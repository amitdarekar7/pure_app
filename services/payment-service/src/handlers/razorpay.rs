use axum::{extract::State, http::StatusCode, Json};
use hmac::{Hmac, Mac};
use serde::{Deserialize, Serialize};
use sha2::Sha256;

use crate::AppState;

type HmacSha256 = Hmac<Sha256>;

// ── Razorpay configuration ────────────────────────────────────────────────────

fn rzp_key_id() -> String {
    std::env::var("RAZORPAY_KEY_ID").unwrap_or_else(|_| "rzp_test_ScTCKAa5bMjNUU".to_string())
}

fn rzp_key_secret() -> String {
    std::env::var("RAZORPAY_KEY_SECRET").unwrap_or_else(|_| "QXy6WTxOHqOaVSeEXqwyhYLo".to_string())
}

// ── Create Order ──────────────────────────────────────────────────────────────
//
// Called by core-api when user taps "Pay Online".
// Creates a Razorpay order via their REST API and returns order_id + key_id
// so the frontend can open the Razorpay checkout.

#[derive(Deserialize)]
pub struct CreateOrderRequest {
    /// Booking ID from core-api (used as receipt identifier)
    pub booking_id: String,
    /// Amount in paise (₹450 = 45000)
    pub amount_paise: i64,
    /// Currency code, defaults to INR
    #[serde(default = "default_currency")]
    pub currency: String,
}

fn default_currency() -> String {
    "INR".to_string()
}

#[derive(Serialize)]
pub struct CreateOrderResponse {
    pub razorpay_order_id: String,
    pub razorpay_key_id: String,
    pub amount_paise: i64,
    pub currency: String,
}

pub async fn create_order(
    State(_state): State<AppState>,
    Json(req): Json<CreateOrderRequest>,
) -> Result<Json<CreateOrderResponse>, (StatusCode, Json<serde_json::Value>)> {
    if req.amount_paise <= 0 {
        return Err((
            StatusCode::BAD_REQUEST,
            Json(serde_json::json!({ "error": "amount_paise must be positive" })),
        ));
    }

    let key_id = rzp_key_id();
    let key_secret = rzp_key_secret();

    // Call Razorpay Orders API
    // https://razorpay.com/docs/api/orders/#create-an-order
    let client = reqwest::Client::new();
    let body = serde_json::json!({
        "amount":   req.amount_paise,
        "currency": req.currency,
        "receipt":  req.booking_id,
        "notes": {
            "booking_id": req.booking_id,
        }
    });

    let resp = client
        .post("https://api.razorpay.com/v1/orders")
        .basic_auth(&key_id, Some(&key_secret))
        .json(&body)
        .send()
        .await
        .map_err(|e| {
            tracing::error!("Razorpay create order HTTP error: {e}");
            (
                StatusCode::BAD_GATEWAY,
                Json(serde_json::json!({ "error": "failed to reach Razorpay" })),
            )
        })?;

    if !resp.status().is_success() {
        let status = resp.status();
        let text = resp.text().await.unwrap_or_default();
        tracing::error!("Razorpay create order failed: {status} — {text}");
        return Err((
            StatusCode::BAD_GATEWAY,
            Json(serde_json::json!({ "error": format!("Razorpay error: {text}") })),
        ));
    }

    let rzp_resp: serde_json::Value = resp.json().await.map_err(|e| {
        tracing::error!("Razorpay response parse error: {e}");
        (
            StatusCode::BAD_GATEWAY,
            Json(serde_json::json!({ "error": "invalid Razorpay response" })),
        )
    })?;

    let order_id = rzp_resp["id"]
        .as_str()
        .unwrap_or("")
        .to_string();

    if order_id.is_empty() {
        return Err((
            StatusCode::BAD_GATEWAY,
            Json(serde_json::json!({ "error": "Razorpay did not return order id" })),
        ));
    }

    tracing::info!(
        booking_id = %req.booking_id,
        order_id = %order_id,
        amount = req.amount_paise,
        "Razorpay order created"
    );

    Ok(Json(CreateOrderResponse {
        razorpay_order_id: order_id,
        razorpay_key_id: key_id,
        amount_paise: req.amount_paise,
        currency: req.currency,
    }))
}

// ── Verify Payment ────────────────────────────────────────────────────────────
//
// After the user completes payment on the Razorpay checkout, the frontend
// receives razorpay_order_id, razorpay_payment_id, razorpay_signature.
// We verify the signature using HMAC-SHA256 to ensure it hasn't been tampered.
//
// Signature = HMAC_SHA256(order_id + "|" + payment_id, key_secret)

#[derive(Deserialize)]
pub struct VerifyPaymentRequest {
    pub razorpay_order_id: String,
    pub razorpay_payment_id: String,
    pub razorpay_signature: String,
    /// Booking ID so we know which booking to mark as paid
    pub booking_id: String,
}

#[derive(Serialize)]
pub struct VerifyPaymentResponse {
    pub verified: bool,
    pub booking_id: String,
    pub razorpay_payment_id: String,
}

pub async fn verify_payment(
    State(_state): State<AppState>,
    Json(req): Json<VerifyPaymentRequest>,
) -> Result<Json<VerifyPaymentResponse>, (StatusCode, Json<serde_json::Value>)> {
    let key_secret = rzp_key_secret();

    // Construct the expected signature payload
    let payload = format!("{}|{}", req.razorpay_order_id, req.razorpay_payment_id);

    let mut mac = HmacSha256::new_from_slice(key_secret.as_bytes()).map_err(|_| {
        (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(serde_json::json!({ "error": "HMAC init failed" })),
        )
    })?;
    mac.update(payload.as_bytes());

    let expected_signature = hex::encode(mac.finalize().into_bytes());

    // Constant-time comparison to prevent timing attacks
    if !constant_time_eq(expected_signature.as_bytes(), req.razorpay_signature.as_bytes()) {
        tracing::warn!(
            booking_id = %req.booking_id,
            order_id = %req.razorpay_order_id,
            "Razorpay signature verification FAILED — possible tampering"
        );
        return Err((
            StatusCode::BAD_REQUEST,
            Json(serde_json::json!({ "error": "payment signature verification failed" })),
        ));
    }

    tracing::info!(
        booking_id = %req.booking_id,
        payment_id = %req.razorpay_payment_id,
        "Razorpay payment verified successfully"
    );

    Ok(Json(VerifyPaymentResponse {
        verified: true,
        booking_id: req.booking_id,
        razorpay_payment_id: req.razorpay_payment_id,
    }))
}

/// Constant-time byte comparison to prevent timing side-channel attacks.
fn constant_time_eq(a: &[u8], b: &[u8]) -> bool {
    if a.len() != b.len() {
        return false;
    }
    let mut diff = 0u8;
    for (x, y) in a.iter().zip(b.iter()) {
        diff |= x ^ y;
    }
    diff == 0
}

use axum::{extract::State, http::StatusCode, Json};
use serde::{Deserialize, Serialize};
use uuid::Uuid;

use crate::AppState;

// ── Create Intent ─────────────────────────────────────────────────────────────

#[derive(Deserialize)]
pub struct CreateIntentRequest {
    pub user_id:         Uuid,
    pub amount_cents:    i64,
    pub currency:        String,
    pub idempotency_key: String,
}

#[derive(Serialize)]
pub struct CreateIntentResponse {
    pub payment_intent_id: Uuid,
    pub status:            String,
    pub amount_cents:      i64,
    pub currency:          String,
}

pub async fn create_intent(
    State(state): State<AppState>,
    Json(req): Json<CreateIntentRequest>,
) -> Result<Json<CreateIntentResponse>, StatusCode> {
    if req.amount_cents <= 0 {
        return Err(StatusCode::BAD_REQUEST);
    }

    // Idempotency check — return existing intent for duplicate keys
    let existing = sqlx::query!(
        "SELECT id, status FROM payment_intents WHERE idempotency_key = $1",
        req.idempotency_key
    )
    .fetch_optional(&state.db)
    .await
    .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;

    if let Some(row) = existing {
        return Ok(Json(CreateIntentResponse {
            payment_intent_id: row.id,
            status:            row.status,
            amount_cents:      req.amount_cents,
            currency:          req.currency.clone(),
        }));
    }

    let intent_id = Uuid::new_v4();

    sqlx::query!(
        r#"INSERT INTO payment_intents
             (id, user_id, amount_cents, currency, status, idempotency_key, metadata)
           VALUES ($1, $2, $3, $4, 'pending', $5, '{}'::jsonb)"#,
        intent_id,
        req.user_id,
        req.amount_cents,
        req.currency,
        req.idempotency_key,
    )
    .execute(&state.db)
    .await
    .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;

    // Write outbox event in the same logical step
    let intent_id_str  = intent_id.to_string();
    let user_id_str    = req.user_id.to_string();
    let payload = serde_json::json!({
        "payment_intent_id": intent_id_str,
        "user_id":           user_id_str,
        "amount_cents":      req.amount_cents,
        "currency":          &req.currency,
        "idempotency_key":   &req.idempotency_key,
    });
    sqlx::query!(
        "INSERT INTO outbox_events (aggregate_id, event_type, payload) VALUES ($1, 'payment.intent.created', $2)",
        intent_id,
        payload,
    )
    .execute(&state.db)
    .await
    .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;

    Ok(Json(CreateIntentResponse {
        payment_intent_id: intent_id,
        status:            "pending".to_string(),
        amount_cents:      req.amount_cents,
        currency:          req.currency,
    }))
}

// ── Confirm Payment ───────────────────────────────────────────────────────────

#[derive(Deserialize)]
pub struct ConfirmPaymentRequest {
    pub payment_intent_id:  Uuid,
    pub payment_method_token: String,
}

pub async fn confirm_payment(
    State(state): State<AppState>,
    Json(req): Json<ConfirmPaymentRequest>,
) -> Result<Json<serde_json::Value>, StatusCode> {
    // In production: call Stripe/Braintree with payment_method_token here,
    // capture the processor_ref, then write the ledger entry atomically.
    let processor_ref = format!("proc_{}", Uuid::new_v4());

    let result = sqlx::query!(
        r#"UPDATE payment_intents
           SET status = 'succeeded', processor_ref = $2, updated_at = NOW()
           WHERE id = $1 AND status = 'pending'
           RETURNING id, user_id, amount_cents, currency"#,
        req.payment_intent_id,
        processor_ref,
    )
    .fetch_optional(&state.db)
    .await
    .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;

    let row = result.ok_or(StatusCode::CONFLICT)?;

    // Append ledger entry (never updated or deleted — enforced by DB rules)
    let entry_id = Uuid::new_v4();
    sqlx::query!(
        r#"INSERT INTO ledger_entries
             (id, wallet_id, payment_intent_id, entry_type, amount_cents,
              currency, balance_after_cents, description)
           SELECT $1, w.id, $2, 'debit', $3, $4,
                  (w.balance_cents - $3), 'Purchase payment'
           FROM wallets w
           WHERE w.user_id = $5"#,
        entry_id,
        row.id,
        row.amount_cents,
        row.currency,
        row.user_id,
    )
    .execute(&state.db)
    .await
    .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;

    // Outbox event for downstream consumers
    let completed_payload = serde_json::json!({
        "payment_intent_id": row.id.to_string(),
        "user_id":           row.user_id.to_string(),
        "amount_cents":      row.amount_cents,
        "currency":          &row.currency,
        "processor_ref":     &processor_ref,
        "ledger_entry_id":   entry_id.to_string(),
    });
    sqlx::query!(
        "INSERT INTO outbox_events (aggregate_id, event_type, payload) VALUES ($1, 'payment.completed', $2)",
        row.id,
        completed_payload,
    )
    .execute(&state.db)
    .await
    .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;

    Ok(Json(serde_json::json!({
        "payment_intent_id": row.id,
        "status": "succeeded",
        "processor_ref": processor_ref
    })))
}

// ── Create Refund ─────────────────────────────────────────────────────────────

#[derive(Deserialize)]
pub struct CreateRefundRequest {
    pub payment_intent_id: Uuid,
    pub amount_cents:      i64,
    pub reason:            String,
}

pub async fn create_refund(
    State(state): State<AppState>,
    Json(req): Json<CreateRefundRequest>,
) -> Result<Json<serde_json::Value>, StatusCode> {
    if req.amount_cents <= 0 {
        return Err(StatusCode::BAD_REQUEST);
    }

    // Ensure the source payment succeeded before issuing a refund
    let intent = sqlx::query!(
        "SELECT id FROM payment_intents WHERE id = $1 AND status = 'succeeded'",
        req.payment_intent_id
    )
    .fetch_optional(&state.db)
    .await
    .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;

    intent.ok_or(StatusCode::UNPROCESSABLE_ENTITY)?;

    let refund_id = Uuid::new_v4();
    sqlx::query!(
        r#"INSERT INTO refunds (id, payment_intent_id, amount_cents, reason, status)
           VALUES ($1, $2, $3, $4, 'pending')"#,
        refund_id,
        req.payment_intent_id,
        req.amount_cents,
        req.reason,
    )
    .execute(&state.db)
    .await
    .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;

    Ok(Json(serde_json::json!({
        "refund_id": refund_id,
        "status": "pending"
    })))
}

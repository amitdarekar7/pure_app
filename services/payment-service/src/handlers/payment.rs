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
    #[serde(default)]
    pub commission_cents: Option<i64>,
    #[serde(default)]
    pub provider_id:     Option<Uuid>,
    #[serde(default = "default_intent_type")]
    pub intent_type:     String,
}

fn default_intent_type() -> String { "booking".to_string() }

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
    let commission = req.commission_cents.unwrap_or(0);
    let provider_cents = req.amount_cents - commission;

    sqlx::query!(
        r#"INSERT INTO payment_intents
             (id, user_id, amount_cents, currency, status, idempotency_key, metadata,
              commission_cents, provider_cents, provider_id, intent_type)
           VALUES ($1, $2, $3, $4, 'pending', $5, '{}'::jsonb, $6, $7, $8, $9)"#,
        intent_id,
        req.user_id,
        req.amount_cents,
        req.currency,
        req.idempotency_key,
        commission,
        provider_cents,
        req.provider_id,
        req.intent_type,
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
           RETURNING id, user_id, amount_cents, currency, commission_cents, provider_cents, provider_id, intent_type"#,
        req.payment_intent_id,
        processor_ref,
    )
    .fetch_optional(&state.db)
    .await
    .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;

    let row = result.ok_or(StatusCode::CONFLICT)?;

    // 1. Debit user wallet (full amount)
    let entry_id = Uuid::new_v4();
    sqlx::query!(
        r#"INSERT INTO ledger_entries
             (id, wallet_id, payment_intent_id, entry_type, amount_cents,
              currency, balance_after_cents, description)
           SELECT $1, w.id, $2, 'debit', $3, $4,
                  (w.balance_cents - $3), $6
           FROM wallets w
           WHERE w.user_id = $5"#,
        entry_id,
        row.id,
        row.amount_cents,
        row.currency,
        row.user_id,
        format!("{} payment", row.intent_type),
    )
    .execute(&state.db)
    .await
    .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;

    // 2. Credit platform wallet (commission or full amount for promotions/subscriptions)
    let platform_credit = if row.intent_type == "booking" { row.commission_cents } else { row.amount_cents };
    if platform_credit > 0 {
        let platform_wallet_id: Uuid = "00000000-0000-0000-0000-000000000001".parse().unwrap();
        let platform_entry_id = Uuid::new_v4();
        sqlx::query!(
            r#"INSERT INTO ledger_entries
                 (id, wallet_id, payment_intent_id, entry_type, amount_cents,
                  currency, balance_after_cents, description)
               VALUES ($1, $2, $3, 'credit', $4, $5, 0, $6)"#,
            platform_entry_id,
            platform_wallet_id,
            row.id,
            platform_credit,
            row.currency,
            if row.intent_type == "booking" { "Booking commission".to_string() }
            else { format!("{} revenue", row.intent_type) },
        )
        .execute(&state.db)
        .await
        .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;

        // Update platform wallet balance
        sqlx::query!(
            "UPDATE wallets SET balance_cents = balance_cents + $1, updated_at = NOW() WHERE id = $2",
            platform_credit,
            platform_wallet_id,
        )
        .execute(&state.db)
        .await
        .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;
    }

    // 3. Credit provider wallet (booking amount minus commission) — only for bookings
    if row.intent_type == "booking" && row.provider_cents > 0 {
        if let Some(provider_id) = row.provider_id {
            // Ensure provider has a wallet (upsert)
            sqlx::query!(
                r#"INSERT INTO wallets (user_id, balance_cents, currency)
                   VALUES ($1, 0, $2)
                   ON CONFLICT (user_id) DO NOTHING"#,
                provider_id,
                row.currency,
            )
            .execute(&state.db)
            .await
            .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;

            let provider_entry_id = Uuid::new_v4();
            sqlx::query!(
                r#"INSERT INTO ledger_entries
                     (id, wallet_id, payment_intent_id, entry_type, amount_cents,
                      currency, balance_after_cents, description)
                   SELECT $1, w.id, $2, 'credit', $3, $4,
                          (w.balance_cents + $3), 'Booking payout'
                   FROM wallets w
                   WHERE w.user_id = $5"#,
                provider_entry_id,
                row.id,
                row.provider_cents,
                row.currency,
                provider_id,
            )
            .execute(&state.db)
            .await
            .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;

            // Update provider wallet balance
            sqlx::query!(
                "UPDATE wallets SET balance_cents = balance_cents + $1, updated_at = NOW() WHERE user_id = $2",
                row.provider_cents,
                provider_id,
            )
            .execute(&state.db)
            .await
            .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;
        }
    }

    // Outbox event for downstream consumers
    let completed_payload = serde_json::json!({
        "payment_intent_id": row.id.to_string(),
        "user_id":           row.user_id.to_string(),
        "amount_cents":      row.amount_cents,
        "commission_cents":  row.commission_cents,
        "provider_cents":    row.provider_cents,
        "provider_id":       row.provider_id.map(|id: Uuid| id.to_string()),
        "intent_type":       &row.intent_type,
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

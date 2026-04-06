use serde::{Deserialize, Serialize};
use sqlx::FromRow;
use uuid::Uuid;

#[derive(Debug, Serialize, Deserialize, FromRow)]
pub struct Wallet {
    pub id:              Uuid,
    pub user_id:         Uuid,
    pub balance_cents:   i64,
    pub currency:        String,
}

#[derive(Debug, Serialize, Deserialize, FromRow)]
pub struct PaymentIntent {
    pub id:               Uuid,
    pub user_id:          Uuid,
    pub amount_cents:     i64,
    pub currency:         String,
    /// pending | processing | succeeded | failed | cancelled
    pub status:           String,
    pub idempotency_key:  String,
    pub metadata:         serde_json::Value,
}

#[derive(Debug, Serialize, Deserialize, FromRow)]
pub struct LedgerEntry {
    pub id:                  Uuid,
    pub wallet_id:           Uuid,
    pub payment_intent_id:   Option<Uuid>,
    /// debit | credit | refund | adjustment
    pub entry_type:          String,
    pub amount_cents:        i64,
    pub currency:            String,
    pub balance_after_cents: i64,
    pub description:         String,
}

#[derive(Debug, Serialize, Deserialize, FromRow)]
pub struct Refund {
    pub id:                Uuid,
    pub payment_intent_id: Uuid,
    pub amount_cents:      i64,
    pub reason:            String,
    /// pending | processing | succeeded | failed
    pub status:            String,
}

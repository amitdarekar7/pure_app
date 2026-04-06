-- Payment Service owns: wallets, payment_methods, payment_intents, ledger_entries, refunds, outbox_events
-- Managed by sqlx migrate — do NOT run manually (Docker mounts this for first-boot only).

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ── wallets ───────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS wallets (
  id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       UUID        NOT NULL UNIQUE,
  balance_cents BIGINT      NOT NULL DEFAULT 0 CHECK (balance_cents >= 0),
  currency      CHAR(3)     NOT NULL DEFAULT 'USD',
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── payment_methods ───────────────────────────────────────────────────────────
-- Raw card data is NEVER stored here. Only opaque processor tokens.
CREATE TABLE IF NOT EXISTS payment_methods (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         UUID        NOT NULL,
  processor       TEXT        NOT NULL CHECK (processor IN ('stripe', 'braintree', 'paypal')),
  processor_token TEXT        NOT NULL,  -- opaque token from payment processor
  last4           CHAR(4),
  brand           TEXT,
  exp_month       SMALLINT,
  exp_year        SMALLINT,
  is_default      BOOLEAN     NOT NULL DEFAULT false,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_payment_methods_user ON payment_methods(user_id);

-- ── payment_intents ───────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS payment_intents (
  id               UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id          UUID        NOT NULL,
  amount_cents     BIGINT      NOT NULL CHECK (amount_cents > 0),
  currency         CHAR(3)     NOT NULL DEFAULT 'USD',
  status           TEXT        NOT NULL DEFAULT 'pending'
                               CHECK (status IN ('pending', 'processing', 'succeeded', 'failed', 'cancelled')),
  idempotency_key  TEXT        UNIQUE NOT NULL,
  processor_ref    TEXT,                  -- processor's transaction ID (e.g. Stripe charge_xxx)
  metadata         JSONB       NOT NULL DEFAULT '{}',
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_payment_intents_user        ON payment_intents(user_id);
CREATE INDEX IF NOT EXISTS idx_payment_intents_idempotency ON payment_intents(idempotency_key);

-- ── ledger_entries (append-only — never UPDATE or DELETE) ─────────────────────
CREATE TABLE IF NOT EXISTS ledger_entries (
  id                  UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  wallet_id           UUID        NOT NULL REFERENCES wallets(id),
  payment_intent_id   UUID        REFERENCES payment_intents(id),
  entry_type          TEXT        NOT NULL
                                  CHECK (entry_type IN ('debit', 'credit', 'refund', 'adjustment')),
  amount_cents        BIGINT      NOT NULL,
  currency            CHAR(3)     NOT NULL DEFAULT 'USD',
  balance_after_cents BIGINT      NOT NULL,
  description         TEXT        NOT NULL,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_ledger_wallet ON ledger_entries(wallet_id, created_at DESC);

-- Enforce append-only: reject any UPDATE or DELETE at the database level
DROP RULE IF EXISTS ledger_no_update ON ledger_entries;
DROP RULE IF EXISTS ledger_no_delete ON ledger_entries;
CREATE RULE ledger_no_update AS ON UPDATE TO ledger_entries DO INSTEAD NOTHING;
CREATE RULE ledger_no_delete AS ON DELETE TO ledger_entries DO INSTEAD NOTHING;

-- ── refunds ───────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS refunds (
  id                UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  payment_intent_id UUID        NOT NULL REFERENCES payment_intents(id),
  amount_cents      BIGINT      NOT NULL CHECK (amount_cents > 0),
  reason            TEXT        NOT NULL,
  status            TEXT        NOT NULL DEFAULT 'pending'
                                CHECK (status IN ('pending', 'processing', 'succeeded', 'failed')),
  processor_ref     TEXT,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── outbox_events (transactional outbox — relay to Kafka) ─────────────────────
CREATE TABLE IF NOT EXISTS outbox_events (
  id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  aggregate_id UUID        NOT NULL,
  event_type   TEXT        NOT NULL,
  payload      JSONB       NOT NULL,
  published    BOOLEAN     NOT NULL DEFAULT false,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_outbox_unpublished ON outbox_events(created_at)
  WHERE published = false;

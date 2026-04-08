-- ═══════════════════════════════════════════════════════════════════════════════
-- PURE APP — Complete Database Schema (all databases)
-- Generated: 2026-04-08
-- ═══════════════════════════════════════════════════════════════════════════════

-- ┌─────────────────────────────────────────────────────────────────────────────┐
-- │  DATABASE 1: core_db  (PostgreSQL 16 — port 5432)                         │
-- │  Service:    core-api (Node.js / Fastify)                                 │
-- │  Tables:     13                                                            │
-- └─────────────────────────────────────────────────────────────────────────────┘

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ── 1. users ─────────────────────────────────────────────────────────────────
CREATE TABLE users (
  id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  email         TEXT        UNIQUE NOT NULL,
  phone         TEXT        UNIQUE,
  password_hash TEXT        NOT NULL,
  status        TEXT        NOT NULL DEFAULT 'active'
                            CHECK (status IN ('active', 'suspended', 'deleted')),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_users_email ON users(email);
CREATE INDEX idx_users_phone ON users(phone) WHERE phone IS NOT NULL;

-- ── 2. profiles ──────────────────────────────────────────────────────────────
CREATE TABLE profiles (
  user_id      UUID        PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  display_name TEXT,
  avatar_url   TEXT,
  bio          TEXT,
  locale       TEXT        NOT NULL DEFAULT 'en-US',
  timezone     TEXT        NOT NULL DEFAULT 'UTC',
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── 3. devices ───────────────────────────────────────────────────────────────
CREATE TABLE devices (
  id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      UUID        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  device_token TEXT        UNIQUE NOT NULL,
  platform     TEXT        NOT NULL
                           CHECK (platform IN ('ios','android','web','android_tv','apple_tv')),
  device_model TEXT,
  push_token   TEXT,
  last_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_devices_user_id    ON devices(user_id);
CREATE INDEX idx_devices_push_token ON devices(push_token) WHERE push_token IS NOT NULL;

-- ── 4. auth_sessions ─────────────────────────────────────────────────────────
CREATE TABLE auth_sessions (
  id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       UUID        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  refresh_token TEXT        UNIQUE NOT NULL,
  device_id     UUID        REFERENCES devices(id) ON DELETE SET NULL,
  expires_at    TIMESTAMPTZ NOT NULL,
  revoked_at    TIMESTAMPTZ,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_auth_sessions_user_id ON auth_sessions(user_id);
CREATE INDEX idx_auth_sessions_refresh ON auth_sessions(refresh_token);

-- ── 5. feature_flags ─────────────────────────────────────────────────────────
CREATE TABLE feature_flags (
  key         TEXT     PRIMARY KEY,
  enabled     BOOLEAN  NOT NULL DEFAULT false,
  rollout_pct SMALLINT NOT NULL DEFAULT 0 CHECK (rollout_pct BETWEEN 0 AND 100),
  metadata    JSONB,
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── 6. outbox_events (core — transactional outbox → Kafka) ───────────────────
CREATE TABLE outbox_events (
  id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  aggregate_id UUID        NOT NULL,
  event_type   TEXT        NOT NULL,
  payload      JSONB       NOT NULL,
  published    BOOLEAN     NOT NULL DEFAULT false,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_outbox_unpublished ON outbox_events(created_at)
  WHERE published = false;

-- ── 7. cities ────────────────────────────────────────────────────────────────
CREATE TABLE cities (
  id         UUID  PRIMARY KEY DEFAULT gen_random_uuid(),
  name       TEXT  NOT NULL UNIQUE,
  state      TEXT  NOT NULL,
  is_rural   BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_cities_name  ON cities(name);
CREATE INDEX idx_cities_state ON cities(state);

-- ── 8. areas ─────────────────────────────────────────────────────────────────
CREATE TABLE areas (
  id         UUID  PRIMARY KEY DEFAULT gen_random_uuid(),
  city_id    UUID  NOT NULL REFERENCES cities(id) ON DELETE CASCADE,
  name       TEXT  NOT NULL,
  pincode    CHAR(6),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(city_id, name)
);

CREATE INDEX idx_areas_city_id ON areas(city_id);
CREATE INDEX idx_areas_name    ON areas(name);

-- ── 9. providers ─────────────────────────────────────────────────────────────
CREATE TABLE providers (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  name        TEXT        NOT NULL,
  city_id     UUID        NOT NULL REFERENCES cities(id),
  area_id     UUID        REFERENCES areas(id),
  address     TEXT,
  lat         NUMERIC(9,6),
  lng         NUMERIC(9,6),
  phone       TEXT,
  likes_count INTEGER     NOT NULL DEFAULT 0,
  status      TEXT        NOT NULL DEFAULT 'active'
                          CHECK (status IN ('active', 'inactive', 'suspended')),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_providers_city_id ON providers(city_id);
CREATE INDEX idx_providers_area_id ON providers(area_id);
CREATE INDEX idx_providers_status  ON providers(status);

-- ── 10. provider_likes ───────────────────────────────────────────────────────
CREATE TABLE provider_likes (
  user_id     UUID        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  provider_id UUID        NOT NULL REFERENCES providers(id) ON DELETE CASCADE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (user_id, provider_id)
);

CREATE INDEX idx_provider_likes_provider_id ON provider_likes(provider_id);

-- ── 11. provider_services ────────────────────────────────────────────────────
CREATE TABLE provider_services (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  provider_id     UUID        NOT NULL REFERENCES providers(id) ON DELETE CASCADE,
  category_slug   TEXT        NOT NULL,
  title           TEXT        NOT NULL,
  price_paise     INTEGER     NOT NULL,
  duration_mins   SMALLINT    NOT NULL,
  is_available    BOOLEAN     NOT NULL DEFAULT true,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_psvc_provider_id   ON provider_services(provider_id);
CREATE INDEX idx_psvc_category_slug ON provider_services(category_slug);
CREATE INDEX idx_psvc_city_cat      ON provider_services(category_slug) INCLUDE (provider_id);

-- ── 12. bookings ─────────────────────────────────────────────────────────────
CREATE TABLE bookings (
  id                  UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id             UUID        NOT NULL REFERENCES users(id),
  provider_id         UUID        NOT NULL REFERENCES providers(id),
  provider_service_id UUID        NOT NULL REFERENCES provider_services(id),
  scheduled_at        TIMESTAMPTZ NOT NULL,
  status              TEXT        NOT NULL DEFAULT 'pending'
                                  CHECK (status IN ('pending','confirmed','in_progress','completed','cancelled')),
  price_paise         INTEGER     NOT NULL,
  notes               TEXT,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_bookings_user_id     ON bookings(user_id);
CREATE INDEX idx_bookings_provider_id ON bookings(provider_id);
CREATE INDEX idx_bookings_scheduled   ON bookings(scheduled_at);

-- ── 13. reviews ──────────────────────────────────────────────────────────────
CREATE TABLE reviews (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_id  UUID        UNIQUE NOT NULL REFERENCES bookings(id),
  user_id     UUID        NOT NULL REFERENCES users(id),
  provider_id UUID        NOT NULL REFERENCES providers(id),
  rating      SMALLINT    NOT NULL CHECK (rating BETWEEN 1 AND 5),
  comment     TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_reviews_provider_id ON reviews(provider_id);


-- ┌─────────────────────────────────────────────────────────────────────────────┐
-- │  DATABASE 2: payments_db  (PostgreSQL 16 — port 5433)                     │
-- │  Service:    payment-service (Rust / Axum)                                │
-- │  Tables:     6                                                             │
-- └─────────────────────────────────────────────────────────────────────────────┘

-- CREATE EXTENSION IF NOT EXISTS "pgcrypto";  (already enabled)

-- ── 14. wallets ──────────────────────────────────────────────────────────────
CREATE TABLE wallets (
  id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       UUID        NOT NULL UNIQUE,
  balance_cents BIGINT      NOT NULL DEFAULT 0 CHECK (balance_cents >= 0),
  currency      CHAR(3)     NOT NULL DEFAULT 'USD',
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── 15. payment_methods ──────────────────────────────────────────────────────
CREATE TABLE payment_methods (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         UUID        NOT NULL,
  processor       TEXT        NOT NULL CHECK (processor IN ('stripe', 'braintree', 'paypal')),
  processor_token TEXT        NOT NULL,
  last4           CHAR(4),
  brand           TEXT,
  exp_month       SMALLINT,
  exp_year        SMALLINT,
  is_default      BOOLEAN     NOT NULL DEFAULT false,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_payment_methods_user ON payment_methods(user_id);

-- ── 16. payment_intents ──────────────────────────────────────────────────────
CREATE TABLE payment_intents (
  id               UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id          UUID        NOT NULL,
  amount_cents     BIGINT      NOT NULL CHECK (amount_cents > 0),
  currency         CHAR(3)     NOT NULL DEFAULT 'USD',
  status           TEXT        NOT NULL DEFAULT 'pending'
                               CHECK (status IN ('pending', 'processing', 'succeeded', 'failed', 'cancelled')),
  idempotency_key  TEXT        UNIQUE NOT NULL,
  processor_ref    TEXT,
  metadata         JSONB       NOT NULL DEFAULT '{}',
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_payment_intents_user        ON payment_intents(user_id);
CREATE INDEX idx_payment_intents_idempotency ON payment_intents(idempotency_key);

-- ── 17. ledger_entries (append-only) ─────────────────────────────────────────
CREATE TABLE ledger_entries (
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

CREATE INDEX idx_ledger_wallet ON ledger_entries(wallet_id, created_at DESC);

CREATE RULE ledger_no_update AS ON UPDATE TO ledger_entries DO INSTEAD NOTHING;
CREATE RULE ledger_no_delete AS ON DELETE TO ledger_entries DO INSTEAD NOTHING;

-- ── 18. refunds ──────────────────────────────────────────────────────────────
CREATE TABLE refunds (
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

-- ── 19. outbox_events (payments — transactional outbox → Kafka) ──────────────
CREATE TABLE outbox_events (
  id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  aggregate_id UUID        NOT NULL,
  event_type   TEXT        NOT NULL,
  payload      JSONB       NOT NULL,
  published    BOOLEAN     NOT NULL DEFAULT false,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_pay_outbox_unpublished ON outbox_events(created_at)
  WHERE published = false;


-- ┌─────────────────────────────────────────────────────────────────────────────┐
-- │  DATABASE 3: OpenSearch  (port 9200)                                      │
-- │  Service:    search-service (Go / Gin)                                    │
-- │  Index:      products  (1 index, not a SQL table)                         │
-- └─────────────────────────────────────────────────────────────────────────────┘
--
-- OpenSearch "products" index mapping (JSON, shown as comment):
--
--   id            keyword
--   title         text (english analyzer) + keyword sub-field
--   description   text (english analyzer)
--   tags          text + keyword sub-field
--   category      keyword
--   price_cents   long
--   currency      keyword
--   rating        float
--   review_count  integer
--   seller_id     keyword
--   in_stock      boolean
--   location      geo_point
--   image_url     keyword (not indexed)
--   created_at    date
--   updated_at    date
--
--   Settings: 3 shards, 1 replica
--   Custom analyzer: standard tokenizer + lowercase + asciifolding + stop + snowball

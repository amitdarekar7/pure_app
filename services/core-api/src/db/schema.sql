-- Core API owns: users, profiles, devices, auth_sessions, feature_flags, outbox_events
-- Run automatically via docker-entrypoint-initdb.d on first launch

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ── users ────────────────────────────────────────────────────────────────────
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

-- ── profiles ─────────────────────────────────────────────────────────────────
CREATE TABLE profiles (
  user_id      UUID        PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  display_name TEXT,
  avatar_url   TEXT,
  bio          TEXT,
  locale       TEXT        NOT NULL DEFAULT 'en-US',
  timezone     TEXT        NOT NULL DEFAULT 'UTC',
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── devices ──────────────────────────────────────────────────────────────────
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

CREATE INDEX idx_devices_user_id   ON devices(user_id);
CREATE INDEX idx_devices_push_token ON devices(push_token) WHERE push_token IS NOT NULL;

-- ── auth_sessions ────────────────────────────────────────────────────────────
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

-- ── feature_flags ────────────────────────────────────────────────────────────
CREATE TABLE feature_flags (
  key         TEXT     PRIMARY KEY,
  enabled     BOOLEAN  NOT NULL DEFAULT false,
  rollout_pct SMALLINT NOT NULL DEFAULT 0 CHECK (rollout_pct BETWEEN 0 AND 100),
  metadata    JSONB,
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── outbox_events (transactional outbox — relay to Kafka) ────────────────────
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

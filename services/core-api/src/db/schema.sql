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
  address      TEXT,
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

-- ── cities ───────────────────────────────────────────────────────────────────
CREATE TABLE cities (
  id         UUID  PRIMARY KEY DEFAULT gen_random_uuid(),
  name       TEXT  NOT NULL UNIQUE,
  state      TEXT  NOT NULL,
  is_rural   BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_cities_name  ON cities(name);
CREATE INDEX idx_cities_state ON cities(state);

-- ── areas ────────────────────────────────────────────────────────────────────
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

-- ── providers ────────────────────────────────────────────────────────────────
-- A provider is a salon, studio, or freelance artist.
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

CREATE INDEX idx_providers_city_id  ON providers(city_id);
CREATE INDEX idx_providers_area_id  ON providers(area_id);
CREATE INDEX idx_providers_status   ON providers(status);

-- ── provider_likes ──────────────────────────────────────────────────────────
CREATE TABLE provider_likes (
  user_id     UUID        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  provider_id UUID        NOT NULL REFERENCES providers(id) ON DELETE CASCADE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (user_id, provider_id)
);

CREATE INDEX idx_provider_likes_provider_id ON provider_likes(provider_id);

-- ── provider_services ────────────────────────────────────────────────────────
-- Maps a provider to the categories they offer, with their price/duration.
-- category_slug matches the id field in the CATEGORIES array in the app
-- (e.g. 'haircut', 'facial', 'manicure', 'pedicure', 'bridalmakeup').
CREATE TABLE provider_services (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  provider_id     UUID        NOT NULL REFERENCES providers(id) ON DELETE CASCADE,
  category_slug   TEXT        NOT NULL,  -- 'haircut' | 'facial' | 'manicure' | etc.
  title           TEXT        NOT NULL,  -- e.g. "Women's Haircut & Blow Dry"
  price_paise     INTEGER     NOT NULL,  -- price in paise (₹ × 100), avoids float issues
  duration_mins   SMALLINT    NOT NULL,  -- e.g. 45
  is_available    BOOLEAN     NOT NULL DEFAULT true,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_psvc_provider_id   ON provider_services(provider_id);
CREATE INDEX idx_psvc_category_slug ON provider_services(category_slug);
-- Composite index powers the main listing query: "providers in city offering haircuts"
CREATE INDEX idx_psvc_city_cat      ON provider_services(category_slug)
  INCLUDE (provider_id);

-- ── bookings ─────────────────────────────────────────────────────────────────
CREATE TABLE bookings (
  id                  UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id             UUID        NOT NULL REFERENCES users(id),
  provider_id         UUID        NOT NULL REFERENCES providers(id),
  provider_service_id UUID        NOT NULL REFERENCES provider_services(id),
  scheduled_at        TIMESTAMPTZ NOT NULL,
  status              TEXT        NOT NULL DEFAULT 'pending'
                                  CHECK (status IN ('pending','confirmed','in_progress','completed','cancelled')),
  price_paise         INTEGER     NOT NULL,  -- snapshot at time of booking
  notes               TEXT,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_bookings_user_id     ON bookings(user_id);
CREATE INDEX idx_bookings_provider_id ON bookings(provider_id);
CREATE INDEX idx_bookings_scheduled   ON bookings(scheduled_at);

-- ── reviews ──────────────────────────────────────────────────────────────────
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

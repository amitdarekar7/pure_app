-- Provider Portal migration
-- Adds: user role, provider_accounts (user ↔ provider link),
--        provider_availability (weekly hours), provider_service_images

-- ── 1. role column on users ──────────────────────────────────────────────────
ALTER TABLE users
  ADD COLUMN IF NOT EXISTS role TEXT NOT NULL DEFAULT 'customer'
  CHECK (role IN ('customer', 'provider', 'admin'));

-- ── 2. provider_accounts ─────────────────────────────────────────────────────
-- Links a user account to the provider profile they manage
CREATE TABLE IF NOT EXISTS provider_accounts (
  user_id     UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  provider_id UUID NOT NULL REFERENCES providers(id) ON DELETE CASCADE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (provider_id)          -- one owner per provider for now
);

CREATE INDEX IF NOT EXISTS idx_provider_accounts_provider_id
  ON provider_accounts(provider_id);

-- ── 3. provider_availability ─────────────────────────────────────────────────
-- Weekly recurring availability. day_of_week: 0=Sunday … 6=Saturday
CREATE TABLE IF NOT EXISTS provider_availability (
  id          UUID     PRIMARY KEY DEFAULT gen_random_uuid(),
  provider_id UUID     NOT NULL REFERENCES providers(id) ON DELETE CASCADE,
  day_of_week SMALLINT NOT NULL CHECK (day_of_week BETWEEN 0 AND 6),
  open_time   TIME     NOT NULL DEFAULT '09:00',   -- e.g. '09:00'
  close_time  TIME     NOT NULL DEFAULT '22:00',   -- e.g. '22:00'
  is_closed   BOOLEAN  NOT NULL DEFAULT false,
  UNIQUE (provider_id, day_of_week)
);

CREATE INDEX IF NOT EXISTS idx_pav_provider_id
  ON provider_availability(provider_id);

-- ── 4. provider_service_images ───────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS provider_service_images (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  service_id  UUID        NOT NULL REFERENCES provider_services(id) ON DELETE CASCADE,
  provider_id UUID        NOT NULL REFERENCES providers(id) ON DELETE CASCADE,
  image_url   TEXT        NOT NULL,
  sort_order  SMALLINT    NOT NULL DEFAULT 0,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_psimg_service_id
  ON provider_service_images(service_id);
CREATE INDEX IF NOT EXISTS idx_psimg_provider_id
  ON provider_service_images(provider_id);

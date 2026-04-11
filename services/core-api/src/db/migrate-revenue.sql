-- Revenue features: booking commission, featured listings, boost promotions
-- Run after schema.sql

-- ── Commission tracking on bookings ─────────────────────────────────────────
ALTER TABLE bookings
  ADD COLUMN IF NOT EXISTS commission_pct    NUMERIC(5,2) NOT NULL DEFAULT 7.00,
  ADD COLUMN IF NOT EXISTS commission_paise  INTEGER      NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS provider_paise    INTEGER      NOT NULL DEFAULT 0;

-- commission_pct:   platform commission percentage at time of booking (snapshot)
-- commission_paise: platform keeps this (price_paise × commission_pct / 100)
-- provider_paise:   provider receives this (price_paise − commission_paise)

-- ── Platform config (holds commission %, feature prices, etc.) ──────────────
CREATE TABLE IF NOT EXISTS platform_config (
  key         TEXT        PRIMARY KEY,
  value       TEXT        NOT NULL,
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

INSERT INTO platform_config (key, value) VALUES
  ('commission_pct',        '7.00'),     -- 7% booking commission
  ('featured_price_paise',  '29900'),    -- ₹299/month
  ('boost_price_paise',     '4900')      -- ₹49 per 24h boost
ON CONFLICT (key) DO NOTHING;

-- ── Promotion products catalog ──────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS promotion_products (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  slug            TEXT        UNIQUE NOT NULL,    -- 'featured_monthly', 'boost_24h'
  name            TEXT        NOT NULL,
  description     TEXT,
  price_paise     INTEGER     NOT NULL,
  duration_hours  INTEGER     NOT NULL,           -- how long the promotion lasts
  promotion_type  TEXT        NOT NULL CHECK (promotion_type IN ('featured', 'boost')),
  is_active       BOOLEAN     NOT NULL DEFAULT true,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

INSERT INTO promotion_products (slug, name, description, price_paise, duration_hours, promotion_type) VALUES
  ('featured_monthly', 'Featured Listing',    'Appear at the top of search results for 30 days',  29900,  720, 'featured'),
  ('featured_quarterly', 'Featured 3 Months', 'Appear at the top of search results for 90 days',  74900, 2160, 'featured'),
  ('boost_24h',        '24-Hour Boost',        'Boosted visibility for 24 hours',                   4900,   24, 'boost'),
  ('boost_7d',         '7-Day Boost',          'Boosted visibility for 7 days',                    24900,  168, 'boost')
ON CONFLICT (slug) DO NOTHING;

-- ── Provider promotions (active/expired) ────────────────────────────────────
CREATE TABLE IF NOT EXISTS provider_promotions (
  id                    UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  provider_id           UUID        NOT NULL REFERENCES providers(id) ON DELETE CASCADE,
  promotion_product_id  UUID        NOT NULL REFERENCES promotion_products(id),
  payment_intent_id     TEXT,                          -- payment reference
  promotion_type        TEXT        NOT NULL CHECK (promotion_type IN ('featured', 'boost')),
  status                TEXT        NOT NULL DEFAULT 'active'
                                    CHECK (status IN ('active', 'expired', 'cancelled')),
  starts_at             TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at            TIMESTAMPTZ NOT NULL,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_promo_provider    ON provider_promotions(provider_id);
CREATE INDEX IF NOT EXISTS idx_promo_active      ON provider_promotions(status, expires_at)
  WHERE status = 'active';
CREATE INDEX IF NOT EXISTS idx_promo_type_active ON provider_promotions(provider_id, promotion_type)
  WHERE status = 'active';

-- ── Provider subscription tracking ──────────────────────────────────────────
CREATE TABLE IF NOT EXISTS provider_subscriptions (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  provider_id     UUID        NOT NULL REFERENCES providers(id) ON DELETE CASCADE,
  plan            TEXT        NOT NULL DEFAULT 'quarterly'
                              CHECK (plan IN ('quarterly', 'yearly')),
  price_paise     INTEGER     NOT NULL DEFAULT 14900,   -- ₹149
  status          TEXT        NOT NULL DEFAULT 'active'
                              CHECK (status IN ('active', 'expired', 'cancelled')),
  starts_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at      TIMESTAMPTZ NOT NULL,
  payment_intent_id TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_sub_provider ON provider_subscriptions(provider_id);
CREATE INDEX IF NOT EXISTS idx_sub_active   ON provider_subscriptions(status, expires_at)
  WHERE status = 'active';

-- ── Add is_featured and is_boosted flags to providers (for fast queries) ────
ALTER TABLE providers
  ADD COLUMN IF NOT EXISTS is_featured    BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS is_boosted     BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS featured_until TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS boosted_until  TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_providers_featured ON providers(is_featured) WHERE is_featured = true;
CREATE INDEX IF NOT EXISTS idx_providers_boosted  ON providers(is_boosted)  WHERE is_boosted  = true;

-- ── Subscription enforcement columns ────────────────────────────────────────
-- provider_subscriptions already exists in migrate-revenue.sql.
-- This migration adds auto-renew support and subscription_required tracking.

-- Auto-renew flag on subscriptions
ALTER TABLE provider_subscriptions
  ADD COLUMN IF NOT EXISTS auto_renew BOOLEAN NOT NULL DEFAULT false;

-- Allow 'pending' status for subscriptions awaiting payment
ALTER TABLE provider_subscriptions
  DROP CONSTRAINT IF EXISTS provider_subscriptions_status_check;
ALTER TABLE provider_subscriptions
  ADD CONSTRAINT provider_subscriptions_status_check
  CHECK (status IN ('pending', 'active', 'expired', 'cancelled'));

-- Track when subscription becomes required (1 year after joining)
-- and grace period end (7 days after requirement triggers)
ALTER TABLE providers
  ADD COLUMN IF NOT EXISTS subscription_required    BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS subscription_grace_until TIMESTAMPTZ;

-- Index for filtering out lapsed providers in search
CREATE INDEX IF NOT EXISTS idx_providers_sub_required
  ON providers(subscription_required)
  WHERE subscription_required = true;

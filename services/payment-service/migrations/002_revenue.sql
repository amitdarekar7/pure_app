-- Revenue: add commission tracking to payment_intents and provider/platform wallets

-- Add commission columns to payment_intents
ALTER TABLE payment_intents
  ADD COLUMN IF NOT EXISTS commission_cents  BIGINT NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS provider_cents    BIGINT NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS provider_id       UUID,
  ADD COLUMN IF NOT EXISTS intent_type       TEXT   NOT NULL DEFAULT 'booking'
                                             CHECK (intent_type IN ('booking', 'promotion', 'subscription'));

-- Platform wallet: a special wallet that collects commissions and promo revenue
-- user_id = '00000000-0000-0000-0000-000000000000' is the platform
INSERT INTO wallets (id, user_id, balance_cents, currency)
VALUES (
  '00000000-0000-0000-0000-000000000001',
  '00000000-0000-0000-0000-000000000000',
  0,
  'INR'
) ON CONFLICT (user_id) DO NOTHING;

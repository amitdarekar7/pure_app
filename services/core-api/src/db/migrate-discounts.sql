-- Discounts, prepaid bookings, OTP check-in, no-show / cancellation policy
-- Run after migrate-revenue.sql

-- ── Discount support on services ────────────────────────────────────────────
ALTER TABLE provider_services
  ADD COLUMN IF NOT EXISTS discount_pct  NUMERIC(5,2) NOT NULL DEFAULT 0.00;
-- 0 means no discount; e.g. 15.00 = 15% off for prepaid bookings

-- ── Booking payment mode + check-in OTP ─────────────────────────────────────
ALTER TABLE bookings
  ADD COLUMN IF NOT EXISTS payment_mode        TEXT NOT NULL DEFAULT 'prepaid'
                           CHECK (payment_mode IN ('prepaid', 'pay_at_venue')),
  ADD COLUMN IF NOT EXISTS original_price_paise INTEGER,         -- price before discount
  ADD COLUMN IF NOT EXISTS discount_pct         NUMERIC(5,2) NOT NULL DEFAULT 0.00,
  ADD COLUMN IF NOT EXISTS checkin_otp          CHAR(6),         -- 6-digit OTP shown to user
  ADD COLUMN IF NOT EXISTS checked_in_at        TIMESTAMPTZ,     -- when provider confirmed check-in
  ADD COLUMN IF NOT EXISTS no_show              BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS cancelled_by         TEXT CHECK (cancelled_by IN ('user', 'provider', 'system')),
  ADD COLUMN IF NOT EXISTS cancellation_reason  TEXT,
  ADD COLUMN IF NOT EXISTS cancellation_fee_paise INTEGER NOT NULL DEFAULT 0;

-- Update booking status to support no_show
ALTER TABLE bookings DROP CONSTRAINT IF EXISTS bookings_status_check;
ALTER TABLE bookings ADD CONSTRAINT bookings_status_check
  CHECK (status IN ('pending', 'confirmed', 'in_progress', 'completed', 'cancelled', 'no_show'));

-- ── Cancellation & no-show policy config ────────────────────────────────────
INSERT INTO platform_config (key, value) VALUES
  -- cancellation: free if cancelled > N hours before scheduled_at
  ('free_cancel_hours',      '4'),       -- 4 hours before = free cancellation
  ('late_cancel_pct',        '25'),      -- 25% of price charged as cancellation fee
  ('no_show_charge_pct',     '50'),      -- 50% of price charged for no-show
  ('no_show_grace_mins',     '30'),      -- 30 min after scheduled_at before marking no-show
  ('max_discount_pct',       '50')       -- providers cannot set discount > 50%
ON CONFLICT (key) DO NOTHING;

-- ── Index for no-show detection cron ────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_bookings_noshow
  ON bookings (status, scheduled_at)
  WHERE status = 'confirmed' AND no_show = false;

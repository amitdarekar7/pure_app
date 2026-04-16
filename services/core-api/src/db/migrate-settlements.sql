-- Settlement ledger: tracks Razorpay Route transfers for each booking
-- Run after migrate-razorpay-route.sql

-- ── Transfer tracking on bookings ───────────────────────────────────────────
ALTER TABLE bookings
  ADD COLUMN IF NOT EXISTS razorpay_transfer_id  TEXT,            -- Razorpay transfer ID (trf_xxx)
  ADD COLUMN IF NOT EXISTS settlement_status     TEXT NOT NULL DEFAULT 'pending'
                           CHECK (settlement_status IN (
                             'pending',       -- payment verified, transfer not yet attempted
                             'transferred',   -- Route transfer created successfully
                             'settled',       -- funds settled to provider's bank (webhook)
                             'failed',        -- transfer failed
                             'not_applicable' -- pay_at_venue or provider not on Route
                           ));

CREATE INDEX IF NOT EXISTS idx_bookings_settlement
  ON bookings(settlement_status)
  WHERE payment_status = 'paid' AND settlement_status = 'pending';

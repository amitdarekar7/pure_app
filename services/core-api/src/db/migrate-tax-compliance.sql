-- Tax compliance: TCS (GST Sec 52) + TDS (IT Sec 194-O) + Invoice tracking
-- Run after migrate-settlements.sql

-- ── GST TCS columns on bookings ─────────────────────────────────────────────
-- E-commerce operators must collect TCS at 1% (0.5% CGST + 0.5% SGST) on net taxable value
ALTER TABLE bookings
  ADD COLUMN IF NOT EXISTS gst_paise         INTEGER NOT NULL DEFAULT 0,  -- 18% GST on platform commission
  ADD COLUMN IF NOT EXISTS tcs_paise         INTEGER NOT NULL DEFAULT 0,  -- 1% TCS on net taxable value
  ADD COLUMN IF NOT EXISTS tds_paise         INTEGER NOT NULL DEFAULT 0;  -- 1% TDS u/s 194-O on provider payout

-- ── Provider cumulative earnings (for TDS threshold tracking) ───────────────
CREATE TABLE IF NOT EXISTS provider_fy_earnings (
  provider_id   UUID    NOT NULL REFERENCES providers(id) ON DELETE CASCADE,
  financial_year TEXT   NOT NULL,   -- e.g. '2026-27'
  gross_paise   BIGINT  NOT NULL DEFAULT 0,  -- cumulative gross paid to this provider
  tds_paise     BIGINT  NOT NULL DEFAULT 0,  -- cumulative TDS deducted
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (provider_id, financial_year)
);

-- ── Invoices table ──────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS invoices (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_number  TEXT        UNIQUE NOT NULL,    -- e.g. PURE/2627/000001
  booking_id      UUID        NOT NULL REFERENCES bookings(id),
  user_id         UUID        NOT NULL REFERENCES users(id),
  provider_id     UUID        NOT NULL REFERENCES providers(id),

  -- Amounts
  service_amount_paise  INTEGER NOT NULL,         -- price_paise (what user paid)
  discount_paise        INTEGER NOT NULL DEFAULT 0,
  taxable_value_paise   INTEGER NOT NULL,         -- commission portion (platform fee)
  cgst_paise            INTEGER NOT NULL DEFAULT 0, -- 9% of taxable_value
  sgst_paise            INTEGER NOT NULL DEFAULT 0, -- 9% of taxable_value
  total_tax_paise       INTEGER NOT NULL DEFAULT 0,
  total_paise           INTEGER NOT NULL,         -- service_amount + total_tax

  -- Metadata
  hsn_code      TEXT    NOT NULL DEFAULT '999712', -- SAC code for beauty/wellness services
  invoice_date  DATE    NOT NULL DEFAULT CURRENT_DATE,
  financial_year TEXT   NOT NULL,                  -- e.g. '2026-27'

  -- Platform details (stored for invoice rendering)
  platform_gstin    TEXT NOT NULL DEFAULT '',
  platform_name     TEXT NOT NULL DEFAULT 'Pure App',
  platform_address  TEXT NOT NULL DEFAULT '',

  provider_name     TEXT NOT NULL,
  provider_address  TEXT,

  user_name         TEXT,
  user_email        TEXT,

  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_invoices_booking  ON invoices(booking_id);
CREATE INDEX IF NOT EXISTS idx_invoices_user     ON invoices(user_id);
CREATE INDEX IF NOT EXISTS idx_invoices_provider ON invoices(provider_id);

-- ── Invoice sequence (per financial year) ───────────────────────────────────
CREATE TABLE IF NOT EXISTS invoice_sequences (
  financial_year TEXT PRIMARY KEY,
  last_number    INTEGER NOT NULL DEFAULT 0
);

-- ── Complaints tracking (for compliance reports) ────────────────────────────
CREATE TABLE IF NOT EXISTS complaints (
  id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       UUID        REFERENCES users(id),
  provider_id   UUID        REFERENCES providers(id),
  category      TEXT        NOT NULL CHECK (category IN (
    'service_quality', 'payment', 'cancellation', 'content', 'privacy', 'other'
  )),
  description   TEXT        NOT NULL,
  status        TEXT        NOT NULL DEFAULT 'received'
                CHECK (status IN ('received', 'in_progress', 'resolved', 'rejected')),
  resolution    TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  resolved_at   TIMESTAMPTZ
);

-- ── Platform config additions ───────────────────────────────────────────────
INSERT INTO platform_config (key, value) VALUES
  ('gst_rate',           '18.00'),      -- 18% GST on platform commission
  ('tcs_rate',           '1.00'),       -- 1% TCS (0.5% CGST + 0.5% SGST)
  ('tds_rate',           '1.00'),       -- 1% TDS u/s 194-O
  ('tds_threshold_paise','50000000'),   -- ₹5,00,000 annual threshold for TDS
  ('platform_gstin',     ''),           -- Set after GST registration
  ('platform_legal_name','Pure Beauty & Wellness Technologies Pvt. Ltd.'),
  ('platform_cin',       ''),           -- Set after company incorporation
  ('platform_address',   'Bengaluru, Karnataka, India'),
  ('platform_email',     'support@pureapp.in'),
  ('platform_phone',     ''),
  ('grievance_officer',  'Amit Kumar'),
  ('grievance_email',    'grievance@pureapp.in'),
  ('nodal_officer',      ''),           -- Set after appointment
  ('nodal_email',        '')
ON CONFLICT (key) DO NOTHING;

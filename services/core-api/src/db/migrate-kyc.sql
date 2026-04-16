-- Provider KYC fields for India legal compliance
ALTER TABLE providers
  ADD COLUMN IF NOT EXISTS pan_number         VARCHAR(10),
  ADD COLUMN IF NOT EXISTS bank_account_number VARCHAR(20),
  ADD COLUMN IF NOT EXISTS bank_ifsc          VARCHAR(11),
  ADD COLUMN IF NOT EXISTS bank_holder_name   VARCHAR(120),
  ADD COLUMN IF NOT EXISTS aadhaar_last4      VARCHAR(4),
  ADD COLUMN IF NOT EXISTS gst_number         VARCHAR(15);

-- User consent tracking
ALTER TABLE users
  ADD COLUMN IF NOT EXISTS consent_terms     BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS consent_privacy   BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS consent_at        TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS deleted_at        TIMESTAMPTZ;

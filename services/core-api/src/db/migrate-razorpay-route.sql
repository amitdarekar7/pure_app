-- Migration: Replace self-stored KYC with Razorpay Route linked accounts
-- Provider KYC is now handled entirely by Razorpay — we only store references

-- Add Razorpay Route columns
ALTER TABLE providers
  ADD COLUMN IF NOT EXISTS razorpay_account_id  VARCHAR(40),
  ADD COLUMN IF NOT EXISTS razorpay_kyc_status  VARCHAR(20) DEFAULT 'not_connected';
-- kyc_status values: not_connected | pending | under_review | activated | suspended | rejected

-- Drop KYC columns we no longer need to store
ALTER TABLE providers
  DROP COLUMN IF EXISTS pan_number,
  DROP COLUMN IF EXISTS bank_account_number,
  DROP COLUMN IF EXISTS bank_ifsc,
  DROP COLUMN IF EXISTS bank_holder_name,
  DROP COLUMN IF EXISTS aadhaar_last4,
  DROP COLUMN IF EXISTS gst_number;

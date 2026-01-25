-- Add new fields to customers table

-- Add external_id (merchant's customer ID reference)
ALTER TABLE customers
  ADD COLUMN external_id VARCHAR(255);

-- Add email_verified (track email verification status)
ALTER TABLE customers
  ADD COLUMN email_verified BOOLEAN DEFAULT false NOT NULL;

-- Add billing_address (structured address object)
ALTER TABLE customers
  ADD COLUMN billing_address JSONB DEFAULT '{}'::jsonb;

-- Update existing constraints

-- Make email NOT NULL (it's required for customers)
ALTER TABLE customers
  ALTER COLUMN email SET NOT NULL;

-- Make stripe_customer_id NULLABLE (customers can exist before Stripe sync)
ALTER TABLE customers
  ALTER COLUMN stripe_customer_id DROP NOT NULL;

-- Add unique constraint for external_id per organization (when not null)
CREATE UNIQUE INDEX idx_customers_unique_external_id
  ON customers(organization_id, external_id)
  WHERE external_id IS NOT NULL AND deleted_at IS NULL;

-- Update the existing email unique index to exclude deleted customers
DROP INDEX IF EXISTS idx_customers_unique_email;
CREATE UNIQUE INDEX idx_customers_unique_email
  ON customers(organization_id, LOWER(email))
  WHERE deleted_at IS NULL;

-- Add index for email lookups (case-insensitive)
CREATE INDEX idx_customers_email_lower ON customers(LOWER(email));

-- Add comments for new columns
COMMENT ON COLUMN customers.external_id IS 'Merchant-defined customer ID for SDK integration';
COMMENT ON COLUMN customers.email_verified IS 'Whether customer email has been verified';
COMMENT ON COLUMN customers.billing_address IS 'Customer billing address (JSONB: street, city, state, postal_code, country)';

-- Add unique constraint for customer upsert operations
-- This prevents duplicate customers and enables proper upsert behavior

-- Add unique constraint on organization_id and stripe_customer_id
-- This is the primary constraint for upsert operations
ALTER TABLE customers
ADD CONSTRAINT customers_org_stripe_unique
  UNIQUE (organization_id, stripe_customer_id);

-- Add unique constraint on organization_id and external_id (when not null)
-- This ensures external IDs are unique within an organization
CREATE UNIQUE INDEX customers_org_external_unique
  ON customers (organization_id, external_id)
  WHERE external_id IS NOT NULL AND deleted_at IS NULL;

-- Add unique constraint on organization_id and email
-- This ensures email uniqueness within an organization
CREATE UNIQUE INDEX customers_org_email_unique
  ON customers (organization_id, lower(email))
  WHERE deleted_at IS NULL;

-- Add comment explaining the constraints
COMMENT ON CONSTRAINT customers_org_stripe_unique ON customers IS 'Ensures Stripe customer IDs are unique per organization for upsert operations';
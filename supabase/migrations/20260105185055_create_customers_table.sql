-- Create customers table
CREATE TABLE customers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Relationships
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,

  -- Stripe reference
  stripe_customer_id VARCHAR(255) NOT NULL,

  -- Customer data
  email VARCHAR(255),
  name VARCHAR(255),
  metadata JSONB DEFAULT '{}'::jsonb,

  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  deleted_at TIMESTAMPTZ,

  -- Constraints
  UNIQUE(organization_id, stripe_customer_id)
);

-- Indexes
CREATE INDEX idx_customers_organization ON customers(organization_id);
CREATE INDEX idx_customers_stripe_id ON customers(stripe_customer_id);
CREATE INDEX idx_customers_deleted ON customers(deleted_at) WHERE deleted_at IS NULL;

-- Partial unique index for email (only when email is not NULL)
CREATE UNIQUE INDEX idx_customers_unique_email
  ON customers(organization_id, email)
  WHERE email IS NOT NULL;

-- Trigger for updated_at
CREATE TRIGGER update_customers_updated_at
  BEFORE UPDATE ON customers
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- RLS policies
ALTER TABLE customers ENABLE ROW LEVEL SECURITY;

-- Organizations can manage their own customers
CREATE POLICY "Organizations can view their own customers"
  ON customers FOR SELECT
  USING (organization_id IN (
    SELECT organization_id FROM user_organizations WHERE user_id = auth.uid()
  ));

CREATE POLICY "Organizations can create their own customers"
  ON customers FOR INSERT
  WITH CHECK (organization_id IN (
    SELECT organization_id FROM user_organizations WHERE user_id = auth.uid()
  ));

CREATE POLICY "Organizations can update their own customers"
  ON customers FOR UPDATE
  USING (organization_id IN (
    SELECT organization_id FROM user_organizations WHERE user_id = auth.uid()
  ));

CREATE POLICY "Organizations can delete their own customers"
  ON customers FOR DELETE
  USING (organization_id IN (
    SELECT organization_id FROM user_organizations WHERE user_id = auth.uid()
  ));

-- Comments
COMMENT ON TABLE customers IS 'End users of merchants (organizations)';
COMMENT ON COLUMN customers.stripe_customer_id IS 'Stripe customer ID in merchant Connect account';
COMMENT ON COLUMN customers.deleted_at IS 'Soft delete timestamp';

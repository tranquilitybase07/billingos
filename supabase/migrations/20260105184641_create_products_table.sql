-- Create products table
CREATE TABLE products (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,

  -- Product details
  name VARCHAR(255) NOT NULL,
  description TEXT,

  -- Billing configuration
  recurring_interval VARCHAR(20) NOT NULL CHECK (recurring_interval IN ('month', 'year', 'week', 'day')),
  recurring_interval_count INTEGER NOT NULL DEFAULT 1 CHECK (recurring_interval_count > 0),

  -- Stripe integration
  stripe_product_id VARCHAR(255),

  -- Trial configuration
  trial_days INTEGER DEFAULT 0 CHECK (trial_days >= 0),

  -- Metadata
  metadata JSONB DEFAULT '{}'::jsonb,
  is_archived BOOLEAN DEFAULT false,

  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),

  -- Constraints
  UNIQUE(organization_id, stripe_product_id)
);

-- Indexes
CREATE INDEX idx_products_organization ON products(organization_id);
CREATE INDEX idx_products_archived ON products(is_archived) WHERE is_archived = false;
CREATE INDEX idx_products_stripe_id ON products(stripe_product_id) WHERE stripe_product_id IS NOT NULL;

-- Trigger for updated_at
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_products_updated_at
  BEFORE UPDATE ON products
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- RLS policies
ALTER TABLE products ENABLE ROW LEVEL SECURITY;

-- Organizations can manage their own products
CREATE POLICY "Organizations can view their own products"
  ON products FOR SELECT
  USING (organization_id IN (
    SELECT organization_id FROM user_organizations WHERE user_id = auth.uid()
  ));

CREATE POLICY "Organizations can create their own products"
  ON products FOR INSERT
  WITH CHECK (organization_id IN (
    SELECT organization_id FROM user_organizations WHERE user_id = auth.uid()
  ));

CREATE POLICY "Organizations can update their own products"
  ON products FOR UPDATE
  USING (organization_id IN (
    SELECT organization_id FROM user_organizations WHERE user_id = auth.uid()
  ));

CREATE POLICY "Organizations can delete their own products"
  ON products FOR DELETE
  USING (organization_id IN (
    SELECT organization_id FROM user_organizations WHERE user_id = auth.uid()
  ));

-- Comments
COMMENT ON TABLE products IS 'Product catalog for organizations';
COMMENT ON COLUMN products.recurring_interval IS 'Billing frequency: month, year, week, day';
COMMENT ON COLUMN products.recurring_interval_count IS 'Multiplier for interval (e.g., 2 = every 2 months)';
COMMENT ON COLUMN products.trial_days IS 'Free trial period in days';

-- Create product_prices table
CREATE TABLE product_prices (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,

  -- Price type
  amount_type VARCHAR(20) NOT NULL CHECK (amount_type IN ('fixed', 'free')),

  -- Fixed price details (NULL for free)
  price_amount INTEGER CHECK (price_amount >= 0), -- cents
  price_currency VARCHAR(3) DEFAULT 'usd',

  -- Stripe integration
  stripe_price_id VARCHAR(255),

  -- Status
  is_archived BOOLEAN DEFAULT false,

  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),

  -- Constraints
  CHECK (
    (amount_type = 'free' AND price_amount IS NULL) OR
    (amount_type = 'fixed' AND price_amount IS NOT NULL)
  )
);

-- Indexes
CREATE INDEX idx_product_prices_product ON product_prices(product_id);
CREATE INDEX idx_product_prices_archived ON product_prices(is_archived) WHERE is_archived = false;
CREATE INDEX idx_product_prices_stripe_id ON product_prices(stripe_price_id) WHERE stripe_price_id IS NOT NULL;

-- Trigger for updated_at
CREATE TRIGGER update_product_prices_updated_at
  BEFORE UPDATE ON product_prices
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- RLS policies
ALTER TABLE product_prices ENABLE ROW LEVEL SECURITY;

-- Organizations can manage prices for their own products
CREATE POLICY "Organizations can view prices for their products"
  ON product_prices FOR SELECT
  USING (product_id IN (
    SELECT id FROM products WHERE organization_id IN (
      SELECT organization_id FROM user_organizations WHERE user_id = auth.uid()
    )
  ));

CREATE POLICY "Organizations can create prices for their products"
  ON product_prices FOR INSERT
  WITH CHECK (product_id IN (
    SELECT id FROM products WHERE organization_id IN (
      SELECT organization_id FROM user_organizations WHERE user_id = auth.uid()
    )
  ));

CREATE POLICY "Organizations can update prices for their products"
  ON product_prices FOR UPDATE
  USING (product_id IN (
    SELECT id FROM products WHERE organization_id IN (
      SELECT organization_id FROM user_organizations WHERE user_id = auth.uid()
    )
  ));

CREATE POLICY "Organizations can delete prices for their products"
  ON product_prices FOR DELETE
  USING (product_id IN (
    SELECT id FROM products WHERE organization_id IN (
      SELECT organization_id FROM user_organizations WHERE user_id = auth.uid()
    )
  ));

-- Comments
COMMENT ON TABLE product_prices IS 'Pricing options for products';
COMMENT ON COLUMN product_prices.amount_type IS 'Type of pricing: fixed or free';
COMMENT ON COLUMN product_prices.price_amount IS 'Price in cents (NULL for free)';
COMMENT ON COLUMN product_prices.price_currency IS 'ISO currency code (e.g., usd, eur)';

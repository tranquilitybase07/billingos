-- Create product_features junction table
CREATE TABLE product_features (
  product_id UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  feature_id UUID NOT NULL REFERENCES features(id) ON DELETE CASCADE,

  -- Display configuration
  display_order INTEGER NOT NULL CHECK (display_order > 0),

  -- Per-product feature configuration override (JSONB)
  -- Allows different limits per product:
  -- Starter: {limit: 1000}, Pro: {limit: 5000}, Enterprise: {limit: 50000}
  config JSONB DEFAULT '{}'::jsonb,

  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW(),

  -- Constraints
  PRIMARY KEY (product_id, feature_id),
  UNIQUE (product_id, display_order)
);

-- Indexes
CREATE INDEX idx_product_features_product ON product_features(product_id);
CREATE INDEX idx_product_features_feature ON product_features(feature_id);
CREATE INDEX idx_product_features_order ON product_features(product_id, display_order);

-- RLS policies
ALTER TABLE product_features ENABLE ROW LEVEL SECURITY;

-- Organizations can manage feature links for their own products
CREATE POLICY "Organizations can view features for their products"
  ON product_features FOR SELECT
  USING (product_id IN (
    SELECT id FROM products WHERE organization_id IN (
      SELECT organization_id FROM user_organizations WHERE user_id = auth.uid()
    )
  ));

CREATE POLICY "Organizations can link features to their products"
  ON product_features FOR INSERT
  WITH CHECK (product_id IN (
    SELECT id FROM products WHERE organization_id IN (
      SELECT organization_id FROM user_organizations WHERE user_id = auth.uid()
    )
  ));

CREATE POLICY "Organizations can update feature links for their products"
  ON product_features FOR UPDATE
  USING (product_id IN (
    SELECT id FROM products WHERE organization_id IN (
      SELECT organization_id FROM user_organizations WHERE user_id = auth.uid()
    )
  ));

CREATE POLICY "Organizations can delete feature links for their products"
  ON product_features FOR DELETE
  USING (product_id IN (
    SELECT id FROM products WHERE organization_id IN (
      SELECT organization_id FROM user_organizations WHERE user_id = auth.uid()
    )
  ));

-- Comments
COMMENT ON TABLE product_features IS 'Junction table linking products to features with configuration overrides';
COMMENT ON COLUMN product_features.display_order IS 'Display order in pricing tables (must be > 0)';
COMMENT ON COLUMN product_features.config IS 'Product-specific feature configuration overrides (e.g., higher limits for Pro plan)';

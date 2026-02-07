-- Add versioning fields to products table
-- This migration adds support for product versioning to protect existing customers
-- from price and feature changes

-- Add version tracking columns
ALTER TABLE products
ADD COLUMN IF NOT EXISTS version INTEGER NOT NULL DEFAULT 1,
ADD COLUMN IF NOT EXISTS parent_product_id UUID REFERENCES products(id),
ADD COLUMN IF NOT EXISTS latest_version_id UUID REFERENCES products(id),
ADD COLUMN IF NOT EXISTS version_status VARCHAR(20) DEFAULT 'current'
  CHECK (version_status IN ('current', 'superseded', 'deprecated')),
ADD COLUMN IF NOT EXISTS version_created_reason TEXT,
ADD COLUMN IF NOT EXISTS version_created_at TIMESTAMPTZ DEFAULT NOW();

-- Add composite unique constraint for organization, name, and version
-- This ensures each product can have multiple versions
ALTER TABLE products
ADD CONSTRAINT products_org_name_version_unique
  UNIQUE (organization_id, name, version);

-- Add check constraint to prevent self-referencing
ALTER TABLE products
ADD CONSTRAINT no_self_parent
  CHECK (parent_product_id != id);

-- Create index for version lookups
CREATE INDEX IF NOT EXISTS idx_products_version
  ON products(organization_id, name, version);

-- Create index for parent-child relationships
CREATE INDEX IF NOT EXISTS idx_products_parent
  ON products(parent_product_id)
  WHERE parent_product_id IS NOT NULL;

-- Create index for latest version lookups
CREATE INDEX IF NOT EXISTS idx_products_latest
  ON products(latest_version_id)
  WHERE latest_version_id IS NOT NULL;

-- Create a view for product version analytics
CREATE OR REPLACE VIEW product_version_analytics AS
SELECT
  p.id,
  p.organization_id,
  p.name as product_name,
  p.version,
  p.version_status,
  p.version_created_at,
  p.version_created_reason,
  COUNT(DISTINCT s.id) as subscription_count,
  COUNT(DISTINCT CASE WHEN s.status = 'active' THEN s.id END) as active_subscription_count,
  COALESCE(SUM(CASE WHEN s.status = 'active' THEN s.amount END), 0) as total_mrr,
  p.created_at,
  p.updated_at
FROM products p
LEFT JOIN subscriptions s ON s.product_id = p.id
GROUP BY
  p.id,
  p.organization_id,
  p.name,
  p.version,
  p.version_status,
  p.version_created_at,
  p.version_created_reason,
  p.created_at,
  p.updated_at;

-- Grant appropriate permissions
GRANT SELECT ON product_version_analytics TO authenticated;
GRANT SELECT ON product_version_analytics TO service_role;

-- Create a function to get all versions of a product
CREATE OR REPLACE FUNCTION get_product_versions(
  p_organization_id UUID,
  p_product_name VARCHAR(255)
)
RETURNS TABLE (
  id UUID,
  version INTEGER,
  version_status VARCHAR(20),
  subscription_count BIGINT,
  active_subscription_count BIGINT,
  total_mrr BIGINT,
  created_at TIMESTAMPTZ,
  version_created_reason TEXT
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    pva.id,
    pva.version,
    pva.version_status,
    pva.subscription_count,
    pva.active_subscription_count,
    pva.total_mrr,
    pva.created_at,
    pva.version_created_reason
  FROM product_version_analytics pva
  WHERE pva.organization_id = p_organization_id
    AND pva.product_name = p_product_name
  ORDER BY pva.version DESC;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create a function to get the latest version number for a product
CREATE OR REPLACE FUNCTION get_latest_product_version(
  p_organization_id UUID,
  p_product_name VARCHAR(255)
)
RETURNS INTEGER AS $$
DECLARE
  v_max_version INTEGER;
BEGIN
  SELECT MAX(version) INTO v_max_version
  FROM products
  WHERE organization_id = p_organization_id
    AND name = p_product_name;

  RETURN COALESCE(v_max_version, 0);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Add RLS policies for the new columns
-- Users can see all versions of products in their organization
CREATE POLICY "Users can view all product versions"
  ON products
  FOR SELECT
  USING (
    organization_id IN (
      SELECT organization_id
      FROM user_organizations
      WHERE user_id = auth.uid()
    )
  );

-- Add comment explaining versioning
COMMENT ON COLUMN products.version IS 'Product version number, increments when breaking changes are made';
COMMENT ON COLUMN products.parent_product_id IS 'References the previous version of this product';
COMMENT ON COLUMN products.latest_version_id IS 'References the most recent version of this product';
COMMENT ON COLUMN products.version_status IS 'Status of this version: current (latest), superseded (has newer version), deprecated (should not be used)';
COMMENT ON COLUMN products.version_created_reason IS 'Human-readable explanation of why this version was created';
COMMENT ON COLUMN products.version_created_at IS 'Timestamp when this version was created';

-- Migration rollback script (commented out, for reference)
-- To rollback this migration, run:
/*
ALTER TABLE products
DROP COLUMN IF EXISTS version,
DROP COLUMN IF EXISTS parent_product_id,
DROP COLUMN IF EXISTS latest_version_id,
DROP COLUMN IF EXISTS version_status,
DROP COLUMN IF EXISTS version_created_reason,
DROP COLUMN IF EXISTS version_created_at;

ALTER TABLE products
DROP CONSTRAINT IF EXISTS products_org_name_version_unique,
DROP CONSTRAINT IF EXISTS no_self_parent;

DROP INDEX IF EXISTS idx_products_version;
DROP INDEX IF EXISTS idx_products_parent;
DROP INDEX IF EXISTS idx_products_latest;

DROP VIEW IF EXISTS product_version_analytics;
DROP FUNCTION IF EXISTS get_product_versions(UUID, VARCHAR(255));
DROP FUNCTION IF EXISTS get_latest_product_version(UUID, VARCHAR(255));
*/
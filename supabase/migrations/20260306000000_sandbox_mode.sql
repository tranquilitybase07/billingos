-- Sandbox mode support: track auto-created test accounts and product sync status

-- Add fields to accounts table for sandbox auto-creation tracking
ALTER TABLE accounts ADD COLUMN IF NOT EXISTS auto_created BOOLEAN DEFAULT FALSE;
ALTER TABLE accounts ADD COLUMN IF NOT EXISTS test_mode BOOLEAN DEFAULT FALSE;

-- Add sync_status to products for deferred Stripe sync
ALTER TABLE products ADD COLUMN IF NOT EXISTS sync_status TEXT DEFAULT 'synced'
  CHECK (sync_status IN ('synced', 'pending', 'failed'));

-- Index for efficiently finding pending products to sync
CREATE INDEX IF NOT EXISTS idx_products_sync_pending
  ON products(organization_id, sync_status)
  WHERE sync_status = 'pending';

COMMENT ON COLUMN accounts.auto_created IS 'True if account was auto-created in sandbox mode without manual onboarding';
COMMENT ON COLUMN accounts.test_mode IS 'True if this account uses Stripe test mode keys';
COMMENT ON COLUMN products.sync_status IS 'Stripe sync status: synced (has stripe_product_id), pending (awaiting Stripe account), failed';

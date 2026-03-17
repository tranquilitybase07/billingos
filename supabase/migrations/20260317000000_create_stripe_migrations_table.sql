-- Create stripe_migrations table for tracking import jobs
CREATE TABLE stripe_migrations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id),
  status VARCHAR(50) NOT NULL DEFAULT 'pending',
    -- pending | in_progress | completed | failed | partial
  stripe_account_id VARCHAR(255) NOT NULL,

  -- Import options
  include_archived BOOLEAN NOT NULL DEFAULT false,

  -- Progress counters
  products_imported INTEGER NOT NULL DEFAULT 0,
  prices_imported INTEGER NOT NULL DEFAULT 0,
  customers_imported INTEGER NOT NULL DEFAULT 0,
  subscriptions_imported INTEGER NOT NULL DEFAULT 0,

  products_total INTEGER,
  prices_total INTEGER,
  customers_total INTEGER,
  subscriptions_total INTEGER,

  -- Error tracking
  errors JSONB DEFAULT '[]',
  -- Array of {entity: 'product', stripe_id: 'prod_xxx', error: 'message'}

  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_stripe_migrations_org ON stripe_migrations(organization_id);

-- Add connect_type column to accounts table to distinguish express vs standard accounts
ALTER TABLE accounts ADD COLUMN connect_type VARCHAR(20) DEFAULT 'express';
-- Values: 'express' | 'standard'

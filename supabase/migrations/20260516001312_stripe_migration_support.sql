-- Tables and column changes that back the Stripe → BillingOS import flow.
-- See docs/stripe-migration/plan.md for the end-to-end design.

-- ---------------------------------------------------------------------------
-- 1. stripe_product_mappings
-- Set during the import wizard's mapping step. Tells the worker which BOS
-- product (with its features) a given Stripe product corresponds to.
-- ---------------------------------------------------------------------------
CREATE TABLE public.stripe_product_mappings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  stripe_product_id VARCHAR(255) NOT NULL,
  bos_product_id UUID NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (organization_id, stripe_product_id)
);

CREATE INDEX idx_stripe_product_mappings_org
  ON public.stripe_product_mappings (organization_id);

CREATE TRIGGER update_stripe_product_mappings_updated_at
  BEFORE UPDATE ON public.stripe_product_mappings
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

ALTER TABLE public.stripe_product_mappings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Organizations manage their own product mappings"
  ON public.stripe_product_mappings FOR ALL
  USING (organization_id IN (
    SELECT organization_id FROM public.user_organizations WHERE user_id = auth.uid()
  ));

COMMENT ON TABLE public.stripe_product_mappings IS
  'Maps each Stripe product to a BOS product for the import flow.';

-- ---------------------------------------------------------------------------
-- 2. migration_jobs
-- Surface row for the UI: status, progress, and the two unresolved buckets.
-- pending_binding_count is Bucket 1 (will lazy-bind via email on first SDK
-- session). stuck_customers is Bucket 2 (requires merchant action).
-- ---------------------------------------------------------------------------
CREATE TABLE public.migration_jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'running', 'completed', 'failed', 'cancelled')),
  totals JSONB NOT NULL DEFAULT '{}'::jsonb,
  progress JSONB NOT NULL DEFAULT '{}'::jsonb,
  error_message TEXT,
  pending_binding_count INTEGER NOT NULL DEFAULT 0,
  stuck_customers JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at TIMESTAMPTZ
);

CREATE INDEX idx_migration_jobs_org_created
  ON public.migration_jobs (organization_id, created_at DESC);

-- Only one running job per org at a time.
CREATE UNIQUE INDEX idx_migration_jobs_one_active
  ON public.migration_jobs (organization_id)
  WHERE status IN ('pending', 'running');

CREATE TRIGGER update_migration_jobs_updated_at
  BEFORE UPDATE ON public.migration_jobs
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

ALTER TABLE public.migration_jobs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Organizations view their own migration jobs"
  ON public.migration_jobs FOR SELECT
  USING (organization_id IN (
    SELECT organization_id FROM public.user_organizations WHERE user_id = auth.uid()
  ));

COMMENT ON TABLE public.migration_jobs IS
  'Tracks Stripe → BOS import job state and results.';
COMMENT ON COLUMN public.migration_jobs.pending_binding_count IS
  'Bucket 1: customers with unique email; will lazy-bind on first SDK session.';
COMMENT ON COLUMN public.migration_jobs.stuck_customers IS
  'Bucket 2: customers needing manual action. Each entry: { customer_id, stripe_customer_id, name, email, reason, plan_summary }.';

-- ---------------------------------------------------------------------------
-- 3. Widen stripe_sync_events.entity_type
-- account.service.ts:740 already inserts entity_type='account' but the
-- existing CHECK constraint rejects it. Also needed for import logging
-- of customers, subscriptions, products, and prices.
-- ---------------------------------------------------------------------------
ALTER TABLE public.stripe_sync_events
  DROP CONSTRAINT IF EXISTS stripe_sync_events_entity_type_check;

ALTER TABLE public.stripe_sync_events
  ADD CONSTRAINT stripe_sync_events_entity_type_check
  CHECK (entity_type IN (
    'feature', 'feature_grant', 'product_feature',
    'account', 'customer', 'subscription', 'product', 'price'
  ));

-- ---------------------------------------------------------------------------
-- 4. customers.email becomes nullable again
-- Legacy Stripe customers (especially B2B accounts created via the
-- Dashboard) may not have an email. Forcing NOT NULL breaks import.
-- The partial unique index already excludes nulls so this is safe.
-- ---------------------------------------------------------------------------
ALTER TABLE public.customers
  ALTER COLUMN email DROP NOT NULL;

COMMENT ON COLUMN public.customers.email IS
  'Optional. Imported Stripe customers may not have one. Unique per org when set.';

-- ---------------------------------------------------------------------------
-- 5. session_tokens.external_email
-- Stored at token creation; powers lazy bind in defensive endpoints and
-- gives us an audit trail of which email was used to resolve a customer.
-- ---------------------------------------------------------------------------
ALTER TABLE public.session_tokens
  ADD COLUMN external_email VARCHAR(255);

CREATE INDEX idx_session_tokens_external_email
  ON public.session_tokens (organization_id, external_email)
  WHERE external_email IS NOT NULL;

COMMENT ON COLUMN public.session_tokens.external_email IS
  'Optional email from session-token creation. Used for lazy-bind fallback when external_id has not been set on the customer row yet.';

-- ---------------------------------------------------------------------------
-- 6. PGMQ queue for import jobs
-- ---------------------------------------------------------------------------
SELECT pgmq.create('stripe_import');

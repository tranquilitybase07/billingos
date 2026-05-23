-- Switch the org-level default from Stripe-hosted Checkout to BOS embedded
-- checkout. Existing rows are unaffected — backfill separately per org as
-- needed.
ALTER TABLE organizations
ALTER COLUMN checkout_mode SET DEFAULT 'embedded';

COMMENT ON COLUMN organizations.checkout_mode IS 'Routes the org''s checkouts to either Stripe Checkout Session (hosted) or BOS custom embedded UI (embedded, default). Override per org via UPDATE.';

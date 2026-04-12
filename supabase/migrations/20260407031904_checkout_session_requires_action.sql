-- Add `requires_action` to checkout_session_status enum + a column to track
-- the proration invoice we created on Stripe.
--
-- Used by the in-place upgrade flow when Stripe returns SCA / 3DS for the
-- proration invoice. The hosted_invoice_url is surfaced to the SDK so the
-- customer can complete authentication, and the BOS subscription/entitlement
-- writes are deferred until the `invoice.payment_succeeded` webhook fires.
--
-- Postgres 12+ allows ALTER TYPE ADD VALUE inside a transaction as long as
-- the new value is not USED in the same transaction. We only add it here;
-- application code references the value later.

ALTER TYPE checkout_session_status ADD VALUE IF NOT EXISTS 'requires_action' AFTER 'executing';

ALTER TABLE checkout_sessions
ADD COLUMN IF NOT EXISTS stripe_invoice_id TEXT;

CREATE INDEX IF NOT EXISTS checkout_sessions_stripe_invoice_id_idx ON checkout_sessions (stripe_invoice_id)
WHERE
    stripe_invoice_id IS NOT NULL;

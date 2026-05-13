-- Adds an org-level flag to choose between Stripe-hosted Checkout Session
-- (`hosted`, default) and our custom embedded checkout (`embedded`).
--
-- Default `hosted` because Stripe Checkout gives us atomic
-- subscription/invoice/charge creation with full Stripe Dashboard parity. The
-- embedded path stays available for orgs explicitly flagged into a pilot
-- while we redesign it (sunset audit Q3 2026).
CREATE TYPE organization_checkout_mode AS ENUM (
    'hosted', -- Stripe Checkout Session (ui_mode: 'embedded')
    'embedded' -- BOS custom embedded UI (deferred-creation flow)
);

ALTER TABLE organizations
ADD COLUMN checkout_mode organization_checkout_mode NOT NULL DEFAULT 'hosted';

COMMENT ON COLUMN organizations.checkout_mode IS 'Routes the org''s checkouts to either Stripe Checkout Session (hosted, default) or BOS custom embedded UI (embedded). Pilot orgs only on embedded; default hosted for new and existing orgs.';
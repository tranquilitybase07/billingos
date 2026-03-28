-- Add default_currency to organizations table
-- Each org has ONE charge currency, auto-derived from Stripe account country
ALTER TABLE organizations ADD COLUMN default_currency VARCHAR(3) DEFAULT 'usd';

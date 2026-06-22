-- Flow-level policy toggles (e.g. allowRepeatDiscount). Distinct from `targeting`
-- (reserved for segment/global rules). Reserved as a bag so future toggles need no migration.
ALTER TABLE churn_flows
  ADD COLUMN IF NOT EXISTS settings JSONB NOT NULL DEFAULT '{}'::jsonb;

COMMENT ON COLUMN churn_flows.settings IS
  'Flow-level policy toggles, e.g. { allowRepeatDiscount }.';

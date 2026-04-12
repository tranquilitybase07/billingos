-- Replace the absolute UNIQUE(subscription_id, feature_id) constraint with a
-- partial unique index that only applies to active (non-revoked) grants.
--
-- The old constraint prevents re-granting features on the same subscription
-- after revocation, forcing a hard-delete workaround in subscription-transition.service.ts.
-- With this partial index, soft-revoked rows (revoked_at IS NOT NULL) no longer
-- conflict, and we can use soft-revoke everywhere — no more hard-deletes.
-- Drop the old absolute unique constraint
ALTER TABLE feature_grants
DROP CONSTRAINT IF EXISTS feature_grants_subscription_id_feature_id_key;

-- Add partial unique index: only one active grant per (subscription_id, feature_id)
CREATE UNIQUE INDEX idx_feature_grants_active_unique ON feature_grants (subscription_id, feature_id)
WHERE
    revoked_at IS NULL;
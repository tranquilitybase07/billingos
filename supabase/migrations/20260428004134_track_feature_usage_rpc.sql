-- Atomic track-feature-usage RPC.
--
-- Replaces the previous get-or-create + read-modify-write pattern in
-- UsageService.trackUsage with a single Postgres function that:
--   1. Upserts the usage_records row keyed on the unique constraint
--      (customer_id, feature_id, period_start).
--   2. Atomically increments consumed_units by p_units inside the same
--      statement — row-locked by Postgres, so concurrent calls serialize
--      and no increment is lost.
--   3. Lets the existing CHECK constraint
--      (CHECK (limit_units IS NULL OR consumed_units <= limit_units))
--      enforce the quota. We catch the resulting check_violation and
--      return the unchanged row with exceeded = TRUE so the caller can
--      surface a clean "quota_exceeded" error instead of a database error.
--
-- On conflict we DO update subscription_id (keep pointing at the latest
-- subscription if the customer changed plans mid-period) but do NOT update
-- limit_units or period_end — preserving existing semantics. Changing the
-- limit on an upgrade is a product decision; not in scope here.

CREATE OR REPLACE FUNCTION track_feature_usage(
  p_customer_id UUID,
  p_feature_id UUID,
  p_subscription_id UUID,
  p_period_start TIMESTAMPTZ,
  p_period_end TIMESTAMPTZ,
  p_units NUMERIC,
  p_limit_units NUMERIC
)
-- OUT columns are intentionally prefixed with `out_` so they don't shadow
-- the same-named columns of usage_records inside the function body. Without
-- this, bare references like `period_start` in the INSERT/ON CONFLICT clauses
-- below trigger Postgres error 42702 ("column reference is ambiguous").
RETURNS TABLE (
  out_id UUID,
  out_consumed_units NUMERIC,
  out_limit_units NUMERIC,
  out_period_start TIMESTAMPTZ,
  out_period_end TIMESTAMPTZ,
  out_exceeded BOOLEAN
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_record usage_records%ROWTYPE;
BEGIN
  INSERT INTO usage_records (
    customer_id,
    feature_id,
    subscription_id,
    period_start,
    period_end,
    consumed_units,
    limit_units
  ) VALUES (
    p_customer_id,
    p_feature_id,
    p_subscription_id,
    p_period_start,
    p_period_end,
    p_units,
    p_limit_units
  )
  ON CONFLICT (customer_id, feature_id, period_start) DO UPDATE
  SET consumed_units = usage_records.consumed_units + p_units,
      subscription_id = EXCLUDED.subscription_id,
      updated_at = NOW()
  RETURNING * INTO v_record;

  RETURN QUERY SELECT
    v_record.id        AS out_id,
    v_record.consumed_units AS out_consumed_units,
    v_record.limit_units    AS out_limit_units,
    v_record.period_start   AS out_period_start,
    v_record.period_end     AS out_period_end,
    FALSE                   AS out_exceeded;
EXCEPTION
  WHEN check_violation THEN
    -- The CHECK constraint blocked the increment because
    -- consumed_units + p_units would exceed limit_units. Return the
    -- existing (unchanged) row so the caller can render a quota_exceeded
    -- response without making a second round-trip.
    SELECT * INTO v_record
    FROM usage_records
    WHERE usage_records.customer_id = p_customer_id
      AND usage_records.feature_id = p_feature_id
      AND usage_records.period_start = p_period_start;

    RETURN QUERY SELECT
      v_record.id        AS out_id,
      v_record.consumed_units AS out_consumed_units,
      v_record.limit_units    AS out_limit_units,
      v_record.period_start   AS out_period_start,
      v_record.period_end     AS out_period_end,
      TRUE                    AS out_exceeded;
END;
$$;

GRANT EXECUTE ON FUNCTION track_feature_usage(
  UUID, UUID, UUID, TIMESTAMPTZ, TIMESTAMPTZ, NUMERIC, NUMERIC
) TO service_role;

COMMENT ON FUNCTION track_feature_usage IS
  'Atomic upsert + increment for usage_records. Returns the post-increment row, or the unchanged row with exceeded=TRUE when the quota CHECK fires.';

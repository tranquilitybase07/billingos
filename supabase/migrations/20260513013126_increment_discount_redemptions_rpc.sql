-- Atomic increment-discount-redemptions RPC.
--
-- Replaces the read-then-write pattern in the checkout-session-completed
-- webhook handler with a single UPDATE that is row-locked by Postgres, so
-- concurrent redemptions of the same coupon serialize and no count is lost.
--
-- The previous TS code did:
--   SELECT redemptions_count FROM discounts WHERE id = $1
--   UPDATE discounts SET redemptions_count = $current + 1 WHERE id = $1
-- which silently undercounts under concurrent checkouts.

CREATE OR REPLACE FUNCTION increment_discount_redemptions(p_discount_id UUID)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_new_count INTEGER;
BEGIN
  UPDATE discounts
  SET redemptions_count = redemptions_count + 1,
      updated_at = NOW()
  WHERE id = p_discount_id
  RETURNING redemptions_count INTO v_new_count;

  RETURN v_new_count;
END;
$$;

GRANT EXECUTE ON FUNCTION increment_discount_redemptions(UUID) TO service_role;

COMMENT ON FUNCTION increment_discount_redemptions IS
  'Atomic increment of discounts.redemptions_count. Returns the post-increment count, or NULL if the discount id does not exist.';

-- Atomic subscription creation function (inspired by Flowglad's transaction pattern)
CREATE OR REPLACE FUNCTION create_subscription_atomic(
  p_subscription JSONB,
  p_features JSONB[],
  p_customer_id UUID,
  p_product_id UUID,
  p_organization_id UUID
) RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $func$
DECLARE
  v_subscription_id UUID;
  v_existing_sub RECORD;
  v_result JSONB;
BEGIN
  -- Start transaction implicitly

  -- Check for existing active subscription (with row lock)
  SELECT * INTO v_existing_sub
  FROM subscriptions
  WHERE customer_id = p_customer_id
    AND product_id = p_product_id
    AND status IN ('active', 'trialing')
  FOR UPDATE;

  IF FOUND THEN
    -- Return existing subscription instead of creating duplicate
    RETURN jsonb_build_object(
      'success', false,
      'error', 'Active subscription already exists',
      'subscription_id', v_existing_sub.id
    );
  END IF;

  -- Insert subscription
  INSERT INTO subscriptions (
    customer_id,
    product_id,
    organization_id,
    status,
    stripe_subscription_id,
    stripe_price_id,
    amount,
    currency,
    interval,
    interval_count,
    trial_start,
    trial_end,
    current_period_start,
    current_period_end,
    metadata
  )
  VALUES (
    p_customer_id,
    p_product_id,
    p_organization_id,
    p_subscription->>'status',
    p_subscription->>'stripe_subscription_id',
    p_subscription->>'stripe_price_id',
    (p_subscription->>'amount')::INTEGER,
    p_subscription->>'currency',
    p_subscription->>'interval',
    COALESCE((p_subscription->>'interval_count')::INTEGER, 1),
    (p_subscription->>'trial_start')::TIMESTAMPTZ,
    (p_subscription->>'trial_end')::TIMESTAMPTZ,
    (p_subscription->>'current_period_start')::TIMESTAMPTZ,
    (p_subscription->>'current_period_end')::TIMESTAMPTZ,
    COALESCE(p_subscription->'metadata', '{}'::jsonb)
  )
  RETURNING id INTO v_subscription_id;

  -- Grant features if provided
  IF array_length(p_features, 1) > 0 THEN
    INSERT INTO feature_grants (
      customer_id,
      feature_id,
      subscription_id,
      granted_at,
      metadata
    )
    SELECT
      p_customer_id,
      (feature->>'feature_id')::UUID,
      v_subscription_id,
      NOW(),
      COALESCE(feature->'metadata', '{}'::jsonb)
    FROM unnest(p_features) AS feature
    ON CONFLICT (customer_id, feature_id)
    DO UPDATE SET
      subscription_id = EXCLUDED.subscription_id,
      granted_at = EXCLUDED.granted_at,
      updated_at = NOW();
  END IF;

  -- Update customer status
  UPDATE customers
  SET
    has_active_subscription = true,
    subscription_count = subscription_count + 1,
    updated_at = NOW()
  WHERE id = p_customer_id;

  -- Return success result
  RETURN jsonb_build_object(
    'success', true,
    'subscription_id', v_subscription_id
  );

EXCEPTION
  WHEN unique_violation THEN
    -- Handle race condition where another process created the subscription
    SELECT id INTO v_subscription_id
    FROM subscriptions
    WHERE customer_id = p_customer_id
      AND product_id = p_product_id
      AND status IN ('active', 'trialing')
    LIMIT 1;

    RETURN jsonb_build_object(
      'success', false,
      'error', 'Subscription already exists (race condition)',
      'subscription_id', v_subscription_id
    );

  WHEN OTHERS THEN
    -- Log error and re-raise
    RAISE LOG 'Subscription creation failed: % %', SQLERRM, SQLSTATE;
    RAISE;
END;
$func$;
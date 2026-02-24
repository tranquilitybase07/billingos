-- Atomic customer upsert with race condition handling (inspired by Flowglad's ON CONFLICT pattern)
CREATE OR REPLACE FUNCTION upsert_customer_atomic(
  p_organization_id UUID,
  p_email VARCHAR,
  p_external_id VARCHAR DEFAULT NULL,
  p_name VARCHAR DEFAULT NULL,
  p_stripe_customer_id VARCHAR DEFAULT NULL,
  p_metadata JSONB DEFAULT '{}'
) RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $func$
DECLARE
  v_customer_id UUID;
  v_existing RECORD;
  v_created BOOLEAN := false;
BEGIN
  -- Try to find existing customer by external_id first (most specific)
  IF p_external_id IS NOT NULL THEN
    SELECT * INTO v_existing
    FROM customers
    WHERE organization_id = p_organization_id
      AND external_id = p_external_id
    FOR UPDATE;

    IF FOUND THEN
      -- Update existing customer
      UPDATE customers
      SET
        email = COALESCE(p_email, email),
        name = COALESCE(p_name, name),
        stripe_customer_id = COALESCE(p_stripe_customer_id, stripe_customer_id),
        metadata = metadata || p_metadata,
        updated_at = NOW()
      WHERE id = v_existing.id
      RETURNING id INTO v_customer_id;

      RETURN jsonb_build_object(
        'customer_id', v_customer_id,
        'created', false
      );
    END IF;
  END IF;

  -- Check by email
  SELECT * INTO v_existing
  FROM customers
  WHERE organization_id = p_organization_id
    AND email = p_email
  FOR UPDATE;

  IF FOUND THEN
    -- Update existing
    UPDATE customers
    SET
      external_id = COALESCE(p_external_id, external_id),
      name = COALESCE(p_name, name),
      stripe_customer_id = COALESCE(p_stripe_customer_id, stripe_customer_id),
      metadata = metadata || p_metadata,
      updated_at = NOW()
    WHERE id = v_existing.id
    RETURNING id INTO v_customer_id;

    RETURN jsonb_build_object(
      'customer_id', v_customer_id,
      'created', false
    );
  END IF;

  -- Insert new customer
  INSERT INTO customers (
    organization_id,
    email,
    external_id,
    name,
    stripe_customer_id,
    metadata
  ) VALUES (
    p_organization_id,
    p_email,
    p_external_id,
    p_name,
    p_stripe_customer_id,
    p_metadata
  )
  ON CONFLICT (organization_id, email) DO UPDATE
  SET
    external_id = COALESCE(EXCLUDED.external_id, customers.external_id),
    name = COALESCE(EXCLUDED.name, customers.name),
    stripe_customer_id = COALESCE(EXCLUDED.stripe_customer_id, customers.stripe_customer_id),
    metadata = customers.metadata || EXCLUDED.metadata,
    updated_at = NOW()
  RETURNING id, (xmax = 0) INTO v_customer_id, v_created;

  RETURN jsonb_build_object(
    'customer_id', v_customer_id,
    'created', v_created
  );

EXCEPTION
  WHEN unique_violation THEN
    -- Race condition - another process created customer
    -- Try to find it
    SELECT id INTO v_customer_id
    FROM customers
    WHERE organization_id = p_organization_id
      AND (email = p_email OR external_id = p_external_id)
    LIMIT 1;

    RETURN jsonb_build_object(
      'customer_id', v_customer_id,
      'created', false,
      'race_condition', true
    );
END;
$func$;
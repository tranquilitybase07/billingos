-- Create trial history table to prevent trial abuse
-- Simple approach: One trial per product per customer, ever (inspired by Autum)
CREATE TABLE IF NOT EXISTS trial_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Core identifiers
  customer_id UUID NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  product_id UUID NOT NULL REFERENCES products(id),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,

  -- Trial period details
  trial_start TIMESTAMPTZ NOT NULL,
  trial_end TIMESTAMPTZ NOT NULL,
  trial_days INTEGER NOT NULL,

  -- Associated subscription (if converted)
  subscription_id UUID REFERENCES subscriptions(id) ON DELETE SET NULL,

  -- Outcome tracking
  converted BOOLEAN DEFAULT FALSE,
  conversion_date TIMESTAMPTZ,
  cancellation_reason TEXT,

  -- Metadata
  metadata JSONB DEFAULT '{}',

  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),

  -- Prevent multiple trials for same product
  CONSTRAINT unique_trial_per_customer_product UNIQUE (customer_id, product_id)
);

-- Indexes for trial history
CREATE INDEX idx_trial_history_customer ON trial_history(customer_id);
CREATE INDEX idx_trial_history_product ON trial_history(product_id);
CREATE INDEX idx_trial_history_dates ON trial_history(trial_start, trial_end);
CREATE INDEX idx_trial_history_converted ON trial_history(converted) WHERE converted = true;
CREATE INDEX idx_trial_history_subscription ON trial_history(subscription_id) WHERE subscription_id IS NOT NULL;

-- Simple trial eligibility check function
-- Returns true if customer has NEVER had a trial for this product
CREATE OR REPLACE FUNCTION check_trial_eligibility(
  p_customer_id UUID,
  p_product_id UUID
) RETURNS BOOLEAN AS $$
DECLARE
  v_has_trial BOOLEAN;
  v_has_subscription BOOLEAN;
BEGIN
  -- Check if customer ever had a trial for this product
  SELECT EXISTS(
    SELECT 1 FROM trial_history
    WHERE customer_id = p_customer_id
      AND product_id = p_product_id
  ) INTO v_has_trial;

  IF v_has_trial THEN
    RETURN FALSE; -- Already had trial
  END IF;

  -- Also check if customer ever had a subscription for this product (any status)
  -- This prevents gaming the system by skipping trial on first purchase
  SELECT EXISTS(
    SELECT 1 FROM subscriptions
    WHERE customer_id = p_customer_id
      AND product_id = p_product_id
  ) INTO v_has_subscription;

  RETURN NOT v_has_subscription; -- Eligible only if never had subscription
END;
$$ LANGUAGE plpgsql;

-- Function to record trial usage
CREATE OR REPLACE FUNCTION record_trial_usage(
  p_customer_id UUID,
  p_product_id UUID,
  p_organization_id UUID,
  p_subscription_id UUID,
  p_trial_days INTEGER,
  p_trial_start TIMESTAMPTZ,
  p_trial_end TIMESTAMPTZ
) RETURNS UUID AS $$
DECLARE
  v_trial_id UUID;
BEGIN
  INSERT INTO trial_history (
    customer_id,
    product_id,
    organization_id,
    subscription_id,
    trial_days,
    trial_start,
    trial_end
  ) VALUES (
    p_customer_id,
    p_product_id,
    p_organization_id,
    p_subscription_id,
    p_trial_days,
    p_trial_start,
    p_trial_end
  )
  ON CONFLICT (customer_id, product_id)
  DO UPDATE SET
    -- If somehow called twice, update with latest info
    subscription_id = EXCLUDED.subscription_id,
    updated_at = NOW()
  RETURNING id INTO v_trial_id;

  RETURN v_trial_id;
END;
$$ LANGUAGE plpgsql;

-- Function to mark trial as converted
CREATE OR REPLACE FUNCTION mark_trial_converted(
  p_customer_id UUID,
  p_product_id UUID
) RETURNS VOID AS $$
BEGIN
  UPDATE trial_history
  SET
    converted = TRUE,
    conversion_date = NOW(),
    updated_at = NOW()
  WHERE customer_id = p_customer_id
    AND product_id = p_product_id;
END;
$$ LANGUAGE plpgsql;

-- Trigger to automatically record trial when subscription with trial is created
CREATE OR REPLACE FUNCTION auto_record_trial()
RETURNS TRIGGER AS $$
BEGIN
  -- Only record if subscription has trial dates
  IF NEW.trial_start IS NOT NULL AND NEW.trial_end IS NOT NULL THEN
    -- Calculate trial days
    PERFORM record_trial_usage(
      NEW.customer_id,
      NEW.product_id,
      NEW.organization_id,
      NEW.id,
      EXTRACT(DAY FROM (NEW.trial_end - NEW.trial_start))::INTEGER,
      NEW.trial_start,
      NEW.trial_end
    );
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER record_subscription_trial
  AFTER INSERT ON subscriptions
  FOR EACH ROW
  EXECUTE FUNCTION auto_record_trial();

-- Comments for documentation
COMMENT ON TABLE trial_history IS 'Tracks all trials to prevent abuse. Simple rule: one trial per product per customer, ever.';
COMMENT ON FUNCTION check_trial_eligibility IS 'Returns true if customer has never had a trial OR subscription for this product.';
COMMENT ON FUNCTION record_trial_usage IS 'Records that a customer has used their trial for a product. Idempotent operation.';
COMMENT ON FUNCTION mark_trial_converted IS 'Marks a trial as successfully converted to paid subscription.';
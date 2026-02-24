-- Create refunds table for tracking all refund operations
CREATE TABLE IF NOT EXISTS refunds (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Reference to payment
  payment_intent_id VARCHAR(255) NOT NULL,
  stripe_refund_id VARCHAR(255) UNIQUE,
  stripe_account_id VARCHAR(255), -- Connected account ID if applicable

  -- Refund details
  amount INTEGER NOT NULL CHECK (amount > 0),
  currency VARCHAR(3) NOT NULL DEFAULT 'usd',
  reason TEXT NOT NULL,
  status VARCHAR(50) NOT NULL DEFAULT 'pending',

  -- Who initiated the refund
  initiated_by VARCHAR(50) NOT NULL DEFAULT 'automatic'
    CHECK (initiated_by IN ('automatic', 'manual', 'customer_request', 'support')),

  -- Related entities
  subscription_id UUID REFERENCES subscriptions(id) ON DELETE SET NULL,
  customer_id UUID REFERENCES customers(id) ON DELETE SET NULL,
  organization_id UUID REFERENCES organizations(id) ON DELETE SET NULL,

  -- Additional data
  metadata JSONB DEFAULT '{}',
  error_message TEXT,

  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW(),
  completed_at TIMESTAMPTZ,
  failed_at TIMESTAMPTZ
);

-- Indexes for refunds
CREATE INDEX idx_refunds_payment ON refunds(payment_intent_id);
CREATE INDEX idx_refunds_subscription ON refunds(subscription_id) WHERE subscription_id IS NOT NULL;
CREATE INDEX idx_refunds_customer ON refunds(customer_id) WHERE customer_id IS NOT NULL;
CREATE INDEX idx_refunds_status ON refunds(status);
CREATE INDEX idx_refunds_created ON refunds(created_at DESC);

-- Create reconciliation queue for failed operations that need manual review
CREATE TABLE IF NOT EXISTS reconciliation_queue (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Type of reconciliation needed
  type VARCHAR(100) NOT NULL,
  reference_id VARCHAR(255) NOT NULL, -- Could be payment_intent_id, subscription_id, etc.

  -- Status and priority
  status VARCHAR(50) NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'processing', 'completed', 'failed', 'manual_review', 'ignored')),
  priority INTEGER DEFAULT 5 CHECK (priority BETWEEN 1 AND 10), -- 1 is highest priority

  -- Error details
  error_message TEXT,
  error_count INTEGER DEFAULT 0,

  -- Additional context
  details JSONB DEFAULT '{}',
  resolution_notes TEXT,
  resolved_by VARCHAR(255),

  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  processed_at TIMESTAMPTZ,
  next_retry_at TIMESTAMPTZ
);

-- Create partial unique index to prevent duplicate entries
CREATE UNIQUE INDEX unique_reconciliation_item
  ON reconciliation_queue(type, reference_id, status)
  WHERE status IN ('pending', 'processing');

-- Indexes for reconciliation queue
CREATE INDEX idx_reconciliation_status_priority ON reconciliation_queue(status, priority)
  WHERE status IN ('pending', 'processing');
CREATE INDEX idx_reconciliation_retry ON reconciliation_queue(next_retry_at)
  WHERE status = 'pending' AND next_retry_at IS NOT NULL;
CREATE INDEX idx_reconciliation_type ON reconciliation_queue(type);
CREATE INDEX idx_reconciliation_created ON reconciliation_queue(created_at DESC);

-- Function to automatically set next retry time with exponential backoff
CREATE OR REPLACE FUNCTION calculate_next_retry()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.status = 'failed' AND NEW.error_count < 5 THEN
    -- Exponential backoff: 1min, 2min, 4min, 8min, 16min
    NEW.next_retry_at := NOW() + (INTERVAL '1 minute' * POWER(2, NEW.error_count));
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER set_next_retry
  BEFORE UPDATE ON reconciliation_queue
  FOR EACH ROW
  WHEN (NEW.status = 'failed' AND OLD.status != 'failed')
  EXECUTE FUNCTION calculate_next_retry();

-- Function to process reconciliation queue (can be called by a cron job)
CREATE OR REPLACE FUNCTION process_reconciliation_queue(
  p_limit INTEGER DEFAULT 10
) RETURNS TABLE (
  processed_count INTEGER,
  failed_count INTEGER
) AS $$
DECLARE
  v_processed INTEGER := 0;
  v_failed INTEGER := 0;
  v_record RECORD;
BEGIN
  -- Get pending items ordered by priority and creation date
  FOR v_record IN
    SELECT id, type, reference_id
    FROM reconciliation_queue
    WHERE status = 'pending'
      AND (next_retry_at IS NULL OR next_retry_at <= NOW())
    ORDER BY priority ASC, created_at ASC
    LIMIT p_limit
    FOR UPDATE SKIP LOCKED
  LOOP
    -- Mark as processing
    UPDATE reconciliation_queue
    SET status = 'processing', updated_at = NOW()
    WHERE id = v_record.id;

    -- Here you would call specific reconciliation logic based on type
    -- For now, we'll just mark as manual_review
    UPDATE reconciliation_queue
    SET status = 'manual_review', updated_at = NOW()
    WHERE id = v_record.id;

    v_processed := v_processed + 1;
  END LOOP;

  RETURN QUERY SELECT v_processed, v_failed;
END;
$$ LANGUAGE plpgsql;

-- Add unique constraint to prevent duplicate subscriptions (database constraint)
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'unique_active_subscription_per_customer_product'
    ) THEN
        CREATE UNIQUE INDEX unique_active_subscription_per_customer_product
        ON subscriptions(customer_id, product_id, status)
        WHERE status IN ('active', 'trialing');
    END IF;
END $$;

-- Add unique constraint to prevent duplicate customers
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'unique_customer_per_org_email'
    ) THEN
        ALTER TABLE customers
        ADD CONSTRAINT unique_customer_per_org_email
        UNIQUE (organization_id, email);
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'unique_customer_per_org_external_id'
    ) THEN
        CREATE UNIQUE INDEX unique_customer_per_org_external_id
        ON customers(organization_id, external_id)
        WHERE external_id IS NOT NULL;
    END IF;
END $$;

-- Add check constraints for data integrity
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'check_subscription_dates'
    ) THEN
        ALTER TABLE subscriptions
        ADD CONSTRAINT check_subscription_dates
        CHECK (current_period_start <= current_period_end);
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'check_trial_dates'
    ) THEN
        ALTER TABLE subscriptions
        ADD CONSTRAINT check_trial_dates
        CHECK (trial_start IS NULL OR trial_end IS NULL OR trial_start <= trial_end);
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'check_positive_amount'
    ) THEN
        ALTER TABLE subscriptions
        ADD CONSTRAINT check_positive_amount
        CHECK (amount >= 0);
    END IF;
END $$;

-- Add comments for documentation
COMMENT ON TABLE refunds IS 'Tracks all refund operations, both automatic and manual, for audit trail and reconciliation';
COMMENT ON TABLE reconciliation_queue IS 'Queue for operations that need manual review or retry, inspired by both Autum and Flowglad patterns';
COMMENT ON COLUMN reconciliation_queue.priority IS '1 is highest priority, 10 is lowest. Refund failures should be priority 1.';
-- Create webhook_events table for idempotency and audit trail
-- This table tracks all processed webhook events from Stripe to prevent duplicate processing

CREATE TABLE public.webhook_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Stripe event details
  event_id VARCHAR(255) UNIQUE NOT NULL,  -- Stripe event ID (evt_xxx)
  event_type VARCHAR(100) NOT NULL,        -- Event type (account.updated, payout.paid, etc.)
  livemode BOOLEAN NOT NULL DEFAULT false, -- Test vs production event

  -- Processing status
  status VARCHAR(50) NOT NULL DEFAULT 'pending',  -- pending, processed, failed
  processed_at TIMESTAMP WITH TIME ZONE,
  error_message TEXT,                      -- Error details if processing failed
  retry_count INTEGER NOT NULL DEFAULT 0,  -- Number of retry attempts

  -- Event payload (for debugging and reprocessing)
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,

  -- Metadata
  api_version VARCHAR(50),                 -- Stripe API version
  account_id VARCHAR(100),                 -- Connected account ID if applicable

  -- Timestamps
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),

  -- Constraints
  CONSTRAINT check_webhook_status CHECK (status IN ('pending', 'processed', 'failed'))
);

-- Indexes for efficient lookups
CREATE UNIQUE INDEX idx_webhook_events_event_id ON public.webhook_events (event_id);
CREATE INDEX idx_webhook_events_event_type ON public.webhook_events (event_type);
CREATE INDEX idx_webhook_events_status ON public.webhook_events (status);
CREATE INDEX idx_webhook_events_livemode ON public.webhook_events (livemode);
CREATE INDEX idx_webhook_events_account_id ON public.webhook_events (account_id) WHERE account_id IS NOT NULL;
CREATE INDEX idx_webhook_events_created_at ON public.webhook_events (created_at DESC);

-- Trigger for updated_at
CREATE TRIGGER update_webhook_events_updated_at
  BEFORE UPDATE ON public.webhook_events
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- Comments
COMMENT ON TABLE public.webhook_events IS 'Tracks all Stripe webhook events for idempotency and audit trail';
COMMENT ON COLUMN public.webhook_events.event_id IS 'Unique Stripe event ID (evt_xxx) - prevents duplicate processing';
COMMENT ON COLUMN public.webhook_events.status IS 'Processing status: pending (received), processed (successfully handled), failed (error occurred)';
COMMENT ON COLUMN public.webhook_events.payload IS 'Full Stripe event payload for debugging and reprocessing';
COMMENT ON COLUMN public.webhook_events.retry_count IS 'Number of times we attempted to process this event (for failed events)';
COMMENT ON COLUMN public.webhook_events.livemode IS 'True for production webhooks, false for test webhooks';

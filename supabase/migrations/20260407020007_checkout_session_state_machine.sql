-- State machine for checkout_sessions
--
-- Replaces the existing VARCHAR `status` column with a strict ENUM and adds
-- the columns needed for the two-step preview/execute pipeline:
--   - status:           explicit lifecycle (pending → executing → completed/failed)
--   - request_dto:      original CreateCheckoutDto payload, used to replay the
--                       pipeline at execute time so proration is always fresh
--   - execution_error:  populated when execute() throws
--   - executed_at:      timestamp of successful execute()
--
-- The legacy VARCHAR status used the values
--   ('pending', 'processing', 'completed', 'expired', 'failed').
-- We extend this with the new transitional states 'awaiting_payment' and
-- 'executing' and drop 'processing' (which was never written to in practice).

-- 1. Define the enum
CREATE TYPE checkout_session_status AS ENUM (
  'pending',          -- preview created, waiting for user execute
  'awaiting_payment', -- Stripe object created, waiting for Stripe webhook
  'executing',        -- execute call in progress (lock held)
  'completed',        -- successful
  'failed',           -- terminal failure
  'expired'           -- past expires_at
);

-- 2. Drop the old check constraint and default so we can change the type
ALTER TABLE checkout_sessions
  ALTER COLUMN status DROP DEFAULT;

-- The check constraint is auto-named; drop it if it exists
DO $$
DECLARE
  constraint_name text;
BEGIN
  SELECT conname INTO constraint_name
  FROM pg_constraint
  WHERE conrelid = 'checkout_sessions'::regclass
    AND contype = 'c'
    AND pg_get_constraintdef(oid) LIKE '%status%';
  IF constraint_name IS NOT NULL THEN
    EXECUTE format('ALTER TABLE checkout_sessions DROP CONSTRAINT %I', constraint_name);
  END IF;
END$$;

-- Drop the existing varchar indexes that reference status so we can recreate
-- them later. Partial indexes whose predicate references `status` MUST be
-- dropped before the column type change, otherwise PostgreSQL fails with
-- "functions in index predicate must be marked IMMUTABLE" because the
-- text→enum cast is volatile.
DROP INDEX IF EXISTS idx_checkout_sessions_status;
DROP INDEX IF EXISTS unique_checkout_idempotency;

-- 3. Convert column type. Map any unrecognized legacy values to 'pending'.
ALTER TABLE checkout_sessions
  ALTER COLUMN status TYPE checkout_session_status
  USING (
    CASE
      WHEN status = 'pending' THEN 'pending'::checkout_session_status
      WHEN status = 'completed' THEN 'completed'::checkout_session_status
      WHEN status = 'failed' THEN 'failed'::checkout_session_status
      WHEN status = 'expired' THEN 'expired'::checkout_session_status
      WHEN status = 'processing' THEN 'awaiting_payment'::checkout_session_status
      ELSE 'pending'::checkout_session_status
    END
  );

ALTER TABLE checkout_sessions
  ALTER COLUMN status SET DEFAULT 'pending'::checkout_session_status,
  ALTER COLUMN status SET NOT NULL;

-- 4. Add new columns
ALTER TABLE checkout_sessions
  ADD COLUMN IF NOT EXISTS request_dto JSONB,
  ADD COLUMN IF NOT EXISTS execution_error TEXT,
  ADD COLUMN IF NOT EXISTS executed_at TIMESTAMPTZ;

-- 5. Backfill: anything that has completed_at maps to 'completed';
--    anything past expires_at maps to 'expired'; everything else stays 'pending'.
UPDATE checkout_sessions
   SET status = CASE
     WHEN completed_at IS NOT NULL THEN 'completed'::checkout_session_status
     WHEN expires_at < NOW() THEN 'expired'::checkout_session_status
     ELSE 'pending'::checkout_session_status
   END;

-- 6. Recreate the idempotency partial index using the new enum type literal
CREATE UNIQUE INDEX unique_checkout_idempotency
  ON checkout_sessions(customer_email, product_id)
  WHERE status = 'pending'::checkout_session_status;

-- 7. Partial index on the in-flight statuses (the rows we actually query for)
CREATE INDEX checkout_sessions_status_idx
  ON checkout_sessions(status)
  WHERE status IN (
    'pending'::checkout_session_status,
    'awaiting_payment'::checkout_session_status,
    'executing'::checkout_session_status
  );

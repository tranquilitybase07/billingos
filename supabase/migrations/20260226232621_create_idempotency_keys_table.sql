-- Create idempotency_keys table for usage tracking deduplication
CREATE TABLE
    idempotency_keys (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid (),
        idempotency_key TEXT NOT NULL,
        customer_id UUID NOT NULL REFERENCES customers (id) ON DELETE CASCADE,
        response JSONB NOT NULL DEFAULT '{}',
        created_at TIMESTAMPTZ DEFAULT NOW (),
        expires_at TIMESTAMPTZ NOT NULL DEFAULT (NOW () + INTERVAL '24 hours'),
        CONSTRAINT idempotency_keys_unique UNIQUE (customer_id, idempotency_key)
    );

-- Index for fast lookups by customer + key
CREATE INDEX idx_idempotency_keys_lookup ON idempotency_keys (customer_id, idempotency_key);

-- Index for cleanup of expired keys
CREATE INDEX idx_idempotency_keys_expires_at ON idempotency_keys (expires_at);
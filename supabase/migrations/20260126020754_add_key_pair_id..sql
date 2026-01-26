-- Add key_pair_id to link secret and publishable keys together (like Stripe)
-- This allows generating keys as pairs rather than individually

ALTER TABLE public.api_keys
ADD COLUMN key_pair_id UUID;

-- Create index for fast pair lookups
CREATE INDEX idx_api_keys_pair ON public.api_keys(key_pair_id) WHERE key_pair_id IS NOT NULL;

-- Add comment explaining the pairing concept
COMMENT ON COLUMN public.api_keys.key_pair_id IS 'Links secret and publishable keys together as a pair. When creating keys like Stripe, both secret (sk_*) and publishable (pk_*) keys share the same key_pair_id. NULL for legacy individual keys.';

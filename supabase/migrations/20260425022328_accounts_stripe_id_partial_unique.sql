-- Replace the absolute unique constraint on accounts.stripe_id with a partial
-- unique index that only enforces uniqueness on non-soft-deleted rows.
--
-- The original constraint (accounts_stripe_id_key) prevented reconnecting the
-- same Stripe account after disconnect, because the soft-deleted row still
-- occupied the unique slot. A partial unique index lets the same stripe_id
-- be reused after the previous row is soft-deleted, while still preventing
-- duplicate active connections.
-- Drop the column-level UNIQUE constraint (auto-named accounts_stripe_id_key)
ALTER TABLE public.accounts
DROP CONSTRAINT IF EXISTS accounts_stripe_id_key;

-- Drop the redundant explicit unique index from the original migration
DROP INDEX IF EXISTS public.idx_accounts_stripe_id;

-- Replace with a partial unique index: only one active (non-deleted) row per stripe_id
CREATE UNIQUE INDEX idx_accounts_stripe_id_active_unique ON public.accounts (stripe_id)
WHERE
    deleted_at IS NULL;
import Stripe from 'stripe';
import { SupabaseClient } from '@supabase/supabase-js';
import { Database } from '../types/shared';

/**
 * Context passed to every webhook handler after middleware processing.
 * Contains the resolved Stripe event, Supabase client, and resolved
 * account/organization metadata.
 */
export interface WebhookContext {
  /** The original Stripe event */
  event: Stripe.Event;
  /** Pre-configured Supabase client (service-role) */
  supabase: SupabaseClient<Database>;
  /** Stripe Connect account ID (event.account), if present */
  stripeAccountId: string | null;
  /** Whether this is a live-mode event */
  livemode: boolean;
}

/**
 * Interface for per-event webhook handlers.
 * Each handler processes a specific event type (or set of related types).
 */
export interface WebhookHandler {
  /**
   * Handle a webhook event within the provided context.
   * Handlers should NOT throw for non-critical failures — log and return instead.
   * Only throw if the failure warrants Stripe retrying the event.
   */
  handle(ctx: WebhookContext): Promise<void>;
}

/**
 * A decomposed task within a complex handler (e.g., subscription.updated).
 * Tasks run in sequence and share the same WebhookContext plus handler-specific data.
 */
export interface WebhookTask<TData = unknown> {
  /** Human-readable name for logging */
  readonly name: string;
  /**
   * Execute the task. Return void on success or throw to abort remaining tasks.
   */
  execute(ctx: WebhookContext, data: TData): Promise<void>;
}

/** Data passed between subscription.updated tasks */
export interface SubscriptionUpdatedData {
  /** Existing subscription record from BOS DB */
  existing: {
    id: string;
    customer_id: string;
    product_id: string;
    price_id: string | null;
    status: string;
    stripe_subscription_id: string | null;
    current_period_start: string;
    current_period_end: string;
    cancel_at_period_end: boolean;
    amount: number | null;
    currency: string | null;
    metadata: Record<string, unknown> | null;
  };
  /** Fresh Stripe subscription (re-fetched for authoritative state) */
  stripeSub: Stripe.Subscription;
  /** The Stripe Connect account ID */
  stripeAccountId: string;
  /** Whether the billing period changed (renewal) */
  periodChanged: boolean;
}

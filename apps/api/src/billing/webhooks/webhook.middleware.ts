import { Injectable, Logger } from '@nestjs/common';
import Stripe from 'stripe';
import { SupabaseService } from '../../supabase/supabase.service';
import { RedisService } from '../../redis/redis.service';
import { WebhookContext } from './webhook.types';
import { WebhookRouter } from './webhook.router';

/**
 * Webhook middleware pipeline.
 *
 * Handles all cross-cutting concerns before dispatching to per-event handlers:
 * 1. Structured logging (event type, livemode, id)
 * 2. Redis idempotency check (primary, 5-min TTL)
 * 3. DB idempotency check (secondary, audit trail)
 * 4. Audit trail insert (webhook_events table)
 * 5. Dispatch to handler via WebhookRouter
 * 6. Status tracking (processed/failed)
 */
@Injectable()
export class WebhookMiddleware {
  private readonly logger = new Logger(WebhookMiddleware.name);
  private readonly IDEMPOTENCY_TTL_MS = 300000; // 5 minutes

  constructor(
    private readonly supabaseService: SupabaseService,
    private readonly redisService: RedisService,
    private readonly router: WebhookRouter,
  ) {}

  /**
   * Dispatch a Stripe event directly to its handler, bypassing the
   * idempotency layers and `webhook_events` audit insert.
   *
   * Used by the admin module for "reconcile from Stripe" actions, where we
   * synthesize an `*.updated` event from a freshly fetched Stripe object and
   * route it through the existing handler so all sync logic stays in one
   * place. The caller is responsible for separately writing an audit row
   * (we use `admin_audit_log` for this).
   */
  async dispatchEventDirectly(event: Stripe.Event): Promise<void> {
    const ctx: WebhookContext = {
      event,
      supabase: this.supabaseService.getClient(),
      stripeAccountId: (event.account as string) || null,
      livemode: event.livemode,
    };
    await this.router.dispatch(ctx);
  }

  /**
   * Process an incoming Stripe webhook event through the middleware pipeline.
   * Called from StripeController after signature verification.
   */
  async handleEvent(event: Stripe.Event): Promise<void> {
    // 1. Structured logging
    this.logger.log(
      `Processing webhook event: ${event.type} (livemode: ${event.livemode}, id: ${event.id})`,
    );

    // 2. Redis idempotency check (primary layer)
    const idempotencyKey = `stripe:webhook:${event.livemode ? 'live' : 'test'}:${event.id}`;
    const isFirstRequest = await this.redisService.setIdempotencyKey(
      idempotencyKey,
      Date.now().toString(),
      this.IDEMPOTENCY_TTL_MS,
    );

    if (!isFirstRequest) {
      this.logger.warn(
        `Duplicate webhook event ${event.id} detected via Redis idempotency. Skipping.`,
      );
      return;
    }

    const supabase = this.supabaseService.getClient();

    // 3. DB idempotency check (secondary layer — audit trail + Redis-failure fallback)
    const { data: existingEvent } = await supabase
      .from('webhook_events')
      .select('id, status')
      .eq('event_id', event.id)
      .maybeSingle();

    if (existingEvent) {
      if (existingEvent.status === 'processed') {
        this.logger.warn(
          `Duplicate webhook event ${event.id} found in database - already processed. Skipping.`,
        );
        return;
      }
      // Failed/pending — allow retry by removing stale record
      this.logger.log(`Retrying ${existingEvent.status} event ${event.id}`);
      await supabase.from('webhook_events').delete().eq('event_id', event.id);
    }

    // 4. Audit trail insert
    const { error: insertError } = await supabase
      .from('webhook_events')
      .insert({
        event_id: event.id,
        event_type: event.type,
        livemode: event.livemode,
        status: 'pending',
        payload: event as any,
        api_version: event.api_version,
        account_id: event.account || null,
      });

    if (insertError) {
      this.logger.error(
        `Failed to store webhook event ${event.id}:`,
        insertError,
      );
      // Continue processing even if storage fails (non-critical)
    }

    // 5. Build context and dispatch
    const ctx: WebhookContext = {
      event,
      supabase,
      stripeAccountId: (event.account as string) || null,
      livemode: event.livemode,
    };

    try {
      await this.router.dispatch(ctx);

      // 6a. Mark event as processed
      await supabase
        .from('webhook_events')
        .update({
          status: 'processed',
          processed_at: new Date().toISOString(),
        })
        .eq('event_id', event.id);
    } catch (error) {
      // 6b. Mark event as failed
      await supabase
        .from('webhook_events')
        .update({
          status: 'failed',
          error_message: error instanceof Error ? error.message : String(error),
          retry_count: 1,
        })
        .eq('event_id', event.id);

      // Remove Redis idempotency key so Stripe's retry isn't silently blocked
      await this.redisService.delete(idempotencyKey);

      throw error; // Re-throw → 500 → Stripe retries
    }
  }
}

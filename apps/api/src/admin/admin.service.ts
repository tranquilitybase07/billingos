import {
  Injectable,
  Logger,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import Stripe from 'stripe';
import { SupabaseService } from '../supabase/supabase.service';
import { StripeService } from '../stripe/stripe.service';
import { RedisService } from '../redis/redis.service';
import { WebhookMiddleware } from '../billing/webhooks/webhook.middleware';

/**
 * Internal admin operations — webhook replay, Stripe reconciliation, and
 * read-only Stripe snapshots. Called from the billingos-admin dashboard via
 * `AdminTokenGuard`-protected routes.
 *
 * All Stripe access goes through `StripeService`; all writes either go via
 * `WebhookMiddleware` (which routes through the same handlers as live
 * webhooks) or stay within transactional code paths used in production.
 */
@Injectable()
export class AdminService {
  private readonly logger = new Logger(AdminService.name);

  constructor(
    private readonly supabaseService: SupabaseService,
    private readonly stripeService: StripeService,
    private readonly redisService: RedisService,
    private readonly webhookMiddleware: WebhookMiddleware,
  ) {}

  /**
   * Re-process a row from `webhook_events` through the full webhook pipeline,
   * exactly as if Stripe had just delivered it. Used to recover from handler
   * bugs or transient failures.
   *
   * Strategy:
   *  1. Load the row by id (UUID).
   *  2. Reset status to 'pending' so the middleware's idempotency check
   *     allows reprocessing (it deletes-and-reinserts on retry).
   *  3. Clear the Redis idempotency key for this event.
   *  4. Call `WebhookMiddleware.handleEvent` with the stored payload.
   */
  async replayWebhook(webhookEventId: string) {
    const supabase = this.supabaseService.getClient();

    const { data: row, error } = await supabase
      .from('webhook_events')
      .select('id, event_id, event_type, livemode, payload, status')
      .eq('id', webhookEventId)
      .maybeSingle();

    if (error) throw new BadRequestException(error.message);
    if (!row)
      throw new NotFoundException(`Webhook event ${webhookEventId} not found`);

    if (!row.payload || typeof row.payload !== 'object') {
      throw new BadRequestException(
        'Webhook event has no stored payload to replay',
      );
    }

    // Reset status so middleware treats this as a retry rather than a duplicate.
    await supabase
      .from('webhook_events')
      .update({ status: 'pending', error_message: null })
      .eq('id', webhookEventId);

    const idempotencyKey = `stripe:webhook:${row.livemode ? 'live' : 'test'}:${row.event_id}`;
    await this.redisService.delete(idempotencyKey);

    const event = row.payload as unknown as Stripe.Event;

    this.logger.log(
      `Admin replay: ${row.event_type} (event_id=${row.event_id}, db_id=${row.id})`,
    );

    try {
      await this.webhookMiddleware.handleEvent(event);
      return {
        ok: true,
        webhookEventId,
        eventId: row.event_id,
        eventType: row.event_type,
      };
    } catch (err) {
      this.logger.error(
        `Admin replay failed for ${row.event_id}: ${(err as Error).message}`,
      );
      throw new BadRequestException(`Replay failed: ${(err as Error).message}`);
    }
  }

  /**
   * Force-reconcile a single subscription's BOS state from Stripe. Pulls the
   * authoritative subscription object from Stripe, synthesizes a
   * `customer.subscription.updated` event, and routes it through the same
   * handler that processes live webhooks — so all sync logic lives in one
   * place.
   *
   * `subscriptionId` may be either the BOS UUID or the Stripe id.
   */
  async reconcileSubscription(subscriptionId: string) {
    const supabase = this.supabaseService.getClient();

    const isStripeId = subscriptionId.startsWith('sub_');
    const lookupColumn = isStripeId ? 'stripe_subscription_id' : 'id';

    const { data: subRow, error } = await supabase
      .from('subscriptions')
      .select(
        'id, organization_id, stripe_subscription_id, status, organizations!inner(account_id, accounts!inner(stripe_id))',
      )
      .eq(lookupColumn, subscriptionId)
      .maybeSingle();

    if (error) throw new BadRequestException(error.message);
    if (!subRow)
      throw new NotFoundException(`Subscription ${subscriptionId} not found`);

    const stripeSubscriptionId = subRow.stripe_subscription_id;
    if (!stripeSubscriptionId) {
      throw new BadRequestException(
        'Subscription has no stripe_subscription_id — nothing to reconcile from Stripe',
      );
    }

    const accountStripeId = this.extractStripeAccountId(subRow.organizations);
    if (!accountStripeId) {
      throw new BadRequestException(
        'Organization is missing a Stripe Connect account; cannot reconcile',
      );
    }

    const stripeSub = await this.stripeService.getSubscription(
      stripeSubscriptionId,
      accountStripeId,
    );

    const event = this.synthesizeEvent(
      'customer.subscription.updated',
      stripeSub,
      accountStripeId,
    );

    await this.webhookMiddleware.dispatchEventDirectly(event);

    return {
      ok: true,
      subscriptionId: subRow.id,
      stripeSubscriptionId,
      stripeStatus: stripeSub.status,
      bosStatusBefore: subRow.status,
    };
  }

  /**
   * Force-reconcile a customer's BOS state from Stripe. Same pattern as
   * `reconcileSubscription` but for `customer.updated`.
   */
  async reconcileCustomer(customerId: string) {
    const supabase = this.supabaseService.getClient();

    const isStripeId = customerId.startsWith('cus_');
    const lookupColumn = isStripeId ? 'stripe_customer_id' : 'id';

    const { data: customerRow, error } = await supabase
      .from('customers')
      .select(
        'id, organization_id, stripe_customer_id, organizations!inner(account_id, accounts!inner(stripe_id))',
      )
      .eq(lookupColumn, customerId)
      .maybeSingle();

    if (error) throw new BadRequestException(error.message);
    if (!customerRow)
      throw new NotFoundException(`Customer ${customerId} not found`);

    const accountStripeId = this.extractStripeAccountId(
      customerRow.organizations,
    );
    if (!accountStripeId) {
      throw new BadRequestException(
        'Organization is missing a Stripe Connect account; cannot reconcile',
      );
    }

    const stripeCustomerId = customerRow.stripe_customer_id;
    if (!stripeCustomerId) {
      throw new BadRequestException(
        'Customer has no stripe_customer_id — nothing to reconcile from Stripe',
      );
    }

    const stripeCustomer = await this.stripeService.getConnectCustomer(
      stripeCustomerId,
      accountStripeId,
    );

    if ((stripeCustomer as Stripe.DeletedCustomer).deleted) {
      throw new BadRequestException(
        'Stripe customer has been deleted; refusing to reconcile',
      );
    }

    const event = this.synthesizeEvent(
      'customer.updated',
      stripeCustomer as Stripe.Customer,
      accountStripeId,
    );

    await this.webhookMiddleware.dispatchEventDirectly(event);

    return {
      ok: true,
      customerId: customerRow.id,
      stripeCustomerId,
    };
  }

  /**
   * Read-only snapshot of a customer's live state in Stripe — the customer
   * object, their subscriptions, and recent invoices. For inspection only;
   * no DB writes.
   */
  async getCustomerSnapshot(customerId: string) {
    const supabase = this.supabaseService.getClient();

    const isStripeId = customerId.startsWith('cus_');
    const lookupColumn = isStripeId ? 'stripe_customer_id' : 'id';

    const { data: customerRow, error } = await supabase
      .from('customers')
      .select(
        'id, organization_id, stripe_customer_id, email, organizations!inner(account_id, accounts!inner(stripe_id))',
      )
      .eq(lookupColumn, customerId)
      .maybeSingle();

    if (error) throw new BadRequestException(error.message);
    if (!customerRow)
      throw new NotFoundException(`Customer ${customerId} not found`);

    const accountStripeId = this.extractStripeAccountId(
      customerRow.organizations,
    );
    if (!accountStripeId) {
      throw new BadRequestException(
        'Organization is missing a Stripe Connect account',
      );
    }

    const stripeCustomerId = customerRow.stripe_customer_id;
    if (!stripeCustomerId) {
      throw new BadRequestException('Customer has no stripe_customer_id');
    }

    const [stripeCustomer, subscriptions, invoices] = await Promise.all([
      this.stripeService.getConnectCustomer(stripeCustomerId, accountStripeId),
      this.stripeService.listCustomerSubscriptions({
        customerId: stripeCustomerId,
        stripeAccountId: accountStripeId,
        status: 'all',
      }),
      this.stripeService.listCustomerInvoices(
        stripeCustomerId,
        accountStripeId,
      ),
    ]);

    return {
      customer: stripeCustomer,
      subscriptions: subscriptions.data,
      invoices: invoices.data,
    };
  }

  // ── Private helpers ──

  /**
   * Wrap a Stripe object in a synthetic Event envelope so we can route it
   * through the existing webhook handlers. The synthetic event id is
   * prefixed `evt_admin_*` so anything that ends up in audit tables is
   * obviously not a real Stripe-delivered event.
   */
  private synthesizeEvent<T>(
    type: Stripe.Event.Type,
    object: T,
    stripeAccountId: string,
  ): Stripe.Event {
    return {
      id: `evt_admin_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      object: 'event',
      api_version: '2024-06-20',
      created: Math.floor(Date.now() / 1000),
      data: {
        object: object as unknown as Stripe.Event.Data.Object,
      },
      livemode: process.env.NODE_ENV === 'production',
      pending_webhooks: 0,
      request: { id: null, idempotency_key: null },
      type,
      account: stripeAccountId,
    } as Stripe.Event;
  }

  private extractStripeAccountId(organizations: unknown): string | null {
    const org = Array.isArray(organizations) ? organizations[0] : organizations;
    if (!org || typeof org !== 'object') return null;
    const accounts = (org as Record<string, unknown>).accounts;
    const account = Array.isArray(accounts) ? accounts[0] : accounts;
    if (!account || typeof account !== 'object') return null;
    return ((account as Record<string, unknown>).stripe_id as string) ?? null;
  }
}

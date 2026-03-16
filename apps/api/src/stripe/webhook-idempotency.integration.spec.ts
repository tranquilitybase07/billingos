/**
 * Phase 1 Critical Integration Test: C4
 *
 * C4: Webhook Idempotency (Redis + DB Double-Guard)
 *
 * Tests that duplicate webhook events are properly deduplicated via:
 * Part A — Redis-based idempotency (SET NX)
 * Part B — Database fallback when Redis unavailable
 */
import {
  createIntegrationTestModule,
  cleanBetweenTests,
  IntegrationTestContext,
} from '../../test/integration/setup';
import {
  seedOrganization,
  seedProduct,
  seedPrice,
  seedCustomer,
  seedSubscription,
  fetchRows,
} from '../../test/integration/db-helpers';
import { buildPaymentIntentSucceededEvent } from '../../test/integration/webhook-helpers';
import { StripeWebhookService } from './stripe-webhook.service';
import { RedisService } from '../redis/redis.service';
import { SupabaseService } from '../supabase/supabase.service';
import { randomUUID } from 'crypto';

describe('C4: Webhook Idempotency Integration Tests', () => {
  let ctx: IntegrationTestContext;
  let webhookService: StripeWebhookService;
  let redisService: RedisService;

  beforeAll(async () => {
    ctx = await createIntegrationTestModule();
    webhookService = ctx.module.get(StripeWebhookService);
    redisService = ctx.module.get(RedisService);
  });

  afterAll(async () => {
    await ctx.cleanup();
  });

  afterEach(async () => {
    await cleanBetweenTests(ctx.module);
  });

  /**
   * Helper to seed a complete checkout state (org + account + product + price +
   * customer + subscription + payment_intent) so the webhook handler has
   * everything it needs to process a payment_intent.succeeded event.
   */
  async function seedCompleteCheckoutState() {
    const org = await seedOrganization(ctx.module);
    const product = await seedProduct(ctx.module, org.id);
    const price = await seedPrice(ctx.module, product.id, { amount: 2999 });
    const customer = await seedCustomer(ctx.module, org.id, {
      externalId: 'ext_idem_user',
    });

    const stripeSubId = `sub_idem_${Date.now()}`;
    const stripePiId = `pi_idem_${Date.now()}`;

    const subId = await seedSubscription(ctx.module, {
      organizationId: org.id,
      productId: product.id,
      priceId: price.id,
      customerId: customer.id,
      status: 'incomplete',
      stripeSubscriptionId: stripeSubId,
    });

    // Seed payment_intent record
    const supabase = ctx.module.get(SupabaseService).getClient();
    const piId = randomUUID();

    const { error: piError } = await supabase
      .from('payment_intents')
      .insert({
        id: piId,
        organization_id: org.id,
        customer_id: customer.id,
        stripe_payment_intent_id: stripePiId,
        stripe_customer_id: customer.stripe_customer_id,
        stripe_account_id: org.stripe_account_id,
        stripe_subscription_id: stripeSubId,
        client_secret: `${stripePiId}_secret_test`,
        amount: 2999,
        currency: 'usd',
        application_fee_amount: 150,
        status: 'requires_payment_method',
        product_id: product.id,
        price_id: price.id,
        metadata: {
          subscriptionCreatedDuringCheckout: true,
          stripeSubscriptionId: stripeSubId,
        },
      });

    if (piError) throw new Error(`Failed to seed payment_intent: ${piError.message}`);

    // Seed checkout session
    const expiresAt = new Date();
    expiresAt.setHours(expiresAt.getHours() + 1);

    const { error: csError } = await supabase.from('checkout_sessions').insert({
      organization_id: org.id,
      session_token: customer.external_id,
      payment_intent_id: piId,
      stripe_subscription_id: stripeSubId,
      customer_email: customer.email,
      customer_name: customer.name,
      customer_external_id: customer.external_id,
      expires_at: expiresAt.toISOString(),
      metadata: {
        checkoutMode: 'standard',
        stripeSubscriptionId: stripeSubId,
        stripeAccountId: org.stripe_account_id,
      },
    });

    if (csError) throw new Error(`Failed to seed checkout_session: ${csError.message}`);

    return {
      org,
      product,
      price,
      customer,
      subId,
      stripeSubId,
      stripePiId,
      piId,
    };
  }

  // ─── Part A: Redis prevents duplicate ─────────────────────────────────

  describe('Part A: Redis-based deduplication', () => {
    it('should process first webhook and skip duplicate', async () => {
      const state = await seedCompleteCheckoutState();

      const eventId = `evt_dedup_${Date.now()}`;
      const event = buildPaymentIntentSucceededEvent({
        paymentIntentId: state.stripePiId,
        amount: 2999,
        customerId: state.customer.stripe_customer_id,
        metadata: {
          organizationId: state.org.id,
          productId: state.product.id,
          priceId: state.price.id,
          customerId: state.customer.id,
        },
        stripeAccountId: state.org.stripe_account_id,
        eventId,
      });

      // First call — should process
      await webhookService.handleEvent(event);

      // Verify webhook_events row exists
      const events = await fetchRows(ctx.module, 'webhook_events', {
        event_id: eventId,
      });
      expect(events.length).toBe(1);
      expect(events[0].status).toBe('processed');

      // Second call — should be skipped (Redis NX returns false)
      await webhookService.handleEvent(event);

      // Still exactly 1 webhook_events row (duplicate was not re-inserted)
      const eventsAfter = await fetchRows(ctx.module, 'webhook_events', {
        event_id: eventId,
      });
      expect(eventsAfter.length).toBe(1);

      // Exactly 1 subscription (no duplicate created)
      const subs = await fetchRows(ctx.module, 'subscriptions', {
        organization_id: state.org.id,
      });
      expect(subs.length).toBe(1);
    });
  });

  // ─── Part B: DB fallback when Redis down ──────────────────────────────

  describe('Part B: Database fallback deduplication', () => {
    it('should use DB check when Redis idempotency key is not set', async () => {
      const state = await seedCompleteCheckoutState();

      const eventId = `evt_dbfallback_${Date.now()}`;
      const event = buildPaymentIntentSucceededEvent({
        paymentIntentId: state.stripePiId,
        amount: 2999,
        customerId: state.customer.stripe_customer_id,
        metadata: {
          organizationId: state.org.id,
          productId: state.product.id,
          priceId: state.price.id,
          customerId: state.customer.id,
        },
        stripeAccountId: state.org.stripe_account_id,
        eventId,
      });

      // First call — process normally
      await webhookService.handleEvent(event);

      const events = await fetchRows(ctx.module, 'webhook_events', {
        event_id: eventId,
      });
      expect(events.length).toBe(1);
      expect(events[0].status).toBe('processed');

      // Clear Redis to simulate Redis being unavailable
      // (the key is gone, but DB record still exists)
      await redisService.delete(`stripe:webhook:test:${eventId}`);

      // Second call — Redis will allow (key doesn't exist),
      // but DB check should block
      await webhookService.handleEvent(event);

      // Still exactly 1 processed event
      const eventsAfter = await fetchRows(ctx.module, 'webhook_events', {
        event_id: eventId,
      });
      expect(eventsAfter.length).toBe(1);

      // Still exactly 1 subscription
      const subs = await fetchRows(ctx.module, 'subscriptions', {
        organization_id: state.org.id,
      });
      expect(subs.length).toBe(1);
    });
  });
});

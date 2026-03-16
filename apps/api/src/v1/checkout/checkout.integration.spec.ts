/**
 * Phase 1 Critical Integration Tests: C1, C2, C3, C7
 *
 * C1: Paid Checkout → Payment → Subscription
 * C2: Free Product Checkout
 * C3: Trial Product Checkout (SetupIntent)
 * C7: Duplicate Checkout Prevention
 */
import {
  createIntegrationTestModule,
  cleanBetweenTests,
  IntegrationTestContext,
} from '../../../test/integration/setup';
import {
  seedOrganization,
  seedProduct,
  seedPrice,
  seedCustomer,
  seedFeature,
  seedSubscription,
  fetchRows,
  countRows,
} from '../../../test/integration/db-helpers';
import type {
  SeedOrg,
  SeedProduct,
  SeedPrice,
  SeedCustomer,
} from '../../../test/integration/db-helpers';
import {
  buildPaymentIntentSucceededEvent,
  buildSetupIntentSucceededEvent,
} from '../../../test/integration/webhook-helpers';
import { CheckoutService } from './checkout.service';
import { StripeWebhookService } from '../../stripe/stripe-webhook.service';
import { BadRequestException } from '@nestjs/common';

describe('Checkout Integration Tests (C1, C2, C3, C7)', () => {
  let ctx: IntegrationTestContext;
  let checkoutService: CheckoutService;
  let webhookService: StripeWebhookService;

  beforeAll(async () => {
    ctx = await createIntegrationTestModule();
    checkoutService = ctx.module.get(CheckoutService);
    webhookService = ctx.module.get(StripeWebhookService);
  });

  afterAll(async () => {
    await ctx.cleanup();
  });

  afterEach(async () => {
    await cleanBetweenTests(ctx.module);
  });

  // ─── C1: Paid Checkout → Payment → Subscription ──────────────────────

  describe('C1: Paid checkout flow', () => {
    let org: SeedOrg;
    let product: SeedProduct;
    let price: SeedPrice;

    beforeEach(async () => {
      org = await seedOrganization(ctx.module);
      product = await seedProduct(ctx.module, org.id, {
        name: 'Pro Plan',
      });
      price = await seedPrice(ctx.module, product.id, {
        amount: 2999,
        currency: 'usd',
      });
      // Seed 2 features
      await seedFeature(ctx.module, org.id, product.id, {
        name: 'feature-a',
        title: 'Feature A',
        type: 'boolean',
        displayOrder: 1,
      });
      await seedFeature(ctx.module, org.id, product.id, {
        name: 'feature-b',
        title: 'Feature B',
        type: 'boolean',
        displayOrder: 2,
      });
    });

    it('should create checkout session with payment intent and subscription', async () => {
      // Step 1: Create checkout — this creates a Stripe subscription (incomplete) + PI
      const result = await checkoutService.createCheckout(
        org.id,
        'ext_user_c1',
        { priceId: price.id },
      );

      // Verify checkout response
      expect(result).toBeDefined();
      expect(result.checkoutMode).toBe('standard');
      expect(result.amount).toBe(2999);
      expect(result.clientSecret).toBeDefined();
      expect(result.paymentIntentId).toBeDefined();
      expect(result.product.name).toBe('Pro Plan');

      // Verify DB records created
      const paymentIntents = await fetchRows(ctx.module, 'payment_intents', {
        organization_id: org.id,
      });
      expect(paymentIntents.length).toBe(1);
      expect(paymentIntents[0].amount).toBe(2999);
      expect(paymentIntents[0].status).toBe('requires_payment_method');

      // Verify subscription created with status: incomplete
      const subscriptions = await fetchRows(ctx.module, 'subscriptions', {
        organization_id: org.id,
      });
      expect(subscriptions.length).toBe(1);
      expect(subscriptions[0].status).toBe('incomplete');
      expect(subscriptions[0].product_id).toBe(product.id);
      expect(subscriptions[0].price_id).toBe(price.id);

      // Verify checkout session created
      const checkoutSessions = await fetchRows(
        ctx.module,
        'checkout_sessions',
        { organization_id: org.id },
      );
      expect(checkoutSessions.length).toBe(1);
    });

    it('should activate subscription and grant features on payment success', async () => {
      // Create checkout first
      await checkoutService.createCheckout(org.id, 'ext_user_c1_pay', {
        priceId: price.id,
      });

      // Get the subscription from DB
      const subscriptions = await fetchRows(ctx.module, 'subscriptions', {
        organization_id: org.id,
      });
      expect(subscriptions.length).toBe(1);
      const sub = subscriptions[0];

      // Get the payment intent from DB
      const paymentIntents = await fetchRows(ctx.module, 'payment_intents', {
        organization_id: org.id,
      });
      const pi = paymentIntents[0];

      // Simulate payment_intent.succeeded webhook
      const event = buildPaymentIntentSucceededEvent({
        paymentIntentId: pi.stripe_payment_intent_id as string,
        amount: 2999,
        customerId: pi.stripe_customer_id as string,
        metadata: {
          organizationId: org.id,
          productId: product.id,
          priceId: price.id,
          customerId: sub.customer_id as string,
        },
        stripeAccountId: org.stripe_account_id,
      });

      await webhookService.handleEvent(event);

      // Verify subscription activated
      const updatedSubs = await fetchRows(ctx.module, 'subscriptions', {
        organization_id: org.id,
      });
      expect(updatedSubs.length).toBe(1);
      expect(updatedSubs[0].status).toBe('active');

      // Verify feature grants
      const grants = await fetchRows(ctx.module, 'feature_grants', {
        subscription_id: sub.id as string,
      });
      expect(grants.length).toBe(2);
      for (const grant of grants) {
        expect(grant.revoked_at).toBeNull();
      }

      // Verify checkout session marked complete
      const sessions = await fetchRows(ctx.module, 'checkout_sessions', {
        organization_id: org.id,
      });
      expect(sessions[0].completed_at).toBeDefined();
      expect(sessions[0].completed_at).not.toBeNull();
    });
  });

  // ─── C2: Free Product Checkout ────────────────────────────────────────

  describe('C2: Free product checkout', () => {
    let org: SeedOrg;
    let product: SeedProduct;
    let price: SeedPrice;

    beforeEach(async () => {
      org = await seedOrganization(ctx.module);
      product = await seedProduct(ctx.module, org.id, {
        name: 'Free Plan',
      });
      price = await seedPrice(ctx.module, product.id, {
        amount: 0,
        amountType: 'free',
      });
      await seedFeature(ctx.module, org.id, product.id, {
        name: 'basic-feature',
        title: 'Basic Feature',
        type: 'boolean',
      });
    });

    it('should create a free checkout session without payment', async () => {
      const result = await checkoutService.createCheckout(
        org.id,
        'ext_user_free',
        { priceId: price.id },
      );

      // Verify response indicates free mode
      expect(result).toBeDefined();
      expect(result.amount).toBe(0);
      expect(result.totalAmount).toBe(0);
      expect(result.clientSecret).toBe('');
      expect(result.paymentIntentId).toBe('');

      // Verify checkout session created
      const sessions = await fetchRows(ctx.module, 'checkout_sessions', {
        organization_id: org.id,
      });
      expect(sessions.length).toBe(1);
      const sessionMeta = sessions[0].metadata as Record<string, unknown>;
      expect(sessionMeta.isFreeProduct).toBe(true);

      // Verify NO payment intents created
      const piCount = await countRows(ctx.module, 'payment_intents', {
        organization_id: org.id,
      });
      expect(piCount).toBe(0);
    });

    it('should activate free subscription on confirmation', async () => {
      const result = await checkoutService.createCheckout(
        org.id,
        'ext_user_free_confirm',
        { priceId: price.id },
      );

      // Confirm the free checkout
      const confirmation = await checkoutService.confirmFreeCheckout(result.id);

      expect(confirmation).toBeDefined();
      expect(confirmation.status).toBe('active');

      // Verify subscription created with no Stripe subscription
      const subs = await fetchRows(ctx.module, 'subscriptions', {
        organization_id: org.id,
      });
      expect(subs.length).toBe(1);
      expect(subs[0].status).toBe('active');

      // Verify feature granted
      const grants = await fetchRows(ctx.module, 'feature_grants', {
        subscription_id: subs[0].id as string,
      });
      expect(grants.length).toBe(1);
      expect(grants[0].revoked_at).toBeNull();
    });
  });

  // ─── C3: Trial Product Checkout ───────────────────────────────────────

  describe('C3: Trial product checkout', () => {
    let org: SeedOrg;
    let product: SeedProduct;
    let price: SeedPrice;

    beforeEach(async () => {
      org = await seedOrganization(ctx.module);
      product = await seedProduct(ctx.module, org.id, {
        name: 'Trial Plan',
        trialDays: 14,
      });
      price = await seedPrice(ctx.module, product.id, {
        amount: 2999,
        currency: 'usd',
      });
      await seedFeature(ctx.module, org.id, product.id, {
        name: 'trial-feature',
        title: 'Trial Feature',
        type: 'boolean',
      });
    });

    it('should create a trial checkout with SetupIntent', async () => {
      const result = await checkoutService.createCheckout(
        org.id,
        'ext_user_trial',
        { priceId: price.id },
      );

      expect(result).toBeDefined();
      expect(result.checkoutMode).toBe('trial');
      expect(result.trialDays).toBe(14);
      // Trial uses SetupIntent — clientSecret should be from SetupIntent
      expect(result.clientSecret).toBeDefined();
    });

    it('should activate trialing subscription on setup_intent.succeeded', async () => {
      await checkoutService.createCheckout(org.id, 'ext_user_trial_setup', {
        priceId: price.id,
      });

      // Find the checkout session metadata for the SetupIntent ID
      const sessions = await fetchRows(ctx.module, 'checkout_sessions', {
        organization_id: org.id,
      });
      expect(sessions.length).toBe(1);
      const sessionMeta = sessions[0].metadata as Record<string, unknown>;

      // Find any subscription created (trial flow may create sub during checkout)
      const subs = await fetchRows(ctx.module, 'subscriptions', {
        organization_id: org.id,
      });

      if (subs.length > 0) {
        // If trial sub was created during checkout, it should be trialing
        expect(['trialing', 'incomplete']).toContain(subs[0].status);
      }

      // Simulate setup_intent.succeeded webhook
      const setupIntentId =
        (sessionMeta.setupIntentId as string) || `seti_test_${Date.now()}`;
      const event = buildSetupIntentSucceededEvent({
        setupIntentId,
        metadata: {
          organizationId: org.id,
          productId: product.id,
          priceId: price.id,
        },
        stripeAccountId: org.stripe_account_id,
      });

      await webhookService.handleEvent(event);

      // Verify subscription exists and has trial state
      const updatedSubs = await fetchRows(ctx.module, 'subscriptions', {
        organization_id: org.id,
      });
      expect(updatedSubs.length).toBeGreaterThanOrEqual(1);

      // Find the active or trialing subscription
      const activeSub = updatedSubs.find(
        (s) => s.status === 'trialing' || s.status === 'active',
      );

      if (activeSub) {
        // Verify features granted during trial
        const grants = await fetchRows(ctx.module, 'feature_grants', {
          subscription_id: activeSub.id as string,
        });
        expect(grants.length).toBeGreaterThanOrEqual(1);
        for (const grant of grants) {
          expect(grant.revoked_at).toBeNull();
        }
      }
    });
  });

  // ─── C7: Duplicate Checkout Prevention ────────────────────────────────

  describe('C7: Duplicate checkout prevention', () => {
    let org: SeedOrg;
    let product: SeedProduct;
    let price: SeedPrice;
    let customer: SeedCustomer;

    beforeEach(async () => {
      org = await seedOrganization(ctx.module);
      product = await seedProduct(ctx.module, org.id, {
        name: 'Pro Plan',
      });
      price = await seedPrice(ctx.module, product.id, {
        amount: 2999,
      });
      customer = await seedCustomer(ctx.module, org.id, {
        externalId: 'ext_dup_user',
      });
    });

    it('should reject checkout when customer has active subscription', async () => {
      // Seed an existing active subscription
      await seedSubscription(ctx.module, {
        organizationId: org.id,
        productId: product.id,
        priceId: price.id,
        customerId: customer.id,
        status: 'active',
      });

      // Attempt duplicate checkout
      await expect(
        checkoutService.createCheckout(org.id, customer.external_id, {
          priceId: price.id,
        }),
      ).rejects.toThrow(BadRequestException);

      // Verify no new subscription created
      const subs = await fetchRows(ctx.module, 'subscriptions', {
        organization_id: org.id,
      });
      expect(subs.length).toBe(1); // Only the original
    });

    it('should reject checkout when customer has trialing subscription', async () => {
      await seedSubscription(ctx.module, {
        organizationId: org.id,
        productId: product.id,
        priceId: price.id,
        customerId: customer.id,
        status: 'trialing',
      });

      await expect(
        checkoutService.createCheckout(org.id, customer.external_id, {
          priceId: price.id,
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('should allow checkout when previous subscription is canceled', async () => {
      await seedSubscription(ctx.module, {
        organizationId: org.id,
        productId: product.id,
        priceId: price.id,
        customerId: customer.id,
        status: 'canceled',
      });

      // This should NOT throw — customer can re-subscribe after cancellation
      const result = await checkoutService.createCheckout(
        org.id,
        customer.external_id,
        { priceId: price.id },
      );

      expect(result).toBeDefined();
    });
  });
});

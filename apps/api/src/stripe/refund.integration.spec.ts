/**
 * Phase 1 Critical Integration Test: C5
 *
 * C5: Automatic Refund on Subscription Failure
 *
 * Tests that when a customer pays but subscription creation fails,
 * the system auto-refunds the payment and logs it properly.
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
  fetchRows,
} from '../../test/integration/db-helpers';
import { RefundService } from './refund.service';
import { StripeService } from './stripe.service';
import { SupabaseService } from '../supabase/supabase.service';

describe('C5: Automatic Refund Integration Tests', () => {
  let ctx: IntegrationTestContext;
  let refundService: RefundService;
  let stripeService: StripeService;

  beforeAll(async () => {
    ctx = await createIntegrationTestModule();
    refundService = ctx.module.get(RefundService);
    stripeService = ctx.module.get(StripeService);
  });

  afterAll(async () => {
    await ctx.cleanup();
  });

  afterEach(async () => {
    await cleanBetweenTests(ctx.module);
  });

  it('should refund payment when subscription creation fails', async () => {
    const org = await seedOrganization(ctx.module);
    const product = await seedProduct(ctx.module, org.id);
    const price = await seedPrice(ctx.module, product.id, { amount: 2999 });
    const customer = await seedCustomer(ctx.module, org.id);

    // Create a PaymentIntent via stripe-mock to get a real pi_* ID
    const stripeClient = stripeService.getClient();
    const paymentIntent = await stripeClient.paymentIntents.create(
      {
        amount: 2999,
        currency: 'usd',
        customer: customer.stripe_customer_id,
        metadata: {
          organizationId: org.id,
          productId: product.id,
          priceId: price.id,
        },
      },
      { stripeAccount: org.stripe_account_id },
    );

    expect(paymentIntent.id).toBeDefined();

    // Seed payment_intent record in our DB
    const supabase = ctx.module.get(SupabaseService).getClient();
    await supabase.from('payment_intents').insert({
      organization_id: org.id,
      customer_id: customer.id,
      stripe_payment_intent_id: paymentIntent.id,
      stripe_customer_id: customer.stripe_customer_id,
      stripe_account_id: org.stripe_account_id,
      client_secret: paymentIntent.client_secret || '',
      amount: 2999,
      currency: 'usd',
      application_fee_amount: 150,
      status: 'succeeded',
      product_id: product.id,
      price_id: price.id,
      metadata: {},
    });

    // Trigger auto-refund — matches RefundService.refundPaymentOnFailure signature
    const result = await refundService.refundPaymentOnFailure({
      paymentIntentId: paymentIntent.id,
      stripeAccountId: org.stripe_account_id,
      reason: 'subscription_creation_failed',
    });

    expect(result.success).toBe(true);
    expect(result.refundId).toBeDefined();

    // Verify refund was created in stripe-mock
    const refunds = await stripeClient.refunds.list(
      { payment_intent: paymentIntent.id },
      { stripeAccount: org.stripe_account_id },
    );
    expect(refunds.data.length).toBeGreaterThanOrEqual(1);

    // Verify refund logged in database
    const dbRefunds = await fetchRows(ctx.module, 'refunds', {
      payment_intent_id: paymentIntent.id,
    });
    expect(dbRefunds.length).toBe(1);
    expect(dbRefunds[0].initiated_by).toBe('automatic');
    expect(dbRefunds[0].reason).toBe('subscription_creation_failed');
  });

  it('should log partial refund correctly via processManualRefund', async () => {
    const org = await seedOrganization(ctx.module);
    const product = await seedProduct(ctx.module, org.id);
    const price = await seedPrice(ctx.module, product.id, { amount: 5000 });
    const customer = await seedCustomer(ctx.module, org.id);

    // Create PaymentIntent via stripe-mock
    const stripeClient = stripeService.getClient();
    const paymentIntent = await stripeClient.paymentIntents.create(
      {
        amount: 5000,
        currency: 'usd',
        customer: customer.stripe_customer_id,
      },
      { stripeAccount: org.stripe_account_id },
    );

    // Seed in our DB
    const supabase = ctx.module.get(SupabaseService).getClient();
    await supabase.from('payment_intents').insert({
      organization_id: org.id,
      customer_id: customer.id,
      stripe_payment_intent_id: paymentIntent.id,
      stripe_customer_id: customer.stripe_customer_id,
      stripe_account_id: org.stripe_account_id,
      client_secret: paymentIntent.client_secret || '',
      amount: 5000,
      currency: 'usd',
      application_fee_amount: 250,
      status: 'succeeded',
      product_id: product.id,
      price_id: price.id,
      metadata: {},
    });

    // Process manual partial refund — matches processManualRefund signature
    const refund = await refundService.processManualRefund({
      paymentIntentId: paymentIntent.id,
      stripeAccountId: org.stripe_account_id,
      amount: 2500, // Partial refund
      reason: 'customer_request',
      requestedBy: 'admin_user',
    });

    expect(refund).toBeDefined();
    expect(refund.id).toBeDefined();

    // Verify partial refund in stripe-mock
    const refunds = await stripeClient.refunds.list(
      { payment_intent: paymentIntent.id },
      { stripeAccount: org.stripe_account_id },
    );
    expect(refunds.data.length).toBeGreaterThanOrEqual(1);

    // Verify refund log in DB
    const dbRefunds = await fetchRows(ctx.module, 'refunds', {
      payment_intent_id: paymentIntent.id,
    });
    expect(dbRefunds.length).toBe(1);
    expect(dbRefunds[0].initiated_by).toBe('manual');
  });
});

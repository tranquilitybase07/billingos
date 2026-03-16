/**
 * Phase 1 Critical Integration Test: C6
 *
 * C6: Feature Grant/Revoke Lifecycle
 *
 * Tests the full lifecycle of feature grants:
 * - Features granted when subscription activates
 * - Usage records created for quota features
 * - Features revoked when subscription is canceled
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
  seedFeature,
  seedSubscription,
  fetchRows,
} from '../../test/integration/db-helpers';
import { buildSubscriptionDeletedEvent } from '../../test/integration/webhook-helpers';
import { SubscriptionsService } from '../subscriptions/subscriptions.service';
import { StripeWebhookService } from './stripe-webhook.service';

describe('C6: Feature Grant/Revoke Lifecycle Integration Tests', () => {
  let ctx: IntegrationTestContext;
  let subscriptionsService: SubscriptionsService;
  let webhookService: StripeWebhookService;

  beforeAll(async () => {
    ctx = await createIntegrationTestModule();
    subscriptionsService = ctx.module.get(SubscriptionsService);
    webhookService = ctx.module.get(StripeWebhookService);
  });

  afterAll(async () => {
    await ctx.cleanup();
  });

  afterEach(async () => {
    await cleanBetweenTests(ctx.module);
  });

  describe('Feature grant on subscription creation', () => {
    it('should grant all product features when subscription activates', async () => {
      const org = await seedOrganization(ctx.module);
      const product = await seedProduct(ctx.module, org.id, {
        name: 'Full Plan',
      });
      const price = await seedPrice(ctx.module, product.id, {
        amount: 4999,
      });
      const customer = await seedCustomer(ctx.module, org.id);

      // Seed 3 features of different types
      const boolFeature = await seedFeature(ctx.module, org.id, product.id, {
        name: 'dashboard-access',
        title: 'Dashboard Access',
        type: 'boolean_flag',
        displayOrder: 1,
      });
      const quotaFeature = await seedFeature(ctx.module, org.id, product.id, {
        name: 'api-calls',
        title: 'API Calls',
        type: 'usage_quota',
        properties: { quota_limit: 1000 },
        displayOrder: 2,
      });
      const textFeature = await seedFeature(ctx.module, org.id, product.id, {
        name: 'support-level',
        title: 'Support Level',
        type: 'numeric_limit',
        properties: { value: 'premium' },
        displayOrder: 3,
      });

      // Create subscription
      const now = new Date();
      const periodEnd = new Date(now);
      periodEnd.setMonth(periodEnd.getMonth() + 1);

      const subId = await seedSubscription(ctx.module, {
        organizationId: org.id,
        productId: product.id,
        priceId: price.id,
        customerId: customer.id,
        status: 'active',
        amount: 4999,
      });

      // Grant features via the service
      // Signature: grantProductFeatures(customerId, subscriptionId, productId, periodStart, periodEnd)
      await subscriptionsService.grantProductFeatures(
        customer.id,
        subId,
        product.id,
        now,
        periodEnd,
      );

      // Verify 3 feature_grants created (one per feature)
      const grants = await fetchRows(ctx.module, 'feature_grants', {
        subscription_id: subId,
      });
      expect(grants.length).toBe(3);

      // All grants should be active (revoked_at is null)
      for (const grant of grants) {
        expect(grant.revoked_at).toBeNull();
      }

      // Verify feature IDs match
      const grantedFeatureIds = grants.map((g) => g.feature_id);
      expect(grantedFeatureIds).toContain(boolFeature.id);
      expect(grantedFeatureIds).toContain(quotaFeature.id);
      expect(grantedFeatureIds).toContain(textFeature.id);

      // Verify usage_records created for quota feature
      const usageRecords = await fetchRows(ctx.module, 'usage_records', {
        subscription_id: subId,
      });
      // Should have at least 1 usage record for the quota feature
      const quotaUsageRecords = usageRecords.filter(
        (r) => r.feature_id === quotaFeature.id,
      );
      expect(quotaUsageRecords.length).toBeGreaterThanOrEqual(1);
    });
  });

  describe('Feature revoke on subscription cancellation', () => {
    it('should revoke all features when subscription is deleted', async () => {
      const org = await seedOrganization(ctx.module);
      const product = await seedProduct(ctx.module, org.id);
      const price = await seedPrice(ctx.module, product.id, {
        amount: 2999,
      });
      const customer = await seedCustomer(ctx.module, org.id);

      // Seed features
      await seedFeature(ctx.module, org.id, product.id, {
        name: 'feat-1',
        title: 'Feature 1',
        type: 'boolean_flag',
        displayOrder: 1,
      });
      await seedFeature(ctx.module, org.id, product.id, {
        name: 'feat-2',
        title: 'Feature 2',
        type: 'boolean_flag',
        displayOrder: 2,
      });
      await seedFeature(ctx.module, org.id, product.id, {
        name: 'feat-3',
        title: 'Feature 3',
        type: 'usage_quota',
        properties: { quota_limit: 500 },
        displayOrder: 3,
      });

      const stripeSubId = `sub_lifecycle_${Date.now()}`;
      const now = new Date();
      const periodEnd = new Date(now);
      periodEnd.setMonth(periodEnd.getMonth() + 1);

      const subId = await seedSubscription(ctx.module, {
        organizationId: org.id,
        productId: product.id,
        priceId: price.id,
        customerId: customer.id,
        status: 'active',
        stripeSubscriptionId: stripeSubId,
        amount: 2999,
      });

      // Grant features first
      await subscriptionsService.grantProductFeatures(
        customer.id,
        subId,
        product.id,
        now,
        periodEnd,
      );

      // Verify grants exist
      let grants = await fetchRows(ctx.module, 'feature_grants', {
        subscription_id: subId,
      });
      expect(grants.length).toBe(3);
      expect(grants.every((g) => g.revoked_at === null)).toBe(true);

      // Simulate customer.subscription.deleted webhook
      const event = buildSubscriptionDeletedEvent({
        subscriptionId: stripeSubId,
        customerId: customer.stripe_customer_id,
        metadata: {
          organizationId: org.id,
          productId: product.id,
        },
        stripeAccountId: org.stripe_account_id,
      });

      await webhookService.handleEvent(event);

      // Verify all grants now have revoked_at set
      grants = await fetchRows(ctx.module, 'feature_grants', {
        subscription_id: subId,
      });
      expect(grants.length).toBe(3);
      for (const grant of grants) {
        expect(grant.revoked_at).not.toBeNull();
      }

      // Verify subscription status is canceled
      const subs = await fetchRows(ctx.module, 'subscriptions', {
        stripe_subscription_id: stripeSubId,
      });
      expect(subs.length).toBe(1);
      expect(subs[0].status).toBe('canceled');
      expect(subs[0].ended_at).not.toBeNull();
    });
  });

  describe('Feature grant idempotency', () => {
    it('should not create duplicate grants when called twice', async () => {
      const org = await seedOrganization(ctx.module);
      const product = await seedProduct(ctx.module, org.id);
      const price = await seedPrice(ctx.module, product.id);
      const customer = await seedCustomer(ctx.module, org.id);

      await seedFeature(ctx.module, org.id, product.id, {
        name: 'idem-feat',
        title: 'Idem Feature',
        type: 'boolean_flag',
      });

      const now = new Date();
      const periodEnd = new Date(now);
      periodEnd.setMonth(periodEnd.getMonth() + 1);

      const subId = await seedSubscription(ctx.module, {
        organizationId: org.id,
        productId: product.id,
        priceId: price.id,
        customerId: customer.id,
        status: 'active',
      });

      // Grant twice
      await subscriptionsService.grantProductFeatures(
        customer.id,
        subId,
        product.id,
        now,
        periodEnd,
      );
      await subscriptionsService.grantProductFeatures(
        customer.id,
        subId,
        product.id,
        now,
        periodEnd,
      );

      // Should still only have 1 active grant (not 2)
      const grants = await fetchRows(ctx.module, 'feature_grants', {
        subscription_id: subId,
      });
      const activeGrants = grants.filter((g) => g.revoked_at === null);
      expect(activeGrants.length).toBe(1);
    });
  });
});

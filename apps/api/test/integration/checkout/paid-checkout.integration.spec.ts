import request from 'supertest';
import { createTestApp, TestApp } from '../../setup/test-app';
import { createTestOrg, createTestProduct } from '../../helpers/db';
import {
  createTestApiKey,
  createTestSessionToken,
} from '../../helpers/auth';
import { confirmPaymentWithTestCard } from '../../helpers/stripe';
import { waitForCondition } from '../../helpers/wait';
import { SupabaseService } from '../../../src/supabase/supabase.service';

describe('paid checkout — happy path', () => {
  let ctx: TestApp;

  beforeAll(async () => {
    ctx = await createTestApp();
  });

  afterAll(async () => {
    await ctx.close();
  });

  it('creates checkout → confirms payment → activates subscription + grants features', async () => {
    const org = await createTestOrg(ctx.app);

    try {
      const product = await createTestProduct(ctx.app, org);
      const apiKey = await createTestApiKey(ctx.app, org.orgId);
      const session = await createTestSessionToken(
        ctx.app,
        apiKey.apiKeyId,
        org.orgId,
      );

      // 1. Create checkout session
      const createRes = await request(ctx.app.getHttpServer())
        .post('/v1/checkout/create')
        .set('Authorization', `Bearer ${session.token}`)
        .send({
          priceId: product.priceId,
          customerEmail: `customer-${session.externalUserId}@test.local`,
        });

      if (createRes.status !== 201) {
        // eslint-disable-next-line no-console
        console.error('checkout/create failed:', createRes.status, createRes.body);
      }
      expect(createRes.status).toBe(201);
      expect(createRes.body.paymentIntentId).toBeDefined();
      expect(createRes.body.clientSecret).toBeDefined();
      expect(createRes.body.status).toBe('pending');

      const paymentIntentId = createRes.body.paymentIntentId;

      // 2. Confirm the PaymentIntent with a test card on the Connect account
      const confirmed = await confirmPaymentWithTestCard(
        ctx.app,
        paymentIntentId,
        org.stripeAccountId,
      );
      expect(confirmed.status).toBe('succeeded');

      // 3. Wait for the payment_intent.succeeded webhook to be processed
      const supabase = ctx.app.get(SupabaseService).getClient();

      const subscription = await waitForCondition(
        async () => {
          const { data } = await supabase
            .from('subscriptions')
            .select('id, status, stripe_subscription_id')
            .eq('organization_id', org.orgId)
            .eq('status', 'active')
            .maybeSingle();
          return data;
        },
        { timeoutMs: 20000, label: 'subscription becomes active' },
      );

      expect(subscription.status).toBe('active');
      expect(subscription.stripe_subscription_id).toMatch(/^sub_/);

      // 4. Assert feature grant exists for this subscription
      const grants = await waitForCondition(
        async () => {
          const { data } = await supabase
            .from('feature_grants')
            .select('id, feature_id, revoked_at')
            .eq('subscription_id', subscription.id);
          return data && data.length > 0 ? data : null;
        },
        { timeoutMs: 10000, label: 'feature grants exist' },
      );

      expect(grants).toHaveLength(1);
      expect(grants[0].feature_id).toBe(product.featureId);
      expect(grants[0].revoked_at).toBeNull();
    } finally {
      await org.cleanup();
    }
  }, 60000);
});

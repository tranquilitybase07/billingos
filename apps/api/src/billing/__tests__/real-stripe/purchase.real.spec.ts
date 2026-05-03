/**
 * Real-Stripe purchase scenarios.
 *
 *   RS1 — Standard paid checkout creates incomplete BOS+Stripe sub
 *   RS2 — Trial signup returns a SetupIntent client secret
 */
import { useRealStripeSuite } from '../../../../test/real-stripe/test-bootstrap';
import {
  initRealScenario,
  lastCheckout,
} from '../../../../test/real-stripe/scenario';
import { fetchRows } from '../../../../test/integration/db-helpers';
import { StripeService } from '../../../stripe/stripe.service';

describe('Real Stripe — Purchase', () => {
  const suite = useRealStripeSuite();

  it('RS1: standard $10 checkout creates incomplete BOS+Stripe subscription', async () => {
    const module = suite.getModule();
    const org = suite.getOrg();

    const scenario = await initRealScenario({
      module,
      org,
      products: [
        { key: 'pro', amount: 1000, features: [{ key: 'dashboard' }] },
      ],
      actions: [{ type: 'subscribe', productKey: 'pro' }],
    });
    suite.track(scenario);

    const checkout = lastCheckout(scenario);
    expect(checkout.id).toBeTruthy();
    expect(checkout.checkoutMode).toBe('standard');
    expect(checkout.clientSecret).toBeTruthy();
    expect(checkout.paymentIntentId).toBeTruthy();

    const subs = await fetchRows(module, 'subscriptions', {
      customer_id: scenario.customer.bosCustomer.id,
    });
    expect(subs).toHaveLength(1);
    expect(subs[0].status).toBe('incomplete');
    expect(subs[0].stripe_subscription_id).toBeTruthy();

    // Cross-check: the sub the pipeline created actually exists in Stripe.
    const stripe = module.get(StripeService).getClient();
    const stripeSub = await stripe.subscriptions.retrieve(
      subs[0].stripe_subscription_id as string,
      { stripeAccount: org.stripeAccountId },
    );
    expect(stripeSub.status).toBe('incomplete');
    expect(stripeSub.customer).toBe(scenario.customer.stripeCustomerId);

    // No grants until payment confirms.
    const grants = await fetchRows(module, 'feature_grants', {
      customer_id: scenario.customer.bosCustomer.id,
    });
    expect(grants).toHaveLength(0);
  });

  it('RS2: trial product returns a SetupIntent client secret', async () => {
    const module = suite.getModule();
    const org = suite.getOrg();

    const scenario = await initRealScenario({
      module,
      org,
      customer: { paymentMethod: 'success' },
      products: [
        {
          key: 'trial_pro',
          amount: 1000,
          trialDays: 7,
          features: [{ key: 'dashboard' }],
        },
      ],
      actions: [{ type: 'subscribe', productKey: 'trial_pro' }],
    });
    suite.track(scenario);

    const checkout = lastCheckout(scenario);
    expect(checkout.checkoutMode).toBe('trial');
    expect(checkout.clientSecret).toBeTruthy();
    expect(checkout.clientSecret.startsWith('seti_')).toBe(true);
  });
});

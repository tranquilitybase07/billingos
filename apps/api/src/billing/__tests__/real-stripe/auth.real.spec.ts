/**
 * Real-Stripe authentication / SCA scenarios.
 *
 *   RS10 — 3DS challenge: PI confirmation returns `requires_action`,
 *          BOS sub stays `incomplete` until the customer authenticates.
 */
import { useRealStripeSuite } from '../../../../test/real-stripe/test-bootstrap';
import {
  initRealScenario,
  lastCheckout,
  runRealAction,
} from '../../../../test/real-stripe/scenario';
import { fetchRows } from '../../../../test/integration/db-helpers';
import { StripeService } from '../../../stripe/stripe.service';

describe('Real Stripe — Authentication (3DS / SCA)', () => {
  const suite = useRealStripeSuite();

  it('RS10: confirming with pm_card_authenticationRequired surfaces requires_action', async () => {
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
    expect(checkout.paymentIntentId).toBeTruthy();

    // Confirm with the card Stripe always 3DS-challenges. The PI returns
    // `requires_action`, NOT `succeeded`. The pipeline must leave the BOS
    // sub in `incomplete` so the SDK can surface the 3DS prompt.
    await runRealAction(scenario, {
      type: 'confirmCheckout',
      paymentMethod: 'authRequired',
    });

    const stripe = module.get(StripeService).getClient();
    const piId = checkout.paymentIntentId;
    const pi = await stripe.paymentIntents.retrieve(piId, {
      stripeAccount: org.stripeAccountId,
    });
    expect(pi.status).toBe('requires_action');
    expect(pi.next_action).toBeTruthy();

    const subs = await fetchRows(module, 'subscriptions', {
      customer_id: scenario.customer.bosCustomer.id,
    });
    expect(subs).toHaveLength(1);
    // BOS must NOT mark the sub active until 3DS clears (verification
    // report flagged this — premature activation is a real bug class).
    expect(subs[0].status).toBe('incomplete');

    const grants = await fetchRows(module, 'feature_grants', {
      customer_id: scenario.customer.bosCustomer.id,
    });
    expect(grants).toHaveLength(0);
  });
});

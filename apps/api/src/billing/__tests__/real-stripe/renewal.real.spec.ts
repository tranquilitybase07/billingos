/**
 * Real-Stripe renewal scenarios — drive Stripe's test clock through the
 * lifecycle a real customer would experience.
 *
 *   RS3 — Trial → first charge after trial_end
 *   RS4 — Paid renewal succeeds at period_end
 *   RS5 — Paid renewal fails (declined card) → past_due + grants revoked
 *   RS6 — past_due recovers when invoice retried with valid card → re-grant
 */
import { useRealStripeSuite } from '../../../../test/real-stripe/test-bootstrap';
import {
  initRealScenario,
  runRealAction,
} from '../../../../test/real-stripe/scenario';
import { fetchRow, fetchRows } from '../../../../test/integration/db-helpers';
import {
  expectGrantsConsistent,
  expectStripeAndBosSubMatch,
} from '../../../../test/real-stripe/expect-helpers';

describe('Real Stripe — Renewal lifecycle', () => {
  const suite = useRealStripeSuite();

  it('RS3: trial sub transitions to active after clock passes trial_end', async () => {
    const module = suite.getModule();
    const org = suite.getOrg();

    const scenario = await initRealScenario({
      module,
      org,
      customer: { paymentMethod: 'success' },
      products: [
        {
          // Distinct key from `pro` — this product is the trial variant and
          // the idempotent fixture cache keys on the product `key`. Sharing
          // `pro` between trial and non-trial scenarios silently routes
          // later tests onto the wrong path.
          key: 'trial_pro',
          amount: 1000,
          trialDays: 7,
          features: [{ key: 'dashboard' }],
        },
      ],
      actions: [
        { type: 'subscribe', productKey: 'trial_pro' },
        // Confirms the SetupIntent. The setup_intent.succeeded handler then
        // creates a real Stripe subscription with trial_end set, plus the
        // BOS sub in `trialing`.
        { type: 'confirmCheckout', paymentMethod: 'success' },
      ],
    });
    suite.track(scenario);

    const trialingSubs = await fetchRows(module, 'subscriptions', {
      customer_id: scenario.customer.bosCustomer.id,
    });
    expect(trialingSubs).toHaveLength(1);
    expect(['trialing', 'active']).toContain(trialingSubs[0].status as string);

    // Push past the 7-day trial. Stripe finalizes the first invoice and
    // attempts the charge. With `tok_visa` it succeeds; the resulting
    // invoice.payment_succeeded + customer.subscription.updated events
    // get replayed through the BOS handlers.
    await runRealAction(scenario, { type: 'advanceClock', days: 8 });

    const finalSub = await fetchRow(
      module,
      'subscriptions',
      trialingSubs[0].id as string,
    );
    expect(finalSub?.status).toBe('active');

    const grants = await fetchRows(module, 'feature_grants', {
      subscription_id: trialingSubs[0].id as string,
    });
    expect(
      grants.filter((g) => g.revoked_at === null).length,
    ).toBeGreaterThanOrEqual(1);

    await expectStripeAndBosSubMatch({
      module,
      bosCustomerId: scenario.customer.bosCustomer.id,
      stripeAccountId: org.stripeAccountId,
    });
    await expectGrantsConsistent({
      module,
      bosCustomerId: scenario.customer.bosCustomer.id,
    });
  });

  it('RS4: paid sub renews automatically at period_end with grants intact', async () => {
    const module = suite.getModule();
    const org = suite.getOrg();

    const scenario = await initRealScenario({
      module,
      org,
      customer: { paymentMethod: 'success' },
      products: [
        { key: 'pro', amount: 1000, features: [{ key: 'dashboard' }] },
      ],
      actions: [
        { type: 'subscribe', productKey: 'pro' },
        { type: 'confirmCheckout', paymentMethod: 'success' },
      ],
    });
    suite.track(scenario);

    const initialSubs = await fetchRows(module, 'subscriptions', {
      customer_id: scenario.customer.bosCustomer.id,
    });
    expect(initialSubs).toHaveLength(1);
    expect(initialSubs[0].status).toBe('active');

    const grantsBefore = (
      await fetchRows(module, 'feature_grants', {
        subscription_id: initialSubs[0].id as string,
      })
    ).filter((g) => g.revoked_at === null);
    expect(grantsBefore.length).toBeGreaterThanOrEqual(1);

    // Advance to next billing cycle. Stripe charges the saved card again.
    await runRealAction(scenario, { type: 'advanceClock', months: 1, days: 1 });

    const afterSub = await fetchRow(
      module,
      'subscriptions',
      initialSubs[0].id as string,
    );
    expect(afterSub?.status).toBe('active');

    const grantsAfter = (
      await fetchRows(module, 'feature_grants', {
        subscription_id: initialSubs[0].id as string,
      })
    ).filter((g) => g.revoked_at === null);
    // Grants survive renewal — verifies invoice.payment_succeeded handler
    // doesn't accidentally revoke (FIX 1 from the verification report).
    expect(grantsAfter.length).toBe(grantsBefore.length);

    await expectStripeAndBosSubMatch({
      module,
      bosCustomerId: scenario.customer.bosCustomer.id,
      stripeAccountId: org.stripeAccountId,
    });
  });

  it('RS5: renewal fails when card is swapped to chargeCustomerFail → past_due + grants revoked', async () => {
    const module = suite.getModule();
    const org = suite.getOrg();

    const scenario = await initRealScenario({
      module,
      org,
      customer: { paymentMethod: 'success' },
      products: [
        { key: 'pro', amount: 1000, features: [{ key: 'dashboard' }] },
      ],
      actions: [
        { type: 'subscribe', productKey: 'pro' },
        { type: 'confirmCheckout', paymentMethod: 'success' },
        // First charge succeeded — sub is active. Now flip the default
        // payment method to one Stripe will decline at next renewal.
        { type: 'swapPaymentMethod', kind: 'fail' },
        { type: 'advanceClock', months: 1, days: 1 },
      ],
    });
    suite.track(scenario);

    const subs = await fetchRows(module, 'subscriptions', {
      customer_id: scenario.customer.bosCustomer.id,
    });
    expect(subs).toHaveLength(1);
    expect(subs[0].status).toBe('past_due');

    const grants = await fetchRows(module, 'feature_grants', {
      subscription_id: subs[0].id as string,
    });
    // Failed renewal must revoke active grants — protects merchants from
    // serving features to customers Stripe can't collect from.
    expect(grants.length).toBeGreaterThan(0);
    expect(grants.every((g) => g.revoked_at !== null)).toBe(true);

    await expectGrantsConsistent({
      module,
      bosCustomerId: scenario.customer.bosCustomer.id,
    });
  });

  it('RS6: past_due → success when card fixed and invoice retried → re-grant', async () => {
    const module = suite.getModule();
    const org = suite.getOrg();

    // Start in the same state as RS5 ended: past_due with revoked grants.
    const scenario = await initRealScenario({
      module,
      org,
      customer: { paymentMethod: 'success' },
      products: [
        { key: 'pro', amount: 1000, features: [{ key: 'dashboard' }] },
      ],
      actions: [
        { type: 'subscribe', productKey: 'pro' },
        { type: 'confirmCheckout', paymentMethod: 'success' },
        { type: 'swapPaymentMethod', kind: 'fail' },
        { type: 'advanceClock', months: 1, days: 1 },
      ],
    });
    suite.track(scenario);

    const subs = await fetchRows(module, 'subscriptions', {
      customer_id: scenario.customer.bosCustomer.id,
    });
    expect(subs[0].status).toBe('past_due');
    const stripeSubId = subs[0].stripe_subscription_id as string;

    // Fix the card, retry the open invoice. Stripe re-attempts the charge
    // and (with tok_visa) succeeds.
    await runRealAction(scenario, {
      type: 'swapPaymentMethod',
      kind: 'success',
    });
    await runRealAction(scenario, {
      type: 'payOpenInvoice',
      stripeSubscriptionId: stripeSubId,
    });

    const recovered = await fetchRow(
      module,
      'subscriptions',
      subs[0].id as string,
    );
    expect(recovered?.status).toBe('active');

    const grants = await fetchRows(module, 'feature_grants', {
      subscription_id: subs[0].id as string,
    });
    const active = grants.filter((g) => g.revoked_at === null);
    expect(active.length).toBeGreaterThanOrEqual(1);

    await expectStripeAndBosSubMatch({
      module,
      bosCustomerId: scenario.customer.bosCustomer.id,
      stripeAccountId: org.stripeAccountId,
    });
    await expectGrantsConsistent({
      module,
      bosCustomerId: scenario.customer.bosCustomer.id,
    });
  });
});

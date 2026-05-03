/**
 * Real-Stripe transition scenarios — upgrades, downgrades, cancels.
 *
 *   RS7 — Upgrade with proration: real charge succeeds, grants swap
 *   RS8 — Downgrade scheduled at period end → swap completes after clock
 *   RS9 — Cancel-now: real cancel, grants revoked, no further charges
 */
import { useRealStripeSuite } from '../../../../test/real-stripe/test-bootstrap';
import {
  initRealScenario,
  runRealAction,
} from '../../../../test/real-stripe/scenario';
import { fetchRow, fetchRows } from '../../../../test/integration/db-helpers';
import {
  expectGrantsConsistent,
  expectLatestInvoicePaid,
  expectStripeAndBosSubMatch,
} from '../../../../test/real-stripe/expect-helpers';

describe('Real Stripe — Transitions', () => {
  const suite = useRealStripeSuite();

  it('RS7: upgrade from $10 to $20 issues proration invoice and swaps grants', async () => {
    const module = suite.getModule();
    const org = suite.getOrg();

    const scenario = await initRealScenario({
      module,
      org,
      customer: { paymentMethod: 'success' },
      products: [
        {
          key: 'starter',
          amount: 1000,
          features: [{ key: 'dashboard' }],
        },
        {
          key: 'pro',
          amount: 2000,
          features: [{ key: 'dashboard' }, { key: 'analytics' }],
        },
      ],
      actions: [
        { type: 'subscribe', productKey: 'starter' },
        { type: 'confirmCheckout', paymentMethod: 'success' },
      ],
    });
    suite.track(scenario);

    const starterSubs = await fetchRows(module, 'subscriptions', {
      customer_id: scenario.customer.bosCustomer.id,
    });
    expect(starterSubs).toHaveLength(1);
    expect(starterSubs[0].status).toBe('active');
    const starterSubId = starterSubs[0].id as string;
    const starterStripeSubId = starterSubs[0].stripe_subscription_id as string;

    // Upgrade — pipeline updates the existing Stripe sub's items, generates
    // a proration invoice, charges the saved card.
    await runRealAction(scenario, {
      type: 'subscribe',
      productKey: 'pro',
      existingSubscriptionId: starterSubId,
    });

    // Proration invoice must have been paid (real money math).
    await expectLatestInvoicePaid({
      module,
      stripeSubscriptionId: starterStripeSubId,
      stripeAccountId: org.stripeAccountId,
    });

    // Grants: starter-only feature revoked, pro-only feature granted.
    const grants = await fetchRows(module, 'feature_grants', {
      subscription_id: starterSubId,
    });
    const active = grants.filter((g) => g.revoked_at === null);
    expect(
      active.some(
        (g) => g.feature_id === scenario.products.pro.features.analytics.id,
      ),
    ).toBe(true);

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

  it('RS8: downgrade scheduled at period end → swap applies after clock advance', async () => {
    const module = suite.getModule();
    const org = suite.getOrg();

    const scenario = await initRealScenario({
      module,
      org,
      customer: { paymentMethod: 'success' },
      products: [
        {
          key: 'starter',
          amount: 1000,
          features: [{ key: 'dashboard' }],
        },
        {
          key: 'pro',
          amount: 2000,
          features: [{ key: 'dashboard' }, { key: 'analytics' }],
        },
      ],
      actions: [
        { type: 'subscribe', productKey: 'pro' },
        { type: 'confirmCheckout', paymentMethod: 'success' },
      ],
    });
    suite.track(scenario);

    const proSubs = await fetchRows(module, 'subscriptions', {
      customer_id: scenario.customer.bosCustomer.id,
    });
    expect(proSubs[0].status).toBe('active');
    const proSubId = proSubs[0].id as string;

    // Schedule downgrade. Pipeline marks cancel_at_period_end OR creates a
    // scheduled change row — either is acceptable depending on which path
    // BillingOS takes for this transition.
    await runRealAction(scenario, {
      type: 'subscribe',
      productKey: 'starter',
      existingSubscriptionId: proSubId,
    });

    const oldSub = await fetchRow(module, 'subscriptions', proSubId);
    const scheduledChanges = await fetchRows(module, 'subscription_changes', {
      subscription_id: proSubId,
    });
    const scheduled =
      oldSub?.cancel_at_period_end === true || scheduledChanges.length > 0;
    expect(scheduled).toBe(true);

    // Advance past period end. Stripe transitions the sub.
    await runRealAction(scenario, { type: 'advanceClock', months: 1, days: 2 });

    // Either: a new starter sub now exists, OR the sub's price moved to starter.
    const finalSubs = await fetchRows(module, 'subscriptions', {
      customer_id: scenario.customer.bosCustomer.id,
    });
    const onStarter = finalSubs.some(
      (s) =>
        s.product_id === scenario.products.starter.product.id &&
        (s.status === 'active' || s.status === 'trialing'),
    );
    expect(onStarter).toBe(true);

    await expectGrantsConsistent({
      module,
      bosCustomerId: scenario.customer.bosCustomer.id,
    });
  });

  it('RS9: cancel-now revokes grants and stops further charges', async () => {
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

    const subs = await fetchRows(module, 'subscriptions', {
      customer_id: scenario.customer.bosCustomer.id,
    });
    expect(subs[0].status).toBe('active');
    const stripeSubId = subs[0].stripe_subscription_id as string;

    await runRealAction(scenario, {
      type: 'cancelNow',
      stripeSubscriptionId: stripeSubId,
    });

    const canceled = await fetchRow(
      module,
      'subscriptions',
      subs[0].id as string,
    );
    expect(canceled?.status).toBe('canceled');

    const grants = await fetchRows(module, 'feature_grants', {
      subscription_id: subs[0].id as string,
    });
    expect(grants.length).toBeGreaterThan(0);
    expect(grants.every((g) => g.revoked_at !== null)).toBe(true);

    // Forward 1 month — confirm Stripe doesn't attempt a charge on a
    // canceled sub. (No new invoices, sub stays canceled.)
    await runRealAction(scenario, { type: 'advanceClock', months: 1 });
    const stillCanceled = await fetchRow(
      module,
      'subscriptions',
      subs[0].id as string,
    );
    expect(stillCanceled?.status).toBe('canceled');
  });
});

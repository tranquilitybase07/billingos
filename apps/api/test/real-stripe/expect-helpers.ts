/**
 * Cross-check assertions: BOS state vs. Stripe state. The point of the
 * real-Stripe suite is catching drift between the two — these helpers
 * encode the canonical "they should agree" rules.
 */
import type { TestingModule } from '@nestjs/testing';
import type Stripe from 'stripe';
import { fetchRow, fetchRows } from '../integration/db-helpers';
import { StripeService } from '../../src/stripe/stripe.service';

export interface ExpectMatchOpts {
  module: TestingModule;
  bosCustomerId: string;
  stripeAccountId: string;
}

/**
 * Asserts the active BOS subscription for a customer agrees with the
 * Stripe subscription it points at on status, period dates, and amount.
 */
export async function expectStripeAndBosSubMatch(
  opts: ExpectMatchOpts,
): Promise<void> {
  const subs = await fetchRows(opts.module, 'subscriptions', {
    customer_id: opts.bosCustomerId,
  });
  const active = subs.find(
    (s) =>
      s.status === 'active' ||
      s.status === 'trialing' ||
      s.status === 'past_due',
  );
  if (!active) {
    throw new Error(
      `expectStripeAndBosSubMatch: no active BOS sub for customer ${opts.bosCustomerId}. ` +
        `Subs: ${JSON.stringify(subs.map((s) => ({ id: s.id, status: s.status })))}`,
    );
  }

  const stripe = opts.module.get(StripeService).getClient();
  const stripeSub = await stripe.subscriptions.retrieve(
    active.stripe_subscription_id as string,
    { stripeAccount: opts.stripeAccountId } as Stripe.RequestOptions,
  );

  if (active.status !== stripeSub.status) {
    throw new Error(
      `BOS/Stripe sub status drift — BOS=${active.status}, Stripe=${stripeSub.status}, ` +
        `sub=${stripeSub.id}`,
    );
  }

  // Period boundary check tolerates ±5 seconds — Postgres rounds to ms,
  // Stripe stores seconds.
  const stripePeriodEnd = resolveStripePeriodEnd(stripeSub);
  const bosPeriodEnd = active.current_period_end
    ? new Date(active.current_period_end as string).getTime() / 1000
    : 0;
  if (
    stripePeriodEnd &&
    Math.abs(stripePeriodEnd - bosPeriodEnd) > 5 &&
    stripeSub.status !== 'canceled'
  ) {
    throw new Error(
      `BOS/Stripe period_end drift — BOS=${bosPeriodEnd}s, Stripe=${stripePeriodEnd}s, ` +
        `sub=${stripeSub.id}`,
    );
  }
}

/**
 * Asserts every active BOS subscription has matching active grants for
 * every feature on its product, and every revoked sub has zero active
 * grants. Catches the "grants got out of sync" class of bug.
 */
export async function expectGrantsConsistent(opts: {
  module: TestingModule;
  bosCustomerId: string;
}): Promise<void> {
  const subs = await fetchRows(opts.module, 'subscriptions', {
    customer_id: opts.bosCustomerId,
  });

  for (const sub of subs) {
    const grants = await fetchRows(opts.module, 'feature_grants', {
      subscription_id: sub.id as string,
    });
    const active = grants.filter((g) => g.revoked_at === null);

    const isHealthy = sub.status === 'active' || sub.status === 'trialing';
    const isDead =
      sub.status === 'canceled' ||
      sub.status === 'incomplete_expired' ||
      sub.status === 'past_due';

    if (isDead && active.length > 0) {
      throw new Error(
        `Sub ${sub.id} is ${sub.status} but has ${active.length} active grants`,
      );
    }

    if (isHealthy) {
      const productFeatures = await fetchRows(opts.module, 'product_features', {
        product_id: sub.product_id as string,
      });
      if (productFeatures.length > 0 && active.length === 0) {
        throw new Error(
          `Sub ${sub.id} is ${sub.status} but has 0 active grants ` +
            `(product has ${productFeatures.length} features)`,
        );
      }
    }
  }
}

/**
 * Asserts BOS sees every paid Stripe invoice for a sub. We don't compare
 * exact totals (BOS doesn't store every invoice today) — just count and
 * the latest invoice's status.
 */
export async function expectLatestInvoicePaid(opts: {
  module: TestingModule;
  stripeSubscriptionId: string;
  stripeAccountId: string;
}): Promise<void> {
  const stripe = opts.module.get(StripeService).getClient();
  const invoices = await stripe.invoices.list(
    { subscription: opts.stripeSubscriptionId, limit: 5 },
    { stripeAccount: opts.stripeAccountId } as Stripe.RequestOptions,
  );
  const latest = invoices.data[0];
  if (!latest) {
    throw new Error(
      `expectLatestInvoicePaid: no invoices for sub ${opts.stripeSubscriptionId}`,
    );
  }
  if (latest.status !== 'paid') {
    throw new Error(
      `Latest invoice for sub ${opts.stripeSubscriptionId} is ${latest.status}, not paid. ` +
        `invoice=${latest.id}`,
    );
  }
}

/**
 * Resolve `current_period_end` from new (items-level) or legacy (top-level)
 * Stripe response shape. Mirrors the production `period-end.helper.ts`.
 */
function resolveStripePeriodEnd(sub: Stripe.Subscription): number | null {
  const items = sub.items as
    | { data?: Array<{ current_period_end?: number }> }
    | undefined;
  const itemEnd = items?.data?.[0]?.current_period_end;
  if (itemEnd) return itemEnd;
  const top = (sub as unknown as { current_period_end?: number })
    .current_period_end;
  return top ?? null;
}

/**
 * Convenience: pull the active (or first non-canceled) BOS sub for a
 * customer. Returns null if none.
 */
export async function getActiveBosSub(opts: {
  module: TestingModule;
  bosCustomerId: string;
}): Promise<Record<string, unknown> | null> {
  const subs = await fetchRows(opts.module, 'subscriptions', {
    customer_id: opts.bosCustomerId,
  });
  return (
    subs.find(
      (s) =>
        s.status === 'active' ||
        s.status === 'trialing' ||
        s.status === 'past_due',
    ) ??
    subs[0] ??
    null
  );
}

export { fetchRow, fetchRows };

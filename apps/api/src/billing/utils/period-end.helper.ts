import { Logger } from '@nestjs/common';

const logger = new Logger('PeriodEndHelper');

/**
 * Extracts `current_period_end` from Stripe subscription data as an ISO string.
 *
 * Resolution order (Stripe API v2025-12-15 moved period fields to items level):
 * 1. `items.data[0].current_period_end` (primary — new Stripe API)
 * 2. `current_period_end` (legacy top-level, backward compat)
 * 3. Computed from `items.data[0].current_period_start` + interval
 * 4. Computed from `current_period_start` + interval (legacy)
 * 5. Last resort: 30-day fallback (should never happen with valid Stripe subs)
 */
export function extractPeriodEnd(
  subData: Record<string, unknown>,
): string {
  // 1. Items-level value (Stripe API v2025-12-15+)
  const itemPeriodEnd = resolveItemPeriodEnd(subData);
  if (itemPeriodEnd) {
    return new Date(itemPeriodEnd * 1000).toISOString();
  }

  // 2. Legacy top-level value
  if (subData.current_period_end) {
    return new Date(
      (subData.current_period_end as number) * 1000,
    ).toISOString();
  }

  // 3. Compute from items-level start + interval
  const itemPeriodStart = resolveItemPeriodStart(subData);
  if (itemPeriodStart) {
    const start = new Date(itemPeriodStart * 1000);
    const interval = resolveInterval(subData);
    const intervalCount = resolveIntervalCount(subData);
    if (interval) {
      return addInterval(start, interval, intervalCount).toISOString();
    }
  }

  // 4. Compute from legacy top-level start + interval
  if (subData.current_period_start) {
    const start = new Date(
      (subData.current_period_start as number) * 1000,
    );
    const interval = resolveInterval(subData);
    const intervalCount = resolveIntervalCount(subData);
    if (interval) {
      return addInterval(start, interval, intervalCount).toISOString();
    }
  }

  // 5. Last resort fallback
  logger.warn(
    'current_period_end missing from Stripe data — using 30-day fallback',
  );
  return new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();
}

/**
 * Extracts `current_period_start` from Stripe subscription data as an ISO string.
 *
 * Resolution order (Stripe API v2025-12-15 moved period fields to items level):
 * 1. `items.data[0].current_period_start` (primary — new Stripe API)
 * 2. `current_period_start` (legacy top-level)
 * 3. `new Date()` fallback
 */
export function extractPeriodStart(
  subData: Record<string, unknown>,
): string {
  // 1. Items-level value (Stripe API v2025-12-15+)
  const itemPeriodStart = resolveItemPeriodStart(subData);
  if (itemPeriodStart) {
    return new Date(itemPeriodStart * 1000).toISOString();
  }

  // 2. Legacy top-level value
  if (subData.current_period_start) {
    return new Date(
      (subData.current_period_start as number) * 1000,
    ).toISOString();
  }

  // 3. Fallback
  return new Date().toISOString();
}

// ── Internal helpers ──

/**
 * Resolves `current_period_end` from `items.data[0]`.
 * Stripe API v2025-12-15 moved period fields from the top-level Subscription
 * object to the SubscriptionItem level.
 */
function resolveItemPeriodEnd(subData: Record<string, unknown>): number | null {
  const items = subData.items as
    | { data?: Array<{ current_period_end?: number }> }
    | undefined;
  return items?.data?.[0]?.current_period_end ?? null;
}

/**
 * Resolves `current_period_start` from `items.data[0]`.
 */
function resolveItemPeriodStart(subData: Record<string, unknown>): number | null {
  const items = subData.items as
    | { data?: Array<{ current_period_start?: number }> }
    | undefined;
  return items?.data?.[0]?.current_period_start ?? null;
}

type Interval = 'day' | 'week' | 'month' | 'year';

function resolveInterval(
  subData: Record<string, unknown>,
): Interval | null {
  // Stripe subscription object: items.data[0].price.recurring.interval
  const items = subData.items as
    | { data?: Array<{ price?: { recurring?: { interval?: string; interval_count?: number } } }> }
    | undefined;
  const recurring = items?.data?.[0]?.price?.recurring;
  if (recurring?.interval) {
    return recurring.interval as Interval;
  }

  // Older Stripe shape: plan.interval
  const plan = subData.plan as
    | { interval?: string; interval_count?: number }
    | undefined;
  if (plan?.interval) {
    return plan.interval as Interval;
  }

  return null;
}

function resolveIntervalCount(
  subData: Record<string, unknown>,
): number {
  const items = subData.items as
    | { data?: Array<{ price?: { recurring?: { interval_count?: number } } }> }
    | undefined;
  const recurring = items?.data?.[0]?.price?.recurring;
  if (recurring?.interval_count) {
    return recurring.interval_count;
  }

  const plan = subData.plan as { interval_count?: number } | undefined;
  if (plan?.interval_count) {
    return plan.interval_count;
  }

  return 1;
}

function addInterval(
  start: Date,
  interval: Interval,
  count: number,
): Date {
  const result = new Date(start);
  switch (interval) {
    case 'day':
      result.setDate(result.getDate() + count);
      break;
    case 'week':
      result.setDate(result.getDate() + 7 * count);
      break;
    case 'month':
      result.setMonth(result.getMonth() + count);
      break;
    case 'year':
      result.setFullYear(result.getFullYear() + count);
      break;
  }
  return result;
}

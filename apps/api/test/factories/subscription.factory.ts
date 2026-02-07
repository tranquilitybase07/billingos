import { Factory } from 'fishery';
import { mockData } from '../utils/mock-data';

/**
 * Subscription Factory - Creates test subscription data
 */

export interface SubscriptionFactoryParams {
  id: string;
  organization_id: string;
  product_id: string;
  price_id: string;
  customer_id: string;
  stripe_subscription_id: string | null;
  status: string;
  current_period_start: string;
  current_period_end: string;
  cancel_at_period_end: boolean;
  canceled_at: string | null;
  ended_at: string | null;
  metadata: Record<string, any> | null;
  created_at: string;
  updated_at: string;
}

export const subscriptionFactory = Factory.define<SubscriptionFactoryParams>(
  ({ sequence, params, associations }) => {
    const now = new Date().toISOString();
    const periodStart = params?.current_period_start || mockData.date.recent();
    const periodEnd = params?.current_period_end || mockData.date.future();

    return {
      id: params?.id || `sub_${sequence}`,
      organization_id: params?.organization_id || associations?.organization?.id || `org_${sequence}`,
      product_id: params?.product_id || associations?.product?.id || `product_${sequence}`,
      price_id: params?.price_id || associations?.price?.id || `price_${sequence}`,
      customer_id: params?.customer_id || associations?.customer?.id || `customer_${sequence}`,
      stripe_subscription_id: params?.stripe_subscription_id !== undefined
        ? params.stripe_subscription_id
        : `sub_stripe_${sequence}`,
      status: params?.status || 'active',
      current_period_start: periodStart,
      current_period_end: periodEnd,
      cancel_at_period_end: params?.cancel_at_period_end || false,
      canceled_at: params?.canceled_at || null,
      ended_at: params?.ended_at || null,
      metadata: params?.metadata || {},
      created_at: params?.created_at || mockData.date.past(),
      updated_at: params?.updated_at || now,
    };
  }
);

/**
 * Factory variants for common subscription scenarios
 */

// Active subscription
export const activeSubscription = subscriptionFactory.params({
  status: 'active',
  cancel_at_period_end: false,
});

// Subscription set to cancel at period end
export const cancelingSubscription = subscriptionFactory.params({
  status: 'active',
  cancel_at_period_end: true,
  canceled_at: mockData.date.recent(),
});

// Canceled subscription
export const canceledSubscription = subscriptionFactory.params({
  status: 'canceled',
  canceled_at: mockData.date.recent(),
  ended_at: mockData.date.recent(),
});

// Past due subscription
export const pastDueSubscription = subscriptionFactory.params({
  status: 'past_due',
});

// Trialing subscription
export const trialingSubscription = subscriptionFactory.params({
  status: 'trialing',
});

// Paused subscription
export const pausedSubscription = subscriptionFactory.params({
  status: 'paused',
});

/**
 * Helper to create subscriptions with specific statuses
 */
export function createSubscriptionsByStatus(organizationId: string, productId: string) {
  return {
    active: activeSubscription.build({ organization_id: organizationId, product_id: productId }),
    canceling: cancelingSubscription.build({ organization_id: organizationId, product_id: productId }),
    canceled: canceledSubscription.build({ organization_id: organizationId, product_id: productId }),
    pastDue: pastDueSubscription.build({ organization_id: organizationId, product_id: productId }),
    trialing: trialingSubscription.build({ organization_id: organizationId, product_id: productId }),
  };
}
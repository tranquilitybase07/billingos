import { Factory } from 'fishery';
import { mockData } from '../utils/mock-data';

/**
 * Price Factory - Creates test price data for products
 */

export interface PriceFactoryParams {
  id: string;
  product_id: string;
  amount_type: 'fixed' | 'free';
  price_amount: number | null;
  price_currency: string;
  recurring_interval: string | null;
  recurring_interval_count: number | null;
  stripe_price_id: string | null;
  is_archived: boolean;
  created_at: string;
  updated_at: string;
}

export const priceFactory = Factory.define<PriceFactoryParams>(
  ({ sequence, params, associations }) => {
    const now = new Date().toISOString();
    const amountType = params?.amount_type || 'fixed';
    const isFixed = amountType === 'fixed';

    return {
      id: params?.id || `price_${sequence}`,
      product_id: params?.product_id || associations?.product?.id || `product_${sequence}`,
      amount_type: amountType,
      price_amount: params?.price_amount !== undefined
        ? params.price_amount
        : (isFixed ? mockData.price(100, 100000) : null),
      price_currency: params?.price_currency || 'usd',
      recurring_interval: params?.recurring_interval !== undefined
        ? params.recurring_interval
        : 'month',
      recurring_interval_count: params?.recurring_interval_count !== undefined
        ? params.recurring_interval_count
        : 1,
      stripe_price_id: params?.stripe_price_id !== undefined
        ? params.stripe_price_id
        : (isFixed ? `price_stripe_${sequence}` : null),
      is_archived: params?.is_archived || false,
      created_at: params?.created_at || mockData.date.past(),
      updated_at: params?.updated_at || now,
    };
  }
);

/**
 * Factory variants for common price scenarios
 */

// Free price (no Stripe price needed)
export const freePrice = priceFactory.params({
  amount_type: 'free',
  price_amount: null,
  stripe_price_id: null,
});

// Monthly price ($9.99)
export const monthlyPrice = priceFactory.params({
  amount_type: 'fixed',
  price_amount: 999, // $9.99 in cents
  recurring_interval: 'month',
  recurring_interval_count: 1,
});

// Yearly price ($99.99)
export const yearlyPrice = priceFactory.params({
  amount_type: 'fixed',
  price_amount: 9999, // $99.99 in cents
  recurring_interval: 'year',
  recurring_interval_count: 1,
});

// Archived price
export const archivedPrice = priceFactory.params({
  is_archived: true,
});

// Price without Stripe (e.g., during creation failure)
export const priceWithoutStripe = priceFactory.params({
  stripe_price_id: null,
});

// Custom interval price (e.g., quarterly)
export const quarterlyPrice = priceFactory.params({
  amount_type: 'fixed',
  price_amount: 2999, // $29.99 in cents
  recurring_interval: 'month',
  recurring_interval_count: 3, // Every 3 months
});

// Enterprise price (high value)
export const enterprisePrice = priceFactory.params({
  amount_type: 'fixed',
  price_amount: 99900, // $999.00 in cents
  recurring_interval: 'month',
  recurring_interval_count: 1,
});

/**
 * Helper to create a set of pricing tiers
 */
export function createPricingTiers(productId: string) {
  return {
    free: freePrice.build({ product_id: productId }),
    starter: monthlyPrice.build({ product_id: productId, price_amount: 999 }),
    pro: monthlyPrice.build({ product_id: productId, price_amount: 2999 }),
    enterprise: enterprisePrice.build({ product_id: productId }),
  };
}

/**
 * Helper to create monthly and yearly price pair
 */
export function createPricePair(productId: string, monthlyAmount: number) {
  const yearlyAmount = Math.floor(monthlyAmount * 10); // 2 months free on yearly

  return {
    monthly: monthlyPrice.build({
      product_id: productId,
      price_amount: monthlyAmount,
    }),
    yearly: yearlyPrice.build({
      product_id: productId,
      price_amount: yearlyAmount,
    }),
  };
}
import { Factory } from 'fishery';
import { mockData } from '../utils/mock-data';

/**
 * Product Factory - Creates test product data
 */

export interface ProductFactoryParams {
  id: string;
  organization_id: string;
  name: string;
  description: string | null;
  recurring_interval: string;
  recurring_interval_count: number;
  stripe_product_id: string | null;
  trial_days: number | null;
  metadata: Record<string, any> | null;
  is_archived: boolean;
  version: number;
  parent_product_id: string | null;
  latest_version_id: string | null;
  version_status: string | null;
  version_created_at: string | null;
  version_created_reason: string | null;
  created_at: string;
  updated_at: string;
}

export const productFactory = Factory.define<ProductFactoryParams>(
  ({ sequence, params, associations }) => {
    const now = new Date().toISOString();
    const isVersioned = params?.version && params.version > 1;

    return {
      id: params?.id || `product_${sequence}`,
      organization_id: params?.organization_id || associations?.organization?.id || `org_${sequence}`,
      name: params?.name || mockData.name(),
      description: params?.description !== undefined ? params.description : mockData.text(15),
      recurring_interval: params?.recurring_interval || 'month',
      recurring_interval_count: params?.recurring_interval_count || 1,
      stripe_product_id: params?.stripe_product_id !== undefined
        ? params.stripe_product_id
        : `prod_stripe_${sequence}`,
      trial_days: params?.trial_days !== undefined ? params.trial_days : 14,
      metadata: params?.metadata || {},
      is_archived: params?.is_archived || false,
      version: params?.version || 1,
      parent_product_id: params?.parent_product_id || (isVersioned ? `product_${sequence - 1}` : null),
      latest_version_id: params?.latest_version_id || null,
      version_status: params?.version_status || (isVersioned ? 'current' : 'current'),
      version_created_at: params?.version_created_at || (isVersioned ? now : null),
      version_created_reason: params?.version_created_reason || (isVersioned ? 'Price change' : null),
      created_at: params?.created_at || mockData.date.past(),
      updated_at: params?.updated_at || now,
    };
  }
);

/**
 * Factory variants for common scenarios
 */

// Product with active subscriptions (should trigger versioning on certain updates)
export const productWithSubscriptions = productFactory.params({
  metadata: { has_active_subscriptions: true }
});

// Archived product
export const archivedProduct = productFactory.params({
  is_archived: true,
  version_status: 'archived'
});

// Version 2 of a product (created from versioning)
export const versionedProduct = productFactory.params({
  version: 2,
  version_status: 'current',
  version_created_reason: 'Price change requiring version'
});

// Superseded product (old version after new version created)
export const supersededProduct = productFactory.params({
  version_status: 'superseded',
  latest_version_id: 'product_next_version'
});

// Product without Stripe (e.g., during creation failure)
export const productWithoutStripe = productFactory.params({
  stripe_product_id: null
});

// Product with extended trial
export const productWithExtendedTrial = productFactory.params({
  trial_days: 30
});

// Product with yearly billing
export const yearlyProduct = productFactory.params({
  recurring_interval: 'year',
  recurring_interval_count: 1
});
import { Factory } from 'fishery';
import { mockData } from '../utils/mock-data';

/**
 * Organization Factory - Creates test organization data
 */

export interface OrganizationFactoryParams {
  id: string;
  name: string;
  slug: string | null;
  account_id: string | null;
  payment_setup_complete: boolean;
  payment_required: boolean;
  trial_ends_at: string | null;
  deleted_at: string | null;
  created_at: string;
  updated_at: string;
}

export const organizationFactory = Factory.define<OrganizationFactoryParams>(
  ({ sequence, params }) => {
    const now = new Date().toISOString();
    const name = params?.name || mockData.company();
    const slug = name.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '');

    return {
      id: params?.id || `org_${sequence}`,
      name: name,
      slug: params?.slug !== undefined ? params.slug : slug,
      account_id: params?.account_id !== undefined
        ? params.account_id
        : `acc_${sequence}`,
      payment_setup_complete: params?.payment_setup_complete !== undefined
        ? params.payment_setup_complete
        : true,
      payment_required: params?.payment_required !== undefined
        ? params.payment_required
        : false,
      trial_ends_at: params?.trial_ends_at || null,
      deleted_at: params?.deleted_at || null,
      created_at: params?.created_at || mockData.date.past(),
      updated_at: params?.updated_at || now,
    };
  }
);

/**
 * Factory variants for common organization scenarios
 */

// Organization without Stripe account (needs onboarding)
export const orgWithoutStripe = organizationFactory.params({
  account_id: null,
  payment_setup_complete: false,
});

// Organization with payment required
export const orgRequiringPayment = organizationFactory.params({
  payment_required: true,
  payment_setup_complete: false,
});

// Organization in trial period
export const orgInTrial = organizationFactory.params({
  trial_ends_at: mockData.date.future(),
});

// Deleted organization
export const deletedOrg = organizationFactory.params({
  deleted_at: mockData.date.recent(),
});

// Organization with complete setup
export const completeOrg = organizationFactory.params({
  payment_setup_complete: true,
  payment_required: false,
});
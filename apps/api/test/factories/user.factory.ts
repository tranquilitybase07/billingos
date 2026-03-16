import { Factory } from 'fishery';
import { mockData } from '../utils/mock-data';

/**
 * User Factory - Creates test user data
 */

export interface UserFactoryParams {
  id: string;
  email: string;
  email_verified: boolean;
  avatar_url?: string;
  is_admin: boolean;
  accepted_terms_of_service: boolean;
  meta: Record<string, any>;
  created_at: string;
  updated_at: string;
}

export const userFactory = Factory.define<UserFactoryParams>(
  ({ sequence, params }) => {
    const now = new Date().toISOString();

    return {
      id: params?.id || `user_${sequence}`,
      email: params?.email || mockData.email(),
      email_verified: params?.email_verified ?? true,
      avatar_url: params?.avatar_url ?? mockData.url('/avatar.jpg'),
      is_admin: params?.is_admin ?? false,
      accepted_terms_of_service: params?.accepted_terms_of_service ?? true,
      meta: params?.meta || {},
      created_at: params?.created_at || mockData.date.past(),
      updated_at: params?.updated_at || now,
    };
  },
);

/**
 * Factory variants for common user scenarios
 */

// Admin user
export const adminUser = userFactory.params({
  email: 'admin@example.com',
  is_admin: true,
});

// User without profile
export const userWithoutProfile = userFactory.params({
  avatar_url: undefined,
});

/**
 * User Organization Membership Factory
 */

export interface UserOrganizationFactoryParams {
  user_id: string;
  organization_id: string;
  role: 'admin' | 'member';
  deleted_at: string | null;
  created_at: string;
  updated_at: string;
}

export const userOrganizationFactory =
  Factory.define<UserOrganizationFactoryParams>(
    ({ sequence, params }) => {
      const now = new Date().toISOString();

      return {
        user_id: params?.user_id || `user_${sequence}`,
        organization_id: params?.organization_id || `org_${sequence}`,
        role: params?.role || 'member',
        deleted_at: params?.deleted_at || null,
        created_at: params?.created_at || mockData.date.past(),
        updated_at: params?.updated_at || now,
      };
    },
  );

// Admin membership
export const adminMembership = userOrganizationFactory.params({
  role: 'admin',
});

// Member membership
export const memberMembership = userOrganizationFactory.params({
  role: 'member',
});

// Deleted membership
export const deletedMembership = userOrganizationFactory.params({
  deleted_at: mockData.date.recent(),
});

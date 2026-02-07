import { Factory } from 'fishery';
import { mockData } from '../utils/mock-data';

/**
 * User Factory - Creates test user data
 */

export interface UserFactoryParams {
  id: string;
  email: string;
  full_name: string | null;
  avatar_url: string | null;
  created_at: string;
  updated_at: string;
}

export const userFactory = Factory.define<UserFactoryParams>(
  ({ sequence, params }) => {
    const now = new Date().toISOString();

    return {
      id: params?.id || `user_${sequence}`,
      email: params?.email || mockData.email(),
      full_name: params?.full_name !== undefined
        ? params.full_name
        : mockData.name(),
      avatar_url: params?.avatar_url !== undefined
        ? params.avatar_url
        : mockData.url('/avatar.jpg'),
      created_at: params?.created_at || mockData.date.past(),
      updated_at: params?.updated_at || now,
    };
  }
);

/**
 * Factory variants for common user scenarios
 */

// Admin user
export const adminUser = userFactory.params({
  email: 'admin@example.com',
  full_name: 'Admin User',
});

// User without profile
export const userWithoutProfile = userFactory.params({
  full_name: null,
  avatar_url: null,
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

export const userOrganizationFactory = Factory.define<UserOrganizationFactoryParams>(
  ({ sequence, params, associations }) => {
    const now = new Date().toISOString();

    return {
      user_id: params?.user_id || associations?.user?.id || `user_${sequence}`,
      organization_id: params?.organization_id || associations?.organization?.id || `org_${sequence}`,
      role: params?.role || 'member',
      deleted_at: params?.deleted_at || null,
      created_at: params?.created_at || mockData.date.past(),
      updated_at: params?.updated_at || now,
    };
  }
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
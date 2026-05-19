import { SetMetadata } from '@nestjs/common';

export const BETA_EXEMPT_KEY = 'betaExempt';

/**
 * Marks an endpoint as reachable while the private-beta gate is active and
 * the caller has not been approved. Apply to endpoints that a pending user
 * needs to call (read their own profile, submit the boost-approval form,
 * sign out).
 */
export const BetaExempt = () => SetMetadata(BETA_EXEMPT_KEY, true);

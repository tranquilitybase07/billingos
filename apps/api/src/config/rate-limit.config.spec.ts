import { ExecutionContext } from '@nestjs/common';
import {
  findEndpointRule,
  getGlobalRateLimitForContext,
  normalizePath,
  pathMatches,
  resolveOrganizationId,
  resolveScopedTrackerForContext,
} from './rate-limit.config';

function makeContext(request: any): ExecutionContext {
  return {
    switchToHttp: () => ({
      getRequest: () => request,
    }),
  } as ExecutionContext;
}

describe('rate-limit.config', () => {
  it('normalizes path by removing query and trailing slash', () => {
    expect(normalizePath('/analytics/mrr/?a=1')).toBe('/analytics/mrr');
  });

  it('matches wildcard paths', () => {
    expect(pathMatches('/analytics/*', '/analytics/mrr')).toBe(true);
    expect(pathMatches('/v1/usage/track', '/v1/usage/check')).toBe(false);
  });

  it('returns endpoint-specific global ip rule for stripe webhooks', () => {
    const ctx = makeContext({
      originalUrl: '/stripe/webhooks',
      method: 'POST',
      url: '/stripe/webhooks',
    });

    expect(getGlobalRateLimitForContext(ctx).limit).toBe(100);
  });

  it('resolves organization id from params/query/body', () => {
    expect(
      resolveOrganizationId({
        params: { organizationId: 'org_params' },
        query: {},
        body: {},
        headers: {},
      } as any),
    ).toBe('org_params');
  });

  it('uses customer tracker for customer-scoped endpoints', () => {
    const ctx = makeContext({
      originalUrl: '/v1/usage/track',
      method: 'POST',
      url: '/v1/usage/track',
      body: { customer_id: 'cust_123' },
      query: {},
      params: {},
      headers: {},
    });

    expect(resolveScopedTrackerForContext(ctx)).toBe('cust_123');
  });

  it('finds analytics organization rule', () => {
    const ctx = makeContext({
      originalUrl: '/analytics/mrr',
      method: 'GET',
      url: '/analytics/mrr',
    });

    expect(findEndpointRule(ctx)?.identifier).toBe('organization');
  });
});

import { ExecutionContext } from '@nestjs/common';
import {
  findEndpointRule,
  getGlobalRateLimitForContext,
  getScopedRateLimitForContext,
  normalizePath,
  pathMatches,
  rateLimitConfig,
  resolveScopedTrackerForContext,
  shouldSkipAllRateLimiting,
  shouldSkipPath,
} from '../src/config/rate-limit.config';

function makeContext(request: any): ExecutionContext {
  return {
    switchToHttp: () => ({
      getRequest: () => request,
    }),
  } as ExecutionContext;
}

describe('Rate Limiting Integration', () => {
  const originalEnabled = rateLimitConfig.enabled;
  const originalSkipInTest = rateLimitConfig.skipInTest;

  afterEach(() => {
    rateLimitConfig.enabled = originalEnabled;
    rateLimitConfig.skipInTest = originalSkipInTest;
    delete process.env.NODE_ENV;
  });

  it('skips all rate limiting in test env when skipInTest is true', () => {
    process.env.NODE_ENV = 'test';
    rateLimitConfig.enabled = true;
    rateLimitConfig.skipInTest = true;

    expect(shouldSkipAllRateLimiting()).toBe(true);
  });

  it('does not skip rate limiting in test env when skipInTest is false', () => {
    process.env.NODE_ENV = 'test';
    rateLimitConfig.enabled = true;
    rateLimitConfig.skipInTest = false;

    expect(shouldSkipAllRateLimiting()).toBe(false);
  });

  it('matches health and metrics paths for skip behavior', () => {
    expect(shouldSkipPath('/health')).toBe(true);
    expect(shouldSkipPath('/api/health')).toBe(true);
    expect(shouldSkipPath('/metrics')).toBe(true);
    expect(shouldSkipPath('/v1/checkout/create')).toBe(false);
  });

  it('resolves endpoint-specific global limit for stripe webhook route', () => {
    const context = makeContext({
      originalUrl: '/stripe/webhooks',
      url: '/stripe/webhooks',
      method: 'POST',
    });

    expect(getGlobalRateLimitForContext(context).limit).toBe(100);
  });

  it('resolves endpoint-specific scoped limit for checkout route', () => {
    const context = makeContext({
      originalUrl: '/v1/checkout/create',
      url: '/v1/checkout/create',
      method: 'POST',
      headers: {
        authorization: 'Bearer sk_test_any',
      },
    });

    expect(getScopedRateLimitForContext(context).limit).toBe(50);
  });

  it('derives customer-scoped tracker from customer_id for checkout route', () => {
    const context = makeContext({
      originalUrl: '/v1/checkout/create',
      url: '/v1/checkout/create',
      method: 'POST',
      body: {
        customer_id: 'cust_123',
      },
      headers: {},
      params: {},
      query: {},
    });

    expect(resolveScopedTrackerForContext(context)).toBe('cust_123');
  });

  it('falls back to auth token fingerprint for customer-scoped routes', () => {
    const context = makeContext({
      originalUrl: '/v1/checkout/create',
      url: '/v1/checkout/create',
      method: 'POST',
      body: {},
      headers: {
        authorization: 'Bearer sk_test_fallback',
      },
      params: {},
      query: {},
    });

    expect(resolveScopedTrackerForContext(context)).toMatch(/^token_/);
  });

  it('supports wildcard endpoint matching for analytics routes', () => {
    expect(pathMatches('/analytics/*', '/analytics/mrr')).toBe(true);
    expect(pathMatches('/analytics/*', '/analytics/arpu')).toBe(true);
    expect(pathMatches('/analytics/*', '/v1/usage/check')).toBe(false);
  });

  it('normalizes paths before matching endpoint rules', () => {
    const path = normalizePath('/analytics/mrr/?from=2026-01-01');
    expect(path).toBe('/analytics/mrr');

    const context = makeContext({
      originalUrl: '/analytics/mrr/?from=2026-01-01',
      url: '/analytics/mrr/?from=2026-01-01',
      method: 'GET',
    });

    expect(findEndpointRule(context)?.identifier).toBe('organization');
  });
});

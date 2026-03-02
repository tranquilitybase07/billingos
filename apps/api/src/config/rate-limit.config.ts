import { ExecutionContext } from '@nestjs/common';
import { minutes } from '@nestjs/throttler';
import { Request } from 'express';
import { createHash } from 'crypto';

type RateLimitIdentifier = 'ip' | 'organization' | 'customer';

interface RateLimitTier {
  limit: number;
  ttlMs: number;
}

interface EndpointRateLimitRule {
  path: string;
  method: string;
  identifier: RateLimitIdentifier;
  limit: number;
  ttlMs: number;
}

interface RateLimitConfig {
  enabled: boolean;
  skipInDevelopment: boolean;
  skipInTest: boolean;
  enableGracefulDegradation: boolean;
  logViolations: boolean;
  global: RateLimitTier;
  scopedDefault: RateLimitTier;
  endpoints: EndpointRateLimitRule[];
  headers: {
    limit: string;
    remaining: string;
    reset: string;
    retryAfter: string;
  };
  messages: {
    tooManyRequests: string;
  };
}

export const rateLimitConfig: RateLimitConfig = {
  enabled: process.env.RATE_LIMIT_ENABLED !== 'false',
  skipInDevelopment: process.env.SKIP_RATE_LIMIT === 'true',
  skipInTest: true,
  enableGracefulDegradation: true,
  logViolations: true,
  global: {
    limit: process.env.RATE_LIMIT_GLOBAL
      ? parseInt(process.env.RATE_LIMIT_GLOBAL, 10)
      : process.env.NODE_ENV === 'production'
        ? 100
        : 1000,
    ttlMs: minutes(1),
  },
  scopedDefault: {
    limit: process.env.RATE_LIMIT_ORG
      ? parseInt(process.env.RATE_LIMIT_ORG, 10)
      : 1000,
    ttlMs: minutes(1),
  },
  endpoints: [
    {
      path: '/v1/checkout/create',
      method: 'POST',
      identifier: 'customer',
      limit: 50,
      ttlMs: minutes(1),
    },
    {
      path: '/analytics/*',
      method: 'GET',
      identifier: 'organization',
      limit: 20,
      ttlMs: minutes(1),
    },
    {
      path: '/stripe/webhooks',
      method: 'POST',
      identifier: 'ip',
      limit: 100,
      ttlMs: minutes(1),
    },
    {
      path: '/v1/usage/track',
      method: 'POST',
      identifier: 'customer',
      limit: 1000,
      ttlMs: minutes(1),
    },
    {
      path: '/organizations/*/api-keys',
      method: 'POST',
      identifier: 'organization',
      limit: 10,
      ttlMs: minutes(1),
    },
    {
      path: '/*',
      method: 'DELETE',
      identifier: 'organization',
      limit: 30,
      ttlMs: minutes(1),
    },
  ],
  headers: {
    limit: 'X-RateLimit-Limit',
    remaining: 'X-RateLimit-Remaining',
    reset: 'X-RateLimit-Reset',
    retryAfter: 'Retry-After',
  },
  messages: {
    tooManyRequests: 'Too many requests. Please try again later.',
  },
};

export function shouldSkipAllRateLimiting(): boolean {
  if (!rateLimitConfig.enabled) {
    return true;
  }

  if (
    process.env.NODE_ENV === 'development' &&
    rateLimitConfig.skipInDevelopment
  ) {
    return true;
  }

  if (process.env.NODE_ENV === 'test' && rateLimitConfig.skipInTest) {
    return true;
  }

  return false;
}

export function shouldSkipPath(path: string): boolean {
  return path === '/health' || path === '/api/health' || path === '/metrics';
}

export function normalizePath(path: string): string {
  const noQuery = path.split('?')[0] || '/';
  if (noQuery.length > 1 && noQuery.endsWith('/')) {
    return noQuery.slice(0, -1);
  }
  return noQuery;
}

export function getRequestPath(request: Request): string {
  return normalizePath(request.originalUrl || request.url || '/');
}

export function getContextPath(context: ExecutionContext): string {
  const request = context.switchToHttp().getRequest<Request>();
  return getRequestPath(request);
}

export function getContextMethod(context: ExecutionContext): string {
  const request = context.switchToHttp().getRequest<Request>();
  return (request.method || 'GET').toUpperCase();
}

export function pathMatches(pattern: string, path: string): boolean {
  if (!pattern.includes('*')) {
    return pattern === path;
  }

  const escaped = pattern
    .replace(/[.+?^${}()|[\]\\]/g, '\\$&')
    .replace(/\*/g, '.*');
  return new RegExp(`^${escaped}$`).test(path);
}

export function findEndpointRule(
  context: ExecutionContext,
  identifier?: RateLimitIdentifier,
): EndpointRateLimitRule | undefined {
  const path = getContextPath(context);
  const method = getContextMethod(context);

  return rateLimitConfig.endpoints.find((rule) => {
    if (identifier && rule.identifier !== identifier) {
      return false;
    }

    return rule.method === method && pathMatches(rule.path, path);
  });
}

export function resolveOrganizationId(request: Request): string | undefined {
  const reqAny = request as any;
  const userOrg = reqAny.user?.organizationId;
  const customerOrg = reqAny.customer?.organizationId;
  const paramsOrg = request.params?.organizationId;
  const queryOrg = (request.query?.organization_id ||
    request.query?.organizationId) as string | undefined;
  const bodyOrg = (request.body?.organization_id ||
    request.body?.organizationId) as string | undefined;
  const headerOrg = request.headers['x-organization-id'] as string | undefined;

  return (
    userOrg || customerOrg || paramsOrg || queryOrg || bodyOrg || headerOrg
  );
}

export function resolveCustomerId(request: Request): string | undefined {
  const reqAny = request as any;
  const externalUserId = reqAny.customer?.externalUserId;
  const bodyCustomerId = request.body?.customer_id as string | undefined;
  const queryCustomerId = request.query?.customer_id as string | undefined;
  return externalUserId || bodyCustomerId || queryCustomerId;
}

export function getClientIp(request: Request): string {
  const forwardedFor = request.headers['x-forwarded-for'];
  if (typeof forwardedFor === 'string' && forwardedFor.length > 0) {
    return forwardedFor.split(',')[0].trim();
  }

  return request.ip || 'unknown-ip';
}

export function getGlobalRateLimitForContext(
  context: ExecutionContext,
): RateLimitTier {
  const ipRule = findEndpointRule(context, 'ip');
  if (!ipRule) {
    return rateLimitConfig.global;
  }

  return {
    limit: ipRule.limit,
    ttlMs: ipRule.ttlMs,
  };
}

export function getScopedRateLimitForContext(
  context: ExecutionContext,
): RateLimitTier {
  const scopedRule = findEndpointRule(context);
  if (!scopedRule || scopedRule.identifier === 'ip') {
    return rateLimitConfig.scopedDefault;
  }

  return {
    limit: scopedRule.limit,
    ttlMs: scopedRule.ttlMs,
  };
}

export function resolveScopedTrackerForContext(
  context: ExecutionContext,
): string | undefined {
  const request = context.switchToHttp().getRequest<Request>();
  const scopedRule = findEndpointRule(context);
  const organizationId = resolveOrganizationId(request);
  const customerId = resolveCustomerId(request);

  if (!scopedRule || scopedRule.identifier === 'organization') {
    return organizationId;
  }

  if (scopedRule.identifier === 'customer') {
    return customerId || organizationId || resolveAuthTokenFingerprint(request);
  }

  return organizationId || resolveAuthTokenFingerprint(request);
}

function resolveAuthTokenFingerprint(request: Request): string | undefined {
  const authorization = request.headers.authorization;
  if (!authorization || !authorization.startsWith('Bearer ')) {
    return undefined;
  }

  const token = authorization.slice('Bearer '.length).trim();
  if (!token) {
    return undefined;
  }

  return `token_${createHash('sha256').update(token).digest('hex').slice(0, 16)}`;
}

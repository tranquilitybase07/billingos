// Complete Rate Limiting Configuration for BillingOS
// This file can be copied directly to apps/api/src/config/rate-limit.config.ts

export interface RateLimitTier {
  limit: number;
  ttl: number; // Time window in seconds
  message?: string;
  skipIf?: (context: any) => boolean;
}

export interface EndpointRateLimit {
  path: string;
  method?: string | string[];
  limit: number;
  ttl: number;
  message?: string;
  identifier?: 'ip' | 'organization' | 'customer' | 'custom';
  customKeyGenerator?: (request: any) => string;
}

export interface RateLimitConfig {
  // Tier configurations
  tiers: {
    global: RateLimitTier;
    organization: RateLimitTier;
    customer: RateLimitTier;
    publicKey: RateLimitTier;
    secretKey: RateLimitTier;
  };

  // Endpoint-specific overrides
  endpoints: EndpointRateLimit[];

  // Feature flags
  features: {
    enabled: boolean;
    skipInDevelopment: boolean;
    skipInTest: boolean;
    enableGracefulDegradation: boolean;
    logViolations: boolean;
    logWarnings: boolean;
    warningThreshold: number; // Percentage (e.g., 80 = warn at 80% usage)
  };

  // HTTP Headers configuration
  headers: {
    limit: string;
    remaining: string;
    reset: string;
    retryAfter: string;
  };

  // Storage configuration
  storage: {
    type: 'memory' | 'redis';
    redisUrl?: string;
    cleanupInterval: number; // milliseconds
    maxStorageSize: number; // max entries in memory
  };

  // Response messages
  messages: {
    tooManyRequests: string;
    organizationLimit: string;
    customerLimit: string;
    endpointLimit: string;
  };
}

export const rateLimitConfig: RateLimitConfig = {
  // Tier configurations
  tiers: {
    // Level 1: Global IP-based limiting
    global: {
      limit: process.env.RATE_LIMIT_GLOBAL
        ? parseInt(process.env.RATE_LIMIT_GLOBAL)
        : process.env.NODE_ENV === 'production' ? 100 : 1000,
      ttl: 60, // 1 minute window
      message: 'Too many requests from this IP address. Please try again later.',
      skipIf: (context) => {
        const request = context.switchToHttp().getRequest();
        // Skip for internal health checks
        return request.url === '/health' ||
               request.url === '/api/health' ||
               request.url === '/metrics';
      },
    },

    // Level 2: Organization-based limiting
    organization: {
      limit: process.env.RATE_LIMIT_ORG
        ? parseInt(process.env.RATE_LIMIT_ORG)
        : 1000,
      ttl: 60,
      message: 'Your organization has exceeded its rate limit. Please try again later.',
    },

    // Level 3: Customer/SDK limiting
    customer: {
      limit: process.env.RATE_LIMIT_CUSTOMER
        ? parseInt(process.env.RATE_LIMIT_CUSTOMER)
        : 500,
      ttl: 60,
      message: 'Customer rate limit exceeded. Please try again later.',
    },

    // Publishable key limits (more restrictive)
    publicKey: {
      limit: 200,
      ttl: 60,
      message: 'Publishable key rate limit exceeded. This key has restricted usage.',
    },

    // Secret key limits (more permissive)
    secretKey: {
      limit: 1000,
      ttl: 60,
      message: 'Secret key rate limit exceeded. Please try again later.',
    },
  },

  // Endpoint-specific rate limits
  endpoints: [
    // Checkout operations - expensive Stripe calls
    {
      path: '/api/v1/checkout/create-session',
      method: 'POST',
      limit: 50,
      ttl: 60,
      message: 'Too many checkout attempts. Please wait before trying again.',
      identifier: 'customer',
    },
    {
      path: '/api/v1/checkout/*/complete',
      method: 'POST',
      limit: 10,
      ttl: 60,
      message: 'Too many checkout completion attempts.',
      identifier: 'customer',
    },

    // Analytics - expensive database queries
    {
      path: '/api/v1/analytics/*',
      method: 'GET',
      limit: 20,
      ttl: 60,
      message: 'Analytics rate limit exceeded. These queries are resource-intensive.',
      identifier: 'organization',
    },

    // Usage tracking - high volume expected
    {
      path: '/api/v1/usage/track',
      method: 'POST',
      limit: 1000,
      ttl: 60,
      message: 'Usage tracking rate limit exceeded.',
      identifier: 'customer',
    },
    {
      path: '/api/v1/usage/batch',
      method: 'POST',
      limit: 100,
      ttl: 60,
      message: 'Batch usage tracking rate limit exceeded.',
      identifier: 'customer',
    },

    // API key management - security sensitive
    {
      path: '/api-keys',
      method: 'POST',
      limit: 10,
      ttl: 3600, // 1 hour window
      message: 'Too many API key creation attempts. Please wait before creating more keys.',
      identifier: 'organization',
    },
    {
      path: '/api-keys/*',
      method: 'DELETE',
      limit: 20,
      ttl: 3600,
      message: 'Too many API key deletion attempts.',
      identifier: 'organization',
    },

    // Destructive operations
    {
      path: '/api/v1/products/*',
      method: 'DELETE',
      limit: 30,
      ttl: 60,
      message: 'Too many delete operations. Destructive actions are rate limited.',
      identifier: 'organization',
    },
    {
      path: '/api/v1/customers/*',
      method: 'DELETE',
      limit: 30,
      ttl: 60,
      message: 'Too many customer deletion attempts.',
      identifier: 'organization',
    },

    // Webhook endpoints - handle webhook storms
    {
      path: '/stripe/webhooks',
      method: 'POST',
      limit: 100,
      ttl: 60,
      message: 'Webhook rate limit exceeded. Too many webhook events.',
      identifier: 'ip', // Webhooks come from Stripe IPs
    },

    // Authentication endpoints
    {
      path: '/auth/login',
      method: 'POST',
      limit: 10,
      ttl: 900, // 15 minute window
      message: 'Too many login attempts. Please wait 15 minutes.',
      identifier: 'ip',
    },
    {
      path: '/auth/signup',
      method: 'POST',
      limit: 5,
      ttl: 3600, // 1 hour window
      message: 'Too many signup attempts. Please try again later.',
      identifier: 'ip',
    },

    // File uploads - resource intensive
    {
      path: '/api/v1/upload',
      method: 'POST',
      limit: 10,
      ttl: 300, // 5 minute window
      message: 'File upload rate limit exceeded.',
      identifier: 'organization',
    },

    // Search operations
    {
      path: '/api/v1/search',
      method: 'GET',
      limit: 60,
      ttl: 60,
      message: 'Search rate limit exceeded.',
      identifier: 'organization',
    },

    // Public endpoints - more restrictive
    {
      path: '/api/public/*',
      method: ['GET', 'POST'],
      limit: 30,
      ttl: 60,
      message: 'Public API rate limit exceeded.',
      identifier: 'ip',
    },
  ],

  // Feature configuration
  features: {
    enabled: process.env.RATE_LIMIT_ENABLED !== 'false',
    skipInDevelopment: process.env.SKIP_RATE_LIMIT === 'true',
    skipInTest: true,
    enableGracefulDegradation: true,
    logViolations: true,
    logWarnings: process.env.NODE_ENV === 'development',
    warningThreshold: 80, // Warn when 80% of limit is used
  },

  // HTTP Headers
  headers: {
    limit: 'X-RateLimit-Limit',
    remaining: 'X-RateLimit-Remaining',
    reset: 'X-RateLimit-Reset',
    retryAfter: 'Retry-After',
  },

  // Storage configuration
  storage: {
    type: process.env.REDIS_URL ? 'redis' : 'memory',
    redisUrl: process.env.REDIS_URL,
    cleanupInterval: 60000, // Clean up every minute
    maxStorageSize: 10000, // Max 10k entries in memory
  },

  // Response messages
  messages: {
    tooManyRequests: 'Too many requests. Please slow down and try again later.',
    organizationLimit: 'Your organization has reached its rate limit. Please upgrade your plan for higher limits.',
    customerLimit: 'This customer has exceeded the rate limit. Please try again later.',
    endpointLimit: 'This endpoint has specific rate limits. Please check the documentation.',
  },
};

// Helper functions for rate limiting

/**
 * Get rate limit for a specific endpoint
 */
export function getEndpointRateLimit(
  path: string,
  method: string
): EndpointRateLimit | undefined {
  return rateLimitConfig.endpoints.find(endpoint => {
    const methodMatch = !endpoint.method ||
      (Array.isArray(endpoint.method)
        ? endpoint.method.includes(method)
        : endpoint.method === method);

    const pathMatch = pathMatches(path, endpoint.path);

    return methodMatch && pathMatch;
  });
}

/**
 * Check if a path matches a pattern (with wildcards)
 */
export function pathMatches(actualPath: string, pattern: string): boolean {
  if (pattern.includes('*')) {
    const regex = pattern
      .replace(/\*/g, '.*')
      .replace(/\//g, '\\/')
      .replace(/:/g, '[^/]+');
    return new RegExp(`^${regex}$`).test(actualPath);
  }
  return actualPath === pattern;
}

/**
 * Calculate rate limit window expiry
 */
export function calculateResetTime(ttlSeconds: number): number {
  return Math.floor((Date.now() + ttlSeconds * 1000) / 1000);
}

/**
 * Format rate limit error response
 */
export function formatRateLimitError(
  limit: number,
  remaining: number,
  resetTime: number,
  message?: string
): any {
  return {
    error: {
      code: 'RATE_LIMIT_EXCEEDED',
      message: message || rateLimitConfig.messages.tooManyRequests,
      details: {
        limit,
        remaining: Math.max(0, remaining),
        reset: new Date(resetTime * 1000).toISOString(),
        retryAfter: Math.max(0, resetTime - Math.floor(Date.now() / 1000)),
      },
    },
  };
}

// Environment-specific presets
export const rateLimitPresets = {
  development: {
    global: { limit: 10000, ttl: 60 },
    organization: { limit: 5000, ttl: 60 },
    customer: { limit: 2000, ttl: 60 },
  },
  staging: {
    global: { limit: 500, ttl: 60 },
    organization: { limit: 2000, ttl: 60 },
    customer: { limit: 1000, ttl: 60 },
  },
  production: {
    global: { limit: 100, ttl: 60 },
    organization: { limit: 1000, ttl: 60 },
    customer: { limit: 500, ttl: 60 },
  },
};

// Export for use in other modules
export default rateLimitConfig;
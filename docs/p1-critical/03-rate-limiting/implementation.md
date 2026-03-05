# 🚦 Rate Limiting - Step-by-Step Implementation

**Time Estimate:** 3 hours
**Prerequisites:** Security Audit completed, NestJS app running

## 📋 Pre-Implementation Checklist

- [ ] Security audit completed
- [ ] Request IDs implemented
- [ ] Create branch: `git checkout -b feat/rate-limiting`
- [ ] NestJS app structure understood

## 🛠️ Implementation Steps

### Step 1: Install Dependencies (10 minutes)

```bash
cd apps/api
pnpm add @nestjs/throttler
pnpm add -D @types/express-rate-limit
```

### Step 2: Create Rate Limiting Configuration (20 minutes)

#### 2.1 Create Configuration File

**File:** `apps/api/src/config/rate-limit.config.ts`

```typescript
export interface RateLimitTier {
  limit: number;
  ttl: number; // in seconds
  message?: string;
}

export interface EndpointRateLimit {
  path: string;
  method?: string;
  limit: number;
  ttl: number;
  message?: string;
}

export const rateLimitConfig = {
  // Global rate limit (per IP)
  global: {
    limit: process.env.NODE_ENV === 'production' ? 100 : 1000,
    ttl: 60, // 1 minute
    message: 'Too many requests from this IP, please try again later.',
  } as RateLimitTier,

  // Organization rate limit (per org)
  organization: {
    limit: 1000,
    ttl: 60,
    message: 'Organization rate limit exceeded, please try again later.',
  } as RateLimitTier,

  // Customer rate limit (for SDK usage)
  customer: {
    limit: 500,
    ttl: 60,
    message: 'Customer rate limit exceeded, please try again later.',
  } as RateLimitTier,

  // Endpoint-specific limits
  endpoints: [
    {
      path: '/api/v1/checkout/create-session',
      method: 'POST',
      limit: 50,
      ttl: 60,
      message: 'Too many checkout attempts, please try again later.',
    },
    {
      path: '/api/v1/analytics/*',
      method: 'GET',
      limit: 20,
      ttl: 60,
      message: 'Analytics rate limit exceeded.',
    },
    {
      path: '/api/v1/usage/track',
      method: 'POST',
      limit: 1000,
      ttl: 60,
      message: 'Usage tracking rate limit exceeded.',
    },
    {
      path: '/api-keys',
      method: 'POST',
      limit: 10,
      ttl: 60,
      message: 'Too many API key creation attempts.',
    },
    {
      path: '/api/v1/*',
      method: 'DELETE',
      limit: 30,
      ttl: 60,
      message: 'Too many delete operations.',
    },
  ] as EndpointRateLimit[],

  // Configuration flags
  skipInDevelopment: process.env.SKIP_RATE_LIMIT === 'true',
  enableGracefulDegradation: true,
  logViolations: true,

  // Headers configuration
  headers: {
    limit: 'X-RateLimit-Limit',
    remaining: 'X-RateLimit-Remaining',
    reset: 'X-RateLimit-Reset',
    retryAfter: 'Retry-After',
  },
};
```

### Step 3: Create Custom Rate Limit Guards (45 minutes)

#### 3.1 Create Organization Rate Limit Guard

**File:** `apps/api/src/common/guards/organization-rate-limit.guard.ts`

```typescript
import {
  Injectable,
  ExecutionContext,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import { ThrottlerGuard, ThrottlerException } from '@nestjs/throttler';
import { Reflector } from '@nestjs/core';
import { Request, Response } from 'express';
import { rateLimitConfig } from '../../config/rate-limit.config';
import { securityLogger } from '../utils/security-logger';

@Injectable()
export class OrganizationRateLimitGuard extends ThrottlerGuard {
  constructor(reflector: Reflector) {
    super(
      {
        limit: rateLimitConfig.organization.limit,
        ttl: rateLimitConfig.organization.ttl,
      },
      new Map(), // In-memory storage
      reflector,
    );
  }

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<Request>();
    const response = context.switchToHttp().getResponse<Response>();

    // Skip in development if configured
    if (
      process.env.NODE_ENV === 'development' &&
      rateLimitConfig.skipInDevelopment
    ) {
      return true;
    }

    // Skip if no organization context
    const user = request.user as any;
    if (!user || !user.organizationId) {
      return true; // Let global rate limit handle it
    }

    try {
      const key = this.generateKey(context);
      const { limit, ttl } = this.getLimit(context);
      const ttlMilliseconds = ttl * 1000;

      // Check rate limit
      const { totalHits, timeToExpire } = await this.storageService.increment(
        key,
        ttlMilliseconds,
      );

      const remaining = Math.max(0, limit - totalHits);
      const resetTime = Math.floor((Date.now() + timeToExpire) / 1000);

      // Set rate limit headers
      this.setRateLimitHeaders(response, limit, remaining, resetTime);

      if (totalHits > limit) {
        // Log rate limit violation
        if (rateLimitConfig.logViolations) {
          securityLogger.securityViolation(
            'rate_limit_exceeded',
            {
              type: 'organization',
              organizationId: user.organizationId,
              limit,
              totalHits,
            },
            (request as any).requestId || 'no-request-id',
          );
        }

        // Set Retry-After header
        response.setHeader('Retry-After', Math.ceil(timeToExpire / 1000));

        throw new ThrottlerException(rateLimitConfig.organization.message);
      }

      return true;
    } catch (error) {
      // Graceful degradation
      if (rateLimitConfig.enableGracefulDegradation && !(error instanceof ThrottlerException)) {
        console.error('Rate limiter error, allowing request:', error);
        return true; // Allow request on rate limiter failure
      }
      throw error;
    }
  }

  protected generateKey(context: ExecutionContext): string {
    const request = context.switchToHttp().getRequest<Request>();
    const user = request.user as any;

    // Use organization ID as the key
    return `org_${user.organizationId}`;
  }

  private getLimit(context: ExecutionContext): { limit: number; ttl: number } {
    // Check for endpoint-specific limits
    const request = context.switchToHttp().getRequest<Request>();
    const path = request.route?.path || request.path;
    const method = request.method;

    const endpointLimit = rateLimitConfig.endpoints.find(
      (ep) =>
        this.pathMatches(path, ep.path) &&
        (!ep.method || ep.method === method),
    );

    if (endpointLimit) {
      return { limit: endpointLimit.limit, ttl: endpointLimit.ttl };
    }

    return {
      limit: rateLimitConfig.organization.limit,
      ttl: rateLimitConfig.organization.ttl,
    };
  }

  private pathMatches(actualPath: string, pattern: string): boolean {
    // Handle wildcard patterns
    if (pattern.includes('*')) {
      const regex = pattern.replace(/\*/g, '.*').replace(/\//g, '\\/');
      return new RegExp(`^${regex}$`).test(actualPath);
    }
    return actualPath === pattern;
  }

  private setRateLimitHeaders(
    response: Response,
    limit: number,
    remaining: number,
    reset: number,
  ): void {
    response.setHeader(rateLimitConfig.headers.limit, limit);
    response.setHeader(rateLimitConfig.headers.remaining, remaining);
    response.setHeader(rateLimitConfig.headers.reset, reset);
  }
}
```

#### 3.2 Create Customer Rate Limit Guard

**File:** `apps/api/src/common/guards/customer-rate-limit.guard.ts`

```typescript
import {
  Injectable,
  ExecutionContext,
} from '@nestjs/common';
import { ThrottlerGuard, ThrottlerException } from '@nestjs/throttler';
import { Reflector } from '@nestjs/core';
import { Request } from 'express';
import { rateLimitConfig } from '../../config/rate-limit.config';
import { ApiKeyType } from '../../api-keys/types/api-key.types';

@Injectable()
export class CustomerRateLimitGuard extends ThrottlerGuard {
  constructor(reflector: Reflector) {
    super(
      {
        limit: rateLimitConfig.customer.limit,
        ttl: rateLimitConfig.customer.ttl,
      },
      new Map(),
      reflector,
    );
  }

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<Request>();
    const user = request.user as any;

    // Only apply to API key authentication
    if (!user || user.type !== 'api_key') {
      return true;
    }

    // Different limits for publishable vs secret keys
    if (user.keyType === ApiKeyType.PUBLISHABLE) {
      // Lower limit for publishable keys
      this.options.limit = Math.floor(rateLimitConfig.customer.limit / 2);
    }

    return super.canActivate(context);
  }

  protected generateKey(context: ExecutionContext): string {
    const request = context.switchToHttp().getRequest<Request>();
    const user = request.user as any;

    if (user.type === 'api_key') {
      // Use API key ID for customer rate limiting
      return `customer_${user.keyId}`;
    }

    // Fallback to organization
    return `customer_${user.organizationId}`;
  }
}
```

### Step 4: Create Custom Throttler Storage (30 minutes)

#### 4.1 Create Fallback Storage Service

**File:** `apps/api/src/common/services/throttler-storage.service.ts`

```typescript
import { Injectable } from '@nestjs/common';
import { ThrottlerStorage } from '@nestjs/throttler';

interface StorageRecord {
  totalHits: number;
  expiresAt: number;
}

@Injectable()
export class CustomThrottlerStorage implements ThrottlerStorage {
  private storage = new Map<string, StorageRecord>();
  private cleanupInterval: NodeJS.Timeout;

  constructor() {
    // Cleanup expired entries every minute
    this.cleanupInterval = setInterval(() => {
      this.cleanup();
    }, 60000);
  }

  async increment(key: string, ttl: number): Promise<{ totalHits: number; timeToExpire: number }> {
    const now = Date.now();
    const record = this.storage.get(key);

    if (!record || record.expiresAt <= now) {
      // Create new record
      const expiresAt = now + ttl;
      const newRecord: StorageRecord = {
        totalHits: 1,
        expiresAt,
      };
      this.storage.set(key, newRecord);
      return { totalHits: 1, timeToExpire: ttl };
    }

    // Increment existing record
    record.totalHits++;
    const timeToExpire = record.expiresAt - now;
    return { totalHits: record.totalHits, timeToExpire };
  }

  private cleanup(): void {
    const now = Date.now();
    for (const [key, record] of this.storage.entries()) {
      if (record.expiresAt <= now) {
        this.storage.delete(key);
      }
    }

    // Log memory usage in development
    if (process.env.NODE_ENV === 'development') {
      console.log(`Rate limiter storage size: ${this.storage.size} entries`);
    }
  }

  onModuleDestroy(): void {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
    }
  }
}
```

### Step 5: Configure Throttler Module (30 minutes)

#### 5.1 Update App Module

**File:** `apps/api/src/app.module.ts`

```typescript
import { Module, MiddlewareConsumer, NestModule } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { ThrottlerModule, ThrottlerGuard } from '@nestjs/throttler';
import { OrganizationRateLimitGuard } from './common/guards/organization-rate-limit.guard';
import { CustomThrottlerStorage } from './common/services/throttler-storage.service';
import { rateLimitConfig } from './config/rate-limit.config';
// ... other imports

@Module({
  imports: [
    // Configure global rate limiting
    ThrottlerModule.forRoot({
      ttl: rateLimitConfig.global.ttl,
      limit: rateLimitConfig.global.limit,
      storage: new CustomThrottlerStorage(),
      skipIf: (context) => {
        // Skip rate limiting for health checks
        const request = context.switchToHttp().getRequest();
        return request.url === '/health' || request.url === '/api/health';
      },
    }),
    // ... other modules
  ],
  providers: [
    // Global IP-based rate limiting
    {
      provide: APP_GUARD,
      useClass: ThrottlerGuard,
    },
    // Organization-based rate limiting (applied selectively)
    OrganizationRateLimitGuard,
  ],
})
export class AppModule {}
```

### Step 6: Apply Rate Limiting to Controllers (30 minutes)

#### 6.1 Update V1 Controller

**File:** `apps/api/src/v1/v1.controller.ts`

```typescript
import {
  Controller,
  Get,
  Post,
  Delete,
  UseGuards,
  Body,
  Param,
} from '@nestjs/common';
import { Throttle, SkipThrottle } from '@nestjs/throttler';
import { OrganizationRateLimitGuard } from '../common/guards/organization-rate-limit.guard';
import { CustomerRateLimitGuard } from '../common/guards/customer-rate-limit.guard';
// ... other imports

@Controller('api/v1')
@UseGuards(OrganizationRateLimitGuard) // Apply org limits to all v1 endpoints
export class V1Controller {

  @Get('products')
  async getProducts() {
    // Standard rate limits apply
    return this.productsService.findAll();
  }

  @Post('checkout/create-session')
  @Throttle(50, 60) // Override with stricter limit: 50 per minute
  @UseGuards(CustomerRateLimitGuard) // Also apply customer limits
  async createCheckoutSession(@Body() dto: CreateCheckoutDto) {
    // Expensive Stripe operation - limited more strictly
    return this.checkoutService.createSession(dto);
  }

  @Get('analytics/:type')
  @Throttle(20, 60) // Analytics are expensive: 20 per minute
  async getAnalytics(@Param('type') type: string) {
    return this.analyticsService.getAnalytics(type);
  }

  @Post('usage/track')
  @Throttle(1000, 60) // High volume endpoint: 1000 per minute
  async trackUsage(@Body() dto: TrackUsageDto) {
    return this.usageService.track(dto);
  }

  @Delete('products/:id')
  @Throttle(30, 60) // Destructive operations: 30 per minute
  async deleteProduct(@Param('id') id: string) {
    return this.productsService.delete(id);
  }

  @Get('health')
  @SkipThrottle() // Health checks should never be rate limited
  async health() {
    return { status: 'ok', timestamp: new Date() };
  }
}
```

#### 6.2 Update Stripe Webhook Controller

**File:** `apps/api/src/stripe/stripe.controller.ts`

```typescript
import { Controller, Post, UseGuards } from '@nestjs/common';
import { SkipThrottle, Throttle } from '@nestjs/throttler';
// ... other imports

@Controller('stripe')
export class StripeController {

  @Post('webhooks')
  @Throttle(100, 60) // Allow reasonable webhook volume: 100 per minute
  async handleWebhook(
    @Headers('stripe-signature') signature: string,
    @Req() req: RawBodyRequest<Request>,
  ) {
    // Webhook signature validation provides additional security
    // Rate limiting prevents webhook storms
    return this.handleStripeWebhook(req, signature);
  }

  @Post('webhooks/connect')
  @Throttle(100, 60) // Stripe Connect webhooks
  async handleConnectWebhook(
    @Headers('stripe-signature') signature: string,
    @Req() req: RawBodyRequest<Request>,
  ) {
    return this.handleStripeConnectWebhook(req, signature);
  }
}
```

### Step 7: Create Rate Limit Exception Filter (20 minutes)

**File:** `apps/api/src/common/filters/rate-limit-exception.filter.ts`

```typescript
import {
  ExceptionFilter,
  Catch,
  ArgumentsHost,
  HttpStatus,
} from '@nestjs/common';
import { ThrottlerException } from '@nestjs/throttler';
import { Request, Response } from 'express';

@Catch(ThrottlerException)
export class RateLimitExceptionFilter implements ExceptionFilter {
  catch(exception: ThrottlerException, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();

    const status = HttpStatus.TOO_MANY_REQUESTS;
    const message = exception.message || 'Too many requests';

    // Ensure Retry-After header is set
    if (!response.hasHeader('Retry-After')) {
      response.setHeader('Retry-After', '60'); // Default to 60 seconds
    }

    response.status(status).json({
      statusCode: status,
      message,
      error: 'Too Many Requests',
      requestId: (request as any).requestId || 'no-request-id',
      timestamp: new Date().toISOString(),
    });
  }
}
```

### Step 8: Add Rate Limit Monitoring (20 minutes)

**File:** `apps/api/src/common/interceptors/rate-limit-monitor.interceptor.ts`

```typescript
import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import { tap } from 'rxjs/operators';
import { Response } from 'express';

@Injectable()
export class RateLimitMonitorInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    const response = context.switchToHttp().getResponse<Response>();

    return next.handle().pipe(
      tap(() => {
        // Log rate limit headers for monitoring
        const remaining = response.getHeader('X-RateLimit-Remaining');
        const limit = response.getHeader('X-RateLimit-Limit');

        if (remaining !== undefined && limit !== undefined) {
          const percentUsed = ((limit - remaining) / limit) * 100;

          // Warn when approaching limit
          if (percentUsed > 80) {
            console.warn(`Rate limit warning: ${percentUsed.toFixed(1)}% used`, {
              limit,
              remaining,
              endpoint: context.switchToHttp().getRequest().url,
            });
          }
        }
      }),
    );
  }
}
```

### Step 9: Register Exception Filter and Interceptor (10 minutes)

**File:** `apps/api/src/main.ts`

```typescript
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { RateLimitExceptionFilter } from './common/filters/rate-limit-exception.filter';
import { RateLimitMonitorInterceptor } from './common/interceptors/rate-limit-monitor.interceptor';

async function bootstrap() {
  const app = await NestFactory.create(AppModule, {
    rawBody: true,
  });

  // ... existing configuration

  // Add rate limit exception filter
  app.useGlobalFilters(new RateLimitExceptionFilter());

  // Add rate limit monitoring (development only)
  if (process.env.NODE_ENV === 'development') {
    app.useGlobalInterceptors(new RateLimitMonitorInterceptor());
  }

  await app.listen(3001);
}
bootstrap();
```

## ✅ Verification Steps

### 1. Test Global Rate Limiting

```bash
# Test IP-based rate limiting
for i in {1..110}; do
  echo "Request $i:"
  curl -s -o /dev/null -w "%{http_code}\n" http://localhost:3001/api/v1/products
  sleep 0.5
done

# After 100 requests, should return 429
```

### 2. Test Organization Rate Limiting

```bash
# With API key (organization context)
API_KEY="sk_test_YOUR_KEY"

for i in {1..1010}; do
  if [ $((i % 100)) -eq 0 ]; then
    echo "Request $i:"
    curl -s -w "%{http_code}\n" \
      -H "Authorization: Bearer $API_KEY" \
      http://localhost:3001/api/v1/products
  else
    curl -s -o /dev/null \
      -H "Authorization: Bearer $API_KEY" \
      http://localhost:3001/api/v1/products
  fi
done

# Should get 429 after 1000 requests
```

### 3. Test Endpoint-Specific Limits

```bash
# Test checkout endpoint (limit: 50/min)
for i in {1..55}; do
  echo "Checkout request $i:"
  curl -X POST -s -w "%{http_code}\n" \
    -H "Authorization: Bearer $API_KEY" \
    -H "Content-Type: application/json" \
    -d '{"productId": "prod-123"}' \
    http://localhost:3001/api/v1/checkout/create-session
done

# Should get 429 after 50 requests
```

### 4. Check Rate Limit Headers

```bash
# Make a request and check headers
curl -v -H "Authorization: Bearer $API_KEY" \
  http://localhost:3001/api/v1/products 2>&1 | grep -E "X-RateLimit|Retry-After"

# Expected headers:
# < X-RateLimit-Limit: 1000
# < X-RateLimit-Remaining: 999
# < X-RateLimit-Reset: 1234567890
```

### 5. Test Health Check Bypass

```bash
# Health check should never be rate limited
for i in {1..200}; do
  curl -s -o /dev/null -w "%{http_code} " http://localhost:3001/api/health
done

# All requests should return 200
```

## 🎯 Completion Checklist

- [ ] Dependencies installed (@nestjs/throttler)
- [ ] Rate limit configuration created
- [ ] Custom guards implemented
- [ ] Throttler module configured
- [ ] Controllers decorated with rate limits
- [ ] Exception filter created
- [ ] Monitoring interceptor added
- [ ] Global rate limiting working
- [ ] Organization rate limiting working
- [ ] Endpoint-specific limits applied
- [ ] Rate limit headers present
- [ ] Health check bypass working
- [ ] Graceful degradation tested
- [ ] All tests passing

## 🚀 Next Steps

1. Commit your changes:
```bash
git add .
git commit -m "feat: implement three-tier rate limiting with NestJS Throttler"
```

2. Monitor rate limit usage in development
3. Adjust limits based on actual usage patterns
4. Consider Redis storage for production scale

## 🆘 Troubleshooting

### Issue: Rate limits not being applied
```typescript
// Check if guard is registered
console.log('Guards:', Reflect.getMetadata('__guards__', YourController));

// Verify storage is working
console.log('Storage size:', this.storage.size);
```

### Issue: Headers not appearing
```typescript
// Ensure response object is available
const response = context.switchToHttp().getResponse();
console.log('Response headers:', response.getHeaders());
```

### Issue: Memory usage growing
```bash
# Monitor memory usage
node --inspect apps/api/dist/main.js
# Open chrome://inspect and check memory
```

---

**Important:** Start with conservative limits and monitor actual usage before adjusting!
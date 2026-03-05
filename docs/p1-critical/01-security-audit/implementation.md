# 🔒 Security Audit - Step-by-Step Implementation Guide

**Time Estimate:** 2 hours
**Prerequisites:** Access to BillingOS codebase, Node.js environment

## 📋 Pre-Implementation Checklist

- [ ] Create a new git branch: `git checkout -b feat/security-audit`
- [ ] Ensure all tests pass: `pnpm test`
- [ ] Have the codebase ready at `/Users/ankushkumar/Code/billingos`

## 🛠️ Implementation Steps

### Step 1: Remove Debug Artifacts (30 minutes)

#### 1.1 Clean JWT Auth Guard

**File:** `apps/api/src/auth/guards/jwt-auth.guard.ts`

**Current Code (with issues):**
```typescript
// This file likely contains:
// - TODO comments
// - Debug console.log statements
// - Commented out code
```

**Replace with:**
```typescript
import { Injectable, ExecutionContext, UnauthorizedException } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { Reflector } from '@nestjs/core';
import { IS_PUBLIC_KEY } from '../decorators/public.decorator';

@Injectable()
export class JwtAuthGuard extends AuthGuard('jwt') {
  constructor(private reflector: Reflector) {
    super();
  }

  canActivate(context: ExecutionContext) {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (isPublic) {
      return true;
    }

    return super.canActivate(context);
  }

  handleRequest(err: any, user: any, info: any) {
    if (err || !user) {
      throw err || new UnauthorizedException('Invalid authentication token');
    }
    return user;
  }
}
```

#### 1.2 Search and Remove ALL TODOs

**Run these commands to find all TODOs:**
```bash
# Find all TODO/FIXME comments in API
grep -r "TODO\|FIXME\|XXX\|HACK\|NOTE" apps/api/src/ --include="*.ts" | grep -v node_modules

# Find all console.log statements
grep -r "console\.log\|console\.error\|console\.warn" apps/api/src/ --include="*.ts"
```

**For each found item:**
1. If it's a valid concern, create a GitHub issue
2. Remove the comment from code
3. If it's debug logging, replace with proper logger

### Step 2: Implement Security Utilities (45 minutes)

#### 2.1 Create API Key Masking Utility

**Create file:** `apps/api/src/common/utils/security.utils.ts`

```typescript
/**
 * Masks sensitive API keys for logging
 * @param key - The API key to mask
 * @returns Masked version showing only first 7 and last 4 characters
 */
export function maskApiKey(key: string | undefined | null): string {
  if (!key) return 'no-key-provided';

  // Don't mask short keys (likely invalid anyway)
  if (key.length <= 12) return 'invalid-key-format';

  const prefix = key.substring(0, 7);
  const suffix = key.substring(key.length - 4);

  return `${prefix}...${suffix}`;
}

/**
 * Masks sensitive email addresses for logging
 * @param email - The email to mask
 * @returns Masked version showing only first 2 chars and domain
 */
export function maskEmail(email: string | undefined | null): string {
  if (!email) return 'no-email';

  const parts = email.split('@');
  if (parts.length !== 2) return 'invalid-email';

  const [localPart, domain] = parts;
  const maskedLocal = localPart.length > 2
    ? `${localPart.substring(0, 2)}***`
    : '***';

  return `${maskedLocal}@${domain}`;
}

/**
 * Sanitizes error messages to remove sensitive data
 * @param error - The error object
 * @returns Sanitized error message
 */
export function sanitizeError(error: any): string {
  let message = error?.message || 'Unknown error';

  // Remove potential API keys from error messages
  message = message.replace(/sk_[a-zA-Z0-9]{24,}/g, maskApiKey);
  message = message.replace(/pk_[a-zA-Z0-9]{24,}/g, maskApiKey);

  // Remove potential emails
  message = message.replace(/([a-zA-Z0-9._-]+@[a-zA-Z0-9._-]+\.[a-zA-Z0-9_-]+)/g, maskEmail);

  // Remove potential passwords (common patterns)
  message = message.replace(/password["\s:=]+[^\s,}]*/gi, 'password: [REDACTED]');
  message = message.replace(/secret["\s:=]+[^\s,}]*/gi, 'secret: [REDACTED]');
  message = message.replace(/token["\s:=]+[^\s,}]*/gi, 'token: [REDACTED]');

  return message;
}

/**
 * Generates a unique request ID
 * @returns A unique request identifier
 */
export function generateRequestId(): string {
  const timestamp = Date.now().toString(36);
  const random = Math.random().toString(36).substring(2, 9);
  return `req_${timestamp}_${random}`;
}
```

#### 2.2 Create Request ID Middleware

**Create file:** `apps/api/src/common/middleware/request-id.middleware.ts`

```typescript
import { Injectable, NestMiddleware } from '@nestjs/common';
import { Request, Response, NextFunction } from 'express';
import { generateRequestId } from '../utils/security.utils';

@Injectable()
export class RequestIdMiddleware implements NestMiddleware {
  use(req: Request & { id?: string }, res: Response, next: NextFunction) {
    // Check if client provided a request ID
    const providedId = req.headers['x-request-id'] as string;

    // Use provided ID or generate new one
    req.id = providedId || generateRequestId();

    // Add to response headers for tracing
    res.setHeader('x-request-id', req.id);

    // Add to request object for logging
    (req as any).requestId = req.id;

    next();
  }
}
```

#### 2.3 Create Security Logger

**Create file:** `apps/api/src/common/utils/security-logger.ts`

```typescript
import { Logger } from '@nestjs/common';
import { maskApiKey, maskEmail, sanitizeError } from './security.utils';

export class SecurityLogger {
  private readonly logger = new Logger('Security');

  /**
   * Log authentication attempt
   */
  authAttempt(userId: string, method: string, success: boolean, requestId: string) {
    this.logger.log({
      event: 'auth_attempt',
      userId: userId || 'anonymous',
      method, // 'jwt', 'api_key', 'session_token'
      success,
      requestId,
      timestamp: new Date().toISOString(),
    });
  }

  /**
   * Log API key usage
   */
  apiKeyUsage(keyPrefix: string, endpoint: string, requestId: string) {
    this.logger.log({
      event: 'api_key_usage',
      keyPrefix: maskApiKey(keyPrefix),
      endpoint,
      requestId,
      timestamp: new Date().toISOString(),
    });
  }

  /**
   * Log security violation
   */
  securityViolation(type: string, details: any, requestId: string) {
    this.logger.warn({
      event: 'security_violation',
      type, // 'invalid_token', 'rate_limit', 'suspicious_activity'
      details: this.sanitizeDetails(details),
      requestId,
      timestamp: new Date().toISOString(),
    });
  }

  /**
   * Log webhook validation
   */
  webhookValidation(eventType: string, valid: boolean, requestId: string) {
    this.logger.log({
      event: 'webhook_validation',
      eventType,
      valid,
      requestId,
      timestamp: new Date().toISOString(),
    });
  }

  private sanitizeDetails(details: any): any {
    if (typeof details === 'string') {
      return sanitizeError({ message: details });
    }

    // Recursively sanitize object
    const sanitized: any = {};
    for (const [key, value] of Object.entries(details)) {
      if (typeof value === 'string') {
        sanitized[key] = sanitizeError({ message: value });
      } else if (typeof value === 'object' && value !== null) {
        sanitized[key] = this.sanitizeDetails(value);
      } else {
        sanitized[key] = value;
      }
    }
    return sanitized;
  }
}

export const securityLogger = new SecurityLogger();
```

### Step 3: Update Main Application (30 minutes)

#### 3.1 Register Request ID Middleware

**File:** `apps/api/src/app.module.ts`

```typescript
import { Module, MiddlewareConsumer, NestModule } from '@nestjs/common';
import { RequestIdMiddleware } from './common/middleware/request-id.middleware';
// ... other imports

@Module({
  // ... existing configuration
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer
      .apply(RequestIdMiddleware)
      .forRoutes('*'); // Apply to all routes
  }
}
```

#### 3.2 Update Stripe Webhook Handler

**File:** `apps/api/src/stripe/stripe.controller.ts`

```typescript
import { securityLogger } from '../common/utils/security-logger';
import { sanitizeError } from '../common/utils/security.utils';

@Controller('stripe')
export class StripeController {
  @Post('webhooks')
  async handleWebhook(
    @Headers('stripe-signature') signature: string,
    @Req() req: RawBodyRequest<Request>,
    @Res() res: Response,
  ) {
    const requestId = (req as any).requestId || 'no-request-id';

    try {
      // Verify webhook signature
      const event = this.stripeService.constructEvent(
        req.rawBody,
        signature,
        this.webhookSecret,
      );

      // Log webhook validation
      securityLogger.webhookValidation(event.type, true, requestId);

      // Handle the event
      switch (event.type) {
        case 'checkout.session.completed':
          await this.handleCheckoutComplete(event, requestId);
          break;
        case 'customer.subscription.created':
        case 'customer.subscription.updated':
        case 'customer.subscription.deleted':
          await this.handleSubscriptionChange(event, requestId);
          break;
        case 'invoice.payment_succeeded':
        case 'invoice.payment_failed':
          await this.handleInvoiceEvent(event, requestId);
          break;
        default:
          // Log unhandled events for monitoring
          this.logger.warn(`Unhandled webhook event: ${event.type}`, { requestId });
      }

      res.status(200).send({ received: true });
    } catch (error) {
      securityLogger.webhookValidation('unknown', false, requestId);

      const sanitizedError = sanitizeError(error);
      this.logger.error(`Webhook error: ${sanitizedError}`, { requestId });

      res.status(400).send({
        error: {
          message: 'Webhook validation failed',
          requestId,
        }
      });
    }
  }
}
```

### Step 4: Add Response Sanitization (15 minutes)

#### 4.1 Create Response Interceptor

**Create file:** `apps/api/src/common/interceptors/response-sanitize.interceptor.ts`

```typescript
import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';

@Injectable()
export class ResponseSanitizeInterceptor implements NestInterceptor {
  // Fields that should never be sent to client
  private readonly blacklistedFields = [
    'password',
    'hashedPassword',
    'salt',
    'refreshToken',
    'stripeCustomerSecret',
    'webhookSecret',
    'apiKeyHash',
  ];

  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    const request = context.switchToHttp().getRequest();
    const requestId = (request as any).requestId;

    return next.handle().pipe(
      map(data => {
        // Add request ID to all responses
        if (typeof data === 'object' && data !== null) {
          data.requestId = requestId;
        }

        // Sanitize response
        return this.sanitizeResponse(data);
      }),
    );
  }

  private sanitizeResponse(data: any): any {
    if (!data) return data;

    if (Array.isArray(data)) {
      return data.map(item => this.sanitizeResponse(item));
    }

    if (typeof data !== 'object') {
      return data;
    }

    const sanitized: any = {};
    for (const [key, value] of Object.entries(data)) {
      // Skip blacklisted fields
      if (this.blacklistedFields.includes(key)) {
        continue;
      }

      // Mask API keys if they appear in response
      if (key.toLowerCase().includes('apikey') || key.toLowerCase().includes('api_key')) {
        if (typeof value === 'string' && value.startsWith('sk_')) {
          sanitized[key] = '[REDACTED]';
          continue;
        }
      }

      // Recursively sanitize nested objects
      if (typeof value === 'object' && value !== null) {
        sanitized[key] = this.sanitizeResponse(value);
      } else {
        sanitized[key] = value;
      }
    }

    return sanitized;
  }
}
```

#### 4.2 Register Global Interceptor

**File:** `apps/api/src/main.ts`

```typescript
import { ResponseSanitizeInterceptor } from './common/interceptors/response-sanitize.interceptor';

async function bootstrap() {
  const app = await NestFactory.create(AppModule, {
    rawBody: true,
    logger: ['error', 'warn', 'log'], // Remove 'debug' and 'verbose' in production
  });

  // ... existing configuration

  // Add response sanitization
  app.useGlobalInterceptors(new ResponseSanitizeInterceptor());

  // ... rest of bootstrap
}
```

### Step 5: Environment-Specific Configuration (15 minutes)

#### 5.1 Create Security Configuration

**Create file:** `apps/api/src/config/security.config.ts`

```typescript
export const securityConfig = {
  // Log levels per environment
  logLevel: process.env.NODE_ENV === 'production'
    ? ['error', 'warn', 'log']
    : ['error', 'warn', 'log', 'debug', 'verbose'],

  // Security headers
  headers: {
    'X-Frame-Options': 'DENY',
    'X-Content-Type-Options': 'nosniff',
    'X-XSS-Protection': '1; mode=block',
    'Strict-Transport-Security': 'max-age=31536000; includeSubDomains',
  },

  // CORS configuration
  cors: {
    origin: process.env.NODE_ENV === 'production'
      ? process.env.FRONTEND_URL
      : true, // Allow all origins in development
    credentials: true,
  },

  // Request ID header name
  requestIdHeader: 'x-request-id',
};
```

## ✅ Verification Steps

### 1. Run Security Checks

```bash
# No TODOs should be found
grep -r "TODO\|FIXME" apps/api/src/auth/ | wc -l
# Expected: 0

# No console.log should be found
grep -r "console\.log" apps/api/src/ --include="*.ts" | wc -l
# Expected: 0

# Check for sensitive field exposure
grep -r "password\|secret\|apiKeyHash" apps/api/src/ --include="*.ts" | grep -v "sanitize\|blacklist"
# Review each result to ensure it's not exposed
```

### 2. Test Request ID

```bash
# Should return x-request-id header
curl -v http://localhost:3001/api/v1/products 2>&1 | grep "x-request-id"
# Expected: < x-request-id: req_xxxxx_xxxxx

# Test with custom request ID
curl -H "x-request-id: custom-id-123" -v http://localhost:3001/api/v1/products 2>&1 | grep "x-request-id"
# Expected: < x-request-id: custom-id-123
```

### 3. Test API Key Masking

```bash
# Create an invalid API key error
curl -H "Authorization: Bearer sk_test_thisisaverylongapikeythatshouldbemasked" \
  http://localhost:3001/api/v1/products

# Check logs - should show masked key
# Expected log: "Invalid API key: sk_test...sked"
```

### 4. Test Response Sanitization

```bash
# Call an endpoint that might return user data
curl http://localhost:3001/api/users/me -H "Authorization: Bearer $JWT_TOKEN"

# Response should NOT contain:
# - password
# - hashedPassword
# - apiKeyHash
# - Any other sensitive fields
```

### 5. Run Tests

```bash
cd apps/api
pnpm test

# All tests should pass
# If any fail due to removed console.logs, update the tests
```

## 🎯 Completion Checklist

- [ ] All TODO/FIXME comments removed
- [ ] All console.log statements removed or replaced
- [ ] API key masking utility implemented
- [ ] Request ID middleware added
- [ ] Security logger implemented
- [ ] Stripe webhook validation improved
- [ ] Response sanitization interceptor added
- [ ] All tests still passing
- [ ] Security verification steps completed

## 🚀 Next Steps

1. Commit your changes:
```bash
git add .
git commit -m "feat: complete security audit - remove debug artifacts, add masking, implement request IDs"
```

2. Create a pull request with the security audit changes
3. Move on to implementing API Key Authentication (uses the utilities we just created)

## 🆘 Troubleshooting

### Issue: Tests failing after removing console.log
**Solution:** Update test files to use proper logger mocks instead of checking console output

### Issue: Request ID not appearing
**Solution:** Ensure RequestIdMiddleware is registered in AppModule before other middleware

### Issue: Sensitive data still in responses
**Solution:** Add field to blacklistedFields array in ResponseSanitizeInterceptor

---

**Important:** This security audit sets the foundation for all other P1 features. Take time to do it right!
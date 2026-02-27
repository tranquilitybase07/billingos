# 🚨 Error Handling - Implementation Plan

**Priority:** P1 - Critical
**Estimated Time:** 3 hours
**Complexity:** Medium
**Dependencies:** Security Audit (completed)

## 📋 Overview

Implement comprehensive error handling with standardized responses, Stripe-specific error mapping, and Sentry integration for production monitoring. Based on Autumn's sophisticated error handling patterns.

## 🎯 Why Proper Error Handling Matters

### Business Impact
- **User Experience**: Clear, actionable error messages help users resolve issues
- **Support Reduction**: Good error messages reduce support tickets
- **Trust Building**: Professional error handling builds confidence
- **Debugging Speed**: Detailed errors help developers fix issues faster
- **Payment Success**: Proper Stripe error handling improves payment completion rates

### Technical Impact
- **System Stability**: Graceful error handling prevents crashes
- **Security**: Proper error sanitization prevents information leakage
- **Monitoring**: Centralized error tracking identifies patterns
- **Performance**: Early error detection prevents cascading failures
- **Compliance**: Proper logging for audit trails

## 🏗️ Error Handling Architecture

### Error Hierarchy

```
BillingOSException (Base Class)
├── ValidationException (400)
│   ├── Invalid input data
│   ├── Missing required fields
│   └── Format violations
├── AuthenticationException (401)
│   ├── Invalid credentials
│   ├── Expired tokens
│   └── Missing auth headers
├── AuthorizationException (403)
│   ├── Insufficient permissions
│   ├── Resource access denied
│   └── Plan limits exceeded
├── NotFoundException (404)
│   ├── Resource not found
│   ├── Endpoint not found
│   └── Organization not found
├── ConflictException (409)
│   ├── Duplicate resources
│   ├── State conflicts
│   └── Race conditions
├── PaymentException (402/400)
│   ├── Card declined
│   ├── Insufficient funds
│   └── Invalid payment method
└── InternalException (500)
    ├── Database errors
    ├── Service failures
    └── Unexpected errors
```

### Error Response Format

```json
{
  "error": {
    "code": "PAYMENT_CARD_DECLINED",
    "message": "Your card was declined. Please try another payment method.",
    "details": {
      "declineCode": "insufficient_funds",
      "last4": "4242",
      "suggestion": "Please ensure sufficient funds or try another card"
    },
    "requestId": "req_abc123_xyz789",
    "timestamp": "2024-02-23T10:30:00Z",
    "help": "https://docs.billingos.com/errors/PAYMENT_CARD_DECLINED"
  },
  "statusCode": 400
}
```

## 📊 Current State vs Target State

### Current BillingOS State
- ✅ Basic NestJS exception handling
- ✅ Some validation with class-validator
- ❌ No standardized error format
- ❌ No Stripe error mapping
- ❌ No error categorization
- ❌ No Sentry integration
- ❌ Inconsistent error messages

### Autumn's Approach (Reference)
- Custom RecaseError class with codes
- 40+ Stripe error mappings
- Error categorization (warn vs error)
- Sentry integration with context
- Route-specific error skipping
- Comprehensive error codes enum

### Our Target State
- ✅ Custom BillingOSException hierarchy
- ✅ Complete Stripe error mapping
- ✅ Standardized error responses
- ✅ Sentry integration
- ✅ Error code documentation
- ✅ Context-rich error logging
- ✅ User-friendly messages

## 🔧 Implementation Components

### 1. Error Code System

```typescript
enum ErrorCode {
  // Validation Errors (VAL_)
  VAL_INVALID_INPUT = 'VAL_INVALID_INPUT',
  VAL_MISSING_FIELD = 'VAL_MISSING_FIELD',
  VAL_INVALID_FORMAT = 'VAL_INVALID_FORMAT',

  // Authentication Errors (AUTH_)
  AUTH_INVALID_TOKEN = 'AUTH_INVALID_TOKEN',
  AUTH_TOKEN_EXPIRED = 'AUTH_TOKEN_EXPIRED',
  AUTH_MISSING_CREDENTIALS = 'AUTH_MISSING_CREDENTIALS',

  // Payment Errors (PAY_)
  PAY_CARD_DECLINED = 'PAY_CARD_DECLINED',
  PAY_INSUFFICIENT_FUNDS = 'PAY_INSUFFICIENT_FUNDS',
  PAY_INVALID_CARD = 'PAY_INVALID_CARD',
  PAY_SUBSCRIPTION_FAILED = 'PAY_SUBSCRIPTION_FAILED',

  // Business Logic Errors (BIZ_)
  BIZ_QUOTA_EXCEEDED = 'BIZ_QUOTA_EXCEEDED',
  BIZ_PLAN_LIMIT = 'BIZ_PLAN_LIMIT',
  BIZ_DUPLICATE_RESOURCE = 'BIZ_DUPLICATE_RESOURCE',

  // System Errors (SYS_)
  SYS_DATABASE_ERROR = 'SYS_DATABASE_ERROR',
  SYS_SERVICE_UNAVAILABLE = 'SYS_SERVICE_UNAVAILABLE',
  SYS_INTERNAL_ERROR = 'SYS_INTERNAL_ERROR',
}
```

### 2. Stripe Error Mappings

Based on Autumn's comprehensive Stripe handling:

| Stripe Error | Our Code | User Message | HTTP Status |
|--------------|----------|--------------|-------------|
| card_declined | PAY_CARD_DECLINED | "Your card was declined" | 400 |
| insufficient_funds | PAY_INSUFFICIENT_FUNDS | "Insufficient funds" | 400 |
| expired_card | PAY_EXPIRED_CARD | "Your card has expired" | 400 |
| incorrect_cvc | PAY_INVALID_CVC | "Invalid security code" | 400 |
| processing_error | PAY_PROCESSING_ERROR | "Payment processing failed" | 500 |
| rate_limit | SYS_STRIPE_RATE_LIMIT | "Too many attempts" | 429 |

**40+ More Stripe Errors** (see `stripe-errors.ts` file)

### 3. Error Context Enrichment

```typescript
interface ErrorContext {
  userId?: string;
  organizationId?: string;
  apiKeyId?: string;
  endpoint: string;
  method: string;
  ip: string;
  userAgent: string;
  requestId: string;
  timestamp: Date;
  environment: string;
  // Stripe-specific
  stripeCustomerId?: string;
  stripeSubscriptionId?: string;
  stripePaymentIntentId?: string;
}
```

### 4. Sentry Integration Levels

```typescript
enum SentryLevel {
  DEBUG = 'debug',     // Development issues
  INFO = 'info',       // Informational
  WARNING = 'warning', // Recoverable errors
  ERROR = 'error',     // Errors needing attention
  FATAL = 'fatal',     // System failures
}

// What to send to Sentry
const sentryRules = {
  // Always send
  [ErrorCode.SYS_DATABASE_ERROR]: SentryLevel.ERROR,
  [ErrorCode.SYS_SERVICE_UNAVAILABLE]: SentryLevel.FATAL,

  // Send as warnings
  [ErrorCode.PAY_CARD_DECLINED]: SentryLevel.WARNING,
  [ErrorCode.BIZ_QUOTA_EXCEEDED]: SentryLevel.WARNING,

  // Don't send (normal business logic)
  [ErrorCode.AUTH_INVALID_TOKEN]: null,
  [ErrorCode.VAL_INVALID_INPUT]: null,
};
```

## 📝 Detailed Requirements

### Custom Exception Classes

1. **BillingOSException (Base)**
   - Properties: code, message, statusCode, details, help
   - Methods: toJSON(), withContext(), withDetails()
   - Automatically adds request ID and timestamp

2. **ValidationException**
   - Extends BillingOSException
   - Includes field-level errors
   - Integrates with class-validator

3. **PaymentException**
   - Extends BillingOSException
   - Stripe-specific error handling
   - Includes decline codes, suggestions
   - PCI-compliant (no full card numbers)

4. **BusinessException**
   - Extends BillingOSException
   - Quota/limit violations
   - Plan restrictions
   - Feature gating errors

### Global Exception Filter

```typescript
@Catch()
export class GlobalExceptionFilter implements ExceptionFilter {
  catch(exception: unknown, host: ArgumentsHost) {
    // 1. Categorize the error
    // 2. Sanitize sensitive data
    // 3. Enrich with context
    // 4. Log appropriately
    // 5. Send to Sentry if needed
    // 6. Return standardized response
  }
}
```

### Error Categorization

**Critical Errors** (Send to Sentry immediately):
- Database connection failures
- Service unavailability
- Unexpected system errors
- Security violations

**Warning-Level Errors** (Aggregate and send):
- Payment failures
- Rate limit hits
- Quota exceeded
- Deprecated API usage

**Info-Level** (Log but don't alert):
- Validation errors
- 404 Not Found
- Expected business logic failures

### User-Friendly Messages

| Technical Error | User Message |
|----------------|--------------|
| "connect ECONNREFUSED 127.0.0.1:5432" | "Service temporarily unavailable" |
| "duplicate key value violates unique constraint" | "This resource already exists" |
| "invalid input syntax for type uuid" | "Invalid resource identifier" |
| "JWT expired" | "Your session has expired. Please log in again" |

## 🔍 Reference Implementation (Autumn)

**Key Files:**
- `/Users/ankushkumar/Code/autumn/server/src/honoMiddlewares/errorMiddleware.ts`
- `/Users/ankushkumar/Code/autumn/server/src/honoMiddlewares/errorSkipMiddleware.ts`
- `/Users/ankushkumar/Code/autumn/server/src/errors.ts`

**Patterns to Adopt:**
1. Custom error class with error codes
2. Comprehensive Stripe error mapping
3. Error categorization for monitoring
4. Context-rich error logging
5. Sentry integration with proper levels

**Patterns to Simplify:**
1. Fewer error categories (we don't need 20+)
2. Simpler error skipping rules
3. Basic Sentry integration (not full APM)

## ✅ Success Criteria

### Must Have
- [ ] Custom exception hierarchy
- [ ] Standardized error format
- [ ] Stripe error mapping (40+ cases)
- [ ] Global exception filter
- [ ] Error sanitization
- [ ] Request ID in all errors
- [ ] Sentry integration

### Should Have
- [ ] Error code documentation
- [ ] User-friendly messages
- [ ] Context enrichment
- [ ] Error categorization
- [ ] Help URLs

### Nice to Have
- [ ] Error analytics dashboard
- [ ] Error rate monitoring
- [ ] Custom error pages
- [ ] Localized error messages

## 🚦 Risk Mitigation

| Risk | Impact | Mitigation |
|------|--------|------------|
| Information leakage | High | Sanitize all errors, never expose internals |
| Breaking changes | Medium | Keep existing error format, add new fields |
| Sentry overhead | Low | Use sampling, async reporting |
| Over-alerting | Medium | Proper categorization, rate limiting |
| Message confusion | Low | User testing, clear documentation |

## 📊 Testing Strategy

### Unit Tests
- Exception class creation
- Error code mapping
- Message sanitization
- Context enrichment

### Integration Tests
- Global filter catches all exceptions
- Stripe webhook errors handled
- Validation errors formatted correctly
- Sentry events sent properly

### Manual Testing
- Trigger various error conditions
- Verify error messages
- Check Sentry dashboard
- Test error recovery

## 📚 Additional Resources

- [NestJS Exception Filters](https://docs.nestjs.com/exception-filters)
- [Stripe Error Handling](https://stripe.com/docs/api/errors/handling)
- [Sentry for Node.js](https://docs.sentry.io/platforms/node/)
- [HTTP Status Codes](https://httpstatuses.com/)

## 🔄 Dependencies

**Prerequisites:**
- ✅ Security Audit (for sanitization utils)
- ✅ Request IDs (for error context)

**Enables:**
- Better debugging
- Faster issue resolution
- Improved user experience
- Production monitoring

---

**Remember:** Good error handling is invisible when it works but invaluable when things go wrong!
# 🚨 Error Handling - Step-by-Step Implementation

**Time Estimate:** 3 hours
**Prerequisites:** Security Audit completed, Sentry account ready

## 📋 Pre-Implementation Checklist

- [ ] Security audit completed
- [ ] Request ID middleware implemented
- [ ] Create branch: `git checkout -b feat/error-handling`
- [ ] Sentry account created (get DSN)

## 🛠️ Implementation Steps

### Step 1: Install Dependencies (10 minutes)

```bash
cd apps/api
pnpm add @sentry/node @sentry/profiling-node
pnpm add -D @types/node
```

### Step 2: Create Error Code System (20 minutes)

#### 2.1 Create Error Codes Enum

**File:** `apps/api/src/common/exceptions/error-codes.ts`

```typescript
export enum ErrorCode {
  // Validation Errors (VAL_) - 400
  VAL_INVALID_INPUT = 'VAL_INVALID_INPUT',
  VAL_MISSING_FIELD = 'VAL_MISSING_FIELD',
  VAL_INVALID_FORMAT = 'VAL_INVALID_FORMAT',
  VAL_INVALID_EMAIL = 'VAL_INVALID_EMAIL',
  VAL_INVALID_URL = 'VAL_INVALID_URL',
  VAL_FIELD_TOO_LONG = 'VAL_FIELD_TOO_LONG',
  VAL_FIELD_TOO_SHORT = 'VAL_FIELD_TOO_SHORT',

  // Authentication Errors (AUTH_) - 401
  AUTH_INVALID_TOKEN = 'AUTH_INVALID_TOKEN',
  AUTH_TOKEN_EXPIRED = 'AUTH_TOKEN_EXPIRED',
  AUTH_MISSING_CREDENTIALS = 'AUTH_MISSING_CREDENTIALS',
  AUTH_INVALID_API_KEY = 'AUTH_INVALID_API_KEY',
  AUTH_SESSION_EXPIRED = 'AUTH_SESSION_EXPIRED',
  AUTH_INVALID_CREDENTIALS = 'AUTH_INVALID_CREDENTIALS',

  // Authorization Errors (AUTHZ_) - 403
  AUTHZ_INSUFFICIENT_PERMISSIONS = 'AUTHZ_INSUFFICIENT_PERMISSIONS',
  AUTHZ_RESOURCE_ACCESS_DENIED = 'AUTHZ_RESOURCE_ACCESS_DENIED',
  AUTHZ_ORGANIZATION_ACCESS_DENIED = 'AUTHZ_ORGANIZATION_ACCESS_DENIED',
  AUTHZ_PLAN_LIMIT_EXCEEDED = 'AUTHZ_PLAN_LIMIT_EXCEEDED',
  AUTHZ_FEATURE_NOT_AVAILABLE = 'AUTHZ_FEATURE_NOT_AVAILABLE',

  // Resource Errors (RES_) - 404/409
  RES_NOT_FOUND = 'RES_NOT_FOUND',
  RES_ALREADY_EXISTS = 'RES_ALREADY_EXISTS',
  RES_CONFLICT = 'RES_CONFLICT',
  RES_DELETED = 'RES_DELETED',
  RES_EXPIRED = 'RES_EXPIRED',

  // Payment Errors (PAY_) - 400/402
  PAY_CARD_DECLINED = 'PAY_CARD_DECLINED',
  PAY_INSUFFICIENT_FUNDS = 'PAY_INSUFFICIENT_FUNDS',
  PAY_INVALID_CARD = 'PAY_INVALID_CARD',
  PAY_EXPIRED_CARD = 'PAY_EXPIRED_CARD',
  PAY_INVALID_CVC = 'PAY_INVALID_CVC',
  PAY_PROCESSING_ERROR = 'PAY_PROCESSING_ERROR',
  PAY_INVALID_PAYMENT_METHOD = 'PAY_INVALID_PAYMENT_METHOD',
  PAY_SUBSCRIPTION_FAILED = 'PAY_SUBSCRIPTION_FAILED',
  PAY_PAYMENT_REQUIRED = 'PAY_PAYMENT_REQUIRED',
  PAY_STRIPE_ERROR = 'PAY_STRIPE_ERROR',

  // Business Logic Errors (BIZ_) - 400/422
  BIZ_QUOTA_EXCEEDED = 'BIZ_QUOTA_EXCEEDED',
  BIZ_USAGE_LIMIT_EXCEEDED = 'BIZ_USAGE_LIMIT_EXCEEDED',
  BIZ_INVALID_STATE = 'BIZ_INVALID_STATE',
  BIZ_OPERATION_NOT_ALLOWED = 'BIZ_OPERATION_NOT_ALLOWED',
  BIZ_DUPLICATE_OPERATION = 'BIZ_DUPLICATE_OPERATION',
  BIZ_TRIAL_EXPIRED = 'BIZ_TRIAL_EXPIRED',

  // Rate Limiting (RATE_) - 429
  RATE_LIMIT_EXCEEDED = 'RATE_LIMIT_EXCEEDED',
  RATE_QUOTA_EXCEEDED = 'RATE_QUOTA_EXCEEDED',

  // System Errors (SYS_) - 500
  SYS_DATABASE_ERROR = 'SYS_DATABASE_ERROR',
  SYS_SERVICE_UNAVAILABLE = 'SYS_SERVICE_UNAVAILABLE',
  SYS_INTERNAL_ERROR = 'SYS_INTERNAL_ERROR',
  SYS_EXTERNAL_SERVICE_ERROR = 'SYS_EXTERNAL_SERVICE_ERROR',
  SYS_TIMEOUT = 'SYS_TIMEOUT',
  SYS_STRIPE_WEBHOOK_ERROR = 'SYS_STRIPE_WEBHOOK_ERROR',
}

// Error metadata for each code
export const ErrorMetadata: Record<ErrorCode, {
  message: string;
  statusCode: number;
  userMessage?: string;
  helpUrl?: string;
}> = {
  // Validation Errors
  [ErrorCode.VAL_INVALID_INPUT]: {
    message: 'Invalid input provided',
    statusCode: 400,
    userMessage: 'The information you provided is not valid. Please check and try again.',
  },
  [ErrorCode.VAL_MISSING_FIELD]: {
    message: 'Required field is missing',
    statusCode: 400,
    userMessage: 'Please fill in all required fields.',
  },
  [ErrorCode.VAL_INVALID_EMAIL]: {
    message: 'Invalid email format',
    statusCode: 400,
    userMessage: 'Please enter a valid email address.',
  },

  // Authentication Errors
  [ErrorCode.AUTH_INVALID_TOKEN]: {
    message: 'Invalid authentication token',
    statusCode: 401,
    userMessage: 'Your session is invalid. Please log in again.',
  },
  [ErrorCode.AUTH_TOKEN_EXPIRED]: {
    message: 'Authentication token has expired',
    statusCode: 401,
    userMessage: 'Your session has expired. Please log in again.',
  },
  [ErrorCode.AUTH_INVALID_API_KEY]: {
    message: 'Invalid API key',
    statusCode: 401,
    userMessage: 'The API key provided is invalid or has been revoked.',
    helpUrl: 'https://docs.billingos.com/api/authentication',
  },

  // Authorization Errors
  [ErrorCode.AUTHZ_INSUFFICIENT_PERMISSIONS]: {
    message: 'Insufficient permissions',
    statusCode: 403,
    userMessage: 'You don\'t have permission to perform this action.',
  },
  [ErrorCode.AUTHZ_PLAN_LIMIT_EXCEEDED]: {
    message: 'Plan limit exceeded',
    statusCode: 403,
    userMessage: 'This feature is not available on your current plan. Please upgrade to continue.',
    helpUrl: 'https://billingos.com/pricing',
  },

  // Resource Errors
  [ErrorCode.RES_NOT_FOUND]: {
    message: 'Resource not found',
    statusCode: 404,
    userMessage: 'The requested resource could not be found.',
  },
  [ErrorCode.RES_ALREADY_EXISTS]: {
    message: 'Resource already exists',
    statusCode: 409,
    userMessage: 'This resource already exists. Please use a different identifier.',
  },

  // Payment Errors
  [ErrorCode.PAY_CARD_DECLINED]: {
    message: 'Card declined',
    statusCode: 400,
    userMessage: 'Your card was declined. Please try a different payment method.',
    helpUrl: 'https://docs.billingos.com/payments/declined',
  },
  [ErrorCode.PAY_INSUFFICIENT_FUNDS]: {
    message: 'Insufficient funds',
    statusCode: 400,
    userMessage: 'Your card has insufficient funds. Please try a different payment method.',
  },
  [ErrorCode.PAY_EXPIRED_CARD]: {
    message: 'Card expired',
    statusCode: 400,
    userMessage: 'Your card has expired. Please update your payment method.',
  },

  // Business Logic Errors
  [ErrorCode.BIZ_QUOTA_EXCEEDED]: {
    message: 'Quota exceeded',
    statusCode: 429,
    userMessage: 'You have exceeded your usage quota. Please upgrade your plan or wait for the next billing cycle.',
  },
  [ErrorCode.BIZ_TRIAL_EXPIRED]: {
    message: 'Trial expired',
    statusCode: 403,
    userMessage: 'Your trial has expired. Please upgrade to continue using the service.',
  },

  // Rate Limiting
  [ErrorCode.RATE_LIMIT_EXCEEDED]: {
    message: 'Rate limit exceeded',
    statusCode: 429,
    userMessage: 'Too many requests. Please slow down and try again later.',
  },

  // System Errors
  [ErrorCode.SYS_DATABASE_ERROR]: {
    message: 'Database error',
    statusCode: 500,
    userMessage: 'We encountered a problem accessing our database. Please try again later.',
  },
  [ErrorCode.SYS_SERVICE_UNAVAILABLE]: {
    message: 'Service unavailable',
    statusCode: 503,
    userMessage: 'The service is temporarily unavailable. Please try again later.',
  },
  [ErrorCode.SYS_INTERNAL_ERROR]: {
    message: 'Internal server error',
    statusCode: 500,
    userMessage: 'An unexpected error occurred. Our team has been notified.',
  },
};

// Sentry severity levels for each error code
export const ErrorSeverity: Partial<Record<ErrorCode, 'debug' | 'info' | 'warning' | 'error' | 'fatal'>> = {
  // Critical - Always send
  [ErrorCode.SYS_DATABASE_ERROR]: 'error',
  [ErrorCode.SYS_SERVICE_UNAVAILABLE]: 'fatal',
  [ErrorCode.SYS_INTERNAL_ERROR]: 'error',
  [ErrorCode.SYS_EXTERNAL_SERVICE_ERROR]: 'error',

  // Warning - Aggregate and send
  [ErrorCode.PAY_CARD_DECLINED]: 'warning',
  [ErrorCode.PAY_PROCESSING_ERROR]: 'warning',
  [ErrorCode.BIZ_QUOTA_EXCEEDED]: 'warning',
  [ErrorCode.RATE_LIMIT_EXCEEDED]: 'warning',

  // Info - Log but don't alert
  [ErrorCode.AUTH_TOKEN_EXPIRED]: 'info',
  [ErrorCode.VAL_INVALID_INPUT]: 'info',

  // Don't send to Sentry (normal business logic)
  // Not included in this map
};
```

### Step 3: Create Custom Exception Classes (30 minutes)

#### 3.1 Create Base Exception

**File:** `apps/api/src/common/exceptions/billing-os.exception.ts`

```typescript
import { HttpException, HttpStatus } from '@nestjs/common';
import { ErrorCode, ErrorMetadata } from './error-codes';

export interface ErrorDetails {
  code: ErrorCode;
  message: string;
  details?: Record<string, any>;
  requestId?: string;
  timestamp?: string;
  help?: string;
}

export class BillingOSException extends HttpException {
  public readonly code: ErrorCode;
  public readonly details?: Record<string, any>;
  public readonly help?: string;
  public readonly requestId?: string;

  constructor(
    code: ErrorCode,
    message?: string,
    statusCode?: HttpStatus,
    details?: Record<string, any>
  ) {
    const metadata = ErrorMetadata[code];
    const finalMessage = message || metadata?.userMessage || metadata?.message || 'An error occurred';
    const finalStatusCode = statusCode || metadata?.statusCode || HttpStatus.INTERNAL_SERVER_ERROR;

    super(
      {
        error: {
          code,
          message: finalMessage,
          details,
          timestamp: new Date().toISOString(),
          help: metadata?.helpUrl,
        },
        statusCode: finalStatusCode,
      },
      finalStatusCode
    );

    this.code = code;
    this.details = details;
    this.help = metadata?.helpUrl;
  }

  withRequestId(requestId: string): this {
    (this as any).requestId = requestId;
    const response = this.getResponse() as any;
    response.error.requestId = requestId;
    return this;
  }

  withDetails(details: Record<string, any>): this {
    (this as any).details = { ...this.details, ...details };
    const response = this.getResponse() as any;
    response.error.details = { ...response.error.details, ...details };
    return this;
  }

  withHelp(helpUrl: string): this {
    (this as any).help = helpUrl;
    const response = this.getResponse() as any;
    response.error.help = helpUrl;
    return this;
  }
}
```

#### 3.2 Create Specific Exception Classes

**File:** `apps/api/src/common/exceptions/validation.exception.ts`

```typescript
import { HttpStatus } from '@nestjs/common';
import { BillingOSException } from './billing-os.exception';
import { ErrorCode } from './error-codes';

export class ValidationException extends BillingOSException {
  constructor(
    message?: string,
    fieldErrors?: Record<string, string[]>
  ) {
    super(
      ErrorCode.VAL_INVALID_INPUT,
      message || 'Validation failed',
      HttpStatus.BAD_REQUEST,
      { fieldErrors }
    );
  }

  static fromClassValidator(errors: any[]): ValidationException {
    const fieldErrors: Record<string, string[]> = {};

    errors.forEach((error) => {
      const property = error.property;
      const constraints = Object.values(error.constraints || {});
      fieldErrors[property] = constraints as string[];
    });

    return new ValidationException(
      'Validation failed for one or more fields',
      fieldErrors
    );
  }
}
```

**File:** `apps/api/src/common/exceptions/payment.exception.ts`

```typescript
import { HttpStatus } from '@nestjs/common';
import { BillingOSException } from './billing-os.exception';
import { ErrorCode } from './error-codes';

export class PaymentException extends BillingOSException {
  constructor(
    code: ErrorCode = ErrorCode.PAY_PROCESSING_ERROR,
    message?: string,
    details?: {
      declineCode?: string;
      last4?: string;
      cardBrand?: string;
      suggestion?: string;
    }
  ) {
    super(code, message, HttpStatus.BAD_REQUEST, details);
  }

  static cardDeclined(declineCode: string, last4?: string): PaymentException {
    const suggestions: Record<string, string> = {
      insufficient_funds: 'Please ensure sufficient funds or try another card',
      expired_card: 'Please update your card expiration date',
      incorrect_cvc: 'Please check your card security code',
      processing_error: 'Please try again in a few moments',
      generic_decline: 'Please contact your card issuer or try another card',
    };

    return new PaymentException(
      ErrorCode.PAY_CARD_DECLINED,
      'Your card was declined',
      {
        declineCode,
        last4,
        suggestion: suggestions[declineCode] || suggestions.generic_decline,
      }
    );
  }
}
```

**File:** `apps/api/src/common/exceptions/business.exception.ts`

```typescript
import { HttpStatus } from '@nestjs/common';
import { BillingOSException } from './billing-os.exception';
import { ErrorCode } from './error-codes';

export class BusinessException extends BillingOSException {
  constructor(
    code: ErrorCode = ErrorCode.BIZ_OPERATION_NOT_ALLOWED,
    message?: string,
    details?: Record<string, any>
  ) {
    super(code, message, HttpStatus.BAD_REQUEST, details);
  }

  static quotaExceeded(
    resource: string,
    current: number,
    limit: number
  ): BusinessException {
    return new BusinessException(
      ErrorCode.BIZ_QUOTA_EXCEEDED,
      `You have exceeded your ${resource} quota`,
      {
        resource,
        current,
        limit,
        suggestion: 'Please upgrade your plan for higher limits',
      }
    );
  }

  static planLimitExceeded(feature: string): BusinessException {
    return new BusinessException(
      ErrorCode.AUTHZ_PLAN_LIMIT_EXCEEDED,
      `The feature "${feature}" is not available on your current plan`,
      {
        feature,
        suggestion: 'Please upgrade to a higher plan',
        upgradeUrl: 'https://billingos.com/pricing',
      }
    );
  }
}
```

### Step 4: Create Stripe Error Mapper (30 minutes)

**File:** `apps/api/src/common/exceptions/stripe-error-mapper.ts`

```typescript
import Stripe from 'stripe';
import { PaymentException } from './payment.exception';
import { BillingOSException } from './billing-os.exception';
import { ErrorCode } from './error-codes';
import { HttpStatus } from '@nestjs/common';

export class StripeErrorMapper {
  /**
   * Map Stripe errors to BillingOS exceptions
   * Based on Autumn's comprehensive Stripe error handling
   */
  static mapStripeError(error: Stripe.errors.StripeError): BillingOSException {
    // Handle different Stripe error types
    switch (error.type) {
      case 'StripeCardError':
        return this.handleCardError(error as Stripe.errors.StripeCardError);
      case 'StripeRateLimitError':
        return this.handleRateLimitError(error);
      case 'StripeInvalidRequestError':
        return this.handleInvalidRequestError(error);
      case 'StripeAPIError':
        return this.handleAPIError(error);
      case 'StripeConnectionError':
        return this.handleConnectionError(error);
      case 'StripeAuthenticationError':
        return this.handleAuthenticationError(error);
      default:
        return this.handleUnknownError(error);
    }
  }

  private static handleCardError(error: Stripe.errors.StripeCardError): PaymentException {
    const declineCode = error.decline_code || error.code || 'generic_decline';
    const last4 = (error.raw as any)?.payment_method?.card?.last4;

    // Map specific decline codes to our error codes
    const codeMap: Record<string, ErrorCode> = {
      insufficient_funds: ErrorCode.PAY_INSUFFICIENT_FUNDS,
      expired_card: ErrorCode.PAY_EXPIRED_CARD,
      incorrect_cvc: ErrorCode.PAY_INVALID_CVC,
      card_declined: ErrorCode.PAY_CARD_DECLINED,
      processing_error: ErrorCode.PAY_PROCESSING_ERROR,
      lost_card: ErrorCode.PAY_CARD_DECLINED,
      stolen_card: ErrorCode.PAY_CARD_DECLINED,
      invalid_number: ErrorCode.PAY_INVALID_CARD,
    };

    const errorCode = codeMap[declineCode] || ErrorCode.PAY_CARD_DECLINED;

    return PaymentException.cardDeclined(declineCode, last4);
  }

  private static handleRateLimitError(error: Stripe.errors.StripeError): BillingOSException {
    return new BillingOSException(
      ErrorCode.RATE_LIMIT_EXCEEDED,
      'Too many requests to payment processor',
      HttpStatus.TOO_MANY_REQUESTS,
      {
        retryAfter: 60,
        suggestion: 'Please wait a moment before retrying',
      }
    );
  }

  private static handleInvalidRequestError(error: Stripe.errors.StripeError): BillingOSException {
    // Check for specific invalid request patterns
    const message = error.message.toLowerCase();

    if (message.includes('customer')) {
      return new BillingOSException(
        ErrorCode.PAY_INVALID_PAYMENT_METHOD,
        'Invalid customer information',
        HttpStatus.BAD_REQUEST,
        { originalError: message }
      );
    }

    if (message.includes('amount')) {
      return new BillingOSException(
        ErrorCode.VAL_INVALID_INPUT,
        'Invalid payment amount',
        HttpStatus.BAD_REQUEST,
        { originalError: message }
      );
    }

    return new BillingOSException(
      ErrorCode.VAL_INVALID_INPUT,
      'Invalid payment request',
      HttpStatus.BAD_REQUEST,
      { originalError: message }
    );
  }

  private static handleAPIError(error: Stripe.errors.StripeError): BillingOSException {
    return new BillingOSException(
      ErrorCode.SYS_EXTERNAL_SERVICE_ERROR,
      'Payment service temporarily unavailable',
      HttpStatus.SERVICE_UNAVAILABLE,
      {
        suggestion: 'Please try again in a few moments',
        retryAfter: 30,
      }
    );
  }

  private static handleConnectionError(error: Stripe.errors.StripeError): BillingOSException {
    return new BillingOSException(
      ErrorCode.SYS_EXTERNAL_SERVICE_ERROR,
      'Unable to connect to payment service',
      HttpStatus.SERVICE_UNAVAILABLE,
      {
        suggestion: 'Please check your internet connection and try again',
      }
    );
  }

  private static handleAuthenticationError(error: Stripe.errors.StripeError): BillingOSException {
    return new BillingOSException(
      ErrorCode.SYS_INTERNAL_ERROR,
      'Payment configuration error',
      HttpStatus.INTERNAL_SERVER_ERROR,
      {
        suggestion: 'This is a configuration issue. Please contact support.',
      }
    );
  }

  private static handleUnknownError(error: Stripe.errors.StripeError): BillingOSException {
    return new BillingOSException(
      ErrorCode.PAY_PROCESSING_ERROR,
      'Payment processing failed',
      HttpStatus.BAD_REQUEST,
      {
        originalError: error.message,
        suggestion: 'Please try again or use a different payment method',
      }
    );
  }

  /**
   * Comprehensive list of Stripe decline codes
   * Based on Autumn's implementation
   */
  static readonly DECLINE_CODES = {
    approve_with_id: 'The payment cannot be authorized',
    call_issuer: 'The card issuer needs to be contacted',
    card_not_supported: 'The card does not support this type of purchase',
    card_velocity_exceeded: 'Too many transactions in a short time',
    currency_not_supported: 'The card does not support the specified currency',
    do_not_honor: 'The card issuer declined for an unknown reason',
    do_not_try_again: 'The card issuer has declined and requested not to retry',
    duplicate_transaction: 'A similar transaction was recently submitted',
    expired_card: 'The card has expired',
    fraudulent: 'The payment was declined as fraudulent',
    generic_decline: 'The card was declined for an unknown reason',
    incorrect_number: 'The card number is incorrect',
    incorrect_cvc: 'The CVC number is incorrect',
    incorrect_pin: 'The PIN entered is incorrect',
    incorrect_zip: 'The ZIP/postal code is incorrect',
    insufficient_funds: 'The card has insufficient funds',
    invalid_account: 'The card or account is invalid',
    invalid_amount: 'The payment amount is invalid',
    invalid_cvc: 'The CVC number is invalid',
    invalid_expiry_month: 'The expiration month is invalid',
    invalid_expiry_year: 'The expiration year is invalid',
    invalid_number: 'The card number is invalid',
    invalid_pin: 'The PIN entered is invalid',
    issuer_not_available: 'The card issuer could not be reached',
    lost_card: 'The card has been reported lost',
    merchant_blacklist: 'The merchant is blacklisted',
    new_account_information_available: 'New account information is available',
    no_action_taken: 'No action was taken',
    not_permitted: 'The payment is not permitted',
    offline_pin_required: 'An offline PIN is required',
    online_or_offline_pin_required: 'A PIN is required',
    pickup_card: 'The card cannot be used for this transaction',
    pin_try_exceeded: 'Too many PIN attempts',
    processing_error: 'An error occurred while processing the card',
    reenter_transaction: 'The transaction should be re-entered',
    restricted_card: 'The card has restrictions preventing this transaction',
    revocation_of_all_authorizations: 'All authorizations have been revoked',
    revocation_of_authorization: 'The authorization has been revoked',
    security_violation: 'A security violation occurred',
    service_not_allowed: 'The service is not allowed',
    stolen_card: 'The card has been reported stolen',
    stop_payment_order: 'A stop payment order has been issued',
    testmode_decline: 'Test mode decline',
    transaction_not_allowed: 'The transaction is not allowed',
    try_again_later: 'The card issuer requests trying again later',
    withdrawal_count_limit_exceeded: 'The withdrawal limit has been exceeded',
  };
}
```

### Step 5: Create Global Exception Filter (45 minutes)

**File:** `apps/api/src/common/filters/global-exception.filter.ts`

```typescript
import {
  ExceptionFilter,
  Catch,
  ArgumentsHost,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Request, Response } from 'express';
import * as Sentry from '@sentry/node';
import { BillingOSException } from '../exceptions/billing-os.exception';
import { ValidationException } from '../exceptions/validation.exception';
import { StripeErrorMapper } from '../exceptions/stripe-error-mapper';
import { ErrorCode, ErrorSeverity } from '../exceptions/error-codes';
import { sanitizeError } from '../utils/security.utils';
import Stripe from 'stripe';

@Catch()
export class GlobalExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(GlobalExceptionFilter.name);

  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();

    const requestId = (request as any).requestId || 'no-request-id';
    const timestamp = new Date().toISOString();

    let status = HttpStatus.INTERNAL_SERVER_ERROR;
    let errorResponse: any = {
      error: {
        code: ErrorCode.SYS_INTERNAL_ERROR,
        message: 'An unexpected error occurred',
        requestId,
        timestamp,
      },
      statusCode: status,
    };

    // Handle different exception types
    if (exception instanceof BillingOSException) {
      // Our custom exceptions
      errorResponse = this.handleBillingOSException(exception, requestId, timestamp);
      status = exception.getStatus();
    } else if (exception instanceof HttpException) {
      // NestJS built-in exceptions
      errorResponse = this.handleHttpException(exception, requestId, timestamp);
      status = exception.getStatus();
    } else if (this.isStripeError(exception)) {
      // Stripe errors
      const billingException = StripeErrorMapper.mapStripeError(exception as Stripe.errors.StripeError);
      errorResponse = this.handleBillingOSException(billingException, requestId, timestamp);
      status = billingException.getStatus();
    } else if (exception instanceof Error) {
      // Generic errors
      errorResponse = this.handleGenericError(exception, requestId, timestamp);
    } else {
      // Unknown errors
      errorResponse = this.handleUnknownError(exception, requestId, timestamp);
    }

    // Enrich context for logging
    const context = this.buildErrorContext(request, exception);

    // Log the error
    this.logError(exception, context, errorResponse);

    // Send to Sentry if appropriate
    this.sendToSentry(exception, context, errorResponse);

    // Send response
    response.status(status).json(errorResponse);
  }

  private handleBillingOSException(
    exception: BillingOSException,
    requestId: string,
    timestamp: string
  ): any {
    const response = exception.getResponse() as any;
    return {
      error: {
        ...response.error,
        requestId,
        timestamp,
      },
      statusCode: exception.getStatus(),
    };
  }

  private handleHttpException(
    exception: HttpException,
    requestId: string,
    timestamp: string
  ): any {
    const response = exception.getResponse();
    const status = exception.getStatus();

    // Handle class-validator errors
    if (typeof response === 'object' && 'message' in response) {
      const res = response as any;
      if (Array.isArray(res.message) && res.message.length > 0) {
        return {
          error: {
            code: ErrorCode.VAL_INVALID_INPUT,
            message: 'Validation failed',
            details: {
              errors: res.message,
            },
            requestId,
            timestamp,
          },
          statusCode: status,
        };
      }
    }

    return {
      error: {
        code: this.getErrorCodeFromStatus(status),
        message: exception.message || 'An error occurred',
        requestId,
        timestamp,
      },
      statusCode: status,
    };
  }

  private handleGenericError(
    exception: Error,
    requestId: string,
    timestamp: string
  ): any {
    // Sanitize error message
    const sanitizedMessage = sanitizeError(exception);

    // Check for specific error patterns
    const errorCode = this.detectErrorCode(exception.message);

    return {
      error: {
        code: errorCode,
        message: this.getUserFriendlyMessage(exception.message),
        details: process.env.NODE_ENV === 'development' ? {
          originalError: sanitizedMessage,
        } : undefined,
        requestId,
        timestamp,
      },
      statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
    };
  }

  private handleUnknownError(
    exception: unknown,
    requestId: string,
    timestamp: string
  ): any {
    return {
      error: {
        code: ErrorCode.SYS_INTERNAL_ERROR,
        message: 'An unexpected error occurred',
        requestId,
        timestamp,
      },
      statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
    };
  }

  private isStripeError(exception: unknown): boolean {
    return exception instanceof Error &&
           exception.constructor.name.includes('Stripe') &&
           'type' in exception;
  }

  private buildErrorContext(request: Request, exception: unknown): any {
    return {
      requestId: (request as any).requestId,
      method: request.method,
      url: request.url,
      ip: request.ip,
      userAgent: request.headers['user-agent'],
      userId: (request as any).user?.id,
      organizationId: (request as any).user?.organizationId,
      apiKeyId: (request as any).user?.keyId,
      timestamp: new Date(),
      environment: process.env.NODE_ENV,
      exceptionName: exception?.constructor?.name,
    };
  }

  private logError(exception: unknown, context: any, errorResponse: any): void {
    const level = this.getLogLevel(errorResponse.error.code);

    const logMessage = {
      message: `Error: ${errorResponse.error.message}`,
      code: errorResponse.error.code,
      statusCode: errorResponse.statusCode,
      ...context,
    };

    switch (level) {
      case 'error':
        this.logger.error(logMessage);
        break;
      case 'warn':
        this.logger.warn(logMessage);
        break;
      default:
        this.logger.debug(logMessage);
    }
  }

  private sendToSentry(exception: unknown, context: any, errorResponse: any): void {
    const severity = ErrorSeverity[errorResponse.error.code as ErrorCode];

    // Don't send if no severity defined (normal business logic)
    if (!severity) {
      return;
    }

    // Don't send in development unless it's an error or higher
    if (process.env.NODE_ENV === 'development' &&
        severity !== 'error' && severity !== 'fatal') {
      return;
    }

    Sentry.withScope((scope) => {
      // Set context
      scope.setLevel(severity);
      scope.setContext('request', {
        method: context.method,
        url: context.url,
        ip: context.ip,
        userAgent: context.userAgent,
      });
      scope.setContext('user', {
        id: context.userId,
        organizationId: context.organizationId,
      });
      scope.setContext('error', {
        code: errorResponse.error.code,
        statusCode: errorResponse.statusCode,
        details: errorResponse.error.details,
      });
      scope.setTag('requestId', context.requestId);
      scope.setTag('environment', context.environment);
      scope.setTag('errorCode', errorResponse.error.code);

      // Send to Sentry
      if (exception instanceof Error) {
        Sentry.captureException(exception);
      } else {
        Sentry.captureMessage(errorResponse.error.message, severity);
      }
    });
  }

  private getErrorCodeFromStatus(status: HttpStatus): ErrorCode {
    const statusMap: Record<number, ErrorCode> = {
      400: ErrorCode.VAL_INVALID_INPUT,
      401: ErrorCode.AUTH_INVALID_TOKEN,
      403: ErrorCode.AUTHZ_INSUFFICIENT_PERMISSIONS,
      404: ErrorCode.RES_NOT_FOUND,
      409: ErrorCode.RES_CONFLICT,
      429: ErrorCode.RATE_LIMIT_EXCEEDED,
      500: ErrorCode.SYS_INTERNAL_ERROR,
      503: ErrorCode.SYS_SERVICE_UNAVAILABLE,
    };
    return statusMap[status] || ErrorCode.SYS_INTERNAL_ERROR;
  }

  private detectErrorCode(message: string): ErrorCode {
    const lowercaseMessage = message.toLowerCase();

    if (lowercaseMessage.includes('database')) {
      return ErrorCode.SYS_DATABASE_ERROR;
    }
    if (lowercaseMessage.includes('timeout')) {
      return ErrorCode.SYS_TIMEOUT;
    }
    if (lowercaseMessage.includes('duplicate')) {
      return ErrorCode.RES_ALREADY_EXISTS;
    }
    if (lowercaseMessage.includes('not found')) {
      return ErrorCode.RES_NOT_FOUND;
    }
    if (lowercaseMessage.includes('unauthorized')) {
      return ErrorCode.AUTH_INVALID_TOKEN;
    }

    return ErrorCode.SYS_INTERNAL_ERROR;
  }

  private getUserFriendlyMessage(technicalMessage: string): string {
    const messageMap: Record<string, string> = {
      'connect ECONNREFUSED': 'Service temporarily unavailable. Please try again later.',
      'duplicate key value': 'This resource already exists.',
      'violates foreign key': 'Related resource not found.',
      'invalid input syntax': 'Invalid data format provided.',
      'connection timeout': 'The operation took too long. Please try again.',
      'ECONNRESET': 'Connection lost. Please try again.',
    };

    for (const [pattern, friendlyMessage] of Object.entries(messageMap)) {
      if (technicalMessage.includes(pattern)) {
        return friendlyMessage;
      }
    }

    return 'An error occurred while processing your request.';
  }

  private getLogLevel(errorCode: ErrorCode): 'debug' | 'warn' | 'error' {
    const severity = ErrorSeverity[errorCode];
    switch (severity) {
      case 'fatal':
      case 'error':
        return 'error';
      case 'warning':
        return 'warn';
      default:
        return 'debug';
    }
  }
}
```

### Step 6: Configure Sentry (20 minutes)

**File:** `apps/api/src/config/sentry.config.ts`

```typescript
import * as Sentry from '@sentry/node';
import { ProfilingIntegration } from '@sentry/profiling-node';

export function initializeSentry() {
  if (!process.env.SENTRY_DSN) {
    console.log('Sentry DSN not configured, skipping initialization');
    return;
  }

  Sentry.init({
    dsn: process.env.SENTRY_DSN,
    environment: process.env.NODE_ENV || 'development',
    integrations: [
      // Add profiling
      new ProfilingIntegration(),
    ],
    // Performance Monitoring
    tracesSampleRate: process.env.NODE_ENV === 'production' ? 0.1 : 1.0,
    // Profiling
    profilesSampleRate: process.env.NODE_ENV === 'production' ? 0.1 : 1.0,

    // Only send errors in production
    beforeSend(event, hint) {
      // Don't send in development unless it's an error
      if (process.env.NODE_ENV === 'development') {
        if (event.level !== 'error' && event.level !== 'fatal') {
          return null;
        }
      }

      // Sanitize sensitive data
      if (event.request) {
        delete event.request.cookies;
        delete event.request.headers?.authorization;
        delete event.request.headers?.['x-api-key'];
      }

      return event;
    },

    // Ignore certain errors
    ignoreErrors: [
      // Browser errors
      'ResizeObserver loop limit exceeded',
      'Non-Error promise rejection captured',
      // Expected errors
      'TokenExpiredError',
      'JsonWebTokenError',
    ],
  });

  console.log('Sentry initialized successfully');
}
```

### Step 7: Register Everything (15 minutes)

**File:** `apps/api/src/main.ts`

```typescript
import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { AppModule } from './app.module';
import { GlobalExceptionFilter } from './common/filters/global-exception.filter';
import { initializeSentry } from './config/sentry.config';

async function bootstrap() {
  // Initialize Sentry before anything else
  initializeSentry();

  const app = await NestFactory.create(AppModule, {
    rawBody: true,
  });

  // Global validation pipe with error transformation
  app.useGlobalPipes(
    new ValidationPipe({
      transform: true,
      whitelist: true,
      forbidNonWhitelisted: true,
      exceptionFactory: (errors) => {
        // Transform validation errors to our format
        const ValidationException = require('./common/exceptions/validation.exception').ValidationException;
        return ValidationException.fromClassValidator(errors);
      },
    })
  );

  // Global exception filter
  app.useGlobalFilters(new GlobalExceptionFilter());

  // ... other configuration

  await app.listen(3001);
  console.log('Application is running on: http://localhost:3001');
}
bootstrap();
```

### Step 8: Update Environment Variables (5 minutes)

**File:** `apps/api/.env`

```bash
# Existing variables...

# Sentry Configuration
SENTRY_DSN=https://your-key@sentry.io/your-project-id
SENTRY_ENVIRONMENT=development
SENTRY_RELEASE=1.0.0

# Error Handling
ERROR_INCLUDE_STACK=false
ERROR_VERBOSE_LOGGING=false
```

## ✅ Verification Steps

### 1. Test Validation Errors

```bash
# Send invalid data
curl -X POST http://localhost:3001/api/v1/products \
  -H "Content-Type: application/json" \
  -d '{"name": ""}' \
  -H "Authorization: Bearer $API_KEY"

# Expected response:
# {
#   "error": {
#     "code": "VAL_INVALID_INPUT",
#     "message": "Validation failed",
#     "details": {
#       "fieldErrors": {
#         "name": ["Name must not be empty"]
#       }
#     },
#     "requestId": "req_xxx",
#     "timestamp": "2024-02-23T..."
#   },
#   "statusCode": 400
# }
```

### 2. Test Authentication Errors

```bash
# Invalid token
curl http://localhost:3001/api/v1/products \
  -H "Authorization: Bearer invalid_token"

# Expected: Proper AUTH_INVALID_TOKEN error
```

### 3. Test Payment Errors

```bash
# Trigger a Stripe error (use test card that declines)
curl -X POST http://localhost:3001/api/v1/checkout/create-session \
  -H "Authorization: Bearer $API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "productId": "prod-123",
    "paymentMethodId": "pm_card_chargeDeclined"
  }'

# Expected: PAY_CARD_DECLINED with details
```

### 4. Check Sentry Integration

```bash
# Trigger a 500 error to send to Sentry
curl http://localhost:3001/api/trigger-error

# Check Sentry dashboard for the error
```

## 🎯 Completion Checklist

- [ ] Error codes enum created
- [ ] Custom exception classes implemented
- [ ] Stripe error mapper complete
- [ ] Global exception filter registered
- [ ] Sentry configured and initialized
- [ ] Validation errors properly formatted
- [ ] All error responses include request ID
- [ ] User-friendly messages for all errors
- [ ] Sensitive data sanitized
- [ ] Sentry receiving appropriate errors
- [ ] All tests passing

## 🚀 Next Steps

1. Commit your changes:
```bash
git add .
git commit -m "feat: implement comprehensive error handling with Sentry integration"
```

2. Test error scenarios thoroughly
3. Review Sentry dashboard configuration
4. Document error codes for API consumers

---

**Important:** Always test error handling with real scenarios - it's critical for production stability!
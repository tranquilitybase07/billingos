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
export const ErrorMetadata: Partial<
  Record<
    ErrorCode,
    {
      message: string;
      statusCode: number;
      userMessage?: string;
      helpUrl?: string;
    }
  >
> = {
  // Validation Errors
  [ErrorCode.VAL_INVALID_INPUT]: {
    message: 'Invalid input provided',
    statusCode: 400,
    userMessage:
      'The information you provided is not valid. Please check and try again.',
  },
  [ErrorCode.VAL_MISSING_FIELD]: {
    message: 'Required field is missing',
    statusCode: 400,
    userMessage: 'Please fill in all required fields.',
  },
  [ErrorCode.VAL_INVALID_FORMAT]: {
    message: 'Invalid format',
    statusCode: 400,
    userMessage: 'The format of the provided data is invalid.',
  },
  [ErrorCode.VAL_INVALID_EMAIL]: {
    message: 'Invalid email format',
    statusCode: 400,
    userMessage: 'Please enter a valid email address.',
  },
  [ErrorCode.VAL_INVALID_URL]: {
    message: 'Invalid URL format',
    statusCode: 400,
    userMessage: 'Please enter a valid URL.',
  },
  [ErrorCode.VAL_FIELD_TOO_LONG]: {
    message: 'Field value too long',
    statusCode: 400,
    userMessage: 'One or more fields exceed the maximum allowed length.',
  },
  [ErrorCode.VAL_FIELD_TOO_SHORT]: {
    message: 'Field value too short',
    statusCode: 400,
    userMessage: 'One or more fields are below the minimum required length.',
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
  [ErrorCode.AUTH_MISSING_CREDENTIALS]: {
    message: 'Missing credentials',
    statusCode: 401,
    userMessage: 'Authentication is required to access this resource.',
  },
  [ErrorCode.AUTH_INVALID_API_KEY]: {
    message: 'Invalid API key',
    statusCode: 401,
    userMessage: 'The API key provided is invalid or has been revoked.',
    helpUrl: 'https://docs.billingos.com/api/authentication',
  },
  [ErrorCode.AUTH_SESSION_EXPIRED]: {
    message: 'Session expired',
    statusCode: 401,
    userMessage: 'Your session has expired. Please log in again.',
  },
  [ErrorCode.AUTH_INVALID_CREDENTIALS]: {
    message: 'Invalid credentials',
    statusCode: 401,
    userMessage: 'The credentials you provided are incorrect.',
  },

  // Authorization Errors
  [ErrorCode.AUTHZ_INSUFFICIENT_PERMISSIONS]: {
    message: 'Insufficient permissions',
    statusCode: 403,
    userMessage: "You don't have permission to perform this action.",
  },
  [ErrorCode.AUTHZ_RESOURCE_ACCESS_DENIED]: {
    message: 'Resource access denied',
    statusCode: 403,
    userMessage: "You don't have access to this resource.",
  },
  [ErrorCode.AUTHZ_ORGANIZATION_ACCESS_DENIED]: {
    message: 'Organization access denied',
    statusCode: 403,
    userMessage: "You don't have access to this organization.",
  },
  [ErrorCode.AUTHZ_PLAN_LIMIT_EXCEEDED]: {
    message: 'Plan limit exceeded',
    statusCode: 403,
    userMessage:
      'This feature is not available on your current plan. Please upgrade to continue.',
    helpUrl: 'https://billingos.com/pricing',
  },
  [ErrorCode.AUTHZ_FEATURE_NOT_AVAILABLE]: {
    message: 'Feature not available',
    statusCode: 403,
    userMessage: 'This feature is not available on your current plan.',
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
    userMessage:
      'This resource already exists. Please use a different identifier.',
  },
  [ErrorCode.RES_CONFLICT]: {
    message: 'Resource conflict',
    statusCode: 409,
    userMessage: 'A conflict occurred with the existing resource.',
  },
  [ErrorCode.RES_DELETED]: {
    message: 'Resource has been deleted',
    statusCode: 404,
    userMessage: 'This resource has been deleted and is no longer available.',
  },
  [ErrorCode.RES_EXPIRED]: {
    message: 'Resource has expired',
    statusCode: 410,
    userMessage: 'This resource has expired.',
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
    userMessage:
      'Your card has insufficient funds. Please try a different payment method.',
  },
  [ErrorCode.PAY_INVALID_CARD]: {
    message: 'Invalid card',
    statusCode: 400,
    userMessage: 'The card information provided is invalid.',
  },
  [ErrorCode.PAY_EXPIRED_CARD]: {
    message: 'Card expired',
    statusCode: 400,
    userMessage: 'Your card has expired. Please update your payment method.',
  },
  [ErrorCode.PAY_INVALID_CVC]: {
    message: 'Invalid CVC',
    statusCode: 400,
    userMessage:
      'The security code you entered is invalid. Please check and try again.',
  },
  [ErrorCode.PAY_PROCESSING_ERROR]: {
    message: 'Payment processing error',
    statusCode: 500,
    userMessage:
      'An error occurred while processing your payment. Please try again.',
  },
  [ErrorCode.PAY_INVALID_PAYMENT_METHOD]: {
    message: 'Invalid payment method',
    statusCode: 400,
    userMessage: 'The payment method provided is invalid or unsupported.',
  },
  [ErrorCode.PAY_SUBSCRIPTION_FAILED]: {
    message: 'Subscription creation failed',
    statusCode: 400,
    userMessage:
      'We were unable to create your subscription. Please try again.',
  },
  [ErrorCode.PAY_PAYMENT_REQUIRED]: {
    message: 'Payment required',
    statusCode: 402,
    userMessage: 'Payment is required to access this feature.',
  },
  [ErrorCode.PAY_STRIPE_ERROR]: {
    message: 'Stripe error',
    statusCode: 400,
    userMessage:
      'A payment processing error occurred. Please try again or contact support.',
  },

  // Business Logic Errors
  [ErrorCode.BIZ_QUOTA_EXCEEDED]: {
    message: 'Quota exceeded',
    statusCode: 429,
    userMessage:
      'You have exceeded your usage quota. Please upgrade your plan or wait for the next billing cycle.',
  },
  [ErrorCode.BIZ_USAGE_LIMIT_EXCEEDED]: {
    message: 'Usage limit exceeded',
    statusCode: 429,
    userMessage: 'You have exceeded your usage limit for this billing period.',
  },
  [ErrorCode.BIZ_INVALID_STATE]: {
    message: 'Invalid state',
    statusCode: 400,
    userMessage: 'This operation cannot be performed in the current state.',
  },
  [ErrorCode.BIZ_OPERATION_NOT_ALLOWED]: {
    message: 'Operation not allowed',
    statusCode: 400,
    userMessage: 'This operation is not allowed.',
  },
  [ErrorCode.BIZ_DUPLICATE_OPERATION]: {
    message: 'Duplicate operation',
    statusCode: 409,
    userMessage: 'This operation has already been performed.',
  },
  [ErrorCode.BIZ_TRIAL_EXPIRED]: {
    message: 'Trial expired',
    statusCode: 403,
    userMessage:
      'Your trial has expired. Please upgrade to continue using the service.',
  },

  // Rate Limiting
  [ErrorCode.RATE_LIMIT_EXCEEDED]: {
    message: 'Rate limit exceeded',
    statusCode: 429,
    userMessage: 'Too many requests. Please slow down and try again later.',
  },
  [ErrorCode.RATE_QUOTA_EXCEEDED]: {
    message: 'Quota exceeded',
    statusCode: 429,
    userMessage: 'You have exceeded your request quota for this period.',
  },

  // System Errors
  [ErrorCode.SYS_DATABASE_ERROR]: {
    message: 'Database error',
    statusCode: 500,
    userMessage:
      'We encountered a problem accessing our database. Please try again later.',
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
  [ErrorCode.SYS_EXTERNAL_SERVICE_ERROR]: {
    message: 'External service error',
    statusCode: 502,
    userMessage:
      'An external service is temporarily unavailable. Please try again later.',
  },
  [ErrorCode.SYS_TIMEOUT]: {
    message: 'Request timeout',
    statusCode: 504,
    userMessage: 'The request timed out. Please try again.',
  },
  [ErrorCode.SYS_STRIPE_WEBHOOK_ERROR]: {
    message: 'Stripe webhook error',
    statusCode: 400,
    userMessage: 'The webhook could not be processed.',
  },
};

// Sentry severity levels for each error code
export const ErrorSeverity: Partial<
  Record<ErrorCode, 'debug' | 'info' | 'warning' | 'error' | 'fatal'>
> = {
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

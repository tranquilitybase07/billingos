/**
 * Sanitize error messages to prevent information leakage.
 * Removes sensitive data like connection strings, passwords, internal paths, etc.
 */
export function sanitizeError(error: Error): string {
  let message = error.message || 'An error occurred';

  // Remove potential connection strings
  message = message.replace(
    /(?:postgres|mysql|mongodb|redis):\/\/[^\s]*/gi,
    '[CONNECTION_STRING_REDACTED]',
  );

  // Remove potential passwords or API keys
  message = message.replace(
    /(?:password|secret|key|token|api_key)\s*[:=]\s*[^\s,}]*/gi,
    '[SENSITIVE_DATA_REDACTED]',
  );

  // Remove file paths
  message = message.replace(/(?:[A-Za-z]:\\|\/)[^\s]*/g, '[PATH_REDACTED]');

  // Remove IP addresses
  message = message.replace(
    /\b\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}\b/g,
    '[IP_REDACTED]',
  );

  return message;
}

/**
 * Sanitize request data to remove sensitive fields before logging.
 */
export function sanitizeRequest(
  data: Record<string, any>,
): Record<string, any> {
  const sensitiveFields = [
    'password',
    'secret',
    'token',
    'api_key',
    'apiKey',
    'authorization',
    'creditCard',
    'cardNumber',
    'cvv',
    'cvc',
  ];

  const sanitized = { ...data };

  for (const field of sensitiveFields) {
    if (sanitized[field]) {
      sanitized[field] = '[REDACTED]';
    }
  }

  return sanitized;
}

/**
 * Masks sensitive API keys for logging.
 * Shows only the first 7 and last 4 characters.
 */
export function maskApiKey(key: string | undefined | null): string {
  if (!key) return 'no-key-provided';

  if (key.length <= 12) return 'invalid-key-format';

  const prefix = key.substring(0, 7);
  const suffix = key.substring(key.length - 4);

  return `${prefix}...${suffix}`;
}

/**
 * Masks sensitive email addresses for logging.
 * Shows only first 2 chars of local part and full domain.
 */
export function maskEmail(email: string | undefined | null): string {
  if (!email) return 'no-email';

  const parts = email.split('@');
  if (parts.length !== 2) return 'invalid-email';

  const [localPart, domain] = parts;
  const maskedLocal =
    localPart.length > 2 ? `${localPart.substring(0, 2)}***` : '***';

  return `${maskedLocal}@${domain}`;
}

/**
 * Sanitizes an error message string to remove sensitive data patterns.
 */
export function sanitizeErrorMessage(message: string): string {
  if (!message) return 'Unknown error';

  // Remove potential API keys from error messages
  message = message.replace(
    /sk_[a-zA-Z0-9_]{10,}/g,
    (match) => maskApiKey(match),
  );
  message = message.replace(
    /pk_[a-zA-Z0-9_]{10,}/g,
    (match) => maskApiKey(match),
  );

  // Remove potential emails
  message = message.replace(
    /([a-zA-Z0-9._-]+@[a-zA-Z0-9._-]+\.[a-zA-Z0-9_-]+)/g,
    (match) => maskEmail(match),
  );

  // Remove potential passwords (common patterns)
  message = message.replace(
    /password["\s:=]+[^\s,}]*/gi,
    'password: [REDACTED]',
  );
  message = message.replace(/secret["\s:=]+[^\s,}]*/gi, 'secret: [REDACTED]');
  message = message.replace(/token["\s:=]+[^\s,}]*/gi, 'token: [REDACTED]');

  return message;
}

/**
 * Generates a unique request ID for tracing.
 */
export function generateRequestId(): string {
  const timestamp = Date.now().toString(36);
  const random = Math.random().toString(36).substring(2, 9);
  return `req_${timestamp}_${random}`;
}

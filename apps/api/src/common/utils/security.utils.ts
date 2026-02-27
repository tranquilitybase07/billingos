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

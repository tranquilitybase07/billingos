import * as Sentry from '@sentry/nestjs';

Sentry.init({
  dsn: process.env.SENTRY_DSN,
  environment: process.env.NODE_ENV || 'development',

  // Performance Monitoring
  tracesSampleRate: process.env.NODE_ENV === 'production' ? 0.1 : 1.0,

  // Filter events by environment
  beforeSend(event) {
    // In development: only send error, fatal, and warning level events
    if (process.env.NODE_ENV === 'development') {
      if (
        event.level !== 'error' &&
        event.level !== 'fatal' &&
        event.level !== 'warning'
      ) {
        return null;
      }
    }

    // Sanitize sensitive data
    if (event.request) {
      delete event.request.cookies;
      if (event.request.headers) {
        delete event.request.headers['authorization'];
        delete event.request.headers['x-api-key'];
        delete event.request.headers['x-billingos-api-key'];
      }
    }

    return event;
  },

  // Ignore common non-actionable errors
  ignoreErrors: ['TokenExpiredError', 'JsonWebTokenError'],
});

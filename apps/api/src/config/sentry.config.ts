import * as Sentry from '@sentry/node';

export function initializeSentry() {
  if (!process.env.SENTRY_DSN) {
    console.log('ℹ️  Sentry DSN not configured, skipping initialization');
    return;
  }

  Sentry.init({
    dsn: process.env.SENTRY_DSN,
    environment: process.env.NODE_ENV || 'development',

    // Performance Monitoring
    tracesSampleRate: process.env.NODE_ENV === 'production' ? 0.1 : 1.0,

    // Only send relevant errors in production
    beforeSend(event) {
      // Don't send in development unless it's an error
      if (process.env.NODE_ENV === 'development') {
        if (event.level !== 'error' && event.level !== 'fatal') {
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
    ignoreErrors: [
      'ResizeObserver loop limit exceeded',
      'Non-Error promise rejection captured',
      'TokenExpiredError',
      'JsonWebTokenError',
    ],
  });

  console.log(
    `✅ Sentry initialized (env: ${process.env.NODE_ENV || 'development'})`,
  );
}

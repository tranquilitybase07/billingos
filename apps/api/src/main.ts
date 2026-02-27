import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { AppModule } from './app.module';
import { json } from 'express';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import { initializeSentry } from './config/sentry.config';
import { GlobalExceptionFilter } from './common/filters/global-exception.filter';
import { ValidationException } from './common/exceptions/validation.exception';

async function bootstrap() {
  // Initialize Sentry before anything else
  initializeSentry();

  const app = await NestFactory.create(AppModule, {
    rawBody: true, // Enable raw body for Stripe webhooks
  });

  // Enable CORS for frontend and sample app
  const allowedOrigins = [
    process.env.APP_URL || 'http://localhost:3000',
    'http://localhost:3002', // Sample app
    'https://billingos-web.vercel.app', // Production frontend
    'https://*.vercel.app', // All Vercel preview deployments
  ];

  // Add FRONTEND_URL from env if it exists
  if (process.env.FRONTEND_URL) {
    allowedOrigins.push(process.env.FRONTEND_URL);
  }

  app.enableCors({
    origin: (origin, callback) => {
      // Allow requests with no origin (like mobile apps, Postman, etc.)
      if (!origin) {
        return callback(null, true);
      }

      // Check if origin matches any allowed pattern
      const isAllowed = allowedOrigins.some((allowedOrigin) => {
        if (allowedOrigin.includes('*')) {
          // Handle wildcard patterns
          const pattern = allowedOrigin.replace(/\*/g, '.*');
          const regex = new RegExp(`^${pattern}$`);
          return regex.test(origin);
        }
        return allowedOrigin === origin;
      });

      if (isAllowed) {
        callback(null, true);
      } else {
        console.warn(`CORS blocked origin: ${origin}`);
        callback(new Error('Not allowed by CORS'));
      }
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: [
      'Content-Type',
      'Authorization',
      'X-Requested-With',
      'x-billingos-version',
      'x-billingos-api-key',
    ],
  });

  // Global validation pipe with standardized error format
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      exceptionFactory: (errors) => ValidationException.fromClassValidator(errors),
    }),
  );

  // Global exception filter - catches all errors and standardizes responses
  app.useGlobalFilters(new GlobalExceptionFilter());

  // Use JSON parser for all routes except webhooks
  app.use((req, res, next) => {
    if (req.originalUrl === '/stripe/webhooks') {
      next(); // Skip JSON parsing for webhook route (use raw body)
    } else {
      json()(req, res, next);
    }
  });

  // Swagger/OpenAPI documentation setup
  const config = new DocumentBuilder()
    .setTitle('BillingOS API')
    .setDescription(
      'Comprehensive billing and subscription management platform API. ' +
        'Includes admin endpoints for managing organizations, products, customers, and analytics, ' +
        'as well as SDK endpoints (v1) for customer-facing features.',
    )
    .setVersion('1.0')
    .addBearerAuth(
      {
        type: 'http',
        scheme: 'bearer',
        bearerFormat: 'JWT',
        name: 'Authorization',
        description: 'Enter JWT token from Supabase authentication',
        in: 'header',
      },
      'JWT',
    )
    .addApiKey(
      {
        type: 'apiKey',
        name: 'Authorization',
        in: 'header',
        description: 'Enter API key as: Bearer sk_test_xxx or Bearer sk_live_xxx',
      },
      'ApiKey',
    )
    .addApiKey(
      {
        type: 'apiKey',
        name: 'Authorization',
        in: 'header',
        description: 'Enter session token as: Bearer st_xxx',
      },
      'SessionToken',
    )
    .addServer('http://localhost:3001', 'Local development')
    .addServer('https://api.billingos.com', 'Production')
    .addTag('Health', 'Health check endpoint')
    .addTag('Users', 'User profile management')
    .addTag('Organizations', 'Organization and team management')
    .addTag('Accounts', 'Stripe Connect account management')
    .addTag('Products', 'Product catalog management (Admin)')
    .addTag('Features', 'Feature management (Admin)')
    .addTag('Customers', 'Customer management (Admin)')
    .addTag('Subscriptions', 'Subscription management (Admin)')
    .addTag('Analytics', 'Analytics and metrics (7 endpoints)')
    .addTag('API Keys', 'API key management')
    .addTag('Stripe Webhooks', 'Stripe webhook handlers')
    .addTag('SDK - Session Tokens', 'Session token management (v1)')
    .addTag('SDK - Checkout', 'Checkout flow (v1)')
    .addTag('SDK - Customer', 'Customer portal (v1)')
    .addTag('SDK - Features', 'Feature access and usage tracking (v1)')
    .addTag('SDK - Products', 'Product listing (v1)')
    .build();

  const document = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup('api', app, document, {
    swaggerOptions: {
      persistAuthorization: true, // Keep auth tokens in browser
      tagsSorter: 'alpha',
      operationsSorter: 'alpha',
    },
    customSiteTitle: 'BillingOS API Documentation',
  });

  const port = process.env.PORT ?? 3001;
  await app.listen(port);
  console.log(`🚀 API server running on http://localhost:${port}`);
  console.log(`📚 Swagger documentation available at http://localhost:${port}/api`);
  console.log(`📄 OpenAPI JSON available at http://localhost:${port}/api-json`);
}

void bootstrap();

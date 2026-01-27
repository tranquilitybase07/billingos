import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { AppModule } from './app.module';
import { json } from 'express';

async function bootstrap() {
  const app = await NestFactory.create(AppModule, {
    rawBody: true, // Enable raw body for Stripe webhooks
  });

  // Enable CORS for frontend and sample app
  app.enableCors({
    origin: [
      process.env.APP_URL || 'http://localhost:3000',
      'http://localhost:3002', // Sample app
    ],
    credentials: true,
  });

  // Global validation pipe
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true, // Strip properties that don't have decorators
      forbidNonWhitelisted: true, // Throw error if non-whitelisted properties are present
      transform: true, // Automatically transform payloads to DTO instances
    }),
  );

  // Use JSON parser for all routes except webhooks
  app.use((req, res, next) => {
    if (req.originalUrl === '/stripe/webhooks') {
      next(); // Skip JSON parsing for webhook route (use raw body)
    } else {
      json()(req, res, next);
    }
  });

  const port = process.env.PORT ?? 3001;
  await app.listen(port);
  console.log(`🚀 API server running on http://localhost:${port}`);
}

void bootstrap();

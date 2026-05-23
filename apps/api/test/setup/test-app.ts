import { INestApplication, ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { json } from 'express';
import { AppModule } from '../../src/app.module';
import { GlobalExceptionFilter } from '../../src/common/filters/global-exception.filter';
import { ResponseSanitizeInterceptor } from '../../src/common/interceptors/response-sanitize.interceptor';
import { ValidationException } from '../../src/common/exceptions/validation.exception';

export interface TestApp {
  app: INestApplication;
  port: number;
  baseUrl: string;
  close: () => Promise<void>;
}

export async function createTestApp(): Promise<TestApp> {
  const app = await NestFactory.create(AppModule, {
    rawBody: true,
    logger: false,
  });

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      exceptionFactory: (errors) =>
        ValidationException.fromClassValidator(errors),
    }),
  );

  app.useGlobalFilters(new GlobalExceptionFilter());
  app.useGlobalInterceptors(new ResponseSanitizeInterceptor());

  app.use((req: any, res: any, next: any) => {
    if (req.originalUrl === '/stripe/webhooks') {
      next();
    } else {
      json()(req, res, next);
    }
  });

  const port = parseInt(process.env.PORT || '3002', 10);
  await app.listen(port);

  return {
    app,
    port,
    baseUrl: `http://localhost:${port}`,
    close: async () => {
      await app.close();
    },
  };
}

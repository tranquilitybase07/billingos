import { Injectable, NestMiddleware, Logger } from '@nestjs/common';
import { Request, Response, NextFunction } from 'express';
import { RedisService } from '../redis/redis.service';

/**
 * Middleware for handling webhook idempotency using Redis SET NX pattern
 * Inspired by Autum's approach to webhook processing
 */
@Injectable()
export class WebhookIdempotencyMiddleware implements NestMiddleware {
  private readonly logger = new Logger(WebhookIdempotencyMiddleware.name);
  private readonly IDEMPOTENCY_TTL_MS = 300000; // 5 minutes

  constructor(private readonly redisService: RedisService) {}

  async use(req: Request, res: Response, next: NextFunction) {
    // Only apply to webhook endpoints
    if (!req.path.includes('/webhook') && !req.path.includes('/stripe')) {
      return next();
    }

    // Extract event ID from different webhook formats
    const eventId = this.extractEventId(req);

    if (!eventId) {
      // No event ID found, let the request through (will be validated later)
      return next();
    }

    // Build idempotency key based on endpoint and event ID
    const environment = process.env.NODE_ENV || 'development';
    const idempotencyKey = `webhook:${req.path}:${environment}:${eventId}`;

    // Check Redis for duplicate
    const isFirstRequest = await this.redisService.setIdempotencyKey(
      idempotencyKey,
      JSON.stringify({
        timestamp: Date.now(),
        path: req.path,
        method: req.method,
      }),
      this.IDEMPOTENCY_TTL_MS,
    );

    if (!isFirstRequest) {
      this.logger.warn(`Duplicate webhook detected: ${idempotencyKey}`);
      // Return success to acknowledge receipt (prevents retries)
      return res.status(200).json({
        received: true,
        duplicate: true,
        message: 'Event already processed',
      });
    }

    // Attach idempotency info to request for later use
    (req as any).idempotencyKey = idempotencyKey;
    (req as any).isIdempotent = true;

    next();
  }

  /**
   * Extract event ID from various webhook payload formats
   */
  private extractEventId(req: Request): string | null {
    try {
      // Stripe webhooks
      if (req.body?.id && typeof req.body.id === 'string') {
        return req.body.id;
      }

      // For raw body webhooks (Stripe with signature verification)
      // The actual parsing will happen in the controller
      // We can try to extract from headers if available
      if (req.headers['stripe-event-id']) {
        return req.headers['stripe-event-id'] as string;
      }

      return null;
    } catch (error) {
      this.logger.error('Error extracting event ID:', error);
      return null;
    }
  }
}
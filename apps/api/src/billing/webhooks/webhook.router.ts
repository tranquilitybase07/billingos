import { Injectable, Logger } from '@nestjs/common';
import { WebhookContext, WebhookHandler } from './webhook.types';

/**
 * Routes webhook events to the appropriate handler based on event type.
 * Replaces the monolithic switch statement from stripe-webhook.service.ts.
 *
 * Handlers self-register via registerHandler() during module initialization.
 */
@Injectable()
export class WebhookRouter {
  private readonly logger = new Logger(WebhookRouter.name);
  private readonly handlers = new Map<string, WebhookHandler>();

  /**
   * Register a handler for one or more event types.
   */
  registerHandler(
    eventTypes: string | string[],
    handler: WebhookHandler,
  ): void {
    const types = Array.isArray(eventTypes) ? eventTypes : [eventTypes];
    for (const eventType of types) {
      if (this.handlers.has(eventType)) {
        this.logger.warn(
          `Overwriting existing handler for event type: ${eventType}`,
        );
      }
      this.handlers.set(eventType, handler);
    }
  }

  /**
   * Dispatch a webhook event to the registered handler.
   * If no handler is registered, logs and returns (non-critical).
   */
  async dispatch(ctx: WebhookContext): Promise<void> {
    const handler = this.handlers.get(ctx.event.type);

    if (!handler) {
      this.logger.log(`Unhandled webhook event type: ${ctx.event.type}`);
      return;
    }

    this.logger.log(
      `Dispatching ${ctx.event.type} to ${handler.constructor.name}`,
    );
    await handler.handle(ctx);
  }

  /**
   * Get all registered event types (for diagnostics).
   */
  getRegisteredEventTypes(): string[] {
    return Array.from(this.handlers.keys());
  }
}

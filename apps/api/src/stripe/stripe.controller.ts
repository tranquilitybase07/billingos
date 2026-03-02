import * as common from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Request } from 'express';
import { StripeService } from './stripe.service';
import { StripeWebhookService } from './stripe-webhook.service';
import { Public } from '../auth/decorators/public.decorator';
import { securityLogger } from '../common/utils/security-logger';
import { sanitizeErrorMessage } from '../common/utils/security.utils';

@common.Controller('stripe')
export class StripeController {
  private readonly logger = new common.Logger(StripeController.name);

  constructor(
    private readonly stripeService: StripeService,
    private readonly webhookService: StripeWebhookService,
  ) {}

  /**
   * Stripe webhook endpoint
   * Handles events from Stripe (account.updated, etc.)
   */
  @Public()
  @common.Post('webhooks')
  @common.HttpCode(common.HttpStatus.OK)
  async handleWebhook(
    @common.Headers('stripe-signature') signature: string,
    @common.Req() request: common.RawBodyRequest<Request>,
  ) {
    const requestId = (request as any).requestId || 'no-request-id';

    if (!signature) {
      throw new common.BadRequestException('Missing stripe-signature header');
    }

    const rawBody = request.rawBody;
    if (!rawBody) {
      throw new common.BadRequestException('Missing raw body');
    }

    try {
      const event = this.stripeService.constructWebhookEvent(
        rawBody,
        signature,
      );

      securityLogger.webhookValidation(event.type, true, requestId);
      this.logger.log(`Received Stripe webhook: ${event.type} (${event.id})`);

      await this.webhookService.handleEvent(event);

      return { received: true };
    } catch (error) {
      securityLogger.webhookValidation('unknown', false, requestId);

      const sanitizedMessage = sanitizeErrorMessage(error.message);
      this.logger.error(`Webhook error: ${sanitizedMessage}`, {
        requestId,
      });

      throw new common.BadRequestException({
        error: {
          message: 'Webhook validation failed',
          requestId,
        },
      });
    }
  }
}

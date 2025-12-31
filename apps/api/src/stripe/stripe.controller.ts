import * as common from '@nestjs/common';
import { Request } from 'express';
import { StripeService } from './stripe.service';
import { StripeWebhookService } from './stripe-webhook.service';
import { Public } from '../auth/decorators/public.decorator';

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
  @Public() // Webhook doesn't use JWT auth
  @common.Post('webhooks')
  @common.HttpCode(common.HttpStatus.OK)
  async handleWebhook(
    @common.Headers('stripe-signature') signature: string,
    @common.Req() request: common.RawBodyRequest<Request>,
  ) {
    if (!signature) {
      throw new common.BadRequestException('Missing stripe-signature header');
    }

    // Get raw body (needed for webhook signature verification)
    const rawBody = request.rawBody;
    if (!rawBody) {
      throw new common.BadRequestException('Missing raw body');
    }

    try {
      // Verify and construct the event
      const event = this.stripeService.constructWebhookEvent(
        rawBody,
        signature,
      );

      this.logger.log(`Received Stripe webhook: ${event.type} (${event.id})`);

      // Handle the event
      await this.webhookService.handleEvent(event);

      return { received: true };
    } catch (error) {
      this.logger.error('Webhook error:', error);
      throw new common.BadRequestException(`Webhook Error: ${error.message}`);
    }
  }
}

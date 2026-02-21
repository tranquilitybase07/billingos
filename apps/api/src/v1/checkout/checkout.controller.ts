import {
  Controller,
  Post,
  Get,
  Body,
  Param,
  UseGuards,
  Logger,
  Sse,
  MessageEvent,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { CheckoutService } from './checkout.service';
import { CreateCheckoutDto } from './dto/create-checkout.dto';
import { ConfirmCheckoutDto } from './dto/confirm-checkout.dto';
import { SessionTokenAuthGuard } from '../../auth/guards/session-token-auth.guard';
import { CurrentCustomer, CustomerContext } from '../../auth/decorators/current-customer.decorator';
import { Observable, interval, switchMap, from, catchError, of } from 'rxjs';

@ApiTags('SDK - Checkout')
@Controller('v1/checkout')
export class CheckoutController {
  private readonly logger = new Logger(CheckoutController.name);

  constructor(private readonly checkoutService: CheckoutService) {}

  @Post('create')
  @UseGuards(SessionTokenAuthGuard)
  async createCheckout(
    @CurrentCustomer() customer: CustomerContext,
    @Body() dto: CreateCheckoutDto,
  ) {
    this.logger.log(
      `Creating checkout for organization: ${customer.organizationId}, user: ${customer.externalUserId}`,
    );

    return this.checkoutService.createCheckout(
      customer.organizationId,
      customer.externalUserId,
      dto,
    );
  }

  @Post(':clientSecret/confirm')
  // No auth guard - clientSecret acts as authentication
  // The client secret is a secure token from Stripe that proves possession
  async confirmCheckout(
    @Param('clientSecret') clientSecret: string,
    @Body() dto: ConfirmCheckoutDto,
  ) {
    this.logger.log(`Confirming checkout for client secret: ${clientSecret.substring(0, 10)}...`);

    return this.checkoutService.confirmCheckout(clientSecret, dto);
  }

  @Get(':sessionId/status')
  // No auth guard - session ID acts as bearer token
  // This is safe because:
  // 1. Session ID is cryptographically secure UUID
  // 2. Only returns read-only status information
  // 3. Similar to Stripe's checkout session status endpoint
  async getCheckoutStatus(@Param('sessionId') sessionId: string) {
    this.logger.log(`Getting checkout status for session: ${sessionId}`);

    return this.checkoutService.getCheckoutStatus(sessionId);
  }

  @Post(':sessionId/confirm-free')
  // No auth guard - session ID acts as bearer token for free product confirmations
  // This is safe because:
  // 1. Session ID is cryptographically secure UUID
  // 2. Only creates subscription for already-validated session
  // 3. User has already authenticated when creating the session
  async confirmFreeCheckout(@Param('sessionId') sessionId: string) {
    this.logger.log(`Confirming free checkout for session: ${sessionId}`);

    return this.checkoutService.confirmFreeCheckout(sessionId);
  }

  @Sse(':sessionId/stream')
  streamCheckoutStatus(
    @Param('sessionId') sessionId: string,
  ): Observable<MessageEvent> {
    this.logger.log(`Starting SSE stream for checkout session: ${sessionId}`);

    // Poll status every 2 seconds
    return interval(2000).pipe(
      switchMap(() =>
        from(this.checkoutService.getCheckoutStatus(sessionId)).pipe(
          switchMap((status) =>
            of({
              data: status,
            } as MessageEvent),
          ),
          catchError((error) => {
            this.logger.error(`Error getting checkout status: ${error.message}`);
            return of({
              data: { error: 'Failed to get status', sessionId },
            } as MessageEvent);
          }),
        ),
      ),
    );
  }
}
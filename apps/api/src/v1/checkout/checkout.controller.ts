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
@UseGuards(SessionTokenAuthGuard)
export class CheckoutController {
  private readonly logger = new Logger(CheckoutController.name);

  constructor(private readonly checkoutService: CheckoutService) {}

  @Post('create')
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
  async confirmCheckout(
    @Param('clientSecret') clientSecret: string,
    @Body() dto: ConfirmCheckoutDto,
  ) {
    this.logger.log(`Confirming checkout for client secret: ${clientSecret.substring(0, 10)}...`);

    return this.checkoutService.confirmCheckout(clientSecret, dto);
  }

  @Get(':sessionId/status')
  async getCheckoutStatus(@Param('sessionId') sessionId: string) {
    this.logger.log(`Getting checkout status for session: ${sessionId}`);

    return this.checkoutService.getCheckoutStatus(sessionId);
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
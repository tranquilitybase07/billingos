import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  Query,
  Logger,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse } from '@nestjs/swagger';
import { ChurnService } from './churn.service';
import {
  ApplyOfferDto,
  ChurnCancelDto,
  ChurnEventDto,
} from './dto/churn-engine.dto';

/**
 * Churn engine endpoints (portal mount, Phase 1).
 *
 * Auth model: intentionally NO `SessionTokenAuthGuard`. Like the existing portal
 * cancel endpoint (`POST /v1/portal/:sessionId/cancel-subscription`), the `:sessionId`
 * path param IS the credential — `ChurnContextService.resolveFromPortalSession`
 * validates the portal session and scopes every read/write to its org + customer.
 * This is deliberate so the flow can mount inside the portal, which holds a portal
 * session (not a bearer token). Phase 3 adds a token-guarded `POST /v1/churn/sessions`
 * for the SDK embed; those calls then reuse the same session-id-path surface.
 */
@ApiTags('SDK - Churn')
@Controller('v1/churn')
export class ChurnController {
  private readonly logger = new Logger(ChurnController.name);

  constructor(private readonly churnService: ChurnService) {}

  @Get(':sessionId/config')
  @ApiOperation({ summary: 'Get the enabled churn flow + subscription view' })
  @ApiResponse({ status: 200, description: 'Churn config retrieved' })
  async getConfig(
    @Param('sessionId') sessionId: string,
    @Query('subscriptionId') subscriptionId: string,
  ) {
    return this.churnService.getConfig(sessionId, subscriptionId);
  }

  @Post(':sessionId/events')
  @ApiOperation({ summary: 'Log a churn flow event (action-time analytics)' })
  @ApiResponse({ status: 201, description: 'Event recorded' })
  async logEvent(
    @Param('sessionId') sessionId: string,
    @Body() dto: ChurnEventDto,
  ) {
    return this.churnService.logEvent(sessionId, dto);
  }

  @Post(':sessionId/apply-offer')
  @ApiOperation({
    summary: 'Accept a save offer (ends the flow, sub stays active)',
  })
  @ApiResponse({ status: 200, description: 'Offer applied' })
  async applyOffer(
    @Param('sessionId') sessionId: string,
    @Body() dto: ApplyOfferDto,
  ) {
    this.logger.log(
      `Applying offer for reason "${dto.reason}" on subscription ${dto.subscriptionId}`,
    );
    return this.churnService.applyOffer(sessionId, dto);
  }

  @Post(':sessionId/cancel')
  @ApiOperation({ summary: 'Cancel the subscription (terminal step)' })
  @ApiResponse({ status: 200, description: 'Subscription cancelled' })
  async cancel(
    @Param('sessionId') sessionId: string,
    @Body() dto: ChurnCancelDto,
  ) {
    this.logger.log(
      `Cancelling subscription ${dto.subscriptionId} via churn flow (${dto.timing})`,
    );
    return this.churnService.cancel(sessionId, dto);
  }
}

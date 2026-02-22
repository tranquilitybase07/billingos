import {
  Controller,
  Post,
  Get,
  Patch,
  Delete,
  Body,
  Param,
  UseGuards,
  Logger,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse } from '@nestjs/swagger';
import { PortalService } from './portal.service';
import { CreatePortalSessionDto } from './dto/create-portal-session.dto';
import { CancelSubscriptionDto } from './dto/cancel-subscription.dto';
import { UpdateCustomerDto } from '../../customers/dto/update-customer.dto';
import { PreviewChangeDto } from '../../subscriptions/dto/preview-change.dto';
import { ChangePlanDto } from '../../subscriptions/dto/change-plan.dto';
import { SessionTokenAuthGuard } from '../../auth/guards/session-token-auth.guard';
import {
  CurrentCustomer,
  CustomerContext,
} from '../../auth/decorators/current-customer.decorator';

@ApiTags('SDK - Portal')
@Controller('v1/portal')
export class PortalController {
  private readonly logger = new Logger(PortalController.name);

  constructor(private readonly portalService: PortalService) {}

  @Post('create')
  @UseGuards(SessionTokenAuthGuard)
  @ApiOperation({ summary: 'Create a portal session for customer access' })
  @ApiResponse({ status: 201, description: 'Portal session created successfully' })
  @ApiResponse({ status: 404, description: 'Customer not found' })
  async createPortalSession(
    @CurrentCustomer() customer: CustomerContext,
    @Body() dto: CreatePortalSessionDto,
  ) {
    this.logger.log(
      `Creating portal session for organization: ${customer.organizationId}, user: ${customer.externalUserId}`,
    );

    return this.portalService.createPortalSession(
      customer.organizationId,
      customer.externalUserId,
      dto,
    );
  }

  @Get(':sessionId/status')
  @ApiOperation({ summary: 'Check portal session validity' })
  @ApiResponse({ status: 200, description: 'Session status retrieved' })
  async getSessionStatus(@Param('sessionId') sessionId: string) {
    this.logger.log(`Checking status for portal session: ${sessionId}`);
    return this.portalService.getPortalSessionStatus(sessionId);
  }

  @Get(':sessionId/data')
  @ApiOperation({ summary: 'Get aggregated portal data for a session' })
  @ApiResponse({ status: 200, description: 'Portal data retrieved successfully' })
  @ApiResponse({ status: 401, description: 'Session invalid or expired' })
  @ApiResponse({ status: 404, description: 'Customer not found' })
  async getPortalData(@Param('sessionId') sessionId: string) {
    this.logger.log(`Fetching portal data for session: ${sessionId}`);
    return this.portalService.getPortalData(sessionId);
  }

  @Post(':sessionId/cancel-subscription')
  @ApiOperation({ summary: 'Cancel a customer subscription' })
  @ApiResponse({ status: 200, description: 'Subscription cancelled successfully' })
  @ApiResponse({ status: 401, description: 'Session invalid or expired' })
  @ApiResponse({ status: 404, description: 'Subscription not found' })
  async cancelSubscription(
    @Param('sessionId') sessionId: string,
    @Body() dto: CancelSubscriptionDto,
  ) {
    this.logger.log(`Cancelling subscription ${dto.subscriptionId} for session: ${sessionId}`);
    return this.portalService.cancelSubscription(sessionId, dto);
  }

  @Patch(':sessionId/customer')
  @ApiOperation({ summary: 'Update customer account details' })
  @ApiResponse({ status: 200, description: 'Customer updated successfully' })
  @ApiResponse({ status: 401, description: 'Session invalid or expired' })
  @ApiResponse({ status: 404, description: 'Customer not found' })
  async updateCustomer(
    @Param('sessionId') sessionId: string,
    @Body() dto: UpdateCustomerDto,
  ) {
    this.logger.log(`Updating customer for session: ${sessionId}`);
    return this.portalService.updateCustomer(sessionId, dto);
  }

  @Post(':sessionId/setup-intent')
  @ApiOperation({ summary: 'Create a SetupIntent for adding payment method' })
  @ApiResponse({ status: 200, description: 'SetupIntent created successfully' })
  @ApiResponse({ status: 401, description: 'Session invalid or expired' })
  async createSetupIntent(@Param('sessionId') sessionId: string) {
    this.logger.log(`Creating SetupIntent for session: ${sessionId}`);
    return this.portalService.createSetupIntent(sessionId);
  }

  @Delete(':sessionId/payment-methods/:paymentMethodId')
  @ApiOperation({ summary: 'Remove a payment method' })
  @ApiResponse({ status: 200, description: 'Payment method removed successfully' })
  @ApiResponse({ status: 401, description: 'Session invalid or expired' })
  @ApiResponse({ status: 404, description: 'Payment method not found' })
  async removePaymentMethod(
    @Param('sessionId') sessionId: string,
    @Param('paymentMethodId') paymentMethodId: string,
  ) {
    this.logger.log(`Removing payment method ${paymentMethodId} for session: ${sessionId}`);
    return this.portalService.removePaymentMethod(sessionId, paymentMethodId);
  }

  @Patch(':sessionId/default-payment-method')
  @ApiOperation({ summary: 'Set default payment method' })
  @ApiResponse({ status: 200, description: 'Default payment method updated successfully' })
  @ApiResponse({ status: 401, description: 'Session invalid or expired' })
  async setDefaultPaymentMethod(
    @Param('sessionId') sessionId: string,
    @Body() body: { paymentMethodId: string },
  ) {
    this.logger.log(`Setting default payment method for session: ${sessionId}`);
    return this.portalService.setDefaultPaymentMethod(sessionId, body.paymentMethodId);
  }

  @Get(':sessionId/subscriptions/:subscriptionId/available-plans')
  @ApiOperation({ summary: 'Get available plans for subscription upgrade/downgrade' })
  @ApiResponse({ status: 200, description: 'Available plans retrieved successfully' })
  @ApiResponse({ status: 401, description: 'Session invalid or expired' })
  @ApiResponse({ status: 404, description: 'Subscription not found' })
  async getAvailablePlans(
    @Param('sessionId') sessionId: string,
    @Param('subscriptionId') subscriptionId: string,
  ) {
    this.logger.log(`Getting available plans for subscription ${subscriptionId}, session: ${sessionId}`);
    return this.portalService.getAvailablePlans(sessionId, subscriptionId);
  }

  @Post(':sessionId/subscriptions/:subscriptionId/preview-change')
  @ApiOperation({ summary: 'Preview subscription plan change with proration' })
  @ApiResponse({ status: 200, description: 'Preview calculated successfully' })
  @ApiResponse({ status: 401, description: 'Session invalid or expired' })
  @ApiResponse({ status: 404, description: 'Subscription not found' })
  async previewPlanChange(
    @Param('sessionId') sessionId: string,
    @Param('subscriptionId') subscriptionId: string,
    @Body() dto: PreviewChangeDto,
  ) {
    this.logger.log(`Previewing plan change for subscription ${subscriptionId}, session: ${sessionId}`);
    return this.portalService.previewPlanChange(sessionId, subscriptionId, dto);
  }

  @Post(':sessionId/subscriptions/:subscriptionId/change-plan')
  @ApiOperation({ summary: 'Execute subscription plan change' })
  @ApiResponse({ status: 200, description: 'Plan changed successfully' })
  @ApiResponse({ status: 401, description: 'Session invalid or expired' })
  @ApiResponse({ status: 404, description: 'Subscription not found' })
  @ApiResponse({ status: 400, description: 'Invalid plan change request' })
  async changePlan(
    @Param('sessionId') sessionId: string,
    @Param('subscriptionId') subscriptionId: string,
    @Body() dto: ChangePlanDto,
  ) {
    this.logger.log(`Changing plan for subscription ${subscriptionId}, session: ${sessionId}`);
    return this.portalService.changePlan(sessionId, subscriptionId, dto);
  }
}

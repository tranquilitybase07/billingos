import {
  Controller,
  Post,
  Get,
  Body,
  Param,
  UseGuards,
  Logger,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse } from '@nestjs/swagger';
import { PortalService } from './portal.service';
import { CreatePortalSessionDto } from './dto/create-portal-session.dto';
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
}

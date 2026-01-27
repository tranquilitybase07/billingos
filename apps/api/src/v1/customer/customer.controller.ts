import {
  Controller,
  Get,
  UseGuards,
  NotFoundException,
} from '@nestjs/common';
import { CustomersService } from '../../customers/customers.service';
import { SessionTokenAuthGuard } from '../../auth/guards/session-token-auth.guard';
import { CurrentCustomer, CustomerContext } from '../../auth/decorators/current-customer.decorator';
import { CustomerStateResponseDto } from '../../customers/dto/customer-response.dto';

/**
 * Customer Self-Service Controller (SDK)
 *
 * This controller provides customer-facing endpoints for the SDK.
 * All endpoints require session token authentication.
 *
 * Routes:
 * - GET /v1/customer/me - Get current customer state (profile + subscriptions + features)
 */
@Controller('v1/customer')
@UseGuards(SessionTokenAuthGuard)
export class CustomerController {
  constructor(private readonly customersService: CustomersService) {}

  /**
   * Get current customer state
   *
   * Returns:
   * - Customer profile
   * - Active subscriptions
   * - Granted features
   *
   * @example
   * GET /v1/customer/me
   * Headers: Authorization: Bearer bos_session_xxx
   */
  @Get('me')
  async getMe(
    @CurrentCustomer() customer: CustomerContext,
  ): Promise<CustomerStateResponseDto> {
    // 1. Find customer by external_user_id
    const customerRecord = await this.customersService.findOneByExternalId(
      customer.externalUserId,
      customer.organizationId,
    );

    if (!customerRecord) {
      throw new NotFoundException(
        `Customer not found with external ID: ${customer.externalUserId}`,
      );
    }

    // 2. Get full customer state (customer + subscriptions + features)
    return this.customersService.getCustomerState(
      customerRecord.id,
      customer.organizationId,
    );
  }
}

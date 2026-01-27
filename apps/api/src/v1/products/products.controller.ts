import { Controller, Get, Query, UseGuards, Logger } from '@nestjs/common';
import { V1ProductsService } from './products.service';
import { SessionTokenAuthGuard } from '../../auth/guards/session-token-auth.guard';
import { CurrentCustomer, CustomerContext } from '../../auth/decorators/current-customer.decorator';

@Controller('v1/products')
@UseGuards(SessionTokenAuthGuard)
export class V1ProductsController {
  private readonly logger = new Logger(V1ProductsController.name);

  constructor(private readonly productsService: V1ProductsService) {}

  @Get()
  async getProducts(
    @CurrentCustomer() customer: CustomerContext,
    @Query('planIds') planIds?: string,
  ) {
    this.logger.log(
      `Fetching products for organization: ${customer.organizationId}`,
    );

    // Parse planIds if provided (comma-separated string)
    const planIdsArray = planIds
      ? planIds.split(',').map((id) => id.trim())
      : undefined;

    // Extract customer ID from external user ID
    // Note: We'll need to fetch the actual customer record to get the internal customer ID
    const customerId = customer.externalUserId;

    return this.productsService.getProducts(
      customer.organizationId,
      customerId,
      planIdsArray,
    );
  }
}

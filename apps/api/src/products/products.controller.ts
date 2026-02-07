import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  Query,
  UseGuards,
  ParseBoolPipe,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { ProductsService } from './products.service';
import { CreateProductDto } from './dto/create-product.dto';
import { UpdateProductDto } from './dto/update-product.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { User } from '../user/entities/user.entity';

@ApiTags('Products')

@Controller('products')
@UseGuards(JwtAuthGuard)
export class ProductsController {
  constructor(private readonly productsService: ProductsService) {}

  /**
   * Create product with prices and features (atomic)
   * POST /api/products
   */
  @Post()
  create(@CurrentUser() user: User, @Body() createDto: CreateProductDto) {
    return this.productsService.create(user, createDto);
  }

  /**
   * List all products for organization
   * GET /api/products?organization_id=xxx&include_archived=false&include_features=true&include_prices=true
   */
  @Get()
  findAll(
    @CurrentUser() user: User,
    @Query('organization_id') organizationId: string,
    @Query('include_archived', new ParseBoolPipe({ optional: true }))
    includeArchived?: boolean,
    @Query('include_features', new ParseBoolPipe({ optional: true }))
    includeFeatures?: boolean,
    @Query('include_prices', new ParseBoolPipe({ optional: true }))
    includePrices?: boolean,
  ) {
    return this.productsService.findAll(
      organizationId,
      user.id,
      includeArchived ?? false,
      includeFeatures ?? true,
      includePrices ?? true,
    );
  }

  /**
   * Get single product by ID
   * GET /api/products/:id
   */
  @Get(':id')
  findOne(@CurrentUser() user: User, @Param('id') id: string) {
    return this.productsService.findOne(id, user.id);
  }

  /**
   * Get subscription count for product
   * GET /api/products/:id/subscriptions/count
   */
  @Get(':id/subscriptions/count')
  getSubscriptionCount(@CurrentUser() user: User, @Param('id') id: string) {
    return this.productsService.getSubscriptionCount(id, user.id);
  }

  /**
   * Get subscriptions for product
   * GET /api/products/:id/subscriptions?limit=10&offset=0
   */
  @Get(':id/subscriptions')
  getProductSubscriptions(
    @CurrentUser() user: User,
    @Param('id') id: string,
    @Query('limit') limit?: string,
    @Query('offset') offset?: string,
  ) {
    const parsedLimit = limit ? parseInt(limit, 10) : 10;
    const parsedOffset = offset ? parseInt(offset, 10) : 0;
    return this.productsService.getProductSubscriptions(id, user.id, parsedLimit, parsedOffset);
  }

  /**
   * Get revenue metrics for product
   * GET /api/products/:id/revenue-metrics
   */
  @Get(':id/revenue-metrics')
  getRevenueMetrics(@CurrentUser() user: User, @Param('id') id: string) {
    return this.productsService.getRevenueMetrics(id, user.id);
  }

  /**
   * Check if update would require versioning (preview)
   * POST /api/products/:id/check-versioning
   */
  @Post(':id/check-versioning')
  checkVersioning(
    @CurrentUser() user: User,
    @Param('id') id: string,
    @Body() updateDto: UpdateProductDto,
  ) {
    return this.productsService.checkVersioning(id, user.id, updateDto);
  }

  /**
   * Get all versions of a product
   * GET /api/products/:id/versions
   */
  @Get(':id/versions')
  getVersions(@CurrentUser() user: User, @Param('id') id: string) {
    return this.productsService.getVersionsByProductId(id, user.id);
  }

  /**
   * Sync subscriptions from Stripe for a customer
   * POST /api/products/sync-subscriptions
   * Body: { customer_id: string, stripe_account_id?: string }
   */
  @Post('sync-subscriptions')
  syncSubscriptions(
    @CurrentUser() user: User,
    @Body() syncDto: { customer_id: string; stripe_account_id?: string },
  ) {
    return this.productsService.syncSubscriptionsFromStripe(
      user.id,
      syncDto.customer_id,
      syncDto.stripe_account_id,
    );
  }

  /**
   * Update product
   * PATCH /api/products/:id
   */
  @Patch(':id')
  update(
    @CurrentUser() user: User,
    @Param('id') id: string,
    @Body() updateDto: UpdateProductDto,
  ) {
    return this.productsService.update(id, user.id, updateDto);
  }

  /**
   * Archive product (soft delete)
   * DELETE /api/products/:id
   */
  @Delete(':id')
  remove(@CurrentUser() user: User, @Param('id') id: string) {
    return this.productsService.remove(id, user.id);
  }
}

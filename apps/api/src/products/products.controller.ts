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
import { ProductsService } from './products.service';
import { CreateProductDto } from './dto/create-product.dto';
import { UpdateProductDto } from './dto/update-product.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { User } from '../user/entities/user.entity';

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

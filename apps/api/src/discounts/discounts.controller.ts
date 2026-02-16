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
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { DiscountsService } from './discounts.service';
import { CreateDiscountDto } from './dto/create-discount.dto';
import { UpdateDiscountDto } from './dto/update-discount.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { User } from '../user/entities/user.entity';

@ApiTags('Discounts')
@Controller('discounts')
@UseGuards(JwtAuthGuard)
export class DiscountsController {
  constructor(private readonly discountsService: DiscountsService) {}

  /**
   * Create discount
   * POST /api/discounts
   */
  @Post()
  create(@CurrentUser() user: User, @Body() createDto: CreateDiscountDto) {
    return this.discountsService.create(user.id, createDto);
  }

  /**
   * List discounts
   * GET /api/discounts?organization_id=xxx&query=xxx&page=1&limit=20
   */
  @Get()
  findAll(
    @CurrentUser() user: User,
    @Query('organization_id') organizationId: string,
    @Query('query') query?: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    return this.discountsService.findAll(
      organizationId,
      user.id,
      query,
      page ? parseInt(page, 10) : 1,
      limit ? parseInt(limit, 10) : 20,
    );
  }

  /**
   * Get discounts applicable to a specific product
   * GET /api/discounts/by-product/:productId?organization_id=xxx
   */
  @Get('by-product/:productId')
  findByProduct(
    @CurrentUser() user: User,
    @Param('productId') productId: string,
    @Query('organization_id') organizationId: string,
  ) {
    return this.discountsService.findByProduct(productId, organizationId, user.id);
  }

  /**
   * Get discount by ID
   * GET /api/discounts/:id
   */
  @Get(':id')
  findOne(@CurrentUser() user: User, @Param('id') id: string) {
    return this.discountsService.findOne(id, user.id);
  }

  /**
   * Update discount
   * PATCH /api/discounts/:id
   */
  @Patch(':id')
  update(
    @CurrentUser() user: User,
    @Param('id') id: string,
    @Body() updateDto: UpdateDiscountDto,
  ) {
    return this.discountsService.update(id, user.id, updateDto);
  }

  /**
   * Delete discount
   * DELETE /api/discounts/:id
   */
  @Delete(':id')
  remove(@CurrentUser() user: User, @Param('id') id: string) {
    return this.discountsService.remove(id, user.id);
  }
}

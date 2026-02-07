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
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { CustomersService } from './customers.service';
import { CreateCustomerDto } from './dto/create-customer.dto';
import { UpdateCustomerDto } from './dto/update-customer.dto';
import { ListCustomersDto } from './dto/list-customers.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { User } from '../user/entities/user.entity';

@ApiTags('Customers')

@Controller('customers')
@UseGuards(JwtAuthGuard)
export class CustomersController {
  constructor(private readonly customersService: CustomersService) {}

  /**
   * Create a new customer
   * POST /api/customers
   */
  @Post()
  @HttpCode(HttpStatus.CREATED)
  create(@CurrentUser() user: User, @Body() createDto: CreateCustomerDto) {
    return this.customersService.create(createDto);
  }

  /**
   * List all customers for an organization
   * GET /api/customers?organization_id=xxx&limit=50&page=1&email=...&query=...
   */
  @Get()
  findAll(
    @CurrentUser() user: User,
    @Query('organization_id') organizationId: string,
    @Query() query: ListCustomersDto,
  ) {
    return this.customersService.findAll(organizationId, query);
  }

  /**
   * Get customer state (customer + subscriptions + features)
   * GET /api/customers/:id/state?organization_id=xxx
   */
  @Get(':id/state')
  getCustomerState(
    @CurrentUser() user: User,
    @Param('id') id: string,
    @Query('organization_id') organizationId: string,
  ) {
    return this.customersService.getCustomerState(id, organizationId);
  }

  /**
   * Get customer by ID
   * GET /api/customers/:id?organization_id=xxx
   */
  @Get(':id')
  findOne(
    @CurrentUser() user: User,
    @Param('id') id: string,
    @Query('organization_id') organizationId: string,
  ) {
    return this.customersService.findOne(id, organizationId);
  }

  /**
   * Get customer by external_id
   * GET /api/customers/external/:external_id?organization_id=xxx
   */
  @Get('external/:external_id')
  findOneByExternalId(
    @CurrentUser() user: User,
    @Param('external_id') externalId: string,
    @Query('organization_id') organizationId: string,
  ) {
    return this.customersService.findOneByExternalId(
      externalId,
      organizationId,
    );
  }

  /**
   * Update customer by ID
   * PATCH /api/customers/:id?organization_id=xxx
   */
  @Patch(':id')
  update(
    @CurrentUser() user: User,
    @Param('id') id: string,
    @Query('organization_id') organizationId: string,
    @Body() updateDto: UpdateCustomerDto,
  ) {
    return this.customersService.update(id, organizationId, updateDto);
  }

  /**
   * Update customer by external_id
   * PATCH /api/customers/external/:external_id?organization_id=xxx
   */
  @Patch('external/:external_id')
  updateByExternalId(
    @CurrentUser() user: User,
    @Param('external_id') externalId: string,
    @Query('organization_id') organizationId: string,
    @Body() updateDto: UpdateCustomerDto,
  ) {
    return this.customersService.updateByExternalId(
      externalId,
      organizationId,
      updateDto,
    );
  }

  /**
   * Delete customer by ID (soft delete)
   * DELETE /api/customers/:id?organization_id=xxx
   */
  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  delete(
    @CurrentUser() user: User,
    @Param('id') id: string,
    @Query('organization_id') organizationId: string,
  ) {
    return this.customersService.delete(id, organizationId);
  }

  /**
   * Delete customer by external_id (soft delete)
   * DELETE /api/customers/external/:external_id?organization_id=xxx
   */
  @Delete('external/:external_id')
  @HttpCode(HttpStatus.NO_CONTENT)
  deleteByExternalId(
    @CurrentUser() user: User,
    @Param('external_id') externalId: string,
    @Query('organization_id') organizationId: string,
  ) {
    return this.customersService.deleteByExternalId(externalId, organizationId);
  }
}

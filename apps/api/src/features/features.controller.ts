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
import { FeaturesService } from './features.service';
import { CreateFeatureDto } from './dto/create-feature.dto';
import { UpdateFeatureDto } from './dto/update-feature.dto';
import { TrackUsageDto } from './dto/track-usage.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { User } from '../user/entities/user.entity';

@ApiTags('Features')

@Controller('features')
export class FeaturesController {
  constructor(private readonly featuresService: FeaturesService) {}

  /**
   * Create a new feature
   * POST /api/features
   */
  @Post()
  @UseGuards(JwtAuthGuard)
  create(@CurrentUser() user: User, @Body() createDto: CreateFeatureDto) {
    return this.featuresService.create(user, createDto);
  }

  /**
   * List all features for an organization
   * GET /api/features?organization_id=xxx
   */
  @Get()
  @UseGuards(JwtAuthGuard)
  findAll(
    @CurrentUser() user: User,
    @Query('organization_id') organizationId: string,
  ) {
    return this.featuresService.findAll(organizationId, user.id);
  }

  /**
   * Check if customer has access to a feature (SDK endpoint)
   * GET /api/features/check?customer_id=xxx&feature_name=xxx
   * TODO: Add SDK authentication guard instead of JWT
   */
  @Get('check')
  @UseGuards(JwtAuthGuard) // TODO: Replace with SDK auth guard
  checkAccess(
    @Query('customer_id') customerId: string,
    @Query('feature_name') featureName: string,
  ) {
    return this.featuresService.checkAccess(customerId, featureName);
  }

  /**
   * Get all granted features for a customer
   * GET /api/features/customer/:customerId?organization_id=xxx
   * IMPORTANT: This must be before @Get(':id') to avoid route conflicts
   */
  @Get('customer/:customerId')
  @UseGuards(JwtAuthGuard)
  getCustomerFeatures(
    @Param('customerId') customerId: string,
    @Query('organization_id') organizationId?: string,
  ) {
    return this.featuresService.getCustomerFeatures(customerId, organizationId);
  }

  /**
   * Get a single feature by ID
   * GET /api/features/:id
   */
  @Get(':id')
  @UseGuards(JwtAuthGuard)
  findOne(@CurrentUser() user: User, @Param('id') id: string) {
    return this.featuresService.findOne(id, user.id);
  }

  /**
   * Update a feature
   * PATCH /api/features/:id
   */
  @Patch(':id')
  @UseGuards(JwtAuthGuard)
  update(
    @CurrentUser() user: User,
    @Param('id') id: string,
    @Body() updateDto: UpdateFeatureDto,
  ) {
    return this.featuresService.update(id, user.id, updateDto);
  }

  /**
   * Delete a feature
   * DELETE /api/features/:id
   */
  @Delete(':id')
  @UseGuards(JwtAuthGuard)
  remove(@CurrentUser() user: User, @Param('id') id: string) {
    return this.featuresService.remove(id, user.id);
  }

  /**
   * Track usage for a feature (SDK endpoint)
   * POST /api/features/track-usage
   * TODO: Add SDK authentication guard instead of JWT
   */
  @Post('track-usage')
  @UseGuards(JwtAuthGuard) // TODO: Replace with SDK auth guard
  trackUsage(@Body() trackDto: TrackUsageDto) {
    return this.featuresService.trackUsage(trackDto);
  }
}

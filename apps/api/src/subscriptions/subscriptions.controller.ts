import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { SubscriptionsService } from './subscriptions.service';
import { SubscriptionUpgradeService } from './subscription-upgrade.service';
import { CreateSubscriptionDto } from './dto/create-subscription.dto';
import { CancelSubscriptionDto } from './dto/cancel-subscription.dto';
import { PreviewChangeDto } from './dto/preview-change.dto';
import { ChangePlanDto } from './dto/change-plan.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { User } from '../user/entities/user.entity';

@ApiTags('Subscriptions')

@Controller('subscriptions')
@UseGuards(JwtAuthGuard)
export class SubscriptionsController {
  constructor(
    private readonly subscriptionsService: SubscriptionsService,
    private readonly subscriptionUpgradeService: SubscriptionUpgradeService,
  ) {}

  /**
   * Create subscription
   * POST /api/subscriptions
   */
  @Post()
  create(@CurrentUser() user: User, @Body() createDto: CreateSubscriptionDto) {
    return this.subscriptionsService.create(user, createDto);
  }

  /**
   * List subscriptions
   * GET /api/subscriptions?organization_id=xxx&customer_id=xxx
   */
  @Get()
  findAll(
    @CurrentUser() user: User,
    @Query('organization_id') organizationId: string,
    @Query('customer_id') customerId?: string,
  ) {
    return this.subscriptionsService.findAll(
      organizationId,
      user.id,
      customerId,
    );
  }

  /**
   * Get subscription by ID
   * GET /api/subscriptions/:id
   */
  @Get(':id')
  findOne(@CurrentUser() user: User, @Param('id') id: string) {
    return this.subscriptionsService.findOne(id, user.id);
  }

  /**
   * Cancel subscription
   * POST /api/subscriptions/:id/cancel
   */
  @Post(':id/cancel')
  cancel(
    @CurrentUser() user: User,
    @Param('id') id: string,
    @Body() cancelDto: CancelSubscriptionDto,
  ) {
    return this.subscriptionsService.cancel(id, user.id, cancelDto);
  }

  /**
   * Preview plan change (upgrade/downgrade)
   * POST /api/subscriptions/:id/preview-change
   */
  @Post(':id/preview-change')
  previewChange(
    @CurrentUser() user: User,
    @Param('id') id: string,
    @Body() previewDto: PreviewChangeDto,
  ) {
    const context = { userId: user.id, isSDK: false } as const;
    return this.subscriptionUpgradeService.previewChange(id, context, previewDto);
  }

  /**
   * Execute plan change (upgrade/downgrade)
   * POST /api/subscriptions/:id/change-plan
   */
  @Post(':id/change-plan')
  changePlan(
    @CurrentUser() user: User,
    @Param('id') id: string,
    @Body() changePlanDto: ChangePlanDto,
  ) {
    const context = { userId: user.id, isSDK: false } as const;
    return this.subscriptionUpgradeService.changePlan(id, context, changePlanDto);
  }

  /**
   * Get available plans for upgrade/downgrade
   * GET /api/subscriptions/:id/available-plans
   */
  @Get(':id/available-plans')
  getAvailablePlans(@CurrentUser() user: User, @Param('id') id: string) {
    const context = { userId: user.id, isSDK: false } as const;
    return this.subscriptionUpgradeService.getAvailablePlans(id, context);
  }
}

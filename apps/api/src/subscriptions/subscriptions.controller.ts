import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  Query,
  UseGuards,
} from '@nestjs/common';
import { SubscriptionsService } from './subscriptions.service';
import { CreateSubscriptionDto } from './dto/create-subscription.dto';
import { CancelSubscriptionDto } from './dto/cancel-subscription.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { User } from '../user/entities/user.entity';

@Controller('subscriptions')
@UseGuards(JwtAuthGuard)
export class SubscriptionsController {
  constructor(private readonly subscriptionsService: SubscriptionsService) {}

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
}

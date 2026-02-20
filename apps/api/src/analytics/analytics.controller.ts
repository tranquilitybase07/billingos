import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { AnalyticsService } from './analytics.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { User } from '../user/entities/user.entity';
import {
  AnalyticsQueryDto,
  Granularity,
} from './dto/analytics-query.dto';
import { MRRResponseDto } from './dto/mrr-response.dto';
import { MRRTrendResponseDto } from './dto/mrr-trend-response.dto';
import { ActiveSubscriptionsResponseDto } from './dto/active-subscriptions-response.dto';
import { RevenueTrendResponseDto } from './dto/revenue-trend-response.dto';
import { SubscriptionGrowthResponseDto } from './dto/subscription-growth-response.dto';
import { ChurnRateResponseDto } from './dto/churn-rate-response.dto';
import { TopCustomersResponseDto } from './dto/top-customers-response.dto';
import { ARPUResponseDto } from './dto/arpu-response.dto';

@ApiTags('Analytics')

@Controller('analytics')
@UseGuards(JwtAuthGuard)
export class AnalyticsController {
  constructor(private readonly analyticsService: AnalyticsService) {}

  /**
   * Get Monthly Recurring Revenue (MRR)
   * GET /analytics/mrr?organization_id=xxx
   */
  @Get('mrr')
  async getMRR(
    @CurrentUser() user: User,
    @Query('organization_id') organizationId: string,
  ): Promise<MRRResponseDto> {
    return this.analyticsService.getMRR(organizationId);
  }

  /**
   * Get MRR trend over time
   * GET /analytics/mrr/trend?organization_id=xxx&start_date=2025-01-01&end_date=2026-02-19&granularity=month
   */
  @Get('mrr/trend')
  async getMRRTrend(
    @CurrentUser() user: User,
    @Query() query: AnalyticsQueryDto,
  ): Promise<MRRTrendResponseDto> {
    // Default to last 12 months if no dates provided
    const endDate = query.end_date || new Date().toISOString().split('T')[0];
    const startDate =
      query.start_date ||
      new Date(Date.now() - 365 * 24 * 60 * 60 * 1000)
        .toISOString()
        .split('T')[0];

    return this.analyticsService.getMRRTrend(
      query.organization_id,
      startDate,
      endDate,
      query.granularity || Granularity.MONTH,
    );
  }

  /**
   * Get active subscriptions count
   * GET /analytics/subscriptions/active?organization_id=xxx
   */
  @Get('subscriptions/active')
  async getActiveSubscriptions(
    @CurrentUser() user: User,
    @Query('organization_id') organizationId: string,
  ): Promise<ActiveSubscriptionsResponseDto> {
    return this.analyticsService.getActiveSubscriptionsCount(organizationId);
  }

  /**
   * Get revenue trend over time
   * GET /analytics/revenue/trend?organization_id=xxx&start_date=2026-01-01&end_date=2026-02-07&granularity=day
   */
  @Get('revenue/trend')
  async getRevenueTrend(
    @CurrentUser() user: User,
    @Query() query: AnalyticsQueryDto,
  ): Promise<RevenueTrendResponseDto> {
    // Default to last 30 days if no dates provided
    const endDate = query.end_date || new Date().toISOString().split('T')[0];
    const startDate =
      query.start_date ||
      new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)
        .toISOString()
        .split('T')[0];

    return this.analyticsService.getRevenueTrend(
      query.organization_id,
      startDate,
      endDate,
      query.granularity || Granularity.DAY,
    );
  }

  /**
   * Get subscription growth metrics
   * GET /analytics/subscriptions/growth?organization_id=xxx&start_date=2026-01-01&end_date=2026-02-07&granularity=day
   */
  @Get('subscriptions/growth')
  async getSubscriptionGrowth(
    @CurrentUser() user: User,
    @Query() query: AnalyticsQueryDto,
  ): Promise<SubscriptionGrowthResponseDto> {
    // Default to last 30 days if no dates provided
    const endDate = query.end_date || new Date().toISOString().split('T')[0];
    const startDate =
      query.start_date ||
      new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)
        .toISOString()
        .split('T')[0];

    return this.analyticsService.getSubscriptionGrowth(
      query.organization_id,
      startDate,
      endDate,
      query.granularity || Granularity.DAY,
    );
  }

  /**
   * Get churn rate metrics
   * GET /analytics/churn-rate?organization_id=xxx&start_date=2026-01-01&end_date=2026-02-07&granularity=month
   */
  @Get('churn-rate')
  async getChurnRate(
    @CurrentUser() user: User,
    @Query() query: AnalyticsQueryDto,
  ): Promise<ChurnRateResponseDto> {
    // Default to last 3 months if no dates provided
    const endDate = query.end_date || new Date().toISOString().split('T')[0];
    const startDate =
      query.start_date ||
      new Date(Date.now() - 90 * 24 * 60 * 60 * 1000)
        .toISOString()
        .split('T')[0];

    return this.analyticsService.getChurnRate(
      query.organization_id,
      startDate,
      endDate,
      query.granularity || Granularity.MONTH,
    );
  }

  /**
   * Get top customers by revenue
   * GET /analytics/customers/top-revenue?organization_id=xxx&start_date=2026-01-01&end_date=2026-02-07&limit=10
   */
  @Get('customers/top-revenue')
  async getTopCustomers(
    @CurrentUser() user: User,
    @Query() query: AnalyticsQueryDto,
    @Query('limit') limit?: number,
  ): Promise<TopCustomersResponseDto> {
    // Default to all-time if no dates provided
    const endDate = query.end_date || new Date().toISOString().split('T')[0];
    const startDate =
      query.start_date || new Date('2020-01-01').toISOString().split('T')[0];

    return this.analyticsService.getTopCustomers(
      query.organization_id,
      startDate,
      endDate,
      limit || 10,
    );
  }

  /**
   * Get Average Revenue Per User (ARPU)
   * GET /analytics/arpu?organization_id=xxx
   */
  @Get('arpu')
  async getARPU(
    @CurrentUser() user: User,
    @Query('organization_id') organizationId: string,
  ): Promise<ARPUResponseDto> {
    return this.analyticsService.getARPU(organizationId);
  }
}

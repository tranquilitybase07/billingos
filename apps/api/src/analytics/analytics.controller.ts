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
import { ActiveSubscriptionsResponseDto } from './dto/active-subscriptions-response.dto';
import { RevenueTrendResponseDto } from './dto/revenue-trend-response.dto';
import { SubscriptionGrowthResponseDto } from './dto/subscription-growth-response.dto';
import { ChurnRateResponseDto } from './dto/churn-rate-response.dto';
import { TopCustomersResponseDto } from './dto/top-customers-response.dto';
import { ARPUResponseDto } from './dto/arpu-response.dto';
import { UsageOverviewResponseDto } from './dto/usage-overview-response.dto';
import { UsageByFeatureResponseDto } from './dto/usage-by-feature-response.dto';
import { AtRiskCustomersResponseDto } from './dto/at-risk-customers-response.dto';
import { UsageTrendsResponseDto } from './dto/usage-trends-response.dto';

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

  /**
   * Get usage overview (total consumption, active metered customers, etc.)
   * GET /analytics/usage/overview?organization_id=xxx
   */
  @Get('usage/overview')
  async getUsageOverview(
    @CurrentUser() user: User,
    @Query('organization_id') organizationId: string,
  ): Promise<UsageOverviewResponseDto> {
    return this.analyticsService.getUsageOverview(organizationId);
  }

  /**
   * Get usage breakdown by feature
   * GET /analytics/usage/by-feature?organization_id=xxx
   */
  @Get('usage/by-feature')
  async getUsageByFeature(
    @CurrentUser() user: User,
    @Query('organization_id') organizationId: string,
  ): Promise<UsageByFeatureResponseDto> {
    return this.analyticsService.getUsageByFeature(organizationId);
  }

  /**
   * Get customers at risk of hitting usage limits
   * GET /analytics/usage/at-risk?organization_id=xxx&threshold=80
   */
  @Get('usage/at-risk')
  async getAtRiskCustomers(
    @CurrentUser() user: User,
    @Query('organization_id') organizationId: string,
    @Query('threshold') threshold?: number,
  ): Promise<AtRiskCustomersResponseDto> {
    return this.analyticsService.getAtRiskCustomers(
      organizationId,
      threshold || 80,
    );
  }

  /**
   * Get usage trends for a specific feature over time
   * GET /analytics/usage/trends?organization_id=xxx&feature_name=api_calls&period=30
   */
  @Get('usage/trends')
  async getUsageTrends(
    @CurrentUser() user: User,
    @Query('organization_id') organizationId: string,
    @Query('feature_name') featureName: string,
    @Query('period') period?: number,
  ): Promise<UsageTrendsResponseDto> {
    return this.analyticsService.getUsageTrends(
      organizationId,
      featureName,
      period || 30,
    );
  }
}

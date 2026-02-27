import {
  Injectable,
  Logger,
  BadRequestException,
  Inject,
} from '@nestjs/common';
import { CACHE_MANAGER } from '@nestjs/cache-manager';
import { Cache } from 'cache-manager';
import { SupabaseService } from '../supabase/supabase.service';
import { MRRResponseDto } from './dto/mrr-response.dto';
import { ActiveSubscriptionsResponseDto } from './dto/active-subscriptions-response.dto';
import {
  RevenueTrendResponseDto,
  RevenueTrendDataPoint,
} from './dto/revenue-trend-response.dto';
import {
  SubscriptionGrowthResponseDto,
  SubscriptionGrowthDataPoint,
} from './dto/subscription-growth-response.dto';
import {
  ChurnRateResponseDto,
  ChurnRateDataPoint,
} from './dto/churn-rate-response.dto';
import {
  TopCustomersResponseDto,
  TopCustomerDto,
} from './dto/top-customers-response.dto';
import { ARPUResponseDto } from './dto/arpu-response.dto';
import { UsageOverviewResponseDto } from './dto/usage-overview-response.dto';
import { UsageByFeatureResponseDto } from './dto/usage-by-feature-response.dto';
import { AtRiskCustomersResponseDto } from './dto/at-risk-customers-response.dto';
import { UsageTrendsResponseDto } from './dto/usage-trends-response.dto';
import { Granularity } from './dto/analytics-query.dto';

@Injectable()
export class AnalyticsService {
  private readonly logger = new Logger(AnalyticsService.name);

  constructor(
    private readonly supabaseService: SupabaseService,
    @Inject(CACHE_MANAGER) private cacheManager: Cache,
  ) {}

  /**
   * Get Monthly Recurring Revenue (MRR)
   * Normalizes all subscription intervals to monthly amounts
   */
  async getMRR(organizationId: string): Promise<MRRResponseDto> {
    const cacheKey = `analytics:${organizationId}:mrr`;

    // Try cache first
    const cached = await this.cacheManager.get<MRRResponseDto>(cacheKey);
    if (cached) {
      this.logger.log(`MRR cache HIT for organization ${organizationId}`);
      return cached;
    }

    this.logger.log(`MRR cache MISS for organization ${organizationId}`);

    const supabase = this.supabaseService.getClient();

    // Query subscriptions with JOIN to products for recurring_interval
    const { data: subscriptions, error } = await supabase
      .from('subscriptions')
      .select(
        `
        amount,
        products!inner (
          recurring_interval,
          recurring_interval_count
        )
      `,
      )
      .eq('organization_id', organizationId)
      .in('status', ['active', 'trialing'])
      .eq('cancel_at_period_end', false);

    if (error) {
      this.logger.error(`Failed to calculate MRR: ${error.message}`, error);
      throw new BadRequestException('Failed to calculate MRR');
    }

    // Calculate MRR with interval normalization
    let mrr = 0;
    let activeSubscriptionCount = 0;

    if (subscriptions && subscriptions.length > 0) {
      mrr = subscriptions.reduce((sum, sub) => {
        const product = sub.products as any;
        let normalizedAmount = sub.amount || 0;

        // Normalize to monthly
        switch (product.recurring_interval) {
          case 'year':
            normalizedAmount = Math.round(normalizedAmount / 12);
            break;
          case 'month':
            // Already monthly
            break;
          case 'week':
            normalizedAmount = Math.round(normalizedAmount * 4);
            break;
          case 'day':
            normalizedAmount = Math.round(normalizedAmount * 30);
            break;
          default:
            this.logger.warn(
              `Unknown recurring_interval: ${product.recurring_interval}`,
            );
        }

        return sum + normalizedAmount;
      }, 0);

      activeSubscriptionCount = subscriptions.length;
    }

    const response: MRRResponseDto = {
      mrr,
      currency: 'usd',
      active_subscriptions: activeSubscriptionCount,
      cached_at: new Date().toISOString(),
    };

    // Cache for 5 minutes (300 seconds = 300000 milliseconds)
    await this.cacheManager.set(cacheKey, response, 300000);

    this.logger.log(
      `Calculated MRR for organization ${organizationId}: ${mrr}`,
    );

    return response;
  }

  /**
   * Get count of active subscriptions
   */
  async getActiveSubscriptionsCount(
    organizationId: string,
  ): Promise<ActiveSubscriptionsResponseDto> {
    const cacheKey = `analytics:${organizationId}:active-subscriptions`;

    // Try cache first
    const cached =
      await this.cacheManager.get<ActiveSubscriptionsResponseDto>(cacheKey);
    if (cached) {
      this.logger.log(
        `Active subscriptions cache HIT for organization ${organizationId}`,
      );
      return cached;
    }

    this.logger.log(
      `Active subscriptions cache MISS for organization ${organizationId}`,
    );

    const supabase = this.supabaseService.getClient();

    // Count active subscriptions
    const { count, error } = await supabase
      .from('subscriptions')
      .select('*', { count: 'exact', head: true })
      .eq('organization_id', organizationId)
      .in('status', ['active', 'trialing']);

    if (error) {
      this.logger.error(
        `Failed to count active subscriptions: ${error.message}`,
        error,
      );
      throw new BadRequestException('Failed to count active subscriptions');
    }

    const response: ActiveSubscriptionsResponseDto = {
      count: count || 0,
      as_of: new Date().toISOString(),
    };

    // Cache for 5 minutes
    await this.cacheManager.set(cacheKey, response, 300000);

    this.logger.log(
      `Active subscriptions for organization ${organizationId}: ${count}`,
    );

    return response;
  }

  /**
   * Get revenue trend over time
   * Returns time-series data of revenue by date
   */
  async getRevenueTrend(
    organizationId: string,
    startDate: string,
    endDate: string,
    granularity: Granularity = Granularity.DAY,
  ): Promise<RevenueTrendResponseDto> {
    const cacheKey = `analytics:${organizationId}:revenue-trend:${startDate}:${endDate}:${granularity}`;

    // Try cache first
    const cached =
      await this.cacheManager.get<RevenueTrendResponseDto>(cacheKey);
    if (cached) {
      this.logger.log(
        `Revenue trend cache HIT for organization ${organizationId}`,
      );
      return cached;
    }

    this.logger.log(
      `Revenue trend cache MISS for organization ${organizationId}`,
    );

    const supabase = this.supabaseService.getClient();

    // Fetch all successful payments in date range
    const { data: payments, error } = await supabase
      .from('payment_intents')
      .select('amount, created_at')
      .eq('organization_id', organizationId)
      .eq('status', 'succeeded')
      .gte('created_at', startDate)
      .lte('created_at', endDate)
      .order('created_at', { ascending: true });

    if (error) {
      this.logger.error(
        `Failed to fetch revenue trend: ${error.message}`,
        error,
      );
      throw new BadRequestException('Failed to fetch revenue trend');
    }

    // Group by date based on granularity
    const grouped: Record<
      string,
      { revenue: number; transaction_count: number }
    > = {};

    if (payments && payments.length > 0) {
      payments.forEach((payment) => {
        if (!payment.created_at) return; // Skip if no created_at

        const date = this.formatDateByGranularity(
          payment.created_at,
          granularity,
        );

        if (!grouped[date]) {
          grouped[date] = { revenue: 0, transaction_count: 0 };
        }

        grouped[date].revenue += payment.amount || 0;
        grouped[date].transaction_count += 1;
      });
    }

    // Convert to array and sort by date
    const data: RevenueTrendDataPoint[] = Object.entries(grouped)
      .map(([date, metrics]) => ({
        date,
        revenue: metrics.revenue,
        transaction_count: metrics.transaction_count,
      }))
      .sort((a, b) => a.date.localeCompare(b.date));

    const totalRevenue = data.reduce((sum, point) => sum + point.revenue, 0);

    const response: RevenueTrendResponseDto = {
      data,
      total_revenue: totalRevenue,
      period: {
        start: startDate,
        end: endDate,
      },
      granularity,
    };

    // Cache for 15 minutes (900000 milliseconds)
    await this.cacheManager.set(cacheKey, response, 900000);

    this.logger.log(
      `Revenue trend for organization ${organizationId}: ${data.length} data points`,
    );

    return response;
  }

  /**
   * Get subscription growth metrics
   * Tracks new vs canceled subscriptions over time
   */
  async getSubscriptionGrowth(
    organizationId: string,
    startDate: string,
    endDate: string,
    granularity: Granularity = Granularity.DAY,
  ): Promise<SubscriptionGrowthResponseDto> {
    const cacheKey = `analytics:${organizationId}:sub-growth:${startDate}:${endDate}:${granularity}`;

    // Try cache first
    const cached =
      await this.cacheManager.get<SubscriptionGrowthResponseDto>(cacheKey);
    if (cached) {
      this.logger.log(
        `Subscription growth cache HIT for organization ${organizationId}`,
      );
      return cached;
    }

    this.logger.log(
      `Subscription growth cache MISS for organization ${organizationId}`,
    );

    const supabase = this.supabaseService.getClient();

    // Fetch all subscriptions created in period
    const { data: newSubs, error: newError } = await supabase
      .from('subscriptions')
      .select('created_at')
      .eq('organization_id', organizationId)
      .gte('created_at', startDate)
      .lte('created_at', endDate);

    if (newError) {
      this.logger.error(
        `Failed to fetch new subscriptions: ${newError.message}`,
        newError,
      );
      throw new BadRequestException('Failed to fetch subscription growth');
    }

    // Fetch all subscriptions canceled in period
    const { data: canceledSubs, error: cancelError } = await supabase
      .from('subscriptions')
      .select('canceled_at')
      .eq('organization_id', organizationId)
      .not('canceled_at', 'is', null)
      .gte('canceled_at', startDate)
      .lte('canceled_at', endDate);

    if (cancelError) {
      this.logger.error(
        `Failed to fetch canceled subscriptions: ${cancelError.message}`,
        cancelError,
      );
      throw new BadRequestException('Failed to fetch subscription growth');
    }

    // Group by date
    const growth: Record<
      string,
      { new: number; canceled: number }
    > = {};

    if (newSubs && newSubs.length > 0) {
      newSubs.forEach((sub) => {
        if (!sub.created_at) return; // Skip if no created_at
        const date = this.formatDateByGranularity(sub.created_at, granularity);
        if (!growth[date]) growth[date] = { new: 0, canceled: 0 };
        growth[date].new += 1;
      });
    }

    if (canceledSubs && canceledSubs.length > 0) {
      canceledSubs.forEach((sub) => {
        if (!sub.canceled_at) return; // Skip if no canceled_at
        const date = this.formatDateByGranularity(
          sub.canceled_at,
          granularity,
        );
        if (!growth[date]) growth[date] = { new: 0, canceled: 0 };
        growth[date].canceled += 1;
      });
    }

    // Convert to array with net_growth
    const data: SubscriptionGrowthDataPoint[] = Object.entries(growth)
      .map(([date, metrics]) => ({
        date,
        new_subscriptions: metrics.new,
        canceled_subscriptions: metrics.canceled,
        net_growth: metrics.new - metrics.canceled,
      }))
      .sort((a, b) => a.date.localeCompare(b.date));

    // Calculate summary
    const summary = {
      total_new: data.reduce((sum, point) => sum + point.new_subscriptions, 0),
      total_canceled: data.reduce(
        (sum, point) => sum + point.canceled_subscriptions,
        0,
      ),
      net_growth: 0,
    };
    summary.net_growth = summary.total_new - summary.total_canceled;

    const response: SubscriptionGrowthResponseDto = {
      data,
      summary,
      period: {
        start: startDate,
        end: endDate,
      },
    };

    // Cache for 15 minutes
    await this.cacheManager.set(cacheKey, response, 900000);

    this.logger.log(
      `Subscription growth for organization ${organizationId}: +${summary.total_new} -${summary.total_canceled}`,
    );

    return response;
  }

  /**
   * Format date by granularity
   */
  private formatDateByGranularity(
    dateString: string,
    granularity: Granularity,
  ): string {
    const date = new Date(dateString);

    switch (granularity) {
      case Granularity.DAY:
        return date.toISOString().split('T')[0]; // YYYY-MM-DD

      case Granularity.WEEK:
        // Get Monday of the week
        const day = date.getDay();
        const diff = date.getDate() - day + (day === 0 ? -6 : 1);
        const monday = new Date(date.setDate(diff));
        return monday.toISOString().split('T')[0];

      case Granularity.MONTH:
        return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;

      default:
        return date.toISOString().split('T')[0];
    }
  }

  /**
   * Get churn rate metrics
   * Calculates percentage of subscriptions that were canceled
   */
  async getChurnRate(
    organizationId: string,
    startDate: string,
    endDate: string,
    granularity: Granularity = Granularity.MONTH,
  ): Promise<ChurnRateResponseDto> {
    const cacheKey = `analytics:${organizationId}:churn-rate:${startDate}:${endDate}:${granularity}`;

    // Try cache first
    const cached =
      await this.cacheManager.get<ChurnRateResponseDto>(cacheKey);
    if (cached) {
      this.logger.log(
        `Churn rate cache HIT for organization ${organizationId}`,
      );
      return cached;
    }

    this.logger.log(
      `Churn rate cache MISS for organization ${organizationId}`,
    );

    const supabase = this.supabaseService.getClient();

    // Get all subscriptions to track active count at start of each period
    const { data: allSubs, error: allError } = await supabase
      .from('subscriptions')
      .select('id, created_at, canceled_at, status')
      .eq('organization_id', organizationId)
      .or(`created_at.lte.${endDate},and(canceled_at.gte.${startDate},canceled_at.lte.${endDate})`);

    if (allError) {
      this.logger.error(
        `Failed to fetch subscriptions for churn: ${allError.message}`,
        allError,
      );
      throw new BadRequestException('Failed to calculate churn rate');
    }

    // Process by period
    const periodData: Map<
      string,
      {
        active_at_start: Set<string>;
        new: number;
        canceled: number;
      }
    > = new Map();

    // Initialize periods
    const start = new Date(startDate);
    const end = new Date(endDate);
    let current = new Date(start);

    while (current <= end) {
      const periodKey = this.formatDateByGranularity(
        current.toISOString(),
        granularity,
      );
      if (!periodData.has(periodKey)) {
        periodData.set(periodKey, {
          active_at_start: new Set(),
          new: 0,
          canceled: 0,
        });
      }

      // Move to next period
      switch (granularity) {
        case Granularity.DAY:
          current.setDate(current.getDate() + 1);
          break;
        case Granularity.WEEK:
          current.setDate(current.getDate() + 7);
          break;
        case Granularity.MONTH:
          current.setMonth(current.getMonth() + 1);
          break;
      }
    }

    // Calculate metrics for each period
    if (allSubs && allSubs.length > 0) {
      periodData.forEach((metrics, periodKey) => {
        const periodStart = new Date(periodKey);

        allSubs.forEach((sub) => {
          const createdAt = sub.created_at ? new Date(sub.created_at) : null;
          const canceledAt = sub.canceled_at
            ? new Date(sub.canceled_at)
            : null;

          // Was active at start of period?
          if (createdAt && createdAt < periodStart) {
            if (!canceledAt || canceledAt >= periodStart) {
              metrics.active_at_start.add(sub.id);
            }
          }

          // Was created during period?
          if (createdAt) {
            const createdPeriod = this.formatDateByGranularity(
              createdAt.toISOString(),
              granularity,
            );
            if (createdPeriod === periodKey) {
              metrics.new += 1;
            }
          }

          // Was canceled during period?
          if (canceledAt) {
            const canceledPeriod = this.formatDateByGranularity(
              canceledAt.toISOString(),
              granularity,
            );
            if (canceledPeriod === periodKey) {
              metrics.canceled += 1;
            }
          }
        });
      });
    }

    // Convert to response format
    const data: ChurnRateDataPoint[] = Array.from(periodData.entries())
      .map(([date, metrics]) => {
        const activeAtStart = metrics.active_at_start.size;
        const churnRate =
          activeAtStart > 0 ? (metrics.canceled / activeAtStart) * 100 : 0;
        const retentionRate = 100 - churnRate;

        return {
          date,
          active_at_start: activeAtStart,
          new_subscriptions: metrics.new,
          canceled_subscriptions: metrics.canceled,
          churn_rate: Math.round(churnRate * 100) / 100,
          retention_rate: Math.round(retentionRate * 100) / 100,
        };
      })
      .sort((a, b) => a.date.localeCompare(b.date));

    // Calculate summary
    const avgChurnRate =
      data.length > 0
        ? data.reduce((sum, point) => sum + point.churn_rate, 0) / data.length
        : 0;
    const avgRetentionRate = 100 - avgChurnRate;

    const response: ChurnRateResponseDto = {
      data,
      summary: {
        avg_churn_rate: Math.round(avgChurnRate * 100) / 100,
        avg_retention_rate: Math.round(avgRetentionRate * 100) / 100,
        total_periods: data.length,
      },
      period: {
        start: startDate,
        end: endDate,
      },
      granularity,
    };

    // Cache for 15 minutes
    await this.cacheManager.set(cacheKey, response, 900000);

    this.logger.log(
      `Churn rate for organization ${organizationId}: ${avgChurnRate.toFixed(2)}% average`,
    );

    return response;
  }

  /**
   * Get top customers by revenue
   */
  async getTopCustomers(
    organizationId: string,
    startDate: string,
    endDate: string,
    limit: number = 10,
  ): Promise<TopCustomersResponseDto> {
    const cacheKey = `analytics:${organizationId}:top-customers:${startDate}:${endDate}:${limit}`;

    // Try cache first
    const cached =
      await this.cacheManager.get<TopCustomersResponseDto>(cacheKey);
    if (cached) {
      this.logger.log(
        `Top customers cache HIT for organization ${organizationId}`,
      );
      return cached;
    }

    this.logger.log(
      `Top customers cache MISS for organization ${organizationId}`,
    );

    const supabase = this.supabaseService.getClient();

    // Aggregate revenue by customer
    const { data: payments, error } = await supabase
      .from('payment_intents')
      .select('customer_id, amount, customers!inner(email, name)')
      .eq('organization_id', organizationId)
      .eq('status', 'succeeded')
      .gte('created_at', startDate)
      .lte('created_at', endDate)
      .not('customer_id', 'is', null);

    if (error) {
      this.logger.error(
        `Failed to fetch top customers: ${error.message}`,
        error,
      );
      throw new BadRequestException('Failed to fetch top customers');
    }

    // Group by customer
    const customerRevenue: Map<
      string,
      {
        email: string;
        name: string | null;
        revenue: number;
        count: number;
      }
    > = new Map();

    if (payments && payments.length > 0) {
      payments.forEach((payment) => {
        if (!payment.customer_id) return;

        const customer = payment.customers as any;
        const existing = customerRevenue.get(payment.customer_id);

        if (existing) {
          existing.revenue += payment.amount || 0;
          existing.count += 1;
        } else {
          customerRevenue.set(payment.customer_id, {
            email: customer.email || '',
            name: customer.name || null,
            revenue: payment.amount || 0,
            count: 1,
          });
        }
      });
    }

    // Sort by revenue and take top N
    const sortedCustomers = Array.from(customerRevenue.entries())
      .sort((a, b) => b[1].revenue - a[1].revenue)
      .slice(0, Math.min(limit, 100)); // Max 100

    const data: TopCustomerDto[] = sortedCustomers.map(
      ([customerId, metrics], index) => ({
        customer_id: customerId,
        email: metrics.email,
        name: metrics.name,
        total_revenue: metrics.revenue,
        transaction_count: metrics.count,
        rank: index + 1,
      }),
    );

    // Calculate summary
    const topNRevenue = data.reduce(
      (sum, customer) => sum + customer.total_revenue,
      0,
    );
    const totalRevenue = Array.from(customerRevenue.values()).reduce(
      (sum, c) => sum + c.revenue,
      0,
    );
    const topNPercentage =
      totalRevenue > 0 ? (topNRevenue / totalRevenue) * 100 : 0;

    const response: TopCustomersResponseDto = {
      data,
      summary: {
        total_customers: customerRevenue.size,
        top_n_revenue: topNRevenue,
        top_n_percentage: Math.round(topNPercentage * 100) / 100,
      },
      period: {
        start: startDate,
        end: endDate,
      },
    };

    // Cache for 30 minutes (1800000 milliseconds)
    await this.cacheManager.set(cacheKey, response, 1800000);

    this.logger.log(
      `Top customers for organization ${organizationId}: ${data.length} results`,
    );

    return response;
  }

  /**
   * Get Average Revenue Per User (ARPU)
   * Formula: MRR / Active Customers
   */
  async getARPU(organizationId: string): Promise<ARPUResponseDto> {
    const cacheKey = `analytics:${organizationId}:arpu`;

    // Try cache first
    const cached = await this.cacheManager.get<ARPUResponseDto>(cacheKey);
    if (cached) {
      this.logger.log(`ARPU cache HIT for organization ${organizationId}`);
      return cached;
    }

    this.logger.log(`ARPU cache MISS for organization ${organizationId}`);

    const supabase = this.supabaseService.getClient();

    // Get MRR (reuse existing logic but inline for better performance)
    const { data: subscriptions, error: mrrError } = await supabase
      .from('subscriptions')
      .select(
        `
        amount,
        products!inner (
          recurring_interval,
          recurring_interval_count
        )
      `,
      )
      .eq('organization_id', organizationId)
      .in('status', ['active', 'trialing'])
      .eq('cancel_at_period_end', false);

    if (mrrError) {
      this.logger.error(`Failed to calculate ARPU: ${mrrError.message}`, mrrError);
      throw new BadRequestException('Failed to calculate ARPU');
    }

    // Calculate MRR
    let mrr = 0;
    if (subscriptions && subscriptions.length > 0) {
      mrr = subscriptions.reduce((sum, sub) => {
        const product = sub.products as any;
        let normalizedAmount = sub.amount || 0;

        switch (product.recurring_interval) {
          case 'year':
            normalizedAmount = Math.round(normalizedAmount / 12);
            break;
          case 'month':
            break;
          case 'week':
            normalizedAmount = Math.round(normalizedAmount * 4);
            break;
          case 'day':
            normalizedAmount = Math.round(normalizedAmount * 30);
            break;
        }

        return sum + normalizedAmount;
      }, 0);
    }

    // Count distinct active customers
    const { data: customerData, error: customerError } = await supabase
      .from('subscriptions')
      .select('customer_id')
      .eq('organization_id', organizationId)
      .in('status', ['active', 'trialing']);

    if (customerError) {
      this.logger.error(
        `Failed to count active customers: ${customerError.message}`,
        customerError,
      );
      throw new BadRequestException('Failed to calculate ARPU');
    }

    const activeCustomers = new Set(
      customerData?.map((s) => s.customer_id) || [],
    ).size;

    const arpu = activeCustomers > 0 ? Math.round(mrr / activeCustomers) : 0;

    const response: ARPUResponseDto = {
      arpu,
      mrr,
      active_customers: activeCustomers,
      currency: 'usd',
      cached_at: new Date().toISOString(),
    };

    // Cache for 5 minutes (same as MRR)
    await this.cacheManager.set(cacheKey, response, 300000);

    this.logger.log(
      `ARPU for organization ${organizationId}: ${arpu} (MRR: ${mrr}, Customers: ${activeCustomers})`,
    );

    return response;
  }

  /**
   * Get usage overview for an organization
   * Aggregates total consumption, active metered customers, at-limit count, features tracked
   */
  async getUsageOverview(organizationId: string): Promise<UsageOverviewResponseDto> {
    const cacheKey = `analytics:${organizationId}:usage-overview`;

    const cached = await this.cacheManager.get<UsageOverviewResponseDto>(cacheKey);
    if (cached) return cached;

    const supabase = this.supabaseService.getClient();

    // Get current period usage records for this org's features
    const { data: records, error } = await supabase
      .from('usage_records')
      .select(`
        consumed_units,
        limit_units,
        customer_id,
        feature_id,
        features!inner (
          id,
          organization_id
        )
      `)
      .eq('features.organization_id', organizationId)
      .gte('period_end', new Date().toISOString());

    if (error) {
      this.logger.error(`Failed to fetch usage overview: ${error.message}`);
      throw new BadRequestException('Failed to fetch usage overview');
    }

    const totalConsumption = (records || []).reduce((sum, r) => sum + (r.consumed_units || 0), 0);
    const uniqueCustomers = new Set((records || []).map(r => r.customer_id));
    const atLimitCount = (records || []).filter(
      r => r.limit_units && r.limit_units > 0 && (r.consumed_units || 0) >= r.limit_units,
    ).length;
    const uniqueFeatures = new Set((records || []).map(r => r.feature_id));

    const response: UsageOverviewResponseDto = {
      total_consumption: totalConsumption,
      active_metered_customers: uniqueCustomers.size,
      at_limit_count: atLimitCount,
      features_tracked: uniqueFeatures.size,
      as_of: new Date().toISOString(),
    };

    await this.cacheManager.set(cacheKey, response, 300000);
    return response;
  }

  /**
   * Get usage breakdown by feature for an organization
   */
  async getUsageByFeature(organizationId: string): Promise<UsageByFeatureResponseDto> {
    const cacheKey = `analytics:${organizationId}:usage-by-feature`;

    const cached = await this.cacheManager.get<UsageByFeatureResponseDto>(cacheKey);
    if (cached) return cached;

    const supabase = this.supabaseService.getClient();

    const { data: records, error } = await supabase
      .from('usage_records')
      .select(`
        consumed_units,
        limit_units,
        customer_id,
        features!inner (
          id,
          name,
          title,
          organization_id
        )
      `)
      .eq('features.organization_id', organizationId)
      .gte('period_end', new Date().toISOString());

    if (error) {
      this.logger.error(`Failed to fetch usage by feature: ${error.message}`);
      throw new BadRequestException('Failed to fetch usage by feature');
    }

    // Group by feature
    const featureMap = new Map<string, {
      feature_key: string;
      feature_title: string;
      total_consumed: number;
      customers: Set<string>;
      at_limit: number;
    }>();

    (records || []).forEach((r: any) => {
      const featureId = r.features?.id;
      if (!featureId) return;

      const existing = featureMap.get(featureId) || {
        feature_key: r.features.name,
        feature_title: r.features.title || r.features.name,
        total_consumed: 0,
        customers: new Set<string>(),
        at_limit: 0,
      };

      existing.total_consumed += r.consumed_units || 0;
      existing.customers.add(r.customer_id);
      if (r.limit_units && r.limit_units > 0 && (r.consumed_units || 0) >= r.limit_units) {
        existing.at_limit += 1;
      }

      featureMap.set(featureId, existing);
    });

    const data = Array.from(featureMap.values()).map(f => ({
      feature_key: f.feature_key,
      feature_title: f.feature_title,
      total_consumed: f.total_consumed,
      avg_per_customer: f.customers.size > 0 ? Math.round(f.total_consumed / f.customers.size) : 0,
      customer_count: f.customers.size,
      at_limit_count: f.at_limit,
    }));

    const response: UsageByFeatureResponseDto = {
      data,
      organization_id: organizationId,
      as_of: new Date().toISOString(),
    };

    await this.cacheManager.set(cacheKey, response, 300000);
    return response;
  }

  /**
   * Get customers at risk of hitting their usage limits
   */
  async getAtRiskCustomers(
    organizationId: string,
    threshold: number = 80,
  ): Promise<AtRiskCustomersResponseDto> {
    const cacheKey = `analytics:${organizationId}:at-risk:${threshold}`;

    const cached = await this.cacheManager.get<AtRiskCustomersResponseDto>(cacheKey);
    if (cached) return cached;

    const supabase = this.supabaseService.getClient();

    // Step 1: Get usage records with features for this org
    const { data: records, error } = await supabase
      .from('usage_records')
      .select(`
        consumed_units,
        limit_units,
        period_end,
        customer_id,
        feature_id,
        features!inner (
          name,
          organization_id
        )
      `)
      .eq('features.organization_id', organizationId)
      .gte('period_end', new Date().toISOString())
      .gt('limit_units', 0);

    if (error) {
      this.logger.error(`Failed to fetch at-risk usage records: ${error.message}`);
      throw new BadRequestException('Failed to fetch at-risk customers');
    }

    // Step 2: Get customer details for the customer IDs found
    const customerIds = [...new Set((records || []).map(r => r.customer_id))];
    const customerMap = new Map<string, { external_user_id: string; email: string }>();

    if (customerIds.length > 0) {
      const { data: customers } = await supabase
        .from('customers')
        .select('id, external_user_id, email')
        .in('id', customerIds);

      (customers || []).forEach((c: any) => {
        customerMap.set(c.id, { external_user_id: c.external_user_id || '', email: c.email || '' });
      });
    }

    const atRisk = (records || [])
      .filter((r: any) => {
        const pct = ((r.consumed_units || 0) / r.limit_units) * 100;
        return pct >= threshold;
      })
      .map((r: any) => {
        const customer = customerMap.get(r.customer_id);
        return {
          customer_id: r.customer_id,
          external_id: customer?.external_user_id || '',
          email: customer?.email || '',
          feature_key: r.features?.name || '',
          consumed: r.consumed_units || 0,
          limit: r.limit_units,
          percentage_used: Math.round(((r.consumed_units || 0) / r.limit_units) * 100),
          resets_at: r.period_end,
        };
      })
      .sort((a: any, b: any) => b.percentage_used - a.percentage_used);

    const response: AtRiskCustomersResponseDto = {
      data: atRisk,
      threshold,
      total_at_risk: atRisk.length,
      as_of: new Date().toISOString(),
    };

    await this.cacheManager.set(cacheKey, response, 300000);
    return response;
  }

  /**
   * Get usage trends for a specific feature over time
   */
  async getUsageTrends(
    organizationId: string,
    featureName: string,
    periodDays: number = 30,
  ): Promise<UsageTrendsResponseDto> {
    const cacheKey = `analytics:${organizationId}:usage-trends:${featureName}:${periodDays}`;

    const cached = await this.cacheManager.get<UsageTrendsResponseDto>(cacheKey);
    if (cached) return cached;

    const supabase = this.supabaseService.getClient();

    const startDate = new Date(Date.now() - periodDays * 24 * 60 * 60 * 1000).toISOString();

    const { data: records, error } = await supabase
      .from('usage_records')
      .select(`
        consumed_units,
        period_start,
        customer_id,
        features!inner (
          name,
          organization_id
        )
      `)
      .eq('features.organization_id', organizationId)
      .eq('features.name', featureName)
      .gte('period_start', startDate)
      .order('period_start', { ascending: true });

    if (error) {
      this.logger.error(`Failed to fetch usage trends: ${error.message}`);
      throw new BadRequestException('Failed to fetch usage trends');
    }

    // Group by period_start date
    const dateMap = new Map<string, { consumed: number; customers: Set<string> }>();

    (records || []).forEach((r: any) => {
      const date = r.period_start ? new Date(r.period_start).toISOString().split('T')[0] : null;
      if (!date) return;

      const existing = dateMap.get(date) || { consumed: 0, customers: new Set<string>() };
      existing.consumed += r.consumed_units || 0;
      existing.customers.add(r.customer_id);
      dateMap.set(date, existing);
    });

    const data = Array.from(dateMap.entries())
      .map(([date, metrics]) => ({
        date,
        consumed: metrics.consumed,
        customer_count: metrics.customers.size,
      }))
      .sort((a, b) => a.date.localeCompare(b.date));

    const response: UsageTrendsResponseDto = {
      feature_key: featureName,
      data,
      period: periodDays,
    };

    await this.cacheManager.set(cacheKey, response, 900000);
    return response;
  }

  /**
   * Invalidate all analytics caches for an organization
   * Call this when subscriptions or payments change
   *
   * Note: For pattern-based cache invalidation (sub-growth:*, revenue-trend:*),
   * we would need Redis-specific commands. For now, we invalidate specific keys.
   * Time-based caches will naturally expire after 15 minutes.
   */
  async invalidateAnalyticsCache(organizationId: string): Promise<void> {
    try {
      // Delete specific cache keys that change frequently
      await this.cacheManager.del(`analytics:${organizationId}:mrr`);
      await this.cacheManager.del(
        `analytics:${organizationId}:active-subscriptions`,
      );
      await this.cacheManager.del(`analytics:${organizationId}:arpu`);

      // Note: Time-series caches (revenue-trend, sub-growth, churn-rate, top-customers)
      // have 15-30 min TTL and will naturally expire. Pattern-based deletion would
      // require direct Redis client access, which can be added if needed.

      this.logger.log(
        `Invalidated analytics cache for organization ${organizationId}`,
      );
    } catch (error) {
      this.logger.error(
        `Failed to invalidate analytics cache: ${error.message}`,
        error,
      );
      // Don't throw - cache invalidation failure shouldn't block operations
    }
  }
}

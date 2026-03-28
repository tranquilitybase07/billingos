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
import { ConversionFunnelResponseDto } from './dto/conversion-funnel-response.dto';
import { DashboardOverviewResponseDto } from './dto/dashboard-overview.dto';
import {
  ActivityFeedItemDto,
  ActivityFeedResponseDto,
} from './dto/activity-feed.dto';
import { Granularity } from './dto/analytics-query.dto';
import {
  ProductSubscribersResponseDto,
  ProductSubscriberDataPoint,
} from './dto/product-subscribers-response.dto';
import { StripeService } from '../stripe/stripe.service';

@Injectable()
export class AnalyticsService {
  private readonly logger = new Logger(AnalyticsService.name);

  constructor(
    private readonly supabaseService: SupabaseService,
    private readonly stripeService: StripeService,
    @Inject(CACHE_MANAGER) private cacheManager: Cache,
  ) {}

  /**
   * Resolve the Stripe Connect account ID for an organization.
   * Returns null if the org hasn't connected Stripe yet.
   */
  private async getStripeAccountId(
    organizationId: string,
  ): Promise<string | null> {
    const supabase = this.supabaseService.getClient();
    const { data: org } = await supabase
      .from('organizations')
      .select('account_id')
      .eq('id', organizationId)
      .is('deleted_at', null)
      .single();
    if (!org?.account_id) return null;
    const { data: account } = await supabase
      .from('accounts')
      .select('stripe_id')
      .eq('id', org.account_id)
      .single();
    return account?.stripe_id || null;
  }

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

    // Resolve Stripe Connect account for this org
    const stripeAccountId = await this.getStripeAccountId(organizationId);

    // Group by date based on granularity
    const grouped: Record<
      string,
      { revenue: number; transaction_count: number }
    > = {};

    if (stripeAccountId) {
      const startDateUnix = Math.floor(new Date(startDate).getTime() / 1000);
      const endDateUnix = Math.floor(new Date(endDate).getTime() / 1000);

      const invoices = await this.stripeService.listInvoices(stripeAccountId, {
        status: 'paid',
        created: { gte: startDateUnix, lte: endDateUnix },
      });

      invoices.forEach((invoice) => {
        const createdAt = new Date(invoice.created * 1000).toISOString();
        const date = this.formatDateByGranularity(createdAt, granularity);

        if (!grouped[date]) {
          grouped[date] = { revenue: 0, transaction_count: 0 };
        }

        grouped[date].revenue += invoice.amount_paid || 0;
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
    const growth: Record<string, { new: number; canceled: number }> = {};

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
        const date = this.formatDateByGranularity(sub.canceled_at, granularity);
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

      case Granularity.WEEK: {
        // Get Monday of the week
        const day = date.getDay();
        const diff = date.getDate() - day + (day === 0 ? -6 : 1);
        const monday = new Date(date.setDate(diff));
        return monday.toISOString().split('T')[0];
      }

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
    const cached = await this.cacheManager.get<ChurnRateResponseDto>(cacheKey);
    if (cached) {
      this.logger.log(
        `Churn rate cache HIT for organization ${organizationId}`,
      );
      return cached;
    }

    this.logger.log(`Churn rate cache MISS for organization ${organizationId}`);

    const supabase = this.supabaseService.getClient();

    // Get all subscriptions to track active count at start of each period
    const { data: allSubs, error: allError } = await supabase
      .from('subscriptions')
      .select('id, created_at, canceled_at, status')
      .eq('organization_id', organizationId)
      .or(
        `created_at.lte.${endDate},and(canceled_at.gte.${startDate},canceled_at.lte.${endDate})`,
      );

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
    const current = new Date(start);

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
          const canceledAt = sub.canceled_at ? new Date(sub.canceled_at) : null;

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

    // Resolve Stripe Connect account for this org
    const stripeAccountId = await this.getStripeAccountId(organizationId);

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

    if (stripeAccountId) {
      const startDateUnix = Math.floor(new Date(startDate).getTime() / 1000);
      const endDateUnix = Math.floor(new Date(endDate).getTime() / 1000);

      // Fetch paid invoices from Stripe
      const invoices = await this.stripeService.listInvoices(stripeAccountId, {
        status: 'paid',
        created: { gte: startDateUnix, lte: endDateUnix },
      });

      // Batch-fetch BOS customers for this org to resolve Stripe customer IDs
      const { data: customers } = await supabase
        .from('customers')
        .select('id, stripe_customer_id, email, name')
        .eq('organization_id', organizationId);

      const customerMap = new Map(
        customers?.map((c) => [c.stripe_customer_id, c]) || [],
      );

      invoices.forEach((invoice) => {
        const stripeCustomerId =
          typeof invoice.customer === 'string'
            ? invoice.customer
            : invoice.customer?.id;
        if (!stripeCustomerId) return;

        const bosCustomer = customerMap.get(stripeCustomerId);
        if (!bosCustomer) return;

        const existing = customerRevenue.get(bosCustomer.id);

        if (existing) {
          existing.revenue += invoice.amount_paid || 0;
          existing.count += 1;
        } else {
          customerRevenue.set(bosCustomer.id, {
            email: bosCustomer.email || '',
            name: bosCustomer.name || null,
            revenue: invoice.amount_paid || 0,
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
      this.logger.error(
        `Failed to calculate ARPU: ${mrrError.message}`,
        mrrError,
      );
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
  async getUsageOverview(
    organizationId: string,
  ): Promise<UsageOverviewResponseDto> {
    const cacheKey = `analytics:${organizationId}:usage-overview`;

    const cached =
      await this.cacheManager.get<UsageOverviewResponseDto>(cacheKey);
    if (cached) return cached;

    const supabase = this.supabaseService.getClient();

    // Get current period usage records for this org's features
    const { data: records, error } = await supabase
      .from('usage_records')
      .select(
        `
        consumed_units,
        limit_units,
        customer_id,
        feature_id,
        features!inner (
          id,
          organization_id
        )
      `,
      )
      .eq('features.organization_id', organizationId)
      .gte('period_end', new Date().toISOString());

    if (error) {
      this.logger.error(`Failed to fetch usage overview: ${error.message}`);
      throw new BadRequestException('Failed to fetch usage overview');
    }

    const totalConsumption = (records || []).reduce(
      (sum, r) => sum + (r.consumed_units || 0),
      0,
    );
    const uniqueCustomers = new Set((records || []).map((r) => r.customer_id));
    const atLimitCount = (records || []).filter(
      (r) =>
        r.limit_units &&
        r.limit_units > 0 &&
        (r.consumed_units || 0) >= r.limit_units,
    ).length;
    const uniqueFeatures = new Set((records || []).map((r) => r.feature_id));

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
  async getUsageByFeature(
    organizationId: string,
  ): Promise<UsageByFeatureResponseDto> {
    const cacheKey = `analytics:${organizationId}:usage-by-feature`;

    const cached =
      await this.cacheManager.get<UsageByFeatureResponseDto>(cacheKey);
    if (cached) return cached;

    const supabase = this.supabaseService.getClient();

    const { data: records, error } = await supabase
      .from('usage_records')
      .select(
        `
        consumed_units,
        limit_units,
        customer_id,
        features!inner (
          id,
          name,
          title,
          organization_id
        )
      `,
      )
      .eq('features.organization_id', organizationId)
      .gte('period_end', new Date().toISOString());

    if (error) {
      this.logger.error(`Failed to fetch usage by feature: ${error.message}`);
      throw new BadRequestException('Failed to fetch usage by feature');
    }

    // Group by feature
    const featureMap = new Map<
      string,
      {
        feature_key: string;
        feature_title: string;
        total_consumed: number;
        customers: Set<string>;
        at_limit: number;
      }
    >();

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
      if (
        r.limit_units &&
        r.limit_units > 0 &&
        (r.consumed_units || 0) >= r.limit_units
      ) {
        existing.at_limit += 1;
      }

      featureMap.set(featureId, existing);
    });

    const data = Array.from(featureMap.values()).map((f) => ({
      feature_key: f.feature_key,
      feature_title: f.feature_title,
      total_consumed: f.total_consumed,
      avg_per_customer:
        f.customers.size > 0
          ? Math.round(f.total_consumed / f.customers.size)
          : 0,
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
    const cacheKey = `analytics:v3:${organizationId}:at-risk:${threshold}`;

    const cached =
      await this.cacheManager.get<AtRiskCustomersResponseDto>(cacheKey);
    if (cached) return cached;

    const supabase = this.supabaseService.getClient();

    // Step 1: Get usage records with features for this org
    const { data: records, error } = await supabase
      .from('usage_records')
      .select(
        `
        consumed_units,
        limit_units,
        period_end,
        customer_id,
        feature_id,
        customers (
          id,
          name,
          email,
          external_id
        ),
        features!inner (
          name,
          organization_id
        )
      `,
      )
      .eq('features.organization_id', organizationId)
      .gte('period_end', new Date().toISOString())
      .gt('limit_units', 0);

    if (error) {
      this.logger.error(
        `Failed to fetch at-risk usage records: ${error.message}`,
      );
      throw new BadRequestException('Failed to fetch at-risk customers');
    }

    const atRisk = (records || [])
      .filter((r: any) => {
        const pct = ((r.consumed_units || 0) / r.limit_units) * 100;
        return pct >= threshold;
      })
      .map((r: any) => {
        const customer = Array.isArray(r.customers)
          ? r.customers[0]
          : r.customers;
        return {
          customer_id: r.customer_id,
          name:
            customer?.name ||
            (customer?.email ? String(customer.email).split('@')[0] : '') ||
            '',
          external_id: customer?.external_id || '',
          email: customer?.email || '',
          feature_key: r.features?.name || '',
          consumed: r.consumed_units || 0,
          limit: r.limit_units,
          percentage_used: Math.round(
            ((r.consumed_units || 0) / r.limit_units) * 100,
          ),
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

    const cached =
      await this.cacheManager.get<UsageTrendsResponseDto>(cacheKey);
    if (cached) return cached;

    const supabase = this.supabaseService.getClient();

    const startDate = new Date(
      Date.now() - periodDays * 24 * 60 * 60 * 1000,
    ).toISOString();

    const { data: records, error } = await supabase
      .from('usage_records')
      .select(
        `
        consumed_units,
        period_start,
        customer_id,
        features!inner (
          name,
          organization_id
        )
      `,
      )
      .eq('features.organization_id', organizationId)
      .eq('features.name', featureName)
      .gte('period_start', startDate)
      .order('period_start', { ascending: true });

    if (error) {
      this.logger.error(`Failed to fetch usage trends: ${error.message}`);
      throw new BadRequestException('Failed to fetch usage trends');
    }

    // Group by period_start date
    const dateMap = new Map<
      string,
      { consumed: number; customers: Set<string> }
    >();

    (records || []).forEach((r: any) => {
      const date = r.period_start
        ? new Date(r.period_start).toISOString().split('T')[0]
        : null;
      if (!date) return;

      const existing = dateMap.get(date) || {
        consumed: 0,
        customers: new Set<string>(),
      };
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
   * Get dashboard overview — aggregated KPIs with sparklines
   */
  async getDashboardOverview(
    organizationId: string,
  ): Promise<DashboardOverviewResponseDto> {
    const cacheKey = `analytics:${organizationId}:dashboard-overview`;

    const cached =
      await this.cacheManager.get<DashboardOverviewResponseDto>(cacheKey);
    if (cached) {
      this.logger.log(
        `Dashboard overview cache HIT for organization ${organizationId}`,
      );
      return cached;
    }

    this.logger.log(
      `Dashboard overview cache MISS for organization ${organizationId}`,
    );

    const supabase = this.supabaseService.getClient();
    const now = new Date();
    const thirtyDaysAgo = new Date(
      now.getTime() - 30 * 24 * 60 * 60 * 1000,
    ).toISOString();
    const sixtyDaysAgo = new Date(
      now.getTime() - 60 * 24 * 60 * 60 * 1000,
    ).toISOString();
    const nowISO = now.toISOString();

    // --- MRR ---
    const { data: currentSubs } = await supabase
      .from('subscriptions')
      .select(
        `amount, products!inner (recurring_interval, recurring_interval_count)`,
      )
      .eq('organization_id', organizationId)
      .in('status', ['active', 'trialing'])
      .eq('cancel_at_period_end', false);

    const normalizeMRR = (subs: typeof currentSubs) => {
      if (!subs || subs.length === 0) return 0;
      return subs.reduce((sum, sub) => {
        const product = sub.products as any;
        let amt = sub.amount || 0;
        switch (product.recurring_interval) {
          case 'year':
            amt = Math.round(amt / 12);
            break;
          case 'week':
            amt = Math.round(amt * 4);
            break;
          case 'day':
            amt = Math.round(amt * 30);
            break;
        }
        return sum + amt;
      }, 0);
    };

    const currentMRR = normalizeMRR(currentSubs);

    // Previous MRR: subs active 30 days ago
    const { data: prevSubs } = await supabase
      .from('subscriptions')
      .select(
        `amount, products!inner (recurring_interval, recurring_interval_count)`,
      )
      .eq('organization_id', organizationId)
      .in('status', ['active', 'trialing'])
      .lte('created_at', thirtyDaysAgo);

    const previousMRR = normalizeMRR(prevSubs);

    // MRR sparkline: daily revenue from payment_intents (last 30 days)
    const { data: revenuePayments } = await supabase
      .from('payment_intents')
      .select('amount, created_at')
      .eq('organization_id', organizationId)
      .eq('status', 'succeeded')
      .gte('created_at', thirtyDaysAgo)
      .lte('created_at', nowISO)
      .order('created_at', { ascending: true });

    const mrrSparkline = this.buildDailySparkline(
      revenuePayments || [],
      30,
      'sum',
    );

    // --- Active Subscriptions ---
    const { count: currentActiveSubs } = await supabase
      .from('subscriptions')
      .select('*', { count: 'exact', head: true })
      .eq('organization_id', organizationId)
      .in('status', ['active', 'trialing']);

    const { count: prevActiveSubs } = await supabase
      .from('subscriptions')
      .select('*', { count: 'exact', head: true })
      .eq('organization_id', organizationId)
      .in('status', ['active', 'trialing'])
      .lte('created_at', thirtyDaysAgo);

    const activeSubsCurrent = currentActiveSubs || 0;
    const activeSubsPrevious = prevActiveSubs || 0;

    // Active subs sparkline: daily count of subscriptions created
    const { data: newSubsRaw } = await supabase
      .from('subscriptions')
      .select('created_at')
      .eq('organization_id', organizationId)
      .gte('created_at', thirtyDaysAgo)
      .lte('created_at', nowISO);

    const activeSubsSparkline = this.buildDailySparkline(
      newSubsRaw || [],
      30,
      'count',
    );

    // --- New Customers ---
    const { count: currentNewCustomers } = await supabase
      .from('customers')
      .select('*', { count: 'exact', head: true })
      .eq('organization_id', organizationId)
      .is('deleted_at', null)
      .gte('created_at', thirtyDaysAgo)
      .lte('created_at', nowISO);

    const { count: prevNewCustomers } = await supabase
      .from('customers')
      .select('*', { count: 'exact', head: true })
      .eq('organization_id', organizationId)
      .is('deleted_at', null)
      .gte('created_at', sixtyDaysAgo)
      .lte('created_at', thirtyDaysAgo);

    const newCustomersCurrent = currentNewCustomers || 0;
    const newCustomersPrevious = prevNewCustomers || 0;

    const { data: newCustomersRaw } = await supabase
      .from('customers')
      .select('created_at')
      .eq('organization_id', organizationId)
      .is('deleted_at', null)
      .gte('created_at', thirtyDaysAgo)
      .lte('created_at', nowISO);

    const newCustomersSparkline = this.buildDailySparkline(
      newCustomersRaw || [],
      30,
      'count',
    );

    // --- Churn Rate ---
    const { count: canceledCurrent } = await supabase
      .from('subscriptions')
      .select('*', { count: 'exact', head: true })
      .eq('organization_id', organizationId)
      .not('canceled_at', 'is', null)
      .gte('canceled_at', thirtyDaysAgo)
      .lte('canceled_at', nowISO);

    const { count: canceledPrevious } = await supabase
      .from('subscriptions')
      .select('*', { count: 'exact', head: true })
      .eq('organization_id', organizationId)
      .not('canceled_at', 'is', null)
      .gte('canceled_at', sixtyDaysAgo)
      .lte('canceled_at', thirtyDaysAgo);

    const churnCurrent =
      activeSubsCurrent > 0
        ? Math.round(((canceledCurrent || 0) / activeSubsCurrent) * 10000) / 100
        : 0;
    const churnPrevious =
      activeSubsPrevious > 0
        ? Math.round(
            ((canceledPrevious || 0) / activeSubsPrevious) * 10000,
          ) / 100
        : 0;

    const { data: canceledRaw } = await supabase
      .from('subscriptions')
      .select('canceled_at')
      .eq('organization_id', organizationId)
      .not('canceled_at', 'is', null)
      .gte('canceled_at', thirtyDaysAgo)
      .lte('canceled_at', nowISO);

    const churnSparkline = this.buildDailySparkline(
      (canceledRaw || []).map((r) => ({
        created_at: r.canceled_at,
        amount: null,
      })),
      30,
      'count',
    );

    const calcChange = (current: number, previous: number): number => {
      if (previous === 0) return current > 0 ? 100 : 0;
      return Math.round(((current - previous) / previous) * 10000) / 100;
    };

    const response: DashboardOverviewResponseDto = {
      mrr: {
        current: currentMRR,
        previous: previousMRR,
        change_percent: calcChange(currentMRR, previousMRR),
        sparkline: mrrSparkline,
      },
      active_subscriptions: {
        current: activeSubsCurrent,
        previous: activeSubsPrevious,
        change_percent: calcChange(activeSubsCurrent, activeSubsPrevious),
        sparkline: activeSubsSparkline,
      },
      new_customers: {
        current: newCustomersCurrent,
        previous: newCustomersPrevious,
        change_percent: calcChange(newCustomersCurrent, newCustomersPrevious),
        sparkline: newCustomersSparkline,
      },
      churn_rate: {
        current: churnCurrent,
        previous: churnPrevious,
        change_percent: calcChange(churnCurrent, churnPrevious),
        sparkline: churnSparkline,
      },
      currency: 'usd',
    };

    await this.cacheManager.set(cacheKey, response, 300000);

    this.logger.log(
      `Dashboard overview for organization ${organizationId}: MRR=${currentMRR}`,
    );

    return response;
  }

  /**
   * Build a daily sparkline array for the last N days
   */
  private buildDailySparkline(
    records: { created_at?: string | null; amount?: number | null }[],
    days: number,
    mode: 'count' | 'sum',
  ): number[] {
    const result: number[] = new Array(days).fill(0);
    const now = new Date();

    records.forEach((r) => {
      if (!r.created_at) return;
      const date = new Date(r.created_at);
      const diffDays = Math.floor(
        (now.getTime() - date.getTime()) / (24 * 60 * 60 * 1000),
      );
      const index = days - 1 - diffDays;
      if (index >= 0 && index < days) {
        if (mode === 'count') {
          result[index] += 1;
        } else {
          result[index] += r.amount || 0;
        }
      }
    });

    return result;
  }

  /**
   * Get activity feed — recent financial events
   */
  async getActivityFeed(
    organizationId: string,
    limit: number = 10,
  ): Promise<ActivityFeedResponseDto> {
    const cacheKey = `analytics:${organizationId}:activity-feed:${limit}`;

    const cached =
      await this.cacheManager.get<ActivityFeedResponseDto>(cacheKey);
    if (cached) {
      this.logger.log(
        `Activity feed cache HIT for organization ${organizationId}`,
      );
      return cached;
    }

    this.logger.log(
      `Activity feed cache MISS for organization ${organizationId}`,
    );

    const supabase = this.supabaseService.getClient();
    const events: ActivityFeedItemDto[] = [];

    // New subscriptions + trials
    const { data: newSubs } = await supabase
      .from('subscriptions')
      .select(
        `id, status, amount, created_at, customers!inner(name, email), products!inner(name)`,
      )
      .eq('organization_id', organizationId)
      .order('created_at', { ascending: false })
      .limit(limit);

    if (newSubs) {
      newSubs.forEach((sub: any) => {
        const type =
          sub.status === 'trialing' ? 'trial_started' : 'new_subscription';
        events.push({
          id: `sub_${sub.id}`,
          type,
          customer_name: sub.customers?.name || null,
          customer_email: sub.customers?.email || '',
          product_name: sub.products?.name || '',
          amount: sub.amount,
          currency: 'usd',
          occurred_at: sub.created_at,
        });
      });
    }

    // Successful payments
    const { data: payments } = await supabase
      .from('payment_intents')
      .select(`id, amount, created_at, customers!inner(name, email)`)
      .eq('organization_id', organizationId)
      .eq('status', 'succeeded')
      .order('created_at', { ascending: false })
      .limit(limit);

    if (payments) {
      payments.forEach((p: any) => {
        events.push({
          id: `pay_${p.id}`,
          type: 'payment_succeeded',
          customer_name: p.customers?.name || null,
          customer_email: p.customers?.email || '',
          product_name: '',
          amount: p.amount,
          currency: 'usd',
          occurred_at: p.created_at,
        });
      });
    }

    // Canceled subscriptions
    const { data: canceledSubs } = await supabase
      .from('subscriptions')
      .select(
        `id, canceled_at, customers!inner(name, email), products!inner(name)`,
      )
      .eq('organization_id', organizationId)
      .not('canceled_at', 'is', null)
      .order('canceled_at', { ascending: false })
      .limit(limit);

    if (canceledSubs) {
      canceledSubs.forEach((sub: any) => {
        events.push({
          id: `cancel_${sub.id}`,
          type: 'subscription_canceled',
          customer_name: sub.customers?.name || null,
          customer_email: sub.customers?.email || '',
          product_name: sub.products?.name || '',
          amount: null,
          currency: 'usd',
          occurred_at: sub.canceled_at,
        });
      });
    }

    // Sort all events by occurred_at DESC
    events.sort(
      (a, b) =>
        new Date(b.occurred_at).getTime() - new Date(a.occurred_at).getTime(),
    );

    const trimmed = events.slice(0, limit);

    const response: ActivityFeedResponseDto = {
      data: trimmed,
      total: trimmed.length,
    };

    // Cache for 2 minutes
    await this.cacheManager.set(cacheKey, response, 120000);

    this.logger.log(
      `Activity feed for organization ${organizationId}: ${trimmed.length} events`,
    );

    return response;
  }

  /**
   * Get subscriber distribution across products
   */
  async getProductSubscribers(
    organizationId: string,
  ): Promise<ProductSubscribersResponseDto> {
    const cacheKey = `analytics:${organizationId}:product-subscribers`;

    const cached =
      await this.cacheManager.get<ProductSubscribersResponseDto>(cacheKey);
    if (cached) return cached;

    const supabase = this.supabaseService.getClient();

    const { data: subscriptions, error } = await supabase
      .from('subscriptions')
      .select('product_id, products!inner(name)')
      .eq('organization_id', organizationId)
      .in('status', ['active', 'trialing']);

    if (error) {
      this.logger.error(
        `Failed to fetch product subscribers: ${error.message}`,
      );
      throw new BadRequestException('Failed to fetch product subscribers');
    }

    // Aggregate by product_id
    const productMap = new Map<
      string,
      { name: string; count: number }
    >();

    (subscriptions || []).forEach((sub: any) => {
      const productId = sub.product_id;
      const productName = sub.products?.name || 'Unknown';
      const existing = productMap.get(productId);
      if (existing) {
        existing.count += 1;
      } else {
        productMap.set(productId, { name: productName, count: 1 });
      }
    });

    const data: ProductSubscriberDataPoint[] = Array.from(
      productMap.entries(),
    ).map(([productId, info]) => ({
      product_id: productId,
      product_name: info.name,
      subscriber_count: info.count,
    }));

    // Sort by subscriber_count descending
    data.sort((a, b) => b.subscriber_count - a.subscriber_count);

    const totalSubscribers = data.reduce(
      (sum, d) => sum + d.subscriber_count,
      0,
    );

    const response: ProductSubscribersResponseDto = {
      data,
      total_subscribers: totalSubscribers,
    };

    // Cache for 15 minutes
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

  /**
   * Get subscription conversion funnel
   * Stages: Sign-ups / Leads → Free Trial Users → Paying Customers
   */
  async getConversionFunnel(
    organizationId: string,
  ): Promise<ConversionFunnelResponseDto> {
    const cacheKey = `analytics:${organizationId}:conversion-funnel`;

    const cached =
      await this.cacheManager.get<ConversionFunnelResponseDto>(cacheKey);
    if (cached) {
      this.logger.log(
        `Conversion funnel cache HIT for organization ${organizationId}`,
      );
      return cached;
    }

    this.logger.log(
      `Conversion funnel cache MISS for organization ${organizationId}`,
    );

    const supabase = this.supabaseService.getClient();

    // Stage 1: Total customers
    const { count: totalCustomers, error: customersError } = await supabase
      .from('customers')
      .select('*', { count: 'exact', head: true })
      .eq('organization_id', organizationId)
      .is('deleted_at', null);

    if (customersError) {
      this.logger.error(
        `Failed to count customers: ${customersError.message}`,
        customersError,
      );
      throw new BadRequestException('Failed to fetch conversion funnel');
    }

    // Stage 2: Free Trial Users — customers currently trialing
    const { data: trialingCustomers, error: trialingError } = await supabase
      .from('subscriptions')
      .select('customer_id')
      .eq('organization_id', organizationId)
      .eq('status', 'trialing');

    if (trialingError) {
      this.logger.error(
        `Failed to count trialing customers: ${trialingError.message}`,
        trialingError,
      );
      throw new BadRequestException('Failed to fetch conversion funnel');
    }

    const uniqueTrialing = new Set(
      (trialingCustomers ?? []).map((s) => s.customer_id),
    ).size;

    // Stage 3: Paying Customers — active subscriptions
    const { data: activeCustomers, error: activeError } = await supabase
      .from('subscriptions')
      .select('customer_id')
      .eq('organization_id', organizationId)
      .eq('status', 'active');

    if (activeError) {
      this.logger.error(
        `Failed to count active customers: ${activeError.message}`,
        activeError,
      );
      throw new BadRequestException('Failed to fetch conversion funnel');
    }

    const uniqueActive = new Set(
      (activeCustomers ?? []).map((s) => s.customer_id),
    ).size;

    const top = totalCustomers ?? 0;
    const overallRate =
      top > 0 ? Math.round((uniqueActive / top) * 10000) / 100 : 0;

    const response: ConversionFunnelResponseDto = {
      stages: [
        {
          label: 'Sign-ups / Leads',
          value: top,
          description: 'Total customers created for your organization',
        },
        {
          label: 'Free Trial Users',
          value: uniqueTrialing,
          description: 'Customers currently in a free trial',
        },
        {
          label: 'Paying Customers',
          value: uniqueActive,
          description: 'Customers with an active paid subscription',
        },
      ],
      overall_conversion_rate: overallRate,
      as_of: new Date().toISOString(),
    };

    // Cache for 5 minutes
    await this.cacheManager.set(cacheKey, response, 300000);

    this.logger.log(
      `Conversion funnel for organization ${organizationId}: ${top} → ${uniqueActive} (${overallRate}%)`,
    );

    return response;
  }
}

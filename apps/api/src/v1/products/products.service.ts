import { Injectable, Logger } from '@nestjs/common';
import { SupabaseService } from '../../supabase/supabase.service';

export interface PricingProduct {
  id: string;
  name: string;
  description: string;
  prices: PricingPrice[];
  features: PricingFeature[];
  isCurrentPlan: boolean;
  trialDays: number;
  highlighted?: boolean;
}

export interface PricingPrice {
  id: string;
  amount: number; // in cents
  currency: string;
  interval: 'month' | 'year' | 'week' | 'day';
  intervalCount: number;
}

export interface PricingFeature {
  id: string;
  name: string;
  title: string;
  type: 'boolean_flag' | 'usage_quota' | 'numeric_limit';
  properties: {
    limit?: number;
    period?: 'month' | 'year';
    unit?: string;
  };
}

export interface PricingCurrentSubscription {
  id: string;
  productId: string;
  priceId: string;
  status: 'active' | 'trialing' | 'past_due' | 'canceled';
  currentPeriodEnd: string;
  cancelAtPeriodEnd: boolean;
}

export interface GetProductsResponse {
  products: PricingProduct[];
  currentSubscription: PricingCurrentSubscription | null;
}

@Injectable()
export class V1ProductsService {
  private readonly logger = new Logger(V1ProductsService.name);

  constructor(private readonly supabaseService: SupabaseService) {}

  async getProducts(
    organizationId: string,
    externalUserId?: string,
    planIds?: string[],
  ): Promise<GetProductsResponse> {
    const supabase = this.supabaseService.getClient();

    // 1. Fetch active products for organization
    let query = supabase
      .from('products')
      .select(
        `
        *,
        prices:product_prices!inner(*),
        productFeatures:product_features(
          display_order,
          config,
          features(*)
        )
      `,
      )
      .eq('organization_id', organizationId)
      .eq('is_archived', false)
      .eq('prices.is_archived', false)
      .order('created_at', { ascending: true });

    // Filter by specific plan IDs if provided
    if (planIds && planIds.length > 0) {
      query = query.in('id', planIds);
    }

    const { data: products, error: productsError } = await query;

    if (productsError) {
      this.logger.error('Failed to fetch products:', productsError);
      throw new Error('Failed to fetch products');
    }

    // 2. Fetch customer's current subscription if externalUserId provided
    let currentSubscription: PricingCurrentSubscription | null = null;
    let currentProductId: string | null = null;

    if (externalUserId) {
      // First, find the customer by external_user_id
      const { data: customer } = await supabase
        .from('customers')
        .select('id')
        .eq('organization_id', organizationId)
        .eq('external_id', externalUserId)
        .maybeSingle();

      if (customer) {
        // Then fetch their active subscription
        const { data: subscription, error: subscriptionError } = await supabase
          .from('subscriptions')
          .select('*')
          .eq('customer_id', customer.id)
          .in('status', ['active', 'trialing', 'past_due'])
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle();

        if (!subscriptionError && subscription) {
          currentProductId = subscription.product_id;
          currentSubscription = {
            id: subscription.id,
            productId: subscription.product_id,
            priceId: subscription.product_id, // Note: We might need to add price_id to subscriptions table
            status: subscription.status as 'active' | 'trialing' | 'past_due' | 'canceled',
            currentPeriodEnd: subscription.current_period_end,
            cancelAtPeriodEnd: subscription.cancel_at_period_end || false,
          };
        }
      }
    }

    // 3. Transform products to SDK format
    const pricingProducts: PricingProduct[] = (products || []).map(
      (product) => {
        // Transform prices
        const prices: PricingPrice[] = (product.prices || []).map((price: any) => ({
          id: price.id,
          amount: price.price_amount || 0,
          currency: price.price_currency || 'usd',
          interval: price.recurring_interval as 'month' | 'year' | 'week' | 'day',
          intervalCount: price.recurring_interval_count || 1,
        }));

        // Transform features
        const features: PricingFeature[] = (product.productFeatures || [])
          .sort((a: any, b: any) => a.display_order - b.display_order)
          .map((pf: any) => {
            const feature = pf.features;
            return {
              id: feature.id,
              name: feature.name,
              title: feature.title,
              type: feature.type as 'boolean_flag' | 'usage_quota' | 'numeric_limit',
              properties: (feature.properties || {}) as {
                limit?: number;
                period?: 'month' | 'year';
                unit?: string;
              },
            };
          });

        // Check if this is the current plan
        const isCurrentPlan = product.id === currentProductId;

        // Check if highlighted (from metadata)
        const metadata = product.metadata as any;
        const highlighted = metadata?.recommended === true;

        return {
          id: product.id,
          name: product.name,
          description: product.description || '',
          prices,
          features,
          isCurrentPlan,
          trialDays: product.trial_days || 0,
          highlighted,
        };
      },
    );

    return {
      products: pricingProducts,
      currentSubscription,
    };
  }
}

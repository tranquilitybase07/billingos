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
  interval: 'month' | 'year' | 'week' | 'day' | null;
  amount: number | null;
}

export interface GetProductsResponse {
  products: PricingProduct[];
  currentSubscription: PricingCurrentSubscription | null;
}

@Injectable()
export class V1ProductsService {
  private readonly logger = new Logger(V1ProductsService.name);

  constructor(private readonly supabaseService: SupabaseService) {}

  /**
   * Get products for SDK pricing table display
   *
   * Filters:
   * - Only visible products (visible_in_pricing_table = true)
   * - Only current/latest versions (excludes superseded versions)
   * - Only active products (is_archived = false)
   * - Only active prices (prices.is_archived = false)
   *
   * @param organizationId Organization to fetch products for
   * @param externalUserId Optional external user ID to check current subscription
   * @param planIds Optional specific plan IDs to fetch
   */
  async getProducts(
    organizationId: string,
    externalUserId?: string,
    planIds?: string[],
    externalEmail?: string,
  ): Promise<GetProductsResponse> {
    const supabase = this.supabaseService.getClient();

    // 1. Fetch active products for organization that are visible in the pricing table
    // Only fetch current versions (exclude superseded versions)
    let query = supabase
      .from('products')
      .select(
        `
        *,
        prices:product_prices!inner(*),
        productFeatures:product_features(
          display_order,
          config,
          features(id, name, title, description, type, properties)
        )
      `,
      )
      .eq('organization_id', organizationId)
      .eq('is_archived', false)
      .eq('visible_in_pricing_table', true) // Only show products marked as visible
      .or('version_status.is.null,version_status.neq.superseded') // Include products without versioning OR current versions
      .eq('prices.is_archived', false)
      .order('created_at', { ascending: true });

    // Filter by specific plan IDs if provided
    if (planIds && planIds.length > 0) {
      query = query.in('id', planIds);
    }

    const [{ data: products, error: productsError }, { data: orgData }] =
      await Promise.all([
        query,
        supabase
          .from('organizations')
          .select('default_currency')
          .eq('id', organizationId)
          .single(),
      ]);

    const orgCurrency = orgData?.default_currency || 'usd';

    if (productsError) {
      this.logger.error('Failed to fetch products:', productsError);
      throw new Error('Failed to fetch products');
    }

    // Log the number of products fetched
    this.logger.log(
      `Fetched ${products?.length || 0} visible products (excluding superseded versions) for organization ${organizationId}`,
    );

    // 2. Fetch customer's current subscription if externalUserId provided
    let currentSubscription: PricingCurrentSubscription | null = null;
    let currentProductId: string | null = null;

    if (externalUserId) {
      // Find by external_id; fall back to email-based lazy bind for imported
      // customers whose external_id is still NULL.
      let { data: customer } = await supabase
        .from('customers')
        .select('id')
        .eq('organization_id', organizationId)
        .eq('external_id', externalUserId)
        .is('deleted_at', null)
        .maybeSingle();

      if (!customer && externalEmail) {
        const { data: bound } = await supabase
          .from('customers')
          .update({ external_id: externalUserId } as any)
          .eq('organization_id', organizationId)
          .ilike('email', externalEmail)
          .is('external_id', null)
          .is('deleted_at', null)
          .select('id')
          .maybeSingle();
        customer = bound;
      }

      if (customer) {
        // Then fetch their active subscription
        const { data: subscription, error: subscriptionError } = await supabase
          .from('subscriptions')
          .select('*, price:product_prices(recurring_interval)')
          .eq('customer_id', customer.id)
          .in('status', ['active', 'trialing', 'past_due'])
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle();

        if (!subscriptionError && subscription) {
          currentProductId = subscription.product_id;
          const price = subscription.price as unknown as {
            recurring_interval: string;
          } | null;
          currentSubscription = {
            id: subscription.id,
            productId: subscription.product_id,
            priceId: subscription.price_id || subscription.product_id,
            status: subscription.status as
              | 'active'
              | 'trialing'
              | 'past_due'
              | 'canceled',
            currentPeriodEnd: subscription.current_period_end,
            cancelAtPeriodEnd: subscription.cancel_at_period_end || false,
            interval:
              (price?.recurring_interval as
                | 'month'
                | 'year'
                | 'week'
                | 'day') || null,
            amount: subscription.amount ?? null,
          };
        }
      }
    }

    // 2b. Resolve currentProductId to the current version if it points to a superseded version.
    // This happens when a product is edited (versioned) while a subscription is active —
    // the subscription still references the old (superseded) product_id.
    // Uses name-based resolution: all versions share the same name (enforced by
    // UNIQUE(organization_id, name, version) constraint), so one PK lookup on the
    // superseded product + an in-memory find resolves any chain depth (V1→V100).
    if (
      currentProductId &&
      products &&
      !products.some((p) => p.id === currentProductId)
    ) {
      const { data: supersededProduct } = await supabase
        .from('products')
        .select('name')
        .eq('id', currentProductId)
        .eq('organization_id', organizationId)
        .single();

      if (supersededProduct) {
        const currentVersion = products.find(
          (p) => p.name === supersededProduct.name,
        );
        if (currentVersion) {
          this.logger.log(
            `Resolved subscription product ${currentProductId} → current version ${currentVersion.id} (matched by name "${supersededProduct.name}")`,
          );
          currentProductId = currentVersion.id;
          if (currentSubscription) {
            currentSubscription.productId = currentVersion.id;
          }
        }
      }
    }

    // 3. Transform products to SDK format
    const pricingProducts: PricingProduct[] = (products || []).map(
      (product) => {
        // Transform prices
        const prices: PricingPrice[] = (product.prices || []).map(
          (price: any) => ({
            id: price.id,
            amount: price.price_amount || 0,
            currency: price.price_currency || orgCurrency,
            interval: price.recurring_interval as
              | 'month'
              | 'year'
              | 'week'
              | 'day',
            intervalCount: price.recurring_interval_count || 1,
          }),
        );

        // Transform features
        const features: PricingFeature[] = (product.productFeatures || [])
          .sort((a: any, b: any) => a.display_order - b.display_order)
          .map((pf: any) => {
            const feature = pf.features;
            // Merge feature.properties (global) with pf.config (per-product limits)
            const properties = {
              ...(feature.properties || {}),
              ...(pf.config || {}),
            } as {
              limit?: number;
              period?: 'month' | 'year';
              unit?: string;
            };
            return {
              id: feature.id,
              name: feature.name,
              title: feature.title,
              type: feature.type as
                | 'boolean_flag'
                | 'usage_quota'
                | 'numeric_limit',
              properties,
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

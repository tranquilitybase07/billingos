import {
  Injectable,
  Logger,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { SupabaseService } from '../../supabase/supabase.service';
import { CustomerResolver } from './customer.resolver';
import { TransitionDetector } from './transition.detector';
import { CheckoutDiscountService } from '../checkout/discount.service';
import {
  BillingContext,
  BillingOrganization,
  BillingProduct,
  BillingPrice,
  DiscountContext,
  ProductFeatureSummary,
} from './types';
import { CreateCheckoutDto } from '../../v1/checkout/dto/create-checkout.dto';

/**
 * Phase 1: Builds a fully-resolved BillingContext from a checkout request.
 *
 * After this phase, no further DB queries are needed to compute the plan.
 * All context (product, price, customer, transitions, org) is assembled here.
 */
@Injectable()
export class BillingContextBuilder {
  private readonly logger = new Logger(BillingContextBuilder.name);

  constructor(
    private readonly supabaseService: SupabaseService,
    private readonly customerResolver: CustomerResolver,
    private readonly transitionDetector: TransitionDetector,
    private readonly discountService: CheckoutDiscountService,
  ) {}

  async build(
    organizationId: string,
    externalUserId: string,
    dto: CreateCheckoutDto,
  ): Promise<BillingContext> {
    const supabase = this.supabaseService.getClient();

    // 1. Resolve organization + Stripe account
    const organization = await this.resolveOrganization(organizationId);

    // 2. Fetch price + product
    const { product, price } = await this.resolveProductAndPrice(
      dto.priceId,
      organizationId,
    );

    // 3. Resolve customer (get-or-create in BOS + Stripe)
    const customerEmail = dto.customerEmail || dto.customer?.email;
    const customerName = dto.customerName || dto.customer?.name;

    const customer = await this.customerResolver.resolve(
      organizationId,
      externalUserId,
      organization.stripeAccountId,
      customerEmail,
      customerName,
      dto.metadata,
    );

    // 4. Check for duplicate active subscriptions (prevent re-subscribe)
    if (!dto.existingSubscriptionId) {
      await this.checkDuplicateSubscription(customer.id, product.id);
    }

    // 5. Detect transition (upgrade/downgrade/swap)
    const isFreeProduct = price.amountType === 'free' || price.amount === 0;
    const transition = await this.transitionDetector.detect(
      customer.id,
      product.id,
      price.amount,
      dto.existingSubscriptionId,
      organization.stripeAccountId,
    );

    // 6. Determine if in-place upgrade (existing paid Stripe sub + new paid price)
    const isInPlaceUpgrade =
      transition !== null &&
      transition.type === 'upgrade' &&
      !isFreeProduct &&
      !!transition.oldSubscription.stripeSubscriptionId?.startsWith('sub_');

    // 6b. Determine if in-place downgrade (existing paid Stripe sub + new lower price)
    const isInPlaceDowngrade =
      transition !== null &&
      transition.type === 'downgrade' &&
      !!transition.oldSubscription.stripeSubscriptionId?.startsWith('sub_');

    // 7. Determine trial eligibility (trial product + no transition)
    const isTrialEligible = (product.trialDays || 0) > 0 && transition === null;

    // 8. Adaptive pricing bypassed for MVP
    const isAdaptivePricing = false;
    // const isAdaptivePricing =
    //   dto.adaptivePricing === true && !isInPlaceUpgrade && !isInPlaceDowngrade;

    // 9. Fetch product features for display
    const features = await this.resolveProductFeatures(product.id);

    // 10. Resolve discount (if coupon code provided at checkout creation)
    let discount: DiscountContext | null = null;
    if (dto.couponCode) {
      discount = await this.discountService.resolveDiscount(
        organizationId,
        dto.couponCode,
        product.id,
      );
    }

    return {
      organization,
      customer,
      product: { ...product, features },
      price,
      transition,
      discount,
      isFreeProduct,
      isTrialEligible,
      isAdaptivePricing,
      isInPlaceUpgrade,
      isInPlaceDowngrade,
      metadata: dto.metadata || {},
    };
  }

  // ── Private helpers ──

  private async resolveOrganization(
    organizationId: string,
  ): Promise<BillingOrganization> {
    const supabase = this.supabaseService.getClient();

    const { data: organization } = await supabase
      .from('organizations')
      .select('default_currency, accounts!inner(stripe_id)')
      .eq('id', organizationId)
      .single();

    if (!organization?.accounts) {
      throw new BadRequestException(
        'Organization does not have a Stripe Connect account',
      );
    }

    const stripeAccountId = (organization.accounts as Record<string, unknown>)
      .stripe_id as string;
    if (!stripeAccountId) {
      throw new BadRequestException(
        'Organization Stripe account not properly configured',
      );
    }

    return {
      id: organizationId,
      stripeAccountId,
      defaultCurrency: organization.default_currency || 'usd',
    };
  }

  private async resolveProductAndPrice(
    priceId: string,
    organizationId: string,
  ): Promise<{
    product: Omit<BillingProduct, 'features'>;
    price: BillingPrice;
  }> {
    const supabase = this.supabaseService.getClient();

    const { data: priceRow, error } = await supabase
      .from('product_prices')
      .select(
        `
        *,
        product:products!inner(*)
      `,
      )
      .eq('id', priceId)
      .eq('product.organization_id', organizationId)
      .eq('is_archived', false)
      .single();

    if (error || !priceRow) {
      throw new NotFoundException('Price not found or not available');
    }

    const productRow = priceRow.product as Record<string, unknown>;
    if (!productRow || (productRow.is_archived as boolean)) {
      throw new NotFoundException('Product not found or not available');
    }

    const product: Omit<BillingProduct, 'features'> = {
      id: productRow.id as string,
      name: productRow.name as string,
      description: (productRow.description as string) || undefined,
      trialDays: (productRow.trial_days as number) || 0,
      isArchived: productRow.is_archived as boolean,
    };

    const price: BillingPrice = {
      id: priceRow.id,
      stripePriceId: priceRow.stripe_price_id || '',
      amount: priceRow.price_amount || 0,
      currency: priceRow.price_currency || 'usd',
      amountType: priceRow.amount_type === 'free' ? 'free' : 'fixed',
      recurringInterval:
        (priceRow.recurring_interval as BillingPrice['recurringInterval']) ||
        'month',
      recurringIntervalCount: priceRow.recurring_interval_count || 1,
    };

    return { product, price };
  }

  private async resolveProductFeatures(
    productId: string,
  ): Promise<ProductFeatureSummary[]> {
    const supabase = this.supabaseService.getClient();

    const { data: productFeatures } = await supabase
      .from('product_features')
      .select('features(title, properties)')
      .eq('product_id', productId)
      .order('display_order', { ascending: true });

    return (productFeatures || []).map((pf: Record<string, unknown>) => {
      const feature = pf.features as Record<string, unknown>;
      return {
        title: feature.title as string,
        properties: (feature.properties as Record<string, unknown>) || {},
      };
    });
  }

  private async checkDuplicateSubscription(
    customerId: string,
    productId: string,
  ): Promise<void> {
    const supabase = this.supabaseService.getClient();

    const { data: existingSubs } = await supabase
      .from('subscriptions')
      .select('id, status, created_at')
      .eq('customer_id', customerId)
      .eq('product_id', productId)
      .in('status', ['active', 'trialing', 'past_due', 'incomplete']);

    if (!existingSubs || existingSubs.length === 0) return;

    // Reject if customer has active/trialing/past_due subscription
    const activeSub = existingSubs.find((s) =>
      ['active', 'trialing', 'past_due'].includes(s.status),
    );
    if (activeSub) {
      throw new BadRequestException(
        'Customer already has an active subscription for this product',
      );
    }

    // Clean up stale incomplete subscriptions (older than 1 hour)
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
    const staleSubs = existingSubs.filter(
      (s) =>
        s.status === 'incomplete' &&
        s.created_at &&
        new Date(s.created_at) < oneHourAgo,
    );

    for (const staleSub of staleSubs) {
      await supabase
        .from('subscriptions')
        .update({ status: 'canceled' })
        .eq('id', staleSub.id);
      this.logger.log(
        `Cleaned up stale incomplete subscription ${staleSub.id}`,
      );
    }
  }
}

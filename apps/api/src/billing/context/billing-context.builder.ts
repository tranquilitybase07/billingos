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
    // Wave 1: org + price/product are independent
    const [organization, { product, price }] = await Promise.all([
      this.resolveOrganization(organizationId),
      this.resolveProductAndPrice(dto.priceId, organizationId),
    ]);

    const isFreeProduct = price.amountType === 'free' || price.amount === 0;

    // Wave 2: customer needs the org's stripeAccountId; features and
    //         discount only need the product id. All three are independent.
    const customerEmail = dto.customerEmail || dto.customer?.email;
    const customerName = dto.customerName || dto.customer?.name;

    const [customer, features, discount] = await Promise.all([
      this.customerResolver.resolve(
        organizationId,
        externalUserId,
        organization.stripeAccountId,
        customerEmail,
        customerName,
        dto.metadata,
      ),
      this.resolveProductFeatures(product.id),
      dto.couponCode
        ? this.discountService.resolveDiscount(
            organizationId,
            dto.couponCode,
            product.id,
          )
        : Promise.resolve<DiscountContext | null>(null),
    ]);

    // Wave 3: dup-check + transition both depend on customer.id and run
    //         in parallel. checkDuplicateSubscription throws on conflict —
    //         Promise.all rejects fast, which is the desired behavior.
    const [, transition] = await Promise.all([
      dto.existingSubscriptionId
        ? Promise.resolve()
        : this.checkDuplicateSubscription(customer.id, product.id),
      this.transitionDetector.detect(
        customer.id,
        product.id,
        price.amount,
        dto.existingSubscriptionId,
        organization.stripeAccountId,
      ),
    ]);

    // 6. Determine if in-place upgrade (existing Stripe sub + new paid price)
    const isInPlaceUpgrade =
      transition !== null &&
      transition.type === 'upgrade' &&
      !isFreeProduct &&
      !!transition.oldSubscription.stripeSubscriptionId?.startsWith('sub_');

    // 6a. Trial upgrade: in-place upgrade from a trialing subscription
    const isTrialUpgrade =
      isInPlaceUpgrade && transition.oldSubscription.status === 'trialing';

    // 6a2. Trial-to-trial: upgrading from trial AND new product also has a trial period.
    //      Grants a fresh trial on the new plan instead of ending trial + charging.
    const isTrialToTrialUpgrade =
      isTrialUpgrade && (product.trialDays || 0) > 0;

    // 6b. Trial-to-trial downgrade: old sub is trialing AND new product also has a trial period.
    //     Grants a fresh trial on the new (lower) plan — same pattern as isTrialToTrialUpgrade.
    const isTrialToTrialDowngrade =
      transition !== null &&
      transition.type === 'downgrade' &&
      transition.oldSubscription.status === 'trialing' &&
      (product.trialDays || 0) > 0 &&
      !!transition.oldSubscription.stripeSubscriptionId?.startsWith('sub_');

    // 6c. Determine if in-place downgrade (existing Stripe sub + new lower price).
    //     Non-trialing subs always route here. A trialing sub routes here only
    //     when downgrading to a free product — otherwise isTrialToTrialDowngrade
    //     (paid→paid trial) claims it above. Without this, trialing→free would
    //     fall through to free_activation and orphan the Stripe trial sub.
    const isInPlaceDowngrade =
      transition !== null &&
      transition.type === 'downgrade' &&
      !!transition.oldSubscription.stripeSubscriptionId?.startsWith('sub_') &&
      (transition.oldSubscription.status !== 'trialing' || isFreeProduct) &&
      !isTrialToTrialDowngrade;

    // 6d. Same-price plan switch: different product but identical price amount AND
    //     identical billing interval. Routed through subscriptions.update() with
    //     proration_behavior:'none' — no card entry, no proration math, no
    //     destructive cancel + recreate. Guards:
    //     - The interval guard is critical because transition.detector.ts
    //       classifies on amount alone, so two products at $10/mo and $10/yr
    //       would both report 'swap' without it.
    //     - The 'trialing' exclusion mirrors isInPlaceDowngrade. A plain
    //       items-swap on a trialing sub doesn't end the trial (no trial_end
    //       set) — that's an unexplored edge case, so we route trial swaps
    //       through the existing path instead. If we want to support
    //       trial-aware swaps later, add a sibling branch akin to
    //       isTrialToTrialUpgrade/Downgrade.
    const isInPlaceSwap =
      transition !== null &&
      transition.type === 'swap' &&
      !isFreeProduct &&
      !!transition.oldSubscription.stripeSubscriptionId?.startsWith('sub_') &&
      transition.oldSubscription.recurringInterval ===
        price.recurringInterval &&
      transition.oldSubscription.status !== 'trialing';

    // 7. Determine trial eligibility (trial product + no transition)
    const isTrialEligible = (product.trialDays || 0) > 0 && transition === null;

    // 8. Adaptive pricing bypassed for MVP
    const isAdaptivePricing = false;
    // const isAdaptivePricing =
    //   dto.adaptivePricing === true && !isInPlaceUpgrade && !isInPlaceDowngrade;

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
      isTrialUpgrade,
      isTrialToTrialUpgrade,
      isInPlaceDowngrade,
      isTrialToTrialDowngrade,
      isInPlaceSwap,
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
      .select('default_currency, checkout_mode, accounts!inner(stripe_id)')
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
      checkoutMode: organization.checkout_mode || 'hosted',
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

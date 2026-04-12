import { Injectable, Logger } from '@nestjs/common';
import { SupabaseService } from '../../supabase/supabase.service';
import { StripeService } from '../../stripe/stripe.service';
import { ProrationPreview } from './types';

/**
 * Calculates proration for in-place subscription upgrades.
 * Uses Stripe's upcoming invoice preview for accurate amounts.
 */
@Injectable()
export class ProrationCalculator {
  private readonly logger = new Logger(ProrationCalculator.name);

  constructor(
    private readonly supabaseService: SupabaseService,
    private readonly stripeService: StripeService,
  ) {}

  /**
   * Preview the prorated amount for upgrading a subscription to a new price.
   */
  async preview(
    existingBosSubId: string,
    newStripePriceId: string,
    stripeAccountId: string,
  ): Promise<ProrationPreview> {
    const supabase = this.supabaseService.getClient();

    // Fetch BOS subscription + Stripe customer ID
    const { data: sub } = await supabase
      .from('subscriptions')
      .select(
        'id, stripe_subscription_id, customer_id, customers!inner(stripe_customer_id)',
      )
      .eq('id', existingBosSubId)
      .single();

    if (
      !sub ||
      !sub.stripe_subscription_id?.startsWith('sub_') ||
      !(sub as Record<string, unknown>).customers
    ) {
      throw new Error(
        `Subscription ${existingBosSubId} not found or missing Stripe IDs`,
      );
    }

    const stripeCustomerId = (
      (sub as Record<string, unknown>).customers as Record<string, unknown>
    ).stripe_customer_id as string;

    // Get upcoming invoice preview from Stripe
    const upcomingInvoice = await this.stripeService.retrieveUpcomingInvoice(
      sub.stripe_subscription_id,
      stripeCustomerId,
      newStripePriceId,
      stripeAccountId,
    );

    // Parse proration from upcoming invoice line items
    let creditAmount = 0;
    let newPlanCharge = 0;

    for (const line of upcomingInvoice.lines?.data || []) {
      const parent = line.parent as unknown as
        | Record<string, unknown>
        | undefined;
      const invoiceItemDetails = parent?.invoice_item_details as
        | Record<string, unknown>
        | undefined;
      const subscriptionItemDetails = parent?.subscription_item_details as
        | Record<string, unknown>
        | undefined;
      const isProration =
        invoiceItemDetails?.proration === true ||
        subscriptionItemDetails?.proration === true;

      if (isProration) {
        if (line.amount < 0) {
          creditAmount += Math.abs(line.amount);
        } else {
          newPlanCharge += line.amount;
        }
      }
    }

    const proratedAmount = newPlanCharge - creditAmount;
    const currency = upcomingInvoice.currency || 'usd';

    return {
      proratedAmount,
      creditAmount,
      newPlanCharge,
      currency,
      immediateCharge: proratedAmount > 0,
    };
  }
}

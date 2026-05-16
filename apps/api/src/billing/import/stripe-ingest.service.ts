import { Injectable, Logger } from '@nestjs/common';
import Stripe from 'stripe';
import { SupabaseService } from '../../supabase/supabase.service';
import { EntitlementService } from '../entitlements/entitlement.service';
import { ExternalIdDetector } from './external-id-detector';

export interface IngestCustomerResult {
  customerId: string;
  created: boolean;
}

export interface IngestSubscriptionResult {
  subscriptionId: string;
  created: boolean;
  granted: boolean;
}

// Idempotent helpers that mirror Stripe state into BOS. Used by both the
// migration worker (bulk import) and webhook handlers (defensive ingest when
// events arrive for entities BOS hasn't seen yet — typically the race window
// between OAuth connect and the merchant clicking "Migrate").
@Injectable()
export class StripeIngestService {
  private readonly logger = new Logger(StripeIngestService.name);

  constructor(
    private readonly supabaseService: SupabaseService,
    private readonly entitlementService: EntitlementService,
  ) {}

  // Maps a Stripe Connect account ID → BOS organization ID.
  // Resolution path per backend rules: stripe_id → accounts.id → organizations.account_id.
  async resolveOrganizationId(
    stripeAccountId: string | null | undefined,
  ): Promise<string | null> {
    if (!stripeAccountId) return null;
    const supabase = this.supabaseService.getClient();

    const { data: account } = await supabase
      .from('accounts')
      .select('id')
      .eq('stripe_id', stripeAccountId)
      .maybeSingle();
    if (!account) return null;

    const { data: org } = await supabase
      .from('organizations')
      .select('id')
      .eq('account_id', account.id)
      .maybeSingle();
    return org?.id ?? null;
  }

  // Upserts a Stripe customer into BOS. external_id is derived from common
  // metadata keys when present, otherwise NULL (will lazy-bind via email).
  async ingestCustomer(
    organizationId: string,
    customer: Stripe.Customer,
  ): Promise<IngestCustomerResult> {
    const supabase = this.supabaseService.getClient();

    const { data: existing } = await supabase
      .from('customers')
      .select('id')
      .eq('organization_id', organizationId)
      .eq('stripe_customer_id', customer.id)
      .is('deleted_at', null)
      .maybeSingle();

    if (existing) {
      return { customerId: existing.id, created: false };
    }

    const externalId = ExternalIdDetector.detect(
      (customer.metadata as Record<string, unknown>) || null,
    );

    const row = {
      organization_id: organizationId,
      stripe_customer_id: customer.id,
      email: customer.email?.toLowerCase() || null,
      name: customer.name || null,
      external_id: externalId,
      billing_address: customer.address
        ? {
            street: customer.address.line1 || '',
            city: customer.address.city || '',
            state: customer.address.state || '',
            postal_code: customer.address.postal_code || '',
            country: customer.address.country || '',
          }
        : {},
      metadata: {
        ...(customer.metadata as Record<string, unknown>),
        imported_from: 'stripe',
        imported_at: new Date().toISOString(),
      },
    };

    const { data: inserted, error } = await supabase
      .from('customers')
      .insert(row as any)
      .select('id')
      .single();

    if (error) {
      // Concurrent insert (e.g., webhook + import racing). Re-fetch and return.
      this.logger.warn(
        `Insert raced for customer ${customer.id} in org ${organizationId}: ${error.message}`,
      );
      const { data: refetched } = await supabase
        .from('customers')
        .select('id')
        .eq('organization_id', organizationId)
        .eq('stripe_customer_id', customer.id)
        .maybeSingle();
      if (!refetched) {
        throw new Error(
          `Failed to ingest customer ${customer.id}: ${error.message}`,
        );
      }
      return { customerId: refetched.id, created: false };
    }

    return { customerId: inserted.id, created: true };
  }

  // Upserts a Stripe subscription into BOS and grants the mapped product's
  // features. Returns false-y `granted` when no product mapping exists yet,
  // signalling the caller to surface this in the migration job's "skipped" list.
  async ingestSubscription(
    organizationId: string,
    stripeSub: Stripe.Subscription,
  ): Promise<IngestSubscriptionResult | null> {
    const supabase = this.supabaseService.getClient();

    const stripeCustomerId =
      typeof stripeSub.customer === 'string'
        ? stripeSub.customer
        : stripeSub.customer?.id;
    if (!stripeCustomerId) {
      this.logger.warn(
        `Subscription ${stripeSub.id} has no customer id — skipping`,
      );
      return null;
    }

    const stripeProductId =
      typeof stripeSub.items.data[0]?.price.product === 'string'
        ? stripeSub.items.data[0].price.product
        : stripeSub.items.data[0]?.price.product?.id;
    if (!stripeProductId) {
      this.logger.warn(
        `Subscription ${stripeSub.id} has no product id — skipping`,
      );
      return null;
    }

    // Resolve product mapping (set by merchant during import wizard).
    const { data: mapping } = await supabase
      .from('stripe_product_mappings' as any)
      .select('bos_product_id')
      .eq('organization_id', organizationId)
      .eq('stripe_product_id', stripeProductId)
      .maybeSingle();

    if (!mapping) {
      this.logger.log(
        `No product mapping for Stripe product ${stripeProductId} in org ${organizationId} — subscription ${stripeSub.id} skipped`,
      );
      return null;
    }
    const bosProductId = (mapping as unknown as { bos_product_id: string })
      .bos_product_id;

    // Resolve BOS customer (must exist — call ingestCustomer first if not).
    const { data: bosCustomer } = await supabase
      .from('customers')
      .select('id')
      .eq('organization_id', organizationId)
      .eq('stripe_customer_id', stripeCustomerId)
      .is('deleted_at', null)
      .maybeSingle();

    if (!bosCustomer) {
      this.logger.warn(
        `BOS customer for Stripe customer ${stripeCustomerId} not found — call ingestCustomer first`,
      );
      return null;
    }

    const subData = stripeSub as Stripe.Subscription & {
      current_period_start?: number;
      current_period_end?: number;
    };
    const periodStart = subData.current_period_start
      ? new Date(subData.current_period_start * 1000)
      : new Date();
    const periodEnd = subData.current_period_end
      ? new Date(subData.current_period_end * 1000)
      : new Date(periodStart.getTime() + 30 * 24 * 60 * 60 * 1000);

    const firstItem = stripeSub.items.data[0];
    const amount = firstItem?.price.unit_amount ?? 0;
    const currency = (firstItem?.price.currency || 'usd').toLowerCase();

    // Upsert subscription row.
    const { data: existingSub } = await supabase
      .from('subscriptions')
      .select('id')
      .eq('organization_id', organizationId)
      .eq('stripe_subscription_id', stripeSub.id)
      .maybeSingle();

    let bosSubId: string;
    let created = false;

    if (existingSub) {
      bosSubId = existingSub.id;
      await supabase
        .from('subscriptions')
        .update({
          status: stripeSub.status as any,
          amount,
          currency,
          current_period_start: periodStart.toISOString(),
          current_period_end: periodEnd.toISOString(),
          cancel_at_period_end: stripeSub.cancel_at_period_end || false,
          updated_at: new Date().toISOString(),
        } as any)
        .eq('id', bosSubId);
    } else {
      const { data: inserted, error: insertError } = await supabase
        .from('subscriptions')
        .insert({
          organization_id: organizationId,
          customer_id: bosCustomer.id,
          product_id: bosProductId,
          status: stripeSub.status as any,
          amount,
          currency,
          current_period_start: periodStart.toISOString(),
          current_period_end: periodEnd.toISOString(),
          trial_start: stripeSub.trial_start
            ? new Date(stripeSub.trial_start * 1000).toISOString()
            : null,
          trial_end: stripeSub.trial_end
            ? new Date(stripeSub.trial_end * 1000).toISOString()
            : null,
          cancel_at_period_end: stripeSub.cancel_at_period_end || false,
          stripe_subscription_id: stripeSub.id,
          metadata: {
            ...(stripeSub.metadata as Record<string, unknown>),
            imported_from: 'stripe',
            imported_at: new Date().toISOString(),
          },
        } as any)
        .select('id')
        .single();

      if (insertError || !inserted) {
        this.logger.error(
          `Failed to insert subscription ${stripeSub.id}: ${insertError?.message}`,
        );
        return null;
      }
      bosSubId = inserted.id;
      created = true;
    }

    // Feature grants:
    //   - active / trialing → the DB trigger `grant_subscription_features_trigger`
    //     (migration 20260205040000) auto-creates feature_grants on INSERT.
    //     Calling grantForSubscription here would race the trigger and trip
    //     idx_feature_grants_active_unique.
    //   - past_due / unpaid → trigger no-ops on these statuses, so we grant
    //     explicitly so paying-but-failing customers keep their access.
    let granted = false;
    if (created && ['active', 'trialing'].includes(stripeSub.status)) {
      // Trigger handled it.
      granted = true;
    } else if (
      created &&
      ['past_due', 'unpaid'].includes(stripeSub.status)
    ) {
      try {
        await this.entitlementService.grantForSubscription({
          customerId: bosCustomer.id,
          subscriptionId: bosSubId,
          productId: bosProductId,
          periodStart,
          periodEnd,
        });
        granted = true;
      } catch (e) {
        this.logger.error(
          `Granting features for subscription ${stripeSub.id} failed: ${(e as Error).message}`,
        );
      }
    }

    return { subscriptionId: bosSubId, created, granted };
  }
}

import {
  Injectable,
  InternalServerErrorException,
  Logger,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import Stripe from 'stripe';
import { SupabaseService } from '../supabase/supabase.service';
import { StripeService } from '../stripe/stripe.service';
import { RedisService } from '../redis/redis.service';
import { WebhookMiddleware } from '../billing/webhooks/webhook.middleware';
import type { Json } from '../../../../packages/shared/types/database';

type SourceProductRow = {
  id: string;
  name: string;
  description: string | null;
  recurring_interval: string;
  recurring_interval_count: number | null;
  trial_days: number | null;
  metadata: Json | null;
  visible_in_pricing_table: boolean | null;
};

type SourceFeatureRow = {
  id: string;
  name: string;
  title: string;
  description: string | null;
  type: string;
  properties: Json | null;
  metadata: Json | null;
};

/**
 * Internal admin operations — webhook replay, Stripe reconciliation, and
 * read-only Stripe snapshots. Called from the billingos-admin dashboard via
 * `AdminTokenGuard`-protected routes.
 *
 * All Stripe access goes through `StripeService`; all writes either go via
 * `WebhookMiddleware` (which routes through the same handlers as live
 * webhooks) or stay within transactional code paths used in production.
 */
@Injectable()
export class AdminService {
  private readonly logger = new Logger(AdminService.name);

  constructor(
    private readonly supabaseService: SupabaseService,
    private readonly stripeService: StripeService,
    private readonly redisService: RedisService,
    private readonly webhookMiddleware: WebhookMiddleware,
  ) {}

  /**
   * Re-process a row from `webhook_events` through the full webhook pipeline,
   * exactly as if Stripe had just delivered it. Used to recover from handler
   * bugs or transient failures.
   *
   * Strategy:
   *  1. Load the row by id (UUID).
   *  2. Reset status to 'pending' so the middleware's idempotency check
   *     allows reprocessing (it deletes-and-reinserts on retry).
   *  3. Clear the Redis idempotency key for this event.
   *  4. Call `WebhookMiddleware.handleEvent` with the stored payload.
   */
  async replayWebhook(webhookEventId: string) {
    const supabase = this.supabaseService.getClient();

    const { data: row, error } = await supabase
      .from('webhook_events')
      .select('id, event_id, event_type, livemode, payload, status')
      .eq('id', webhookEventId)
      .maybeSingle();

    if (error) throw new BadRequestException(error.message);
    if (!row)
      throw new NotFoundException(`Webhook event ${webhookEventId} not found`);

    if (!row.payload || typeof row.payload !== 'object') {
      throw new BadRequestException(
        'Webhook event has no stored payload to replay',
      );
    }

    // Reset status so middleware treats this as a retry rather than a duplicate.
    // Must succeed before clearing Redis — otherwise we'd lose the idempotency
    // key while leaving the row in its old state, opening a race window for
    // a duplicate live delivery to slip through.
    const { error: updateError } = await supabase
      .from('webhook_events')
      .update({ status: 'pending', error_message: null })
      .eq('id', webhookEventId);

    if (updateError) {
      throw new BadRequestException(
        `Failed to reset webhook_event status before replay: ${updateError.message}`,
      );
    }

    const idempotencyKey = `stripe:webhook:${row.livemode ? 'live' : 'test'}:${row.event_id}`;
    await this.redisService.delete(idempotencyKey);

    const event = row.payload as unknown as Stripe.Event;

    this.logger.log(
      `Admin replay: ${row.event_type} (event_id=${row.event_id}, db_id=${row.id})`,
    );

    try {
      await this.webhookMiddleware.handleEvent(event);
      return {
        ok: true,
        webhookEventId,
        eventId: row.event_id,
        eventType: row.event_type,
      };
    } catch (err) {
      this.logger.error(
        `Admin replay failed for ${row.event_id}: ${(err as Error).message}`,
      );
      throw new BadRequestException(`Replay failed: ${(err as Error).message}`);
    }
  }

  /**
   * Force-reconcile a single subscription's BOS state from Stripe. Pulls the
   * authoritative subscription object from Stripe, synthesizes a
   * `customer.subscription.updated` event, and routes it through the same
   * handler that processes live webhooks — so all sync logic lives in one
   * place.
   *
   * `subscriptionId` may be either the BOS UUID or the Stripe id.
   */
  async reconcileSubscription(subscriptionId: string) {
    const supabase = this.supabaseService.getClient();

    const isStripeId = subscriptionId.startsWith('sub_');
    const lookupColumn = isStripeId ? 'stripe_subscription_id' : 'id';

    const { data: subRow, error } = await supabase
      .from('subscriptions')
      .select(
        'id, organization_id, stripe_subscription_id, status, organizations!inner(account_id, accounts!inner(stripe_id))',
      )
      .eq(lookupColumn, subscriptionId)
      .maybeSingle();

    if (error) throw new BadRequestException(error.message);
    if (!subRow)
      throw new NotFoundException(`Subscription ${subscriptionId} not found`);

    const stripeSubscriptionId = subRow.stripe_subscription_id;
    if (!stripeSubscriptionId) {
      throw new BadRequestException(
        'Subscription has no stripe_subscription_id — nothing to reconcile from Stripe',
      );
    }

    const accountStripeId = this.extractStripeAccountId(subRow.organizations);
    if (!accountStripeId) {
      throw new BadRequestException(
        'Organization is missing a Stripe Connect account; cannot reconcile',
      );
    }

    const stripeSub = await this.stripeService.getSubscription(
      stripeSubscriptionId,
      accountStripeId,
    );

    const event = this.synthesizeEvent(
      'customer.subscription.updated',
      stripeSub,
      accountStripeId,
      stripeSub.livemode,
    );

    await this.webhookMiddleware.dispatchEventDirectly(event);

    return {
      ok: true,
      subscriptionId: subRow.id,
      stripeSubscriptionId,
      stripeStatus: stripeSub.status,
      bosStatusBefore: subRow.status,
    };
  }

  /**
   * Force-reconcile a customer's BOS state from Stripe. Same pattern as
   * `reconcileSubscription` but for `customer.updated`.
   */
  async reconcileCustomer(customerId: string) {
    const supabase = this.supabaseService.getClient();

    const isStripeId = customerId.startsWith('cus_');
    const lookupColumn = isStripeId ? 'stripe_customer_id' : 'id';

    const { data: customerRow, error } = await supabase
      .from('customers')
      .select(
        'id, organization_id, stripe_customer_id, organizations!inner(account_id, accounts!inner(stripe_id))',
      )
      .eq(lookupColumn, customerId)
      .maybeSingle();

    if (error) throw new BadRequestException(error.message);
    if (!customerRow)
      throw new NotFoundException(`Customer ${customerId} not found`);

    const accountStripeId = this.extractStripeAccountId(
      customerRow.organizations,
    );
    if (!accountStripeId) {
      throw new BadRequestException(
        'Organization is missing a Stripe Connect account; cannot reconcile',
      );
    }

    const stripeCustomerId = customerRow.stripe_customer_id;
    if (!stripeCustomerId) {
      throw new BadRequestException(
        'Customer has no stripe_customer_id — nothing to reconcile from Stripe',
      );
    }

    const stripeCustomer = await this.stripeService.getConnectCustomer(
      stripeCustomerId,
      accountStripeId,
    );

    if ((stripeCustomer as Stripe.DeletedCustomer).deleted) {
      throw new BadRequestException(
        'Stripe customer has been deleted; refusing to reconcile',
      );
    }

    const customerObject = stripeCustomer as Stripe.Customer;
    const event = this.synthesizeEvent(
      'customer.updated',
      customerObject,
      accountStripeId,
      customerObject.livemode,
    );

    await this.webhookMiddleware.dispatchEventDirectly(event);

    return {
      ok: true,
      customerId: customerRow.id,
      stripeCustomerId,
    };
  }

  /**
   * Read-only snapshot of a customer's live state in Stripe — the customer
   * object, their subscriptions, and recent invoices. For inspection only;
   * no DB writes.
   */
  async getCustomerSnapshot(customerId: string) {
    const supabase = this.supabaseService.getClient();

    const isStripeId = customerId.startsWith('cus_');
    const lookupColumn = isStripeId ? 'stripe_customer_id' : 'id';

    const { data: customerRow, error } = await supabase
      .from('customers')
      .select(
        'id, organization_id, stripe_customer_id, email, organizations!inner(account_id, accounts!inner(stripe_id))',
      )
      .eq(lookupColumn, customerId)
      .maybeSingle();

    if (error) throw new BadRequestException(error.message);
    if (!customerRow)
      throw new NotFoundException(`Customer ${customerId} not found`);

    const accountStripeId = this.extractStripeAccountId(
      customerRow.organizations,
    );
    if (!accountStripeId) {
      throw new BadRequestException(
        'Organization is missing a Stripe Connect account',
      );
    }

    const stripeCustomerId = customerRow.stripe_customer_id;
    if (!stripeCustomerId) {
      throw new BadRequestException('Customer has no stripe_customer_id');
    }

    const [stripeCustomer, subscriptions, invoices] = await Promise.all([
      this.stripeService.getConnectCustomer(stripeCustomerId, accountStripeId),
      this.stripeService.listCustomerSubscriptions({
        customerId: stripeCustomerId,
        stripeAccountId: accountStripeId,
        status: 'all',
      }),
      this.stripeService.listCustomerInvoices(
        stripeCustomerId,
        accountStripeId,
      ),
    ]);

    return {
      customer: stripeCustomer,
      subscriptions: subscriptions.data,
      invoices: invoices.data,
    };
  }

  /**
   * List users by access_status for private-beta triage. Returns the user
   * row + the submitted beta_application payload (if any), most recent first.
   */
  async listBetaApplications(args: {
    status: 'pending' | 'approved' | 'denied';
    limit: number;
  }) {
    const supabase = this.supabaseService.getClient();

    const { data, error } = await supabase
      .from('users')
      .select(
        'id, email, created_at, access_status, access_status_updated_at, beta_application',
      )
      .eq('access_status', args.status)
      .is('deleted_at', null)
      .order('created_at', { ascending: false })
      .limit(args.limit);

    if (error) {
      this.logger.error(`listBetaApplications failed: ${error.message}`);
      throw new InternalServerErrorException(
        'Failed to list beta applications',
      );
    }
    return { users: data ?? [] };
  }

  /**
   * Set a user's `access_status`. Idempotent — repeats are safe and just
   * refresh `access_status_updated_at`.
   */
  async setAccessStatus(userId: string, status: 'approved' | 'denied') {
    const supabase = this.supabaseService.getClient();

    const { data, error } = await supabase
      .from('users')
      .update({
        access_status: status,
        access_status_updated_at: new Date().toISOString(),
      })
      .eq('id', userId)
      .is('deleted_at', null)
      .select('id, email, access_status, access_status_updated_at')
      .maybeSingle();

    if (error) {
      this.logger.error(
        `setAccessStatus(${status}) for ${userId} failed: ${error.message}`,
      );
      throw new InternalServerErrorException(
        'Failed to update user access status',
      );
    }
    if (!data) throw new NotFoundException(`User ${userId} not found`);

    this.logger.log(
      `Admin set access_status=${status} for user ${userId} (${data.email})`,
    );

    return { ok: true, user: data };
  }

  async copyProducts(input: { sourceOrgId: string; targetOrgId: string }) {
    if (input.sourceOrgId === input.targetOrgId) {
      throw new BadRequestException('source and target must differ');
    }

    const supabase = this.supabaseService.getClient();

    const { data: orgs, error: orgsErr } = await supabase
      .from('organizations')
      .select('id, name, default_currency, account_id, accounts(stripe_id)')
      .in('id', [input.sourceOrgId, input.targetOrgId])
      .is('deleted_at', null);

    if (orgsErr) throw new BadRequestException(orgsErr.message);

    const source = orgs?.find((o) => o.id === input.sourceOrgId);
    const target = orgs?.find((o) => o.id === input.targetOrgId);

    if (!source) throw new NotFoundException('source org not found');
    if (!target) throw new NotFoundException('target org not found');

    const targetStripeId = this.extractStripeAccountId(target);
    if (!targetStripeId) {
      throw new BadRequestException(
        'target org has no connected Stripe account',
      );
    }

    const { data: sourceProducts, error: prodErr } = await supabase
      .from('products')
      .select(
        'id, name, description, recurring_interval, recurring_interval_count, trial_days, metadata, visible_in_pricing_table',
      )
      .eq('organization_id', input.sourceOrgId)
      .eq('is_archived', false)
      .or('version_status.is.null,version_status.eq.current')
      .order('created_at', { ascending: true });

    if (prodErr) throw new BadRequestException(prodErr.message);

    const { data: targetExisting } = await supabase
      .from('products')
      .select('name')
      .eq('organization_id', input.targetOrgId)
      .eq('is_archived', false);

    const collisionNames = new Set((targetExisting ?? []).map((p) => p.name));

    const featureCache = new Map<
      string,
      { id: string; stripe_feature_id: string | null }
    >();

    const copied: Array<{
      source_product_id: string;
      target_product_id: string;
      name: string;
      stripe_product_id: string;
      prices: number;
      features: number;
    }> = [];
    const skipped: Array<{
      source_product_id: string;
      name: string;
      reason: string;
    }> = [];
    const errors: Array<{
      source_product_id: string;
      name: string;
      message: string;
    }> = [];

    for (const sp of sourceProducts ?? []) {
      if (collisionNames.has(sp.name)) {
        skipped.push({
          source_product_id: sp.id,
          name: sp.name,
          reason: 'name_collision',
        });
        continue;
      }

      try {
        const result = await this.copyOneProduct({
          sourceProduct: sp,
          sourceOrgId: input.sourceOrgId,
          targetOrgId: input.targetOrgId,
          targetStripeAccountId: targetStripeId,
          targetCurrency: (target.default_currency as string) || 'usd',
          featureCache,
        });
        copied.push(result);
        collisionNames.add(sp.name);
      } catch (err) {
        const message = (err as Error).message ?? String(err);
        this.logger.error(
          `Failed to copy product ${sp.id} (${sp.name}) to org ${input.targetOrgId}: ${message}`,
        );
        errors.push({
          source_product_id: sp.id,
          name: sp.name,
          message,
        });
      }
    }

    return { copied, skipped, errors };
  }

  private async copyOneProduct(args: {
    sourceProduct: SourceProductRow;
    sourceOrgId: string;
    targetOrgId: string;
    targetStripeAccountId: string;
    targetCurrency: string;
    featureCache: Map<string, { id: string; stripe_feature_id: string | null }>;
  }): Promise<{
    source_product_id: string;
    target_product_id: string;
    name: string;
    stripe_product_id: string;
    prices: number;
    features: number;
  }> {
    const supabase = this.supabaseService.getClient();
    const sp = args.sourceProduct;

    const { data: sourcePrices, error: priceErr } = await supabase
      .from('product_prices')
      .select(
        'id, amount_type, price_amount, price_currency, recurring_interval, recurring_interval_count',
      )
      .eq('product_id', sp.id)
      .eq('is_archived', false);
    if (priceErr) throw new Error(`load prices: ${priceErr.message}`);

    const { data: sourceLinks, error: linksErr } = await supabase
      .from('product_features')
      .select(
        'feature_id, display_order, config, features!inner(id, name, title, description, type, properties, metadata)',
      )
      .eq('product_id', sp.id)
      .order('display_order', { ascending: true });
    if (linksErr) throw new Error(`load feature links: ${linksErr.message}`);

    // Stripe metadata only accepts Record<string, string>. The source
    // product's metadata column is Json (can contain nested objects, arrays,
    // numbers). Keep only top-level string values so Stripe doesn't 400 on a
    // nested payload at runtime.
    const sourceMetadataRaw = (sp.metadata ?? {}) as Record<string, unknown>;
    const sourceMetadata = Object.fromEntries(
      Object.entries(sourceMetadataRaw).filter(
        ([, v]) => typeof v === 'string',
      ),
    ) as Record<string, string>;
    const stripeProduct = await this.stripeService.createProduct(
      {
        name: sp.name,
        description: sp.description ?? undefined,
        metadata: {
          ...sourceMetadata,
          organization_id: args.targetOrgId,
          copied_from_org_id: args.sourceOrgId,
          copied_from_product_id: sp.id,
        },
      },
      args.targetStripeAccountId,
    );

    type SourcePriceRow = NonNullable<typeof sourcePrices>[number];
    const stripePrices: Array<{
      stripe_price_id: string | null;
      source: SourcePriceRow;
    }> = [];
    try {
      for (const price of sourcePrices ?? []) {
        if (price.amount_type === 'free') {
          stripePrices.push({ stripe_price_id: null, source: price });
          continue;
        }
        if (price.price_amount == null) {
          throw new Error(
            `price ${price.id} has amount_type=fixed but no price_amount`,
          );
        }
        const created = await this.stripeService.createPrice(
          {
            product: stripeProduct.id,
            currency: price.price_currency || args.targetCurrency || 'usd',
            unit_amount: price.price_amount,
            recurring: {
              interval: (price.recurring_interval ??
                sp.recurring_interval) as Stripe.PriceCreateParams.Recurring.Interval,
              interval_count:
                price.recurring_interval_count ??
                sp.recurring_interval_count ??
                1,
            },
          },
          args.targetStripeAccountId,
        );
        stripePrices.push({ stripe_price_id: created.id, source: price });
      }

      const { data: newProduct, error: insertErr } = await supabase
        .from('products')
        .insert({
          organization_id: args.targetOrgId,
          name: sp.name,
          description: sp.description,
          recurring_interval: sp.recurring_interval,
          recurring_interval_count: sp.recurring_interval_count ?? 1,
          stripe_product_id: stripeProduct.id,
          trial_days: sp.trial_days ?? 0,
          metadata: sp.metadata ?? {},
          is_archived: false,
          visible_in_pricing_table: sp.visible_in_pricing_table ?? true,
        })
        .select('id')
        .single();
      if (insertErr || !newProduct) {
        throw new Error(
          `insert product: ${insertErr?.message ?? 'no row returned'}`,
        );
      }

      // Audit: per backend rules, all Stripe sync operations log to
      // stripe_sync_events. Best-effort — failures here must never break the
      // copy.
      await supabase
        .from('stripe_sync_events')
        .insert({
          organization_id: args.targetOrgId,
          entity_type: 'product',
          entity_id: newProduct.id,
          stripe_object_id: stripeProduct.id,
          operation: 'create',
          status: 'success',
          triggered_by: 'admin.copyProducts',
        })
        .then(({ error }) => {
          if (error) {
            this.logger.warn(
              `Failed to log stripe_sync_events for ${stripeProduct.id}: ${error.message}`,
            );
          }
        });

      for (const { stripe_price_id, source: price } of stripePrices) {
        const { error: priceInsertErr } = await supabase
          .from('product_prices')
          .insert({
            product_id: newProduct.id,
            amount_type: price.amount_type,
            price_amount: price.price_amount,
            price_currency:
              price.price_currency || args.targetCurrency || 'usd',
            recurring_interval:
              price.recurring_interval ?? sp.recurring_interval,
            recurring_interval_count:
              price.recurring_interval_count ??
              sp.recurring_interval_count ??
              1,
            stripe_price_id,
            is_archived: false,
          });
        if (priceInsertErr) {
          throw new Error(`insert price: ${priceInsertErr.message}`);
        }
      }

      let featuresLinked = 0;
      for (const link of sourceLinks ?? []) {
        const sourceFeature = Array.isArray(link.features)
          ? link.features[0]
          : link.features;
        if (!sourceFeature) continue;

        const targetFeature = await this.findOrCreateFeatureInTarget({
          sourceFeature,
          targetOrgId: args.targetOrgId,
          targetStripeAccountId: args.targetStripeAccountId,
          cache: args.featureCache,
        });

        const { error: linkErr } = await supabase
          .from('product_features')
          .insert({
            product_id: newProduct.id,
            feature_id: targetFeature.id,
            display_order: link.display_order,
            config: link.config ?? {},
            stripe_synced: false,
          });
        if (linkErr) {
          this.logger.warn(
            `Failed to insert feature link for product ${newProduct.id}: ${linkErr.message}`,
          );
          continue;
        }

        if (targetFeature.stripe_feature_id) {
          try {
            const pf = await this.stripeService.attachFeatureToProduct({
              productId: stripeProduct.id,
              featureId: targetFeature.stripe_feature_id,
              stripeAccountId: args.targetStripeAccountId,
            });
            await supabase
              .from('product_features')
              .update({
                stripe_synced: true,
                stripe_synced_at: new Date().toISOString(),
                stripe_product_feature_id: pf.id,
              })
              .eq('product_id', newProduct.id)
              .eq('feature_id', targetFeature.id);
          } catch (err) {
            this.logger.warn(
              `Failed to attach feature ${targetFeature.stripe_feature_id} to Stripe product ${stripeProduct.id}: ${(err as Error).message}`,
            );
          }
        }
        featuresLinked++;
      }

      return {
        source_product_id: sp.id,
        target_product_id: newProduct.id,
        name: sp.name,
        stripe_product_id: stripeProduct.id,
        prices: stripePrices.length,
        features: featuresLinked,
      };
    } catch (err) {
      await this.stripeService
        .deleteProduct(stripeProduct.id, args.targetStripeAccountId)
        .catch((cleanupErr) => {
          this.logger.warn(
            `Cleanup of Stripe product ${stripeProduct.id} failed: ${(cleanupErr as Error).message}`,
          );
        });
      throw err;
    }
  }

  private async findOrCreateFeatureInTarget(args: {
    sourceFeature: SourceFeatureRow;
    targetOrgId: string;
    targetStripeAccountId: string;
    cache: Map<string, { id: string; stripe_feature_id: string | null }>;
  }): Promise<{ id: string; stripe_feature_id: string | null }> {
    const supabase = this.supabaseService.getClient();
    const name = args.sourceFeature.name;

    const cached = args.cache.get(name);
    if (cached) return cached;

    const { data: existing } = await supabase
      .from('features')
      .select('id, stripe_feature_id')
      .eq('organization_id', args.targetOrgId)
      .eq('name', name)
      .maybeSingle();

    if (existing) {
      const value = {
        id: existing.id,
        stripe_feature_id: existing.stripe_feature_id ?? null,
      };
      args.cache.set(name, value);
      return value;
    }

    let stripeFeatureId: string | null = null;
    try {
      const stripeFeature = await this.stripeService.createEntitlementFeature({
        name: args.sourceFeature.title || name,
        lookupKey: name,
        metadata: {
          organization_id: args.targetOrgId,
        },
        stripeAccountId: args.targetStripeAccountId,
      });
      stripeFeatureId = stripeFeature.id;
    } catch (err) {
      this.logger.warn(
        `Failed to create Stripe entitlement feature ${name} in account ${args.targetStripeAccountId}: ${(err as Error).message}`,
      );
    }

    const { data: inserted, error: insertErr } = await supabase
      .from('features')
      .insert({
        organization_id: args.targetOrgId,
        name,
        title: args.sourceFeature.title ?? name,
        description: args.sourceFeature.description,
        type: args.sourceFeature.type,
        properties: args.sourceFeature.properties ?? {},
        metadata: args.sourceFeature.metadata ?? {},
        stripe_feature_id: stripeFeatureId,
        stripe_synced_at: stripeFeatureId ? new Date().toISOString() : null,
      })
      .select('id, stripe_feature_id')
      .single();

    if (insertErr || !inserted) {
      throw new Error(`insert feature: ${insertErr?.message ?? 'no row'}`);
    }

    const value = {
      id: inserted.id,
      stripe_feature_id: inserted.stripe_feature_id ?? null,
    };
    args.cache.set(name, value);
    return value;
  }

  // ── Private helpers ──

  /**
   * Wrap a Stripe object in a synthetic Event envelope so we can route it
   * through the existing webhook handlers. The synthetic event id is
   * prefixed `evt_admin_*` so anything that ends up in audit tables is
   * obviously not a real Stripe-delivered event.
   *
   * `livemode` MUST come from the underlying Stripe object, not the BOS
   * deployment env — a test-mode object reconciled on a prod deployment is
   * still a test-mode event, and downstream handlers / audit rows branch on
   * this flag.
   */
  private synthesizeEvent<T>(
    type: Stripe.Event.Type,
    object: T,
    stripeAccountId: string,
    livemode: boolean,
  ): Stripe.Event {
    return {
      id: `evt_admin_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      object: 'event',
      api_version: '2024-06-20',
      created: Math.floor(Date.now() / 1000),
      data: {
        object: object as unknown as Stripe.Event.Data.Object,
      },
      livemode,
      pending_webhooks: 0,
      request: { id: null, idempotency_key: null },
      type,
      account: stripeAccountId,
    } as Stripe.Event;
  }

  private extractStripeAccountId(organizations: unknown): string | null {
    const org = Array.isArray(organizations) ? organizations[0] : organizations;
    if (!org || typeof org !== 'object') return null;
    const accounts = (org as Record<string, unknown>).accounts;
    const account = Array.isArray(accounts) ? accounts[0] : accounts;
    if (!account || typeof account !== 'object') return null;
    return ((account as Record<string, unknown>).stripe_id as string) ?? null;
  }
}

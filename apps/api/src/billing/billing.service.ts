import {
  Injectable,
  Logger,
  BadRequestException,
  NotFoundException,
} from '@nestjs/common';
import { SupabaseService } from '../supabase/supabase.service';
import { RedisService } from '../redis/redis.service';
import { CheckoutMetadataService } from '../v1/checkout/checkout-metadata.service';
import { BillingContextBuilder } from './context/billing-context.builder';
import { BillingPlanBuilder } from './plan/billing-plan.builder';
import { StripePlanBuilder } from './stripe/stripe-plan.builder';
import { StripePlanExecutor } from './stripe/stripe-plan.executor';
import { BosPlanExecutor } from './execute/bos-plan.executor';
import { BillingContext } from './context/types';
import { BillingPlan } from './plan/types';
import { PipelineResult } from './stripe/types';
import { CreateCheckoutDto } from '../v1/checkout/dto/create-checkout.dto';
import { CheckoutSession } from '../v1/checkout/checkout.service';
import type {
  Json,
  Database,
} from '../../../../packages/shared/types/database';

type CheckoutSessionRow =
  Database['public']['Tables']['checkout_sessions']['Row'];
type CheckoutSessionStatus =
  Database['public']['Enums']['checkout_session_status'];

/**
 * Two-step billing pipeline orchestrator.
 *
 * - `previewCheckout`: Phase A. For deferred flows (upgrade, downgrade,
 *   free) it persists a `pending` checkout_sessions row with the
 *   proration preview and original request DTO — NO Stripe writes,
 *   NO BOS subscription mutations. For immediate flows (standard,
 *   adaptive, trial) it runs the full pipeline so the SDK can render
 *   the Stripe PaymentElement.
 *
 * - `executeCheckout`: Phase B. Loads the persisted DTO, rebuilds the
 *   context (so proration and customer state are fresh), acquires a
 *   per-customer Redis lock, and runs the Stripe + BOS phases. Idempotent
 *   on `completed`. Throws on `expired` / `awaiting_payment`.
 */
@Injectable()
export class BillingService {
  private readonly logger = new Logger(BillingService.name);

  /** Lock TTL for an execute call (ms). */
  private static readonly EXECUTE_LOCK_TTL_MS = 120_000;

  constructor(
    private readonly contextBuilder: BillingContextBuilder,
    private readonly planBuilder: BillingPlanBuilder,
    private readonly stripePlanBuilder: StripePlanBuilder,
    private readonly stripePlanExecutor: StripePlanExecutor,
    private readonly bosPlanExecutor: BosPlanExecutor,
    private readonly metadataService: CheckoutMetadataService,
    private readonly redisService: RedisService,
    private readonly supabaseService: SupabaseService,
  ) {}

  // ── Phase A: preview ──

  /**
   * Preview a checkout. For deferred flows (upgrade, downgrade, free)
   * this creates a pending `checkout_sessions` row and returns the
   * proration preview WITHOUT touching Stripe or BOS subscriptions.
   * For immediate flows (standard, adaptive, trial) this creates the
   * Stripe object so the SDK can render its PaymentElement.
   */
  async previewCheckout(
    organizationId: string,
    externalUserId: string,
    dto: CreateCheckoutDto,
  ): Promise<CheckoutSession> {
    const { ctx, plan } = await this.buildContextAndPlan(
      organizationId,
      externalUserId,
      dto,
    );

    if (this.requiresExplicitExecution(ctx)) {
      return this.persistPendingCheckout(ctx, plan, dto);
    }

    return this.runExecutionPhase(ctx, plan, {
      persistAs: 'awaiting_payment',
    });
  }

  // ── Phase B: execute ──

  /**
   * Execute a previously-previewed checkout. Loads the persisted DTO,
   * rebuilds context (fresh proration, latest customer state), acquires
   * a per-customer lock, and runs the Stripe + BOS phases.
   *
   * Idempotent: returns the existing result if status is already 'completed'.
   */
  async executeCheckout(
    organizationId: string,
    sessionId: string,
  ): Promise<CheckoutSession> {
    const session = await this.loadSessionForExecute(organizationId, sessionId);

    // Idempotency: already completed → return without re-executing.
    if (session.status === 'completed') {
      return this.toCheckoutSessionFromPersisted(session);
    }
    // Already mid-action (SCA / 3DS) → return the persisted hosted URL.
    if (session.status === 'requires_action') {
      return this.toCheckoutSessionFromPersisted(session);
    }
    if (session.status === 'expired') {
      throw new BadRequestException('Checkout session has expired');
    }
    if (session.status === 'awaiting_payment') {
      throw new BadRequestException(
        'This checkout is awaiting payment via Stripe — execute is not applicable.',
      );
    }
    // 'pending' is the happy path. 'failed' is allowed to retry.
    // 'executing' will fail at the lock.

    if (!session.request_dto) {
      throw new BadRequestException(
        'Checkout session is missing the request DTO — cannot execute.',
      );
    }
    if (!session.customer_external_id) {
      throw new BadRequestException(
        'Checkout session is missing the customer external id — cannot execute.',
      );
    }

    const lockKey = `billing:exec:${organizationId}:${session.customer_external_id}`;

    return this.redisService.withLock(
      lockKey,
      BillingService.EXECUTE_LOCK_TTL_MS,
      async () => {
        await this.updateSessionStatus(sessionId, 'executing');

        try {
          const dto = session.request_dto as unknown as CreateCheckoutDto;
          const reuseMetadataId = session.metadata_id || undefined;

          const { ctx, plan } = await this.buildContextAndPlan(
            organizationId,
            session.customer_external_id!,
            dto,
            reuseMetadataId,
            sessionId,
          );

          const result = await this.runExecutionPhase(ctx, plan, {
            persistAs: 'completed',
            existingSessionId: sessionId,
          });

          // SCA / 3DS path: bosPlanExecutor already persisted the session as
          // `requires_action` with the hosted invoice URL. Do NOT mark
          // completed — the success webhook will do that once the customer
          // authenticates.
          if (result.requiresAction) {
            return result;
          }

          await this.updateSessionStatus(sessionId, 'completed');
          return result;
        } catch (error) {
          const message =
            error instanceof Error ? error.message : String(error);
          this.logger.error(
            `Execute failed for session ${sessionId}: ${message}`,
          );
          await this.updateSessionStatus(sessionId, 'failed', message);
          throw error;
        }
      },
    );
  }

  // ── Shared pipeline phases ──

  /**
   * Resolve context, ensure a checkout_metadata row exists (creating one
   * if not), and compute the BillingPlan.
   */
  private async buildContextAndPlan(
    organizationId: string,
    externalUserId: string,
    dto: CreateCheckoutDto,
    reuseMetadataId?: string,
    existingCheckoutSessionId?: string,
  ): Promise<{ ctx: BillingContext; plan: BillingPlan }> {
    const baseCtx = await this.contextBuilder.build(
      organizationId,
      externalUserId,
      dto,
    );

    let metadataId = reuseMetadataId;
    if (!metadataId) {
      const checkoutMetadata = await this.metadataService.createMetadata({
        organizationId: baseCtx.organization.id,
        customerId: baseCtx.customer.id,
        productId: baseCtx.product.id,
        priceId: baseCtx.price.id,
        customerEmail: baseCtx.customer.email || '',
        customerName: baseCtx.customer.name || undefined,
        productName: baseCtx.product.name,
        priceAmount: baseCtx.price.amount,
        currency: baseCtx.price.currency,
        billingInterval: baseCtx.price.recurringInterval as
          | 'month'
          | 'year'
          | undefined,
        billingIntervalCount: baseCtx.price.recurringIntervalCount,
        trialPeriodDays: baseCtx.product.trialDays || undefined,
        shouldGrantTrial: baseCtx.isTrialEligible,
        featuresToGrant: [],
        successUrl:
          dto.successUrl || `${process.env.APP_URL}/embed/checkout/complete`,
        cancelUrl:
          dto.cancelUrl || `${process.env.APP_URL}/embed/checkout/cancel`,
        metadata: {
          externalUserId: baseCtx.customer.externalUserId,
          ...dto.metadata,
        },
      });
      metadataId = checkoutMetadata.id;
    }

    const ctx: BillingContext = {
      ...baseCtx,
      checkoutMetadataId: metadataId,
      existingCheckoutSessionId,
    };

    const plan = await this.planBuilder.build(ctx);
    return { ctx, plan };
  }

  /**
   * Phase 3 + 4: map plan → Stripe ops, execute Stripe, execute BOS writes.
   *
   * This is the ONLY place where StripePlanExecutor and BosPlanExecutor
   * are called. Both `previewCheckout` (immediate flows) and
   * `executeCheckout` route through here.
   */
  private async runExecutionPhase(
    ctx: BillingContext,
    plan: BillingPlan,
    options: {
      persistAs: 'awaiting_payment' | 'completed';
      existingSessionId?: string;
    },
  ): Promise<CheckoutSession> {
    const stripePlan = this.stripePlanBuilder.build(ctx, plan);
    const stripeResult = await this.stripePlanExecutor.execute(stripePlan);
    const pipelineResult = await this.bosPlanExecutor.execute(
      ctx,
      plan,
      stripeResult,
      {
        persistAs: options.persistAs,
        existingSessionId: options.existingSessionId,
      },
    );
    return this.toCheckoutSession(ctx, plan, pipelineResult);
  }

  // ── Deferred-flow persistence (preview-only) ──

  /**
   * Persist a `pending` checkout_sessions row with the proration preview
   * and the original request DTO. No Stripe writes happen here.
   *
   * Used for deferred flows (upgrade, downgrade, free).
   */
  private async persistPendingCheckout(
    ctx: BillingContext,
    plan: BillingPlan,
    dto: CreateCheckoutDto,
  ): Promise<CheckoutSession> {
    const supabase = this.supabaseService.getClient();
    const expiresAt = new Date();
    expiresAt.setHours(expiresAt.getHours() + 1);

    const checkoutMode = this.determineCheckoutMode(ctx, plan);

    // Snapshot of all the fields the status endpoint and the executor
    // need to render / replay the preview.
    const sessionMetadata: Record<string, unknown> = {
      ...ctx.metadata,
      checkoutMode,
      productId: ctx.product.id,
      priceId: ctx.price.id,
      customerId: ctx.customer.id,
      stripeAccountId: ctx.organization.stripeAccountId,
      newAmount: ctx.price.amount,
      priceCurrency: ctx.price.currency,
      ...(ctx.transition
        ? { existingSubscriptionId: ctx.transition.oldSubscription.id }
        : {}),
      ...(ctx.isFreeProduct ? { isFreeProduct: true } : {}),
      ...(plan.proration
        ? {
            proration: {
              credit: plan.proration.creditAmount,
              charge: plan.proration.newPlanCharge,
              netAmount: plan.proration.proratedAmount,
              currency: plan.proration.currency,
            },
          }
        : {}),
      ...(plan.subscription.kind === 'schedule_downgrade'
        ? {
            scheduledFor: plan.subscription.scheduledFor.toISOString(),
            effectiveDate: plan.subscription.scheduledFor.toISOString(),
            fromAmount: plan.subscription.fromAmount,
            fromPriceId: plan.subscription.fromPriceId,
            stripePriceId: plan.subscription.newStripePriceId,
          }
        : {}),
      ...(plan.subscription.kind === 'update_subscription'
        ? { stripePriceId: plan.subscription.newStripePriceId }
        : {}),
    };

    // The `unique_checkout_idempotency` partial index enforces one
    // 'pending' row per (customer_email, product_id). If the customer
    // re-previews the same upgrade, reuse + refresh the existing row
    // instead of failing with a 23505 unique violation.
    let existing: { id: string } | null = null;
    if (ctx.customer.email) {
      const { data } = await supabase
        .from('checkout_sessions')
        .select('id')
        .eq('organization_id', ctx.organization.id)
        .eq('customer_email', ctx.customer.email)
        .eq('product_id', ctx.product.id)
        .eq('status', 'pending')
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      existing = data;
    }

    if (existing) {
      const { error: updateError } = await supabase
        .from('checkout_sessions')
        .update({
          session_token: ctx.customer.externalUserId,
          customer_name: ctx.customer.name,
          customer_external_id: ctx.customer.externalUserId,
          metadata_id: ctx.checkoutMetadataId || null,
          expires_at: expiresAt.toISOString(),
          request_dto: dto as unknown as Json,
          metadata: sessionMetadata as unknown as Json,
          updated_at: new Date().toISOString(),
        })
        .eq('id', existing.id);

      if (updateError) {
        this.logger.error(
          'Failed to refresh existing pending checkout session:',
          updateError,
        );
        throw new BadRequestException('Failed to create checkout session');
      }

      return this.toPendingCheckoutSession(
        ctx,
        plan,
        existing.id,
        checkoutMode,
      );
    }

    const { data: row, error } = await supabase
      .from('checkout_sessions')
      .insert({
        organization_id: ctx.organization.id,
        session_token: ctx.customer.externalUserId,
        customer_email: ctx.customer.email,
        customer_name: ctx.customer.name,
        customer_external_id: ctx.customer.externalUserId,
        product_id: ctx.product.id,
        metadata_id: ctx.checkoutMetadataId || null,
        expires_at: expiresAt.toISOString(),
        status: 'pending',
        request_dto: dto as unknown as Json,
        metadata: sessionMetadata as unknown as Json,
      })
      .select('id')
      .single();

    if (error || !row) {
      this.logger.error('Failed to persist pending checkout session:', error);
      throw new BadRequestException('Failed to create checkout session');
    }

    return this.toPendingCheckoutSession(ctx, plan, row.id, checkoutMode);
  }

  // ── Helpers: status / loading ──

  private requiresExplicitExecution(ctx: BillingContext): boolean {
    return ctx.isInPlaceUpgrade || ctx.isInPlaceDowngrade || ctx.isFreeProduct || ctx.isTrialToTrialDowngrade;
  }

  private async loadSessionForExecute(
    organizationId: string,
    sessionId: string,
  ): Promise<CheckoutSessionRow> {
    const supabase = this.supabaseService.getClient();
    const { data: session, error } = await supabase
      .from('checkout_sessions')
      .select('*')
      .eq('id', sessionId)
      .eq('organization_id', organizationId)
      .single();

    if (error || !session) {
      throw new NotFoundException('Checkout session not found');
    }

    // Auto-expire stale rows so the executor doesn't process them.
    if (
      session.status === 'pending' &&
      session.expires_at &&
      new Date(session.expires_at) < new Date()
    ) {
      await this.updateSessionStatus(sessionId, 'expired');
      throw new BadRequestException('Checkout session has expired');
    }

    return session;
  }

  private async updateSessionStatus(
    sessionId: string,
    status: CheckoutSessionStatus,
    errorMessage?: string,
  ): Promise<void> {
    const supabase = this.supabaseService.getClient();
    const updates: Database['public']['Tables']['checkout_sessions']['Update'] =
      {
        status,
        updated_at: new Date().toISOString(),
      };
    if (status === 'completed') {
      updates.completed_at = new Date().toISOString();
      updates.executed_at = new Date().toISOString();
    }
    if (status === 'failed' && errorMessage) {
      updates.execution_error = errorMessage.slice(0, 1000);
    }
    await supabase
      .from('checkout_sessions')
      .update(updates)
      .eq('id', sessionId);
  }

  // ── Response shaping ──

  private toCheckoutSession(
    ctx: BillingContext,
    plan: BillingPlan,
    result: PipelineResult,
  ): CheckoutSession {
    const features = ctx.product.features.map((f) => f.title);

    return {
      id: result.checkoutSessionId,
      clientSecret: result.clientSecret,
      paymentIntentId:
        result.stripeResult.kind === 'subscription_created'
          ? result.stripeResult.paymentIntent.id
          : '',
      amount: ctx.price.amount,
      currency: ctx.price.currency,
      totalAmount: result.proration
        ? result.proration.netAmount
        : ctx.price.amount,
      checkoutMode: result.checkoutMode,
      proration: result.proration,
      downgradeInfo:
        result.checkoutMode === 'downgrade'
          ? {
              effectiveDate: ctx.transition?.oldPeriodEnd?.toISOString(),
              newPrice: ctx.price.amount,
              newInterval: ctx.price.recurringInterval,
              newIntervalCount: ctx.price.recurringIntervalCount,
              currency: ctx.price.currency,
            }
          : undefined,
      product: {
        name: ctx.product.name,
        description: ctx.product.description,
        interval: ctx.price.recurringInterval,
        intervalCount: ctx.price.recurringIntervalCount,
        features,
      },
      customer: {
        email: ctx.customer.email,
        name: ctx.customer.name,
      },
      stripeAccountId: ctx.organization.stripeAccountId,
      trialDays: ctx.product.trialDays,
      subscription: result.subscriptionId
        ? {
            id: result.subscriptionId,
            customerId: ctx.customer.id,
            productId: ctx.product.id,
            priceId: ctx.price.id,
            status: 'active',
            currentPeriodStart: new Date().toISOString(),
            currentPeriodEnd: new Date().toISOString(),
            cancelAtPeriodEnd: false,
          }
        : undefined,
      requiresAction: result.requiresAction,
      actionUrl: result.actionUrl,
      actionType: result.actionType,
      stripeInvoiceId: result.stripeInvoiceId,
    };
  }

  /**
   * Build the response payload for a deferred-flow preview that has been
   * persisted but not yet executed. Mirrors the shape returned by the
   * `getXxxCheckoutStatus` helpers in CheckoutService so the SDK gets the
   * same fields whether it polls the create endpoint or the status endpoint.
   */
  private toPendingCheckoutSession(
    ctx: BillingContext,
    plan: BillingPlan,
    sessionId: string,
    checkoutMode: PipelineResult['checkoutMode'],
  ): CheckoutSession {
    const features = ctx.product.features.map((f) => f.title);
    const proration = plan.proration
      ? {
          credit: plan.proration.creditAmount,
          charge: plan.proration.newPlanCharge,
          netAmount: plan.proration.proratedAmount,
          currency: plan.proration.currency,
        }
      : undefined;

    return {
      id: sessionId,
      clientSecret: '',
      paymentIntentId: '',
      amount: ctx.price.amount,
      currency: ctx.price.currency,
      totalAmount: proration ? proration.netAmount : ctx.price.amount,
      checkoutMode,
      proration,
      downgradeInfo:
        checkoutMode === 'downgrade'
          ? {
              effectiveDate:
                plan.subscription.kind === 'schedule_downgrade'
                  ? plan.subscription.scheduledFor.toISOString()
                  : undefined,
              newPrice: ctx.price.amount,
              newInterval: ctx.price.recurringInterval,
              newIntervalCount: ctx.price.recurringIntervalCount,
              currency: ctx.price.currency,
            }
          : undefined,
      product: {
        name: ctx.product.name,
        description: ctx.product.description,
        interval: ctx.price.recurringInterval,
        intervalCount: ctx.price.recurringIntervalCount,
        features,
      },
      customer: {
        email: ctx.customer.email,
        name: ctx.customer.name,
      },
      stripeAccountId: ctx.organization.stripeAccountId,
      trialDays: ctx.product.trialDays,
    };
  }

  /**
   * Build a CheckoutSession response from a persisted (already-completed)
   * checkout_sessions row. Used by the idempotent path of `executeCheckout`.
   *
   * Avoids re-running the pipeline; instead reads the snapshot stored in
   * `metadata` and looks up the linked subscription if any.
   */
  private async toCheckoutSessionFromPersisted(
    session: CheckoutSessionRow,
  ): Promise<CheckoutSession> {
    const supabase = this.supabaseService.getClient();
    const metadata = (session.metadata as Record<string, unknown>) || {};
    const checkoutMode =
      (metadata.checkoutMode as PipelineResult['checkoutMode']) ?? 'standard';

    const productId = metadata.productId as string | undefined;
    const priceId = metadata.priceId as string | undefined;

    let productRow: Record<string, unknown> | null = null;
    let priceRow: Record<string, unknown> | null = null;
    if (productId) {
      const { data } = await supabase
        .from('products')
        .select('*')
        .eq('id', productId)
        .single();
      productRow = data as Record<string, unknown> | null;
    }
    if (priceId) {
      const { data } = await supabase
        .from('product_prices')
        .select('*')
        .eq('id', priceId)
        .single();
      priceRow = data as Record<string, unknown> | null;
    }

    let features: string[] = [];
    if (productId) {
      const { data: pf } = await supabase
        .from('product_features')
        .select('features(title)')
        .eq('product_id', productId)
        .order('display_order', { ascending: true });
      features = (pf || [])
        .map((row: Record<string, unknown>) => {
          const f = row.features as { title?: string } | null;
          return f?.title;
        })
        .filter((t): t is string => typeof t === 'string');
    }

    let subscription: CheckoutSession['subscription'];
    const linkedSubId =
      session.subscription_id ||
      (metadata.subscriptionId as string | undefined);
    if (linkedSubId) {
      const { data: subRow } = await supabase
        .from('subscriptions')
        .select('*')
        .eq('id', linkedSubId)
        .single();
      if (subRow) {
        subscription = {
          id: subRow.id,
          customerId: subRow.customer_id,
          productId: subRow.product_id,
          priceId: subRow.price_id || '',
          status: subRow.status,
          currentPeriodStart: subRow.current_period_start,
          currentPeriodEnd: subRow.current_period_end,
          cancelAtPeriodEnd: subRow.cancel_at_period_end || false,
        };
      }
    }

    const amount =
      ((metadata.newAmount as number | undefined) ??
        (priceRow?.price_amount as number | undefined)) ||
      0;
    const currency =
      (metadata.priceCurrency as string | undefined) ||
      (priceRow?.price_currency as string | undefined) ||
      'usd';
    const proration = metadata.proration as
      | CheckoutSession['proration']
      | undefined;

    // Hydrate the SCA / 3DS fields when the session is mid-flight in
    // requires_action so SDK polling keeps receiving the hosted URL.
    const requiresAction =
      session.status === 'requires_action'
        ? true
        : (metadata.requiresAction as boolean | undefined);
    const actionUrl =
      (metadata.actionUrl as string | undefined) ||
      (metadata.hostedInvoiceUrl as string | undefined);
    const actionType = metadata.actionType as 'invoice_payment' | undefined;
    const stripeInvoiceId =
      session.stripe_invoice_id ||
      (metadata.stripeInvoiceId as string | undefined) ||
      undefined;

    return {
      id: session.id,
      clientSecret: '',
      paymentIntentId: '',
      amount,
      currency,
      totalAmount: proration?.netAmount ?? amount,
      checkoutMode,
      proration,
      product: {
        name: (productRow?.name as string) || '',
        description: (productRow?.description as string) || undefined,
        interval: (priceRow?.recurring_interval as string) || 'month',
        intervalCount: (priceRow?.recurring_interval_count as number) || 1,
        features,
      },
      customer: {
        email: session.customer_email || undefined,
        name: session.customer_name || undefined,
      },
      stripeAccountId:
        (metadata.stripeAccountId as string | undefined) || undefined,
      trialDays: (productRow?.trial_days as number | undefined) || 0,
      subscription,
      requiresAction,
      actionUrl,
      actionType,
      stripeInvoiceId,
    };
  }

  private determineCheckoutMode(
    ctx: BillingContext,
    plan: BillingPlan,
  ): PipelineResult['checkoutMode'] {
    if (ctx.isFreeProduct) return 'free';
    if (ctx.isTrialToTrialDowngrade) return 'upgrade';
    if (ctx.isTrialUpgrade) return 'upgrade';
    if (ctx.isInPlaceUpgrade) return 'upgrade';
    if (ctx.isInPlaceDowngrade) return 'downgrade';
    if (plan.subscription.kind === 'setup_trial') return 'trial';
    if (plan.useAdaptivePricing) return 'adaptive';
    return 'standard';
  }
}

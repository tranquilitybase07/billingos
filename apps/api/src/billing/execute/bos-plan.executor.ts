import { Injectable, Logger, BadRequestException } from '@nestjs/common';
import { SupabaseService } from '../../supabase/supabase.service';
import { StripeService } from '../../stripe/stripe.service';
import { QueueService } from '../../queue/queue.service';
import { CheckoutMetadataService } from '../../v1/checkout/checkout-metadata.service';
import { BillingContext } from '../context/types';
import { BillingPlan } from '../plan/types';
import { StripeResult, PipelineResult } from '../stripe/types';
import { EntitlementExecutor } from './entitlement.executor';
import {
  addInterval,
  extractPeriodEnd,
  extractPeriodStart,
} from '../utils/period-end.helper';
import type {
  Json,
  Database,
} from '../../../../../packages/shared/types/database';

type CheckoutSessionStatus =
  Database['public']['Enums']['checkout_session_status'];

export interface BosExecuteOptions {
  /**
   * Status to persist on the resulting checkout_sessions row.
   * - 'awaiting_payment' for immediate flows that still need a Stripe webhook
   *   to finalize (standard / adaptive / trial).
   * - 'completed' for synchronous executions kicked off from
   *   `BillingService.executeCheckout` (upgrades, downgrades, free).
   * - 'requires_action' for in-place upgrades that hit SCA / 3DS — the BOS
   *   subscription/entitlement writes are deferred until the
   *   `invoice.payment_succeeded` webhook fires.
   */
  persistAs: 'awaiting_payment' | 'completed' | 'requires_action';
  /**
   * If provided, the executor will UPDATE this checkout_sessions row
   * (created earlier by `previewCheckout`) instead of inserting a new one.
   */
  existingSessionId?: string;
}

interface UpsertSessionInput {
  metadata: Record<string, unknown>;
  paymentIntentId?: string;
  stripeSubscriptionId?: string;
  subscriptionId?: string;
  stripeInvoiceId?: string;
}

/**
 * Phase 4: Executes BOS database writes after Stripe succeeds.
 *
 * Principle: Stripe already succeeded at this point. If BOS writes fail,
 * webhooks will eventually reconcile. We still try our best to write
 * everything, but a DB failure is not a user-facing error.
 */
@Injectable()
export class BosPlanExecutor {
  private readonly logger = new Logger(BosPlanExecutor.name);

  constructor(
    private readonly supabaseService: SupabaseService,
    private readonly stripeService: StripeService,
    private readonly queueService: QueueService,
    private readonly metadataService: CheckoutMetadataService,
    private readonly entitlementExecutor: EntitlementExecutor,
  ) {}

  async execute(
    ctx: BillingContext,
    plan: BillingPlan,
    stripeResult: StripeResult,
    options: BosExecuteOptions,
  ): Promise<PipelineResult> {
    // 1. Execute transition BOS writes (cancel old subscription in DB).
    //    Skip for Checkout Session flows: Stripe creates the new sub only
    //    after the customer actually pays, and the
    //    `checkout.session.completed` webhook calls
    //    `transitionService.handleTransition` to cancel the old sub and
    //    swap entitlements at that point. Running it here would cancel
    //    the customer's existing plan the moment they OPEN the upgrade
    //    modal — even if they never click pay.
    if (stripeResult.kind !== 'checkout_session_created') {
      await this.executeTransition(ctx, plan);
    }

    // 2. Determine checkout mode for status polling
    const checkoutMode = this.determineCheckoutMode(ctx, plan);

    // 3. Dispatch to mode-specific BOS writer
    switch (stripeResult.kind) {
      case 'subscription_created':
        return this.handleSubscriptionCreated(
          ctx,
          plan,
          stripeResult,
          checkoutMode,
          options,
        );

      case 'checkout_session_created':
        return this.handleCheckoutSessionCreated(
          ctx,
          plan,
          stripeResult,
          checkoutMode,
          options,
        );

      case 'setup_intent_created':
        return this.handleSetupIntentCreated(
          ctx,
          plan,
          stripeResult,
          checkoutMode,
          options,
        );

      case 'subscription_updated':
        return this.handleSubscriptionUpdated(
          ctx,
          plan,
          stripeResult,
          checkoutMode,
          options,
        );

      case 'subscription_update_action_required':
        return this.handleUpgradeActionRequired(
          ctx,
          plan,
          stripeResult,
          checkoutMode,
          options,
        );

      case 'no_stripe_result':
        if (ctx.isInPlaceDowngrade) {
          return this.handleScheduledDowngrade(
            ctx,
            plan,
            checkoutMode,
            options,
          );
        }
        if (ctx.isFreeProduct) {
          return this.handleFreeActivation(ctx, plan, checkoutMode, options);
        }
        throw new Error(
          'no_stripe_result without a deferred-flow context (downgrade/free)',
        );

      default: {
        const _exhaustive: never = stripeResult;
        throw new Error(
          `Unknown stripe result: ${JSON.stringify(_exhaustive)}`,
        );
      }
    }
  }

  // ── Transition BOS writes ──

  private async executeTransition(
    ctx: BillingContext,
    plan: BillingPlan,
  ): Promise<void> {
    if (plan.transition.kind === 'no_transition') return;

    const supabase = this.supabaseService.getClient();
    const now = new Date().toISOString();

    if (plan.transition.kind === 'cancel_immediate') {
      await supabase
        .from('subscriptions')
        .update({
          status: 'canceled',
          canceled_at: now,
          ended_at: now,
          cancel_at_period_end: false,
          updated_at: now,
          metadata: {
            ...ctx.transition!.oldSubscription.metadata,
            canceledReason: plan.transition.reason,
          } as Json,
        })
        .eq('id', plan.transition.subscriptionId);
    }

    if (plan.transition.kind === 'cancel_at_period_end') {
      await supabase
        .from('subscriptions')
        .update({
          cancel_at_period_end: true,
          canceled_at: now,
          updated_at: now,
          metadata: {
            ...ctx.transition!.oldSubscription.metadata,
            canceledReason: plan.transition.reason,
            pendingDowngradeAt: plan.transition.periodEnd.toISOString(),
          } as Json,
        })
        .eq('id', plan.transition.subscriptionId);
    }

    // Execute entitlement revoke (if immediate cancel)
    if (
      plan.transition.kind === 'cancel_immediate' &&
      plan.transition.revokeFeatures
    ) {
      await this.entitlementExecutor.execute(plan.entitlements);
    }
  }

  // ── Standard subscription created ──

  private async handleSubscriptionCreated(
    ctx: BillingContext,
    plan: BillingPlan,
    result: Extract<StripeResult, { kind: 'subscription_created' }>,
    checkoutMode: PipelineResult['checkoutMode'],
    options: BosExecuteOptions,
  ): Promise<PipelineResult> {
    const supabase = this.supabaseService.getClient();
    const { subscription, paymentIntent } = result;

    // Store payment intent record
    const applicationFeeAmount = Math.round(ctx.price.amount * 0.05);
    const { data: piRecord, error: piError } = await supabase
      .from('payment_intents')
      .insert({
        organization_id: ctx.organization.id,
        customer_id: ctx.customer.id,
        stripe_payment_intent_id: paymentIntent.id,
        stripe_customer_id: ctx.customer.stripeCustomerId,
        stripe_account_id: ctx.organization.stripeAccountId,
        stripe_subscription_id: subscription.id,
        client_secret: paymentIntent.client_secret || '',
        amount: ctx.price.amount,
        currency: ctx.price.currency,
        application_fee_amount: applicationFeeAmount,
        status: paymentIntent.status,
        product_id: ctx.product.id,
        price_id: ctx.price.id,
        metadata: {
          metadataId: ctx.checkoutMetadataId || '',
          externalUserId: ctx.customer.externalUserId,
          productName: ctx.product.name,
          subscriptionCreatedDuringCheckout: true,
          ...ctx.metadata,
        } as Json,
      })
      .select()
      .single();

    if (piError) {
      this.logger.error('Failed to store payment intent:', piError);
      // Cancel Stripe subscription since we can't track it
      await this.cleanupOrphanedSubscription(
        subscription.id,
        ctx.organization.stripeAccountId,
        ctx,
      );
      throw new BadRequestException('Failed to create checkout session');
    }

    // Store subscription record
    const { error: subError } = await supabase.from('subscriptions').insert({
      customer_id: ctx.customer.id,
      organization_id: ctx.organization.id,
      product_id: ctx.product.id,
      price_id: ctx.price.id,
      stripe_subscription_id: subscription.id,
      status: subscription.status,
      current_period_start: extractPeriodStart(subscription),
      current_period_end: extractPeriodEnd(subscription),
      cancel_at_period_end: false,
      amount: ctx.price.amount,
      currency: ctx.price.currency,
      payment_intent_id: piRecord.id,
      metadata: {
        created_from: 'billing_pipeline',
        metadataId: ctx.checkoutMetadataId || '',
        externalUserId: ctx.customer.externalUserId,
      } as Json,
    });

    if (subError) {
      this.logger.error('Failed to store subscription:', subError);
      await this.cleanupOrphanedSubscription(
        subscription.id,
        ctx.organization.stripeAccountId,
        ctx,
      );
    }

    // Create / update checkout session record
    const checkoutSessionId = await this.upsertCheckoutSession(ctx, options, {
      metadata: {
        checkoutMode: 'standard',
        stripeSubscriptionId: subscription.id,
        stripeAccountId: ctx.organization.stripeAccountId,
        existingSubscriptionId: ctx.transition?.oldSubscription.id,
      },
      paymentIntentId: piRecord.id,
      stripeSubscriptionId: subscription.id,
    });

    // Link metadata
    if (ctx.checkoutMetadataId) {
      await this.metadataService.linkToCheckoutSession(
        ctx.checkoutMetadataId,
        paymentIntent.id,
      );
    }

    return {
      stripeResult: result,
      checkoutSessionId,
      clientSecret: result.clientSecret,
      checkoutMode,
    };
  }

  // ── Stripe Checkout Session created (hosted, embedded custom, adaptive) ──

  private async handleCheckoutSessionCreated(
    ctx: BillingContext,
    plan: BillingPlan,
    result: Extract<StripeResult, { kind: 'checkout_session_created' }>,
    checkoutMode: PipelineResult['checkoutMode'],
    options: BosExecuteOptions,
  ): Promise<PipelineResult> {
    const checkoutSessionId = await this.upsertCheckoutSession(ctx, options, {
      metadata: {
        checkoutMode,
        // Persist org UI preference so getCheckoutStatus can render
        // 'hosted' vs 'embedded' without re-querying organizations.
        uiMode: ctx.organization.checkoutMode,
        stripeCheckoutSessionId: result.checkoutSession.id,
        clientSecret: result.clientSecret,
        stripeAccountId: ctx.organization.stripeAccountId,
        productId: ctx.product.id,
        priceId: ctx.price.id,
        customerId: ctx.customer.id,
        priceAmount: ctx.price.amount,
        priceCurrency: ctx.price.currency,
        metadataId: ctx.checkoutMetadataId || '',
        existingSubscriptionId: ctx.transition?.oldSubscription.id,
      },
    });

    if (ctx.checkoutMetadataId) {
      await this.metadataService.linkToCheckoutSession(
        ctx.checkoutMetadataId,
        result.checkoutSession.id,
      );
    }

    return {
      stripeResult: result,
      checkoutSessionId,
      clientSecret: result.clientSecret,
      checkoutMode,
    };
  }

  // ── Trial setup intent created ──

  private async handleSetupIntentCreated(
    ctx: BillingContext,
    plan: BillingPlan,
    result: Extract<StripeResult, { kind: 'setup_intent_created' }>,
    checkoutMode: PipelineResult['checkoutMode'],
    options: BosExecuteOptions,
  ): Promise<PipelineResult> {
    const checkoutSessionId = await this.upsertCheckoutSession(ctx, options, {
      metadata: {
        checkoutMode: 'trial',
        stripeSetupIntentId: result.setupIntent.id,
        clientSecret: result.clientSecret,
        stripeAccountId: ctx.organization.stripeAccountId,
        productId: ctx.product.id,
        priceId: ctx.price.id,
        customerId: ctx.customer.id,
        priceAmount: ctx.price.amount,
        priceCurrency: ctx.price.currency,
        metadataId: ctx.checkoutMetadataId || '',
        trialDays: ctx.product.trialDays,
      },
    });

    if (ctx.checkoutMetadataId) {
      await this.metadataService.linkToCheckoutSession(
        ctx.checkoutMetadataId,
        result.setupIntent.id,
      );
    }

    return {
      stripeResult: result,
      checkoutSessionId,
      clientSecret: result.clientSecret,
      checkoutMode,
    };
  }

  // ── In-place upgrade ──

  private async handleSubscriptionUpdated(
    ctx: BillingContext,
    plan: BillingPlan,
    result: Extract<StripeResult, { kind: 'subscription_updated' }>,
    checkoutMode: PipelineResult['checkoutMode'],
    options: BosExecuteOptions,
  ): Promise<PipelineResult> {
    const supabase = this.supabaseService.getClient();
    const sub = plan.subscription;

    if (sub.kind !== 'update_subscription') {
      throw new Error(
        'Expected update_subscription action for subscription_updated result',
      );
    }

    // Update BOS subscription record
    const transitionLabel = ctx.isInPlaceSwap ? 'plan_swapped' : 'upgraded';
    const { error: updateError } = await supabase
      .from('subscriptions')
      .update({
        product_id: sub.newProductId,
        price_id: sub.newPriceId,
        amount: sub.newAmount,
        status: result.subscription.status,
        updated_at: new Date().toISOString(),
        current_period_start: extractPeriodStart(result.subscription),
        current_period_end: extractPeriodEnd(result.subscription),
        metadata: {
          ...ctx.transition!.oldSubscription.metadata,
          [ctx.isInPlaceSwap ? 'swappedAt' : 'upgradedAt']:
            new Date().toISOString(),
          previousProductId: ctx.transition!.oldSubscription.productId,
          upgradeMethod: 'in_place',
          transitionReason: transitionLabel,
        } as Json,
      })
      .eq('id', sub.existingBosSubId)
      .eq('organization_id', ctx.organization.id);

    if (updateError) {
      this.logger.error(
        `BOS update failed for sub ${sub.existingBosSubId}:`,
        updateError,
      );
      throw new BadRequestException('Failed to update subscription');
    }

    // Execute entitlement swap
    await this.entitlementExecutor.execute(
      plan.entitlements,
      sub.existingBosSubId,
    );

    // Cancel any pending scheduled downgrades for this subscription
    await supabase
      .from('subscription_changes')
      .update({
        status: 'failed',
        failed_reason: 'Superseded by upgrade',
        updated_at: new Date().toISOString(),
      })
      .eq('subscription_id', sub.existingBosSubId)
      .eq('status', 'scheduled')
      .eq('organization_id', ctx.organization.id);

    // Create / update checkout session for tracking
    const prorationInvoiceId = result.prorationInvoice?.id;
    const checkoutSessionId = await this.upsertCheckoutSession(ctx, options, {
      metadata: {
        checkoutMode: 'upgrade',
        existingSubscriptionId: sub.existingBosSubId,
        stripeAccountId: ctx.organization.stripeAccountId,
        customerId: ctx.customer.id,
        productId: sub.newProductId,
        priceId: sub.newPriceId,
        stripePriceId: sub.newStripePriceId,
        newAmount: sub.newAmount,
        ...(prorationInvoiceId ? { stripeInvoiceId: prorationInvoiceId } : {}),
        proration: plan.proration
          ? {
              credit: plan.proration.creditAmount,
              charge: plan.proration.newPlanCharge,
              netAmount: plan.proration.proratedAmount,
              currency: plan.proration.currency,
            }
          : undefined,
      },
      subscriptionId: sub.existingBosSubId,
      stripeInvoiceId: prorationInvoiceId,
    });

    return {
      stripeResult: result,
      checkoutSessionId,
      subscriptionId: sub.existingBosSubId,
      clientSecret: '',
      checkoutMode,
      proration: plan.proration
        ? {
            credit: plan.proration.creditAmount,
            charge: plan.proration.newPlanCharge,
            netAmount: plan.proration.proratedAmount,
            currency: plan.proration.currency,
          }
        : undefined,
      stripeInvoiceId: prorationInvoiceId,
    };
  }

  // ── In-place upgrade requires customer action (SCA / 3DS) ──

  /**
   * Stripe returned an `open` proration invoice that needs SCA / 3DS. We
   * persist the session in `requires_action` with the hosted invoice URL but
   * do NOT mutate the BOS subscription row or swap entitlements. The
   * `invoice.payment_succeeded` webhook handler is responsible for finalizing.
   */
  private async handleUpgradeActionRequired(
    ctx: BillingContext,
    plan: BillingPlan,
    result: Extract<
      StripeResult,
      { kind: 'subscription_update_action_required' }
    >,
    checkoutMode: PipelineResult['checkoutMode'],
    options: BosExecuteOptions,
  ): Promise<PipelineResult> {
    const sub = plan.subscription;
    if (sub.kind !== 'update_subscription') {
      throw new Error(
        'Expected update_subscription action for action-required result',
      );
    }

    // 30-minute grace before BillingCleanupService voids the invoice and
    // reverts the sub. Long enough for SCA but not so long that an abandoned
    // upgrade lingers indefinitely.
    const actionExpiresAt = new Date(Date.now() + 30 * 60 * 1000).toISOString();

    const checkoutSessionId = await this.upsertCheckoutSession(
      // Override persistAs to requires_action regardless of caller intent —
      // we cannot mark the session 'completed' until the customer authenticates.
      ctx,
      { ...options, persistAs: 'requires_action' },
      {
        metadata: {
          checkoutMode: 'upgrade',
          existingSubscriptionId: sub.existingBosSubId,
          stripeAccountId: ctx.organization.stripeAccountId,
          customerId: ctx.customer.id,
          productId: sub.newProductId,
          priceId: sub.newPriceId,
          stripePriceId: sub.newStripePriceId,
          newAmount: sub.newAmount,
          stripeInvoiceId: result.invoice.id,
          requiresAction: true,
          actionType: 'invoice_payment',
          actionUrl: result.hostedInvoiceUrl,
          hostedInvoiceUrl: result.hostedInvoiceUrl,
          actionExpiresAt,
          proration: plan.proration
            ? {
                credit: plan.proration.creditAmount,
                charge: plan.proration.newPlanCharge,
                netAmount: plan.proration.proratedAmount,
                currency: plan.proration.currency,
              }
            : undefined,
        },
        subscriptionId: sub.existingBosSubId,
        stripeInvoiceId: result.invoice.id ?? undefined,
      },
    );

    return {
      stripeResult: result,
      checkoutSessionId,
      // Intentionally do NOT set subscriptionId here — the BOS sub has not
      // been mutated yet, so the response should not pretend it has.
      clientSecret: '',
      checkoutMode,
      proration: plan.proration
        ? {
            credit: plan.proration.creditAmount,
            charge: plan.proration.newPlanCharge,
            netAmount: plan.proration.proratedAmount,
            currency: plan.proration.currency,
          }
        : undefined,
      requiresAction: true,
      actionUrl: result.hostedInvoiceUrl,
      actionType: 'invoice_payment',
      stripeInvoiceId: result.invoice.id ?? undefined,
    };
  }

  // ── Scheduled downgrade ──

  private async handleScheduledDowngrade(
    ctx: BillingContext,
    plan: BillingPlan,
    checkoutMode: PipelineResult['checkoutMode'],
    options: BosExecuteOptions,
  ): Promise<PipelineResult> {
    const supabase = this.supabaseService.getClient();
    const sub = plan.subscription;

    if (sub.kind !== 'schedule_downgrade') {
      throw new Error(
        'Expected schedule_downgrade action for scheduled downgrade',
      );
    }

    // Cancel any existing scheduled downgrade for this subscription
    await supabase
      .from('subscription_changes')
      .update({
        status: 'failed',
        failed_reason: 'Superseded by new downgrade',
        updated_at: new Date().toISOString(),
      })
      .eq('subscription_id', sub.existingBosSubId)
      .eq('status', 'scheduled')
      .eq('organization_id', ctx.organization.id);

    // Insert new scheduled downgrade
    const { error: insertError } = await supabase
      .from('subscription_changes')
      .insert({
        subscription_id: sub.existingBosSubId,
        organization_id: ctx.organization.id,
        change_type: 'downgrade',
        status: 'scheduled',
        from_price_id: sub.fromPriceId,
        to_price_id: sub.newPriceId,
        from_amount: sub.fromAmount,
        to_amount: sub.newAmount,
        scheduled_for: sub.scheduledFor.toISOString(),
        metadata: {
          scheduledBy: 'billing_pipeline',
        } as Json,
      });

    if (insertError) {
      this.logger.error(
        `Failed to insert subscription_changes for sub ${sub.existingBosSubId}:`,
        insertError,
      );
      throw new BadRequestException('Failed to schedule downgrade');
    }

    // For paid→free downgrades: tell Stripe to stop billing at period end.
    // When the period ends, Stripe fires customer.subscription.deleted which
    // the webhook handler will intercept and let the scheduler complete the transition.
    if (
      !sub.newStripePriceId &&
      ctx.transition?.oldSubscription.stripeSubscriptionId
    ) {
      try {
        await this.stripeService.cancelSubscription(
          ctx.transition.oldSubscription.stripeSubscriptionId,
          ctx.organization.stripeAccountId,
          true, // cancel at period end
        );
      } catch (error) {
        this.logger.error('Failed to set cancel_at_period_end:', error);
        throw new BadRequestException(
          'Failed to schedule subscription cancellation in Stripe',
        );
      }

      // Stripe accepted the cancellation — mirror it in BOS.
      await supabase
        .from('subscriptions')
        .update({
          cancel_at_period_end: true,
          updated_at: new Date().toISOString(),
        })
        .eq('id', sub.existingBosSubId)
        .eq('organization_id', ctx.organization.id);
    }

    const checkoutSessionId = await this.upsertCheckoutSession(ctx, options, {
      metadata: {
        checkoutMode: 'downgrade',
        existingSubscriptionId: sub.existingBosSubId,
        stripeAccountId: ctx.organization.stripeAccountId,
        customerId: ctx.customer.id,
        productId: sub.newProductId,
        priceId: sub.newPriceId,
        stripePriceId: sub.newStripePriceId,
        newAmount: sub.newAmount,
        scheduledFor: sub.scheduledFor.toISOString(),
        effectiveDate: sub.scheduledFor.toISOString(),
        fromPriceId: sub.fromPriceId,
        fromAmount: sub.fromAmount,
      },
      subscriptionId: sub.existingBosSubId,
    });

    return {
      stripeResult: { kind: 'no_stripe_result' },
      checkoutSessionId,
      subscriptionId: sub.existingBosSubId,
      clientSecret: '',
      checkoutMode,
    };
  }

  // ── Free activation ──

  private async handleFreeActivation(
    ctx: BillingContext,
    plan: BillingPlan,
    checkoutMode: PipelineResult['checkoutMode'],
    options: BosExecuteOptions,
  ): Promise<PipelineResult> {
    const supabase = this.supabaseService.getClient();
    const now = new Date();

    // Reuse-or-create subscription. Free flows have no Stripe object,
    // so the entire activation is BOS-only.
    const { data: existing } = await supabase
      .from('subscriptions')
      .select('*')
      .eq('customer_id', ctx.customer.id)
      .eq('product_id', ctx.product.id)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    let subscriptionId: string;
    const periodEnd = addInterval(
      now,
      ctx.price.recurringInterval,
      ctx.price.recurringIntervalCount,
    ).toISOString();

    if (
      existing &&
      (existing.status === 'active' || existing.status === 'trialing')
    ) {
      // Already active — idempotent
      subscriptionId = existing.id;
    } else if (
      existing &&
      (existing.status === 'canceled' || existing.status === 'ended')
    ) {
      // Reactivate
      const { data: reactivated, error: reactivateError } = await supabase
        .from('subscriptions')
        .update({
          status: 'active',
          current_period_start: now.toISOString(),
          current_period_end: periodEnd,
          cancel_at_period_end: false,
          canceled_at: null,
          ended_at: null,
          updated_at: now.toISOString(),
          metadata: {
            ...((existing.metadata as Record<string, unknown>) || {}),
            isFreeProduct: true,
            reactivatedAt: now.toISOString(),
            metadataId: ctx.checkoutMetadataId || '',
          } as Json,
        })
        .eq('id', existing.id)
        .select('id')
        .single();

      if (reactivateError || !reactivated) {
        this.logger.error(
          'Failed to reactivate free subscription:',
          reactivateError,
        );
        throw new BadRequestException('Failed to reactivate subscription');
      }
      subscriptionId = reactivated.id;
    } else {
      const { data: newSub, error: insertError } = await supabase
        .from('subscriptions')
        .insert({
          organization_id: ctx.organization.id,
          customer_id: ctx.customer.id,
          product_id: ctx.product.id,
          price_id: ctx.price.id,
          stripe_subscription_id: null,
          status: 'active',
          amount: 0,
          currency: ctx.price.currency,
          current_period_start: now.toISOString(),
          current_period_end: periodEnd,
          trial_start: null,
          trial_end: null,
          cancel_at_period_end: false,
          canceled_at: null,
          ended_at: null,
          metadata: {
            isFreeProduct: true,
            metadataId: ctx.checkoutMetadataId || '',
            externalUserId: ctx.customer.externalUserId,
          } as Json,
        })
        .select('id')
        .single();

      if (insertError || !newSub) {
        this.logger.error('Failed to create free subscription:', insertError);
        throw new BadRequestException('Failed to create subscription');
      }
      subscriptionId = newSub.id;
    }

    // Grant entitlements (use the actual sub id)
    await this.entitlementExecutor.execute(plan.entitlements, subscriptionId);

    const checkoutSessionId = await this.upsertCheckoutSession(ctx, options, {
      metadata: {
        checkoutMode: 'free',
        isFreeProduct: true,
        productId: ctx.product.id,
        priceId: ctx.price.id,
        customerId: ctx.customer.id,
      },
      subscriptionId,
    });

    return {
      stripeResult: { kind: 'no_stripe_result' },
      checkoutSessionId,
      subscriptionId,
      clientSecret: '',
      checkoutMode,
    };
  }

  // ── Helpers ──

  private async upsertCheckoutSession(
    ctx: BillingContext,
    options: BosExecuteOptions,
    input: UpsertSessionInput,
  ): Promise<string> {
    const supabase = this.supabaseService.getClient();
    const status: CheckoutSessionStatus = options.persistAs;

    if (options.existingSessionId) {
      // UPDATE the existing pending row
      const { data: existing } = await supabase
        .from('checkout_sessions')
        .select('metadata')
        .eq('id', options.existingSessionId)
        .single();

      const mergedMetadata = {
        ...((existing?.metadata as Record<string, unknown>) || {}),
        ...input.metadata,
      };

      const updates: Database['public']['Tables']['checkout_sessions']['Update'] =
        {
          metadata: mergedMetadata as unknown as Json,
          status,
          updated_at: new Date().toISOString(),
        };
      if (input.paymentIntentId) {
        updates.payment_intent_id = input.paymentIntentId;
      }
      if (input.stripeSubscriptionId) {
        updates.stripe_subscription_id = input.stripeSubscriptionId;
      }
      if (input.subscriptionId) {
        updates.subscription_id = input.subscriptionId;
      }
      if (input.stripeInvoiceId) {
        updates.stripe_invoice_id = input.stripeInvoiceId;
      }
      if (status === 'completed') {
        updates.completed_at = new Date().toISOString();
        updates.executed_at = new Date().toISOString();
      }

      const { error } = await supabase
        .from('checkout_sessions')
        .update(updates)
        .eq('id', options.existingSessionId);

      if (error) {
        this.logger.error('Failed to update existing checkout session:', error);
        throw new BadRequestException('Failed to update checkout session');
      }
      return options.existingSessionId;
    }

    // INSERT a fresh row (immediate flows: standard / adaptive / trial)
    const expiresAt = new Date();
    expiresAt.setHours(expiresAt.getHours() + 1);

    const { data: session, error } = await supabase
      .from('checkout_sessions')
      .insert({
        organization_id: ctx.organization.id,
        session_token: ctx.customer.externalUserId,
        payment_intent_id: input.paymentIntentId || null,
        stripe_subscription_id: input.stripeSubscriptionId || null,
        stripe_invoice_id: input.stripeInvoiceId || null,
        subscription_id: input.subscriptionId || null,
        product_id: ctx.product.id,
        metadata_id: ctx.checkoutMetadataId || null,
        customer_email: ctx.customer.email,
        customer_name: ctx.customer.name,
        customer_external_id: ctx.customer.externalUserId,
        expires_at: expiresAt.toISOString(),
        status,
        ...(status === 'completed'
          ? {
              completed_at: new Date().toISOString(),
              executed_at: new Date().toISOString(),
            }
          : {}),
        metadata: {
          ...ctx.metadata,
          ...input.metadata,
        } as Json,
      })
      .select('id')
      .single();

    if (error) {
      this.logger.error('Failed to create checkout session:', error);
      throw new BadRequestException('Failed to create checkout session');
    }

    return session.id;
  }

  private async cleanupOrphanedSubscription(
    stripeSubscriptionId: string,
    stripeAccountId: string,
    ctx: BillingContext,
  ): Promise<void> {
    try {
      await this.stripeService.cancelSubscription(
        stripeSubscriptionId,
        stripeAccountId,
      );
      this.logger.warn(
        `Canceled orphaned Stripe subscription ${stripeSubscriptionId} due to DB error`,
      );
    } catch (cancelError) {
      this.logger.error('Failed to cancel orphaned subscription:', cancelError);
      await this.queueService.sendReconciliation({
        type: 'orphaned_stripe_subscription',
        reference_id: stripeSubscriptionId,
        priority: 2,
        details: {
          stripe_subscription_id: stripeSubscriptionId,
          stripe_account_id: stripeAccountId,
          customer_id: ctx.customer.id,
          product_id: ctx.product.id,
        },
        organization_id: ctx.organization.id,
        created_by: 'billing_pipeline',
      });
    }
  }

  private determineCheckoutMode(
    ctx: BillingContext,
    plan: BillingPlan,
  ): PipelineResult['checkoutMode'] {
    if (ctx.isFreeProduct) return 'free';
    if (ctx.isInPlaceUpgrade) return 'upgrade';
    if (ctx.isInPlaceSwap) return 'upgrade';
    if (ctx.isInPlaceDowngrade) return 'downgrade';
    if (plan.subscription.kind === 'setup_trial') return 'trial';
    if (plan.useAdaptivePricing) return 'adaptive';
    return 'standard';
  }
}

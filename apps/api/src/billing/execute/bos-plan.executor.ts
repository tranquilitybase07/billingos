import { Injectable, Logger, BadRequestException } from '@nestjs/common';
import { SupabaseService } from '../../supabase/supabase.service';
import { StripeService } from '../../stripe/stripe.service';
import { QueueService } from '../../queue/queue.service';
import { CheckoutMetadataService } from '../../v1/checkout/checkout-metadata.service';
import { BillingContext } from '../context/types';
import { BillingPlan } from '../plan/types';
import { StripeResult, PipelineResult } from '../stripe/types';
import { EntitlementExecutor } from './entitlement.executor';
import type { Json } from '../../../../../packages/shared/types/database';

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
  ): Promise<PipelineResult> {
    const supabase = this.supabaseService.getClient();

    // 1. Execute transition BOS writes (cancel old subscription in DB)
    await this.executeTransition(ctx, plan);

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
        );

      case 'checkout_session_created':
        return this.handleCheckoutSessionCreated(
          ctx,
          plan,
          stripeResult,
          checkoutMode,
        );

      case 'setup_intent_created':
        return this.handleSetupIntentCreated(
          ctx,
          plan,
          stripeResult,
          checkoutMode,
        );

      case 'subscription_updated':
        return this.handleSubscriptionUpdated(
          ctx,
          plan,
          stripeResult,
          checkoutMode,
        );

      case 'no_stripe_result':
        if (ctx.isInPlaceDowngrade) {
          return this.handleScheduledDowngrade(ctx, plan, checkoutMode);
        }
        return this.handleFreeActivation(ctx, plan, checkoutMode);

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
    const subData = subscription as unknown as Record<string, unknown>;
    const { error: subError } = await supabase.from('subscriptions').insert({
      customer_id: ctx.customer.id,
      organization_id: ctx.organization.id,
      product_id: ctx.product.id,
      price_id: ctx.price.id,
      stripe_subscription_id: subscription.id,
      status: subscription.status,
      current_period_start: subData.current_period_start
        ? new Date(
            (subData.current_period_start as number) * 1000,
          ).toISOString()
        : new Date().toISOString(),
      current_period_end: subData.current_period_end
        ? new Date((subData.current_period_end as number) * 1000).toISOString()
        : new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
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

    // Create checkout session record
    const checkoutSessionId = await this.createCheckoutSession(
      ctx,
      {
        checkoutMode: 'standard',
        stripeSubscriptionId: subscription.id,
        stripeAccountId: ctx.organization.stripeAccountId,
        existingSubscriptionId: ctx.transition?.oldSubscription.id,
      },
      piRecord.id,
      subscription.id,
    );

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

  // ── Adaptive checkout session created ──

  private async handleCheckoutSessionCreated(
    ctx: BillingContext,
    plan: BillingPlan,
    result: Extract<StripeResult, { kind: 'checkout_session_created' }>,
    checkoutMode: PipelineResult['checkoutMode'],
  ): Promise<PipelineResult> {
    const checkoutSessionId = await this.createCheckoutSession(ctx, {
      checkoutMode: 'adaptive',
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
  ): Promise<PipelineResult> {
    const checkoutSessionId = await this.createCheckoutSession(ctx, {
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
  ): Promise<PipelineResult> {
    const supabase = this.supabaseService.getClient();
    const sub = plan.subscription;

    if (sub.kind !== 'update_subscription') {
      throw new Error(
        'Expected update_subscription action for subscription_updated result',
      );
    }

    // Update BOS subscription record
    const { error: updateError } = await supabase
      .from('subscriptions')
      .update({
        product_id: sub.newProductId,
        price_id: sub.newPriceId,
        amount: sub.newAmount,
        status: result.subscription.status,
        updated_at: new Date().toISOString(),
        metadata: {
          ...ctx.transition!.oldSubscription.metadata,
          upgradedAt: new Date().toISOString(),
          previousProductId: ctx.transition!.oldSubscription.productId,
          upgradeMethod: 'in_place',
        } as Json,
      })
      .eq('id', sub.existingBosSubId);

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

    // Create checkout session for tracking
    const checkoutSessionId = await this.createCheckoutSession(ctx, {
      checkoutMode: 'upgrade',
      existingSubscriptionId: sub.existingBosSubId,
      stripeAccountId: ctx.organization.stripeAccountId,
      customerId: ctx.customer.id,
      productId: sub.newProductId,
      priceId: sub.newPriceId,
      stripePriceId: sub.newStripePriceId,
      newAmount: sub.newAmount,
      proration: plan.proration
        ? {
            credit: plan.proration.creditAmount,
            charge: plan.proration.newPlanCharge,
            netAmount: plan.proration.proratedAmount,
            currency: plan.proration.currency,
          }
        : undefined,
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
    };
  }

  // ── Scheduled downgrade ──

  private async handleScheduledDowngrade(
    ctx: BillingContext,
    plan: BillingPlan,
    checkoutMode: PipelineResult['checkoutMode'],
  ): Promise<PipelineResult> {
    const sub = plan.subscription;

    if (sub.kind !== 'schedule_downgrade') {
      throw new Error(
        'Expected schedule_downgrade action for scheduled downgrade',
      );
    }

    // Create checkout session with downgrade metadata — no DB updates to subscriptions or entitlements
    const checkoutSessionId = await this.createCheckoutSession(ctx, {
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
    });

    return {
      stripeResult: { kind: 'no_stripe_result' },
      checkoutSessionId,
      clientSecret: '',
      checkoutMode,
    };
  }

  // ── Free activation ──

  private async handleFreeActivation(
    ctx: BillingContext,
    plan: BillingPlan,
    checkoutMode: PipelineResult['checkoutMode'],
  ): Promise<PipelineResult> {
    const checkoutSessionId = await this.createCheckoutSession(ctx, {
      checkoutMode: 'free',
      isFreeProduct: true,
      productId: ctx.product.id,
      priceId: ctx.price.id,
      customerId: ctx.customer.id,
    });

    return {
      stripeResult: { kind: 'no_stripe_result' },
      checkoutSessionId,
      clientSecret: '',
      checkoutMode,
    };
  }

  // ── Helpers ──

  private async createCheckoutSession(
    ctx: BillingContext,
    metadata: Record<string, unknown>,
    paymentIntentId?: string,
    stripeSubscriptionId?: string,
  ): Promise<string> {
    const supabase = this.supabaseService.getClient();
    const expiresAt = new Date();
    expiresAt.setHours(expiresAt.getHours() + 1);

    const { data: session, error } = await supabase
      .from('checkout_sessions')
      .insert({
        organization_id: ctx.organization.id,
        session_token: ctx.customer.externalUserId,
        payment_intent_id: paymentIntentId || null,
        stripe_subscription_id: stripeSubscriptionId || null,
        customer_email: ctx.customer.email,
        customer_name: ctx.customer.name,
        customer_external_id: ctx.customer.externalUserId,
        expires_at: expiresAt.toISOString(),
        metadata: {
          ...ctx.metadata,
          ...metadata,
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
    if (ctx.isInPlaceDowngrade) return 'downgrade';
    if (plan.subscription.kind === 'setup_trial') return 'trial';
    if (plan.useAdaptivePricing) return 'adaptive';
    return 'standard';
  }
}

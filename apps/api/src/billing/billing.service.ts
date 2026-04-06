import { Injectable, Logger } from '@nestjs/common';
import { RedisService } from '../redis/redis.service';
import { CheckoutMetadataService } from '../v1/checkout/checkout-metadata.service';
import { BillingContextBuilder } from './context/billing-context.builder';
import { BillingPlanBuilder } from './plan/billing-plan.builder';
import { StripePlanBuilder } from './stripe/stripe-plan.builder';
import { StripePlanExecutor } from './stripe/stripe-plan.executor';
import { BosPlanExecutor } from './execute/bos-plan.executor';
import { BillingContext } from './context/types';
import { PipelineResult } from './stripe/types';
import { CreateCheckoutDto } from '../v1/checkout/dto/create-checkout.dto';
import { CheckoutSession } from '../v1/checkout/checkout.service';

/**
 * Thin orchestrator: Context → Plan → Stripe → Execute.
 *
 * This is the single entry point for all checkout operations.
 * Each phase is independently testable; the orchestrator just
 * wires them together.
 */
@Injectable()
export class BillingService {
  private readonly logger = new Logger(BillingService.name);

  constructor(
    private readonly contextBuilder: BillingContextBuilder,
    private readonly planBuilder: BillingPlanBuilder,
    private readonly stripePlanBuilder: StripePlanBuilder,
    private readonly stripePlanExecutor: StripePlanExecutor,
    private readonly bosPlanExecutor: BosPlanExecutor,
    private readonly metadataService: CheckoutMetadataService,
    private readonly redisService: RedisService,
  ) {}

  /**
   * Run the full billing pipeline for a checkout request.
   */
  async checkout(
    organizationId: string,
    externalUserId: string,
    dto: CreateCheckoutDto,
  ): Promise<CheckoutSession> {
    // Phase 1: Build context
    const ctx = await this.contextBuilder.build(
      organizationId,
      externalUserId,
      dto,
    );

    // Create metadata record for audit trail
    const checkoutMetadata = await this.metadataService.createMetadata({
      organizationId: ctx.organization.id,
      customerId: ctx.customer.id,
      productId: ctx.product.id,
      priceId: ctx.price.id,
      customerEmail: ctx.customer.email || '',
      customerName: ctx.customer.name || undefined,
      productName: ctx.product.name,
      priceAmount: ctx.price.amount,
      currency: ctx.price.currency,
      billingInterval: ctx.price.recurringInterval as
        | 'month'
        | 'year'
        | undefined,
      billingIntervalCount: ctx.price.recurringIntervalCount,
      trialPeriodDays: ctx.product.trialDays || undefined,
      shouldGrantTrial: ctx.isTrialEligible,
      featuresToGrant: [],
      successUrl:
        dto.successUrl || `${process.env.APP_URL}/embed/checkout/complete`,
      cancelUrl:
        dto.cancelUrl || `${process.env.APP_URL}/embed/checkout/cancel`,
      metadata: {
        externalUserId: ctx.customer.externalUserId,
        ...dto.metadata,
      },
    });

    // Attach metadata ID to context
    const ctxWithMetadata: BillingContext = {
      ...ctx,
      checkoutMetadataId: checkoutMetadata.id,
    };

    // Phase 2: Compute plan
    const plan = await this.planBuilder.build(ctxWithMetadata);

    // Phase 3a: Map plan to Stripe operations
    const stripePlan = this.stripePlanBuilder.build(ctxWithMetadata, plan);

    // Phase 3b: Execute Stripe operations (Stripe first, BOS second)
    const stripeResult = await this.stripePlanExecutor.execute(stripePlan);

    // Phase 4: Execute BOS database writes
    const pipelineResult = await this.bosPlanExecutor.execute(
      ctxWithMetadata,
      plan,
      stripeResult,
    );

    // Convert pipeline result to CheckoutSession response
    return this.toCheckoutSession(ctxWithMetadata, plan, pipelineResult);
  }

  /**
   * Convert internal pipeline result to the CheckoutSession interface
   * that the controller returns to the frontend.
   */
  private toCheckoutSession(
    ctx: BillingContext,
    plan: import('./plan/types').BillingPlan,
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
    };
  }
}

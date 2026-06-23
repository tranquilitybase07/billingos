import { Injectable, Logger, BadRequestException } from '@nestjs/common';
import { SupabaseService } from '../../supabase/supabase.service';
import { ChurnContextService } from './churn-context.service';
import {
  ChurnFlowConfig,
  DiscountOffer,
  Offer,
  PauseOffer,
  SurveyStep,
} from './dto/churn-flow-config';
import { isDiscountEligible } from './eligibility';
import {
  ApplyOfferDto,
  ChurnCancelDto,
  ChurnEventDto,
} from './dto/churn-engine.dto';
import {
  ChurnContext,
  SubscriptionView,
} from './resolvers/subscription-resolver.interface';

interface ChurnEventInput {
  eventType: ChurnEventDto['eventType'];
  reason?: string;
  feedback?: string;
  offer?: Record<string, unknown>;
  outcome?: string;
}

type ApplyOfferOutcome =
  | 'saved'
  | 'already_discounted'
  | 'already_paused'
  | 'not_eligible';

@Injectable()
export class ChurnService {
  private readonly logger = new Logger(ChurnService.name);

  constructor(
    private readonly supabaseService: SupabaseService,
    private readonly churnContextService: ChurnContextService,
  ) {}

  async getConfig(
    sessionId: string,
    subscriptionId: string,
  ): Promise<{
    flow: ChurnFlowConfig | null;
    subscription: SubscriptionView;
    offerEligible: boolean;
  }> {
    const ctx = await this.churnContextService.resolveFromPortalSession(
      sessionId,
      subscriptionId,
    );
    const [subscription, redeemedBefore] = await Promise.all([
      ctx.resolver.getSubscription(ctx),
      this.hasRedeemedChurnOffer(ctx, 'discount'),
    ]);
    const offerEligible = isDiscountEligible(
      subscription.hasActiveDiscount,
      redeemedBefore,
      ctx.flow?.settings?.allowRepeatDiscount ?? false,
    );
    return { flow: ctx.flow, subscription, offerEligible };
  }

  async logEvent(
    sessionId: string,
    dto: ChurnEventDto,
  ): Promise<{ success: boolean }> {
    const ctx = await this.churnContextService.resolveFromPortalSession(
      sessionId,
      dto.subscriptionId,
    );
    await this.recordEvent(ctx, {
      eventType: dto.eventType,
      reason: dto.reason,
      feedback: dto.feedback,
      offer: dto.offer,
    });
    return { success: true };
  }

  async applyOffer(
    sessionId: string,
    dto: ApplyOfferDto,
  ): Promise<{
    subscription: SubscriptionView;
    outcome: ApplyOfferOutcome;
  }> {
    const ctx = await this.churnContextService.resolveFromPortalSession(
      sessionId,
      dto.subscriptionId,
    );

    const offer = this.findOfferForReason(ctx.flow, dto.reason);
    if (!offer) {
      throw new BadRequestException('No offer is configured for that reason');
    }

    switch (offer.type) {
      case 'discount':
        return this.applyDiscountOffer(ctx, offer, dto.reason);
      case 'pause':
        return this.applyPauseOffer(ctx, offer, dto.reason);
      default:
        throw new BadRequestException(
          `Offer type "${offer.type}" is not executable server-side`,
        );
    }
  }

  private async applyDiscountOffer(
    ctx: ChurnContext,
    offer: DiscountOffer,
    reason: string,
  ): Promise<{ subscription: SubscriptionView; outcome: ApplyOfferOutcome }> {
    // Eligibility guard — BOS reads only, no Stripe call (rate-limit safety).
    const view = await ctx.resolver.getSubscription(ctx);
    if (view.hasActiveDiscount) {
      return { subscription: view, outcome: 'already_discounted' };
    }
    const redeemedBefore = await this.hasRedeemedChurnOffer(ctx, 'discount');
    const allowRepeat = ctx.flow?.settings?.allowRepeatDiscount ?? false;
    if (!isDiscountEligible(false, redeemedBefore, allowRepeat)) {
      return { subscription: view, outcome: 'not_eligible' };
    }

    const subscription = await ctx.resolver.applyDiscount(ctx, offer, reason);

    await this.recordEvent(ctx, {
      eventType: 'offer_accepted',
      reason,
      offer: offer as unknown as Record<string, unknown>,
      outcome: 'saved',
    });

    return { subscription, outcome: 'saved' };
  }

  private async applyPauseOffer(
    ctx: ChurnContext,
    offer: PauseOffer,
    reason: string,
  ): Promise<{ subscription: SubscriptionView; outcome: ApplyOfferOutcome }> {
    // Eligibility guard — BOS reads only, no Stripe call (rate-limit safety).
    const view = await ctx.resolver.getSubscription(ctx);
    if (view.isPaused) {
      return { subscription: view, outcome: 'already_paused' };
    }
    const redeemedBefore = await this.hasRedeemedChurnOffer(ctx, 'pause');
    const allowRepeat = ctx.flow?.settings?.allowRepeatPause ?? false;
    if (redeemedBefore && !allowRepeat) {
      return { subscription: view, outcome: 'not_eligible' };
    }

    const subscription = await ctx.resolver.pause(ctx, offer);

    await this.recordEvent(ctx, {
      eventType: 'offer_accepted',
      reason,
      offer: offer as unknown as Record<string, unknown>,
      outcome: 'saved',
    });

    return { subscription, outcome: 'saved' };
  }

  async cancel(
    sessionId: string,
    dto: ChurnCancelDto,
  ): Promise<{ subscription: SubscriptionView; outcome: 'canceled' }> {
    const ctx = await this.churnContextService.resolveFromPortalSession(
      sessionId,
      dto.subscriptionId,
    );

    const subscription = await ctx.resolver.cancel(
      ctx,
      dto.timing,
      dto.reason,
      dto.feedback,
    );

    await this.recordEvent(ctx, {
      eventType: 'canceled',
      reason: dto.reason,
      feedback: dto.feedback,
      outcome: 'canceled',
    });

    return { subscription, outcome: 'canceled' };
  }

  private async hasRedeemedChurnOffer(
    ctx: ChurnContext,
    offerType: 'discount' | 'pause',
  ): Promise<boolean> {
    if (!ctx.bosSubscriptionId) return false;
    const supabase = this.supabaseService.getClient();
    const { count } = await supabase
      .from('churn_events')
      .select('id', { count: 'exact', head: true })
      .eq('organization_id', ctx.organizationId)
      .eq('subscription_id', ctx.bosSubscriptionId)
      .eq('event_type', 'offer_accepted')
      .eq('offer->>type', offerType);
    return (count ?? 0) > 0;
  }

  private findOfferForReason(
    flow: ChurnFlowConfig | null,
    reasonKey: string,
  ): Offer | undefined {
    if (!flow) {
      return undefined;
    }
    const survey = flow.steps.find((s): s is SurveyStep => s.type === 'survey');
    return survey?.reasons.find((r) => r.key === reasonKey)?.offer;
  }

  /**
   * Listener path — fire-and-forget analytics. Never throws into the flow.
   */
  private async recordEvent(
    ctx: ChurnContext,
    input: ChurnEventInput,
  ): Promise<void> {
    try {
      const supabase = this.supabaseService.getClient();
      const { error } = await supabase.from('churn_events').insert({
        organization_id: ctx.organizationId,
        customer_id: ctx.customerId ?? null,
        subscription_id: ctx.bosSubscriptionId ?? null,
        flow_id: ctx.flowId ?? null,
        event_type: input.eventType,
        reason: input.reason ?? null,
        feedback: input.feedback ?? null,
        offer: (input.offer as never) ?? null,
        outcome: input.outcome ?? null,
        source: ctx.source,
      });
      if (error) {
        this.logger.warn(`Failed to record churn event: ${error.message}`);
      }
    } catch (err) {
      this.logger.warn(
        `Failed to record churn event: ${(err as Error).message}`,
      );
    }
  }
}

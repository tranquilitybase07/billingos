import {
  ChurnFlowConfig,
  DiscountOffer,
  DowngradeOffer,
  PauseOffer,
} from '../dto/churn-flow-config';

export interface SubscriptionView {
  id: string;
  status: string;
  planName: string;
  amount: number;
  currency: string;
  interval: string;
  renewalDate: string;
  cancelAtPeriodEnd: boolean;
  hasActiveDiscount: boolean;
  isPaused: boolean;
}

export interface DowngradeTargetView {
  priceId: string;
  productId: string;
  stripePriceId: string | null;
  planName: string;
  amount: number;
  currency: string;
  interval: string;
}

export interface ChurnContext {
  organizationId: string;
  stripeAccountId: string;
  subscriptionRef: string;
  bosSubscriptionId?: string;
  customerId?: string;
  flowId?: string;
  /** The org's enabled churn flow, loaded once when the context is built. */
  flow: ChurnFlowConfig | null;
  source: 'portal' | 'embed' | 'api';
  resolver: SubscriptionResolver;
}

export interface SubscriptionResolver {
  getSubscription(ctx: ChurnContext): Promise<SubscriptionView>;
  applyDiscount(
    ctx: ChurnContext,
    offer: DiscountOffer,
    reasonKey: string,
  ): Promise<SubscriptionView>;
  pause(ctx: ChurnContext, offer: PauseOffer): Promise<SubscriptionView>;
  downgrade(
    ctx: ChurnContext,
    offer: DowngradeOffer,
  ): Promise<SubscriptionView>;
  /**
   * Resolve the effective downgrade target for an offer (pinned price or the
   * auto-picked next-cheaper plan). BOS reads only. Returns null when no valid
   * cheaper target exists — used both to enrich the served config and to schedule.
   */
  resolveDowngradeTarget(
    ctx: ChurnContext,
    offer: DowngradeOffer,
  ): Promise<DowngradeTargetView | null>;
  cancel(
    ctx: ChurnContext,
    timing: 'immediate' | 'end_of_period',
    reason?: string,
    feedback?: string,
  ): Promise<SubscriptionView>;
}

export const SUBSCRIPTION_RESOLVER = Symbol('SUBSCRIPTION_RESOLVER');

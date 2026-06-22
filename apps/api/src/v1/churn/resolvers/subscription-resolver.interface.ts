import { DiscountOffer } from '../dto/churn-flow-config';

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
}

export interface ChurnContext {
  organizationId: string;
  stripeAccountId: string;
  subscriptionRef: string;
  bosSubscriptionId?: string;
  customerId?: string;
  flowId?: string;
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
  cancel(
    ctx: ChurnContext,
    timing: 'immediate' | 'end_of_period',
    reason?: string,
    feedback?: string,
  ): Promise<SubscriptionView>;
}

export const SUBSCRIPTION_RESOLVER = Symbol('SUBSCRIPTION_RESOLVER');

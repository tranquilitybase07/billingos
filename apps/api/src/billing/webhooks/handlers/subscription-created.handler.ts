import {
  Injectable,
  Logger,
  OnModuleInit,
  Inject,
  forwardRef,
} from '@nestjs/common';
import Stripe from 'stripe';
import { WebhookContext, WebhookHandler } from '../webhook.types';
import { WebhookRouter } from '../webhook.router';
import { SubscriptionTransitionService } from '../../../subscriptions/subscription-transition.service';

/**
 * Handles `customer.subscription.created` webhook events.
 *
 * When Stripe fires this event, the subscription may already exist in BOS
 * (created via our checkout API). The handler:
 *
 * 1. If the subscription record exists: checks for other active subscriptions
 *    on the same customer (plan transitions) and delegates to
 *    SubscriptionTransitionService.
 * 2. If metadata indicates a checkout-flow origin: skips — the
 *    checkout.session.completed handler will create the BOS record.
 * 3. Otherwise: logs a warning about an externally-created subscription.
 */
@Injectable()
export class SubscriptionCreatedHandler
  implements WebhookHandler, OnModuleInit
{
  private readonly logger = new Logger(SubscriptionCreatedHandler.name);

  constructor(
    private readonly router: WebhookRouter,
    @Inject(forwardRef(() => SubscriptionTransitionService))
    private readonly transitionService: SubscriptionTransitionService,
  ) {}

  onModuleInit(): void {
    this.router.registerHandler('customer.subscription.created', this);
  }

  async handle(ctx: WebhookContext): Promise<void> {
    const subscription = ctx.event.data.object as Stripe.Subscription;
    const stripeAccountId = ctx.stripeAccountId ?? undefined;

    try {
      const customerId =
        typeof subscription.customer === 'string'
          ? subscription.customer
          : subscription.customer?.id;

      this.logger.log(
        `Subscription created: ${subscription.id} for customer ${customerId}`,
      );

      // Check if subscription already exists (created via API)
      const { data: existing } = await ctx.supabase
        .from('subscriptions')
        .select('id')
        .eq('stripe_subscription_id', subscription.id)
        .single();

      if (existing) {
        this.logger.log(
          `Subscription ${subscription.id} already exists in database`,
        );

        // Safety net: check if this customer has other active subs for a different product
        const { data: dbSub } = await ctx.supabase
          .from('subscriptions')
          .select('id, customer_id, product_id, amount')
          .eq('id', existing.id)
          .single();

        if (dbSub) {
          // Check transition lock — if a transition is already in progress, skip
          const locked = await this.transitionService.isTransitionLocked(
            dbSub.customer_id,
          );
          if (!locked) {
            await this.transitionService.detectAndTransition(
              dbSub.customer_id,
              dbSub.product_id,
              stripeAccountId ?? '',
              dbSub.amount || 0,
            );
          }
        }

        return;
      }

      // Check if this subscription was created via our checkout flow
      // (checkout.session.completed webhook will create the BOS record)
      const subMetadata = subscription.metadata || {};
      if (subMetadata.metadataId || subMetadata.organizationId) {
        this.logger.log(
          `Subscription ${subscription.id} created via checkout — BOS record will be created by checkout handler`,
        );
        return;
      }

      // Subscription was created outside our API (e.g., Stripe Dashboard)
      this.logger.warn(
        `Subscription ${subscription.id} was created outside the API - not automatically synced`,
      );
    } catch (error) {
      this.logger.error('Error handling subscription.created:', error);
    }
  }
}

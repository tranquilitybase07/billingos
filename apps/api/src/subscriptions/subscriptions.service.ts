/* eslint-disable @typescript-eslint/no-unsafe-call */
import {
  Injectable,
  Logger,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
} from '@nestjs/common';
import { SupabaseService } from '../supabase/supabase.service';
import { StripeService } from '../stripe/stripe.service';
import { User } from '../user/entities/user.entity';
import { CreateSubscriptionDto } from './dto/create-subscription.dto';
import { CancelSubscriptionDto } from './dto/cancel-subscription.dto';
import { FeatureType } from '../features/dto/create-feature.dto';

@Injectable()
export class SubscriptionsService {
  private readonly logger = new Logger(SubscriptionsService.name);

  constructor(
    private readonly supabaseService: SupabaseService,
    private readonly stripeService: StripeService,
  ) {}

  /**
   * Create subscription with automatic feature granting
   */
  async create(user: User, createDto: CreateSubscriptionDto) {
    const supabase = this.supabaseService.getClient();

    // 1. Verify customer exists
    const { data: customer, error: customerError } = await supabase
      .from('customers')
      .select('id, organization_id, stripe_customer_id')
      .eq('id', createDto.customer_id)
      .single();

    if (customerError || !customer) {
      throw new NotFoundException('Customer not found');
    }

    // 2. Verify user is member of organization
    const { data: membership } = await supabase
      .from('user_organizations')
      .select('user_id')
      .eq('organization_id', customer.organization_id)
      .eq('user_id', user.id)
      .is('deleted_at', null)
      .single();

    if (!membership) {
      throw new ForbiddenException('You are not a member of this organization');
    }

    // 3. Get product with features
    const { data: product, error: productError } = await supabase
      .from('products')
      .select('*')
      .eq('id', createDto.product_id)
      .eq('organization_id', customer.organization_id)
      .single();

    if (productError || !product) {
      throw new NotFoundException('Product not found');
    }

    // 4. Get price
    const { data: price, error: priceError } = await supabase
      .from('product_prices')
      .select('*')
      .eq('id', createDto.price_id)
      .eq('product_id', product.id)
      .single();

    if (priceError || !price) {
      throw new NotFoundException('Price not found');
    }

    // 5. Get Stripe account
    const { data: org } = await supabase
      .from('organizations')
      .select('account_id')
      .eq('id', customer.organization_id)
      .single();

    if (!org?.account_id) {
      throw new BadRequestException('Organization account not found');
    }

    const { data: account } = await supabase
      .from('accounts')
      .select('stripe_id')
      .eq('id', org.account_id)
      .single();

    if (!account?.stripe_id) {
      throw new BadRequestException('Stripe account not found');
    }

    try {
      // 6. Create subscription in Stripe (if not free)
      let stripeSubscription: any = null;
      if (price.stripe_price_id) {
        if (!customer.stripe_customer_id) {
          throw new BadRequestException(
            'Customer must have a Stripe customer ID to create a Stripe subscription',
          );
        }

        const subscriptionParams: any = {
          customer: customer.stripe_customer_id,
          items: [{ price: price.stripe_price_id }],
          metadata: {
            customer_id: customer.id,
            product_id: product.id,
          },
        };

        // Add trial if configured
        if (product.trial_days && product.trial_days > 0) {
          subscriptionParams.trial_period_days = product.trial_days;
        }

        // Add payment method if provided
        if (createDto.payment_method_id) {
          subscriptionParams.default_payment_method =
            createDto.payment_method_id;
        }

        stripeSubscription = await this.stripeService.createSubscription(
          subscriptionParams,
          account.stripe_id,
        );

        this.logger.log(
          `Stripe subscription created: ${stripeSubscription.id}`,
        );
      }

      // 7. Save subscription to database
      const now = new Date();
      const periodEnd = new Date(now);
      periodEnd.setMonth(
        periodEnd.getMonth() + (product.recurring_interval_count || 1),
      );

      const { data: subscription, error: subError } = await supabase
        .from('subscriptions')
        .insert({
          organization_id: customer.organization_id,
          customer_id: customer.id,
          product_id: product.id,
          status: stripeSubscription?.status || 'active',
          amount: price.price_amount || 0,
          currency: price.price_currency || 'usd',
          current_period_start: stripeSubscription?.current_period_start
            ? new Date(
                stripeSubscription.current_period_start * 1000,
              ).toISOString()
            : now.toISOString(),
          current_period_end: stripeSubscription?.current_period_end
            ? new Date(
                stripeSubscription.current_period_end * 1000,
              ).toISOString()
            : periodEnd.toISOString(),
          trial_start: stripeSubscription?.trial_start
            ? new Date(stripeSubscription.trial_start * 1000).toISOString()
            : null,
          trial_end: stripeSubscription?.trial_end
            ? new Date(stripeSubscription.trial_end * 1000).toISOString()
            : null,
          stripe_subscription_id: stripeSubscription?.id || null,
          cancel_at_period_end: false,
        })
        .select()
        .single();

      if (subError || !subscription) {
        this.logger.error('Failed to save subscription to database:', subError);
        this.logger.error('Subscription details:', {
          organizationId: customer.organization_id,
          customerId: customer.id,
          productId: product.id,
          priceId: price.id,
          stripeSubscriptionId: stripeSubscription?.id,
          errorCode: subError?.code,
          errorDetails: subError?.details,
        });

        // Cleanup Stripe subscription if created
        if (stripeSubscription) {
          try {
            await this.stripeService.cancelSubscription(
              stripeSubscription.id,
              account.stripe_id,
            );
            this.logger.warn(`Cancelled Stripe subscription ${stripeSubscription.id} due to database error`);
          } catch (cancelError) {
            this.logger.error('Failed to cancel Stripe subscription after database error:', cancelError);
          }
        }

        throw new BadRequestException(
          `Failed to create subscription: ${subError?.message || 'Database error occurred'}`,
        );
      }

      // 8. Grant all product features
      const grantedFeatures = await this.grantProductFeatures(
        customer.id,
        subscription.id,
        product.id,
        new Date(subscription.current_period_start),
        new Date(subscription.current_period_end),
      );

      this.logger.log(
        `Subscription created: ${subscription.id} with ${grantedFeatures.length} features`,
      );

      // 9. Sync Active Entitlements from Stripe (if subscription was created in Stripe)
      if (stripeSubscription && customer.stripe_customer_id) {
        try {
          await this.syncActiveEntitlementsFromStripe(
            subscription.id,
            customer.id,
            customer.stripe_customer_id,
            account.stripe_id,
          );
          this.logger.log(
            `Synced Active Entitlements from Stripe for subscription ${subscription.id}`,
          );
        } catch (error) {
          this.logger.error(
            `Failed to sync Active Entitlements from Stripe:`,
            error,
          );
          // Don't fail the subscription creation if Stripe sync fails
          // The feature grants are already created locally
        }
      }

      // TODO: Invalidate Redis cache for customer

      // Return subscription with granted features
      return {
        ...subscription,
        granted_features: grantedFeatures,
      };
    } catch (error) {
      this.logger.error('Error creating subscription:', error);
      throw new BadRequestException(
        error.message || 'Failed to create subscription',
      );
    }
  }

  /**
   * Grant all features from a product to a customer
   * Also initialize usage records for quota features
   */
  private async grantProductFeatures(
    customerId: string,
    subscriptionId: string,
    productId: string,
    periodStart: Date,
    periodEnd: Date,
  ) {
    const supabase = this.supabaseService.getClient();

    // Get all features for this product
    const { data: productFeatures } = await supabase
      .from('product_features')
      .select(
        `
        feature_id,
        display_order,
        config,
        features (
          id,
          name,
          title,
          type,
          properties
        )
      `,
      )
      .eq('product_id', productId)
      .order('display_order', { ascending: true });

    if (!productFeatures || productFeatures.length === 0) {
      return [];
    }

    const grantedFeatures: any[] = [];

    for (const pf of productFeatures) {
      const feature = pf.features;
      if (!feature) continue;

      // Merge feature properties with product-specific config
      const mergedProperties = {
        ...(feature.properties as any),
        ...(pf.config as any),
      };

      // Create feature grant
      const { data: grant, error: grantError } = await supabase
        .from('feature_grants')
        .insert({
          customer_id: customerId,
          subscription_id: subscriptionId,
          feature_id: feature.id,
          granted_at: new Date().toISOString(),
          revoked_at: null,
          properties: mergedProperties,
        })
        .select()
        .single();

      if (grantError || !grant) {
        this.logger.error('Failed to create feature grant:', grantError);
        continue;
      }

      // If feature is usage quota, create usage record
      // eslint-disable-next-line @typescript-eslint/no-unsafe-enum-comparison
      if (feature.type === FeatureType.USAGE_QUOTA) {
        const limit = mergedProperties.limit || 0;

        const { error: usageError } = await supabase
          .from('usage_records')
          .insert({
            customer_id: customerId,
            feature_id: feature.id,
            subscription_id: subscriptionId,
            period_start: periodStart.toISOString(),
            period_end: periodEnd.toISOString(),
            consumed_units: 0,
            limit_units: limit,
          });

        if (usageError) {
          this.logger.error('Failed to create usage record:', usageError);
        } else {
          this.logger.log(
            `Usage record created for ${feature.name} with limit ${limit}`,
          );
        }
      }

      grantedFeatures.push({
        id: grant.id,
        feature_id: feature.id,
        name: feature.name,
        title: feature.title,
        type: feature.type,
        granted_at: grant.granted_at,
        revoked_at: grant.revoked_at,
        properties: mergedProperties,
      });
    }

    return grantedFeatures;
  }

  /**
   * Get subscription by ID
   */
  async findOne(id: string, userId: string) {
    const supabase = this.supabaseService.getClient();

    const { data: subscription, error } = await supabase
      .from('subscriptions')
      .select('*')
      .eq('id', id)
      .single();

    if (error || !subscription) {
      throw new NotFoundException('Subscription not found');
    }

    // Verify user has access
    const { data: membership } = await supabase
      .from('user_organizations')
      .select('user_id')
      .eq('organization_id', subscription.organization_id)
      .eq('user_id', userId)
      .is('deleted_at', null)
      .single();

    if (!membership) {
      throw new ForbiddenException(
        'You do not have access to this subscription',
      );
    }

    // Get granted features
    const { data: grants } = await supabase
      .from('feature_grants')
      .select(
        `
        id,
        granted_at,
        revoked_at,
        properties,
        features (
          id,
          name,
          title,
          type,
          properties
        )
      `,
      )
      .eq('subscription_id', id)
      .order('granted_at', { ascending: true });

    return {
      ...subscription,
      granted_features: grants || [],
    };
  }

  /**
   * List subscriptions
   */
  async findAll(organizationId: string, userId: string, customerId?: string) {
    const supabase = this.supabaseService.getClient();

    // Verify user is member
    const { data: membership } = await supabase
      .from('user_organizations')
      .select('user_id')
      .eq('organization_id', organizationId)
      .eq('user_id', userId)
      .is('deleted_at', null)
      .single();

    if (!membership) {
      throw new ForbiddenException('You are not a member of this organization');
    }

    let query = supabase
      .from('subscriptions')
      .select(`
        *,
        customers (
          id,
          name,
          email,
          external_id,
          stripe_customer_id
        ),
        products (
          id,
          name
        ),
        product_prices (
          id,
          recurring_interval,
          recurring_interval_count
        )
      `)
      .eq('organization_id', organizationId)
      .order('created_at', { ascending: false });

    if (customerId) {
      query = query.eq('customer_id', customerId);
    }

    const { data: subscriptions, error } = await query;

    if (error) {
      throw new BadRequestException('Failed to fetch subscriptions');
    }

    return subscriptions || [];
  }

  /**
   * Cancel subscription
   */
  async cancel(id: string, userId: string, cancelDto: CancelSubscriptionDto) {
    const supabase = this.supabaseService.getClient();

    // Get subscription
    const subscription = await this.findOne(id, userId);

    // Get Stripe account
    const { data: org } = await supabase
      .from('organizations')
      .select('account_id')
      .eq('id', subscription.organization_id)
      .single();

    if (!org?.account_id) {
      throw new BadRequestException('Organization account not found');
    }

    const { data: account } = await supabase
      .from('accounts')
      .select('stripe_id')
      .eq('id', org.account_id)
      .single();

    if (!account?.stripe_id) {
      throw new BadRequestException('Stripe account not found');
    }

    try {
      // Cancel in Stripe if exists
      if (subscription.stripe_subscription_id) {
        await this.stripeService.cancelSubscription(
          subscription.stripe_subscription_id,
          account.stripe_id,
          cancelDto.cancel_at_period_end,
        );
      }

      // Update database
      const updateData: any = {
        cancel_at_period_end: cancelDto.cancel_at_period_end,
        canceled_at: new Date(),
      };

      // If immediate cancellation, revoke features
      if (!cancelDto.cancel_at_period_end) {
        updateData.status = 'canceled';

        // Revoke all feature grants
        await supabase
          .from('feature_grants')
          .update({ revoked_at: new Date().toISOString() })
          .eq('subscription_id', id)
          .is('revoked_at', null);

        this.logger.log(`Features revoked for subscription ${id}`);
      }

      const { data: updated, error } = await supabase
        .from('subscriptions')
        .update(updateData)
        .eq('id', id)
        .select()
        .single();

      if (error || !updated) {
        throw new BadRequestException('Failed to cancel subscription');
      }

      this.logger.log(`Subscription canceled: ${id}`);

      // TODO: Invalidate Redis cache

      return updated;
    } catch (error) {
      this.logger.error('Error canceling subscription:', error);
      throw new BadRequestException(
        error.message || 'Failed to cancel subscription',
      );
    }
  }

  /**
   * Handle subscription renewal (called by webhook)
   * Creates new usage records for the new period
   */
  async handleRenewal(
    subscriptionId: string,
    newPeriodStart: Date,
    newPeriodEnd: Date,
  ) {
    const supabase = this.supabaseService.getClient();

    // Get all quota features for this subscription
    const { data: grants } = await supabase
      .from('feature_grants')
      .select(
        `
        id,
        customer_id,
        feature_id,
        subscription_id,
        properties,
        features (
          id,
          type
        )
      `,
      )
      .eq('subscription_id', subscriptionId)
      .is('revoked_at', null);

    if (!grants) return;

    for (const grant of grants) {
      // eslint-disable-next-line @typescript-eslint/no-unsafe-enum-comparison
      if (grant.features?.type === FeatureType.USAGE_QUOTA) {
        const limit = (grant.properties as any)?.limit || 0;

        // Create new usage record for new period
        const { error } = await supabase.from('usage_records').insert({
          customer_id: grant.customer_id,
          feature_id: grant.feature_id,
          subscription_id: grant.subscription_id,
          period_start: newPeriodStart.toISOString(),
          period_end: newPeriodEnd.toISOString(),
          consumed_units: 0,
          limit_units: limit,
        });

        if (error) {
          this.logger.error(
            'Failed to create usage record for renewal:',
            error,
          );
        } else {
          this.logger.log(
            `Usage record created for renewal: ${grant.feature_id}`,
          );
        }
      }
    }

    this.logger.log(`Subscription renewed: ${subscriptionId}`);
  }

  /**
   * Sync Active Entitlements from Stripe to local database
   * This fetches the customer's active entitlements from Stripe and updates feature_grants
   */
  private async syncActiveEntitlementsFromStripe(
    subscriptionId: string,
    customerId: string,
    stripeCustomerId: string,
    stripeAccountId: string,
  ) {
    const supabase = this.supabaseService.getClient();

    try {
      // Fetch Active Entitlements from Stripe
      const activeEntitlements =
        await this.stripeService.syncActiveEntitlementsFromSubscription({
          subscriptionId, // This is actually the Stripe subscription ID in context
          customerId: stripeCustomerId,
          stripeAccountId,
        });

      if (!activeEntitlements || activeEntitlements.length === 0) {
        this.logger.warn(
          `No Active Entitlements found in Stripe for customer ${stripeCustomerId}`,
        );
        return;
      }

      this.logger.log(
        `Found ${activeEntitlements.length} Active Entitlements in Stripe`,
      );

      // Update each feature_grant with the corresponding Active Entitlement ID
      for (const entitlement of activeEntitlements) {
        // Get the feature lookup_key from the Stripe Feature
        const stripeFeature =
          typeof entitlement.feature === 'string' ? null : entitlement.feature;

        if (!stripeFeature || !stripeFeature.lookup_key) {
          this.logger.warn(
            `Active Entitlement ${entitlement.id} has no feature lookup_key`,
          );
          continue;
        }

        // Find the corresponding local feature by stripe_feature_id
        const { data: localFeature } = await supabase
          .from('features')
          .select('id')
          .eq('stripe_feature_id', stripeFeature.id)
          .single();

        if (!localFeature) {
          this.logger.warn(
            `No local feature found for Stripe Feature ${stripeFeature.id} (${stripeFeature.lookup_key})`,
          );
          continue;
        }

        // Find the feature_grant for this subscription and feature
        const { data: grant } = await supabase
          .from('feature_grants')
          .select('id')
          .eq('subscription_id', subscriptionId)
          .eq('customer_id', customerId)
          .eq('feature_id', localFeature.id)
          .is('revoked_at', null)
          .single();

        if (!grant) {
          this.logger.warn(
            `No feature_grant found for feature ${localFeature.id} on subscription ${subscriptionId}`,
          );
          continue;
        }

        // Update the feature_grant with Stripe Active Entitlement ID
        const { error: updateError } = await supabase
          .from('feature_grants')
          .update({
            stripe_active_entitlement_id: entitlement.id,
            stripe_synced_at: new Date().toISOString(),
            stripe_sync_status: 'synced',
          })
          .eq('id', grant.id);

        if (updateError) {
          this.logger.error(
            `Failed to update feature_grant ${grant.id} with Active Entitlement ${entitlement.id}:`,
            updateError,
          );
        } else {
          this.logger.log(
            `Synced Active Entitlement ${entitlement.id} to feature_grant ${grant.id}`,
          );
        }

        // Log sync event
        const { data: customerData } = await supabase
          .from('customers')
          .select('organization_id')
          .eq('id', customerId)
          .single();

        if (customerData?.organization_id) {
          await supabase.from('stripe_sync_events').insert({
            organization_id: customerData.organization_id,
            entity_type: 'feature_grant',
            entity_id: grant.id,
            stripe_object_id: entitlement.id,
            operation: 'create',
            status: updateError ? 'failure' : 'success',
            error_message: updateError?.message,
            triggered_by: 'api',
          });
        }
      }
    } catch (error) {
      this.logger.error(
        `Error syncing Active Entitlements from Stripe:`,
        error,
      );
      throw error;
    }
  }
}

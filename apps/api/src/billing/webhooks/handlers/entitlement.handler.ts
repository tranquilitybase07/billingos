import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import Stripe from 'stripe';
import { WebhookContext, WebhookHandler } from '../webhook.types';
import { WebhookRouter } from '../webhook.router';

/**
 * Handles entitlements.active_entitlement.created, .updated, and .deleted events.
 * Syncs Stripe's entitlement state to the feature_grants table.
 *
 * NOTE: These event types are cast to work around Stripe SDK typing limitations —
 * Stripe's TypeScript types may not include entitlement event types yet.
 */
@Injectable()
export class EntitlementHandler implements WebhookHandler, OnModuleInit {
  private readonly logger = new Logger(EntitlementHandler.name);

  constructor(private readonly router: WebhookRouter) {}

  onModuleInit(): void {
    this.router.registerHandler(
      [
        'entitlements.active_entitlement.created',
        'entitlements.active_entitlement.updated',
        'entitlements.active_entitlement.deleted',
      ],
      this,
    );
  }

  async handle(ctx: WebhookContext): Promise<void> {
    try {
      const activeEntitlement =
        ctx.event.data.object as unknown as Stripe.Entitlements.ActiveEntitlement;

      switch (ctx.event.type as string) {
        case 'entitlements.active_entitlement.created':
          await this.handleActiveEntitlementCreated(ctx, activeEntitlement);
          break;

        case 'entitlements.active_entitlement.updated':
          await this.handleActiveEntitlementUpdated(ctx, activeEntitlement);
          break;

        case 'entitlements.active_entitlement.deleted':
          await this.handleActiveEntitlementDeleted(ctx, activeEntitlement);
          break;

        default:
          this.logger.warn(`Unexpected event type: ${ctx.event.type}`);
      }
    } catch (error) {
      this.logger.error('Error in EntitlementHandler:', error);
    }
  }

  private async handleActiveEntitlementCreated(
    ctx: WebhookContext,
    activeEntitlement: Stripe.Entitlements.ActiveEntitlement,
  ): Promise<void> {
    try {
      // Cast to any to access customer property (not in official types yet)
      const entitlement = activeEntitlement as any;

      this.logger.log(
        `Active Entitlement created: ${entitlement.id} for customer ${entitlement.customer}`,
      );

      const supabase = ctx.supabase;

      // Get feature ID from Stripe feature
      const stripeFeatureId =
        typeof entitlement.feature === 'string'
          ? entitlement.feature
          : entitlement.feature.id;

      // Find local feature by stripe_feature_id
      const { data: localFeature } = await supabase
        .from('features')
        .select('id, organization_id, properties')
        .eq('stripe_feature_id', stripeFeatureId)
        .single();

      if (!localFeature) {
        this.logger.warn(
          `Feature not found for stripe_feature_id: ${stripeFeatureId}`,
        );
        return;
      }

      // Find customer by stripe_customer_id
      const stripeCustomerId =
        typeof entitlement.customer === 'string'
          ? entitlement.customer
          : entitlement.customer.id;

      const { data: customer } = await supabase
        .from('customers')
        .select('id, organization_id')
        .eq('stripe_customer_id', stripeCustomerId)
        .single();

      if (!customer) {
        this.logger.warn(
          `Customer not found for stripe_customer_id: ${stripeCustomerId}`,
        );
        return;
      }

      // Find the subscription
      const { data: subscription } = await supabase
        .from('subscriptions')
        .select('id')
        .eq('customer_id', customer.id)
        .eq('status', 'active')
        .order('created_at', { ascending: false })
        .limit(1)
        .single();

      // Check if feature_grant already exists
      const { data: existingGrant } = await supabase
        .from('feature_grants')
        .select('id')
        .eq('stripe_active_entitlement_id', entitlement.id)
        .single();

      if (existingGrant) {
        this.logger.log(
          `Feature grant already exists for Active Entitlement ${entitlement.id}`,
        );
        return;
      }

      // Create feature_grant
      const insertData: any = {
        customer_id: customer.id,
        feature_id: localFeature.id,
        stripe_active_entitlement_id: entitlement.id,
        stripe_synced_at: new Date().toISOString(),
        stripe_sync_status: 'synced',
        granted_at: new Date().toISOString(),
      };

      if (subscription?.id) {
        insertData.subscription_id = subscription.id;
      }

      const { data: grant, error: grantError } = await supabase
        .from('feature_grants')
        .insert(insertData)
        .select()
        .single();

      if (grantError || !grant) {
        this.logger.error(
          `Failed to create feature_grant for Active Entitlement ${entitlement.id}:`,
          grantError,
        );
        return;
      }

      // Log sync event
      await supabase.from('stripe_sync_events').insert({
        organization_id: customer.organization_id,
        entity_type: 'feature_grant',
        entity_id: grant.id,
        stripe_object_id: entitlement.id,
        operation: 'create',
        status: 'success',
        triggered_by: 'webhook',
      });

      this.logger.log(
        `Feature grant created: ${grant.id} for Active Entitlement ${entitlement.id}`,
      );
    } catch (error) {
      this.logger.error(
        'Error handling entitlements.active_entitlement.created:',
        error,
      );
    }
  }

  private async handleActiveEntitlementUpdated(
    ctx: WebhookContext,
    activeEntitlement: Stripe.Entitlements.ActiveEntitlement,
  ): Promise<void> {
    try {
      // Cast to any to access customer property (not in official types yet)
      const entitlement = activeEntitlement as any;

      this.logger.log(
        `Active Entitlement updated: ${entitlement.id} for customer ${entitlement.customer}`,
      );

      const supabase = ctx.supabase;

      // Find existing feature_grant by stripe_active_entitlement_id
      const { data: existingGrant } = await supabase
        .from('feature_grants')
        .select('id, customer_id, customers!inner(organization_id)')
        .eq('stripe_active_entitlement_id', entitlement.id)
        .single();

      if (!existingGrant) {
        this.logger.warn(
          `Feature grant not found for Active Entitlement ${entitlement.id}, creating new one`,
        );
        // If not found, treat as create
        await this.handleActiveEntitlementCreated(ctx, activeEntitlement);
        return;
      }

      // Update the feature_grant
      const { error: updateError } = await supabase
        .from('feature_grants')
        .update({
          stripe_synced_at: new Date().toISOString(),
          stripe_sync_status: 'synced',
        })
        .eq('id', existingGrant.id);

      if (updateError) {
        this.logger.error(
          `Failed to update feature_grant ${existingGrant.id}:`,
          updateError,
        );
        return;
      }

      // Log sync event
      await supabase.from('stripe_sync_events').insert({
        organization_id: (existingGrant as any).customers.organization_id,
        entity_type: 'feature_grant',
        entity_id: existingGrant.id,
        stripe_object_id: entitlement.id,
        operation: 'update',
        status: 'success',
        triggered_by: 'webhook',
      });

      this.logger.log(
        `Feature grant updated: ${existingGrant.id} for Active Entitlement ${entitlement.id}`,
      );
    } catch (error) {
      this.logger.error(
        'Error handling entitlements.active_entitlement.updated:',
        error,
      );
    }
  }

  private async handleActiveEntitlementDeleted(
    ctx: WebhookContext,
    activeEntitlement: Stripe.Entitlements.ActiveEntitlement,
  ): Promise<void> {
    try {
      // Cast to any to access customer property (not in official types yet)
      const entitlement = activeEntitlement as any;

      this.logger.log(
        `Active Entitlement deleted: ${entitlement.id} for customer ${entitlement.customer}`,
      );

      const supabase = ctx.supabase;

      // Find existing feature_grant by stripe_active_entitlement_id
      const { data: existingGrant } = await supabase
        .from('feature_grants')
        .select('id, customer_id, customers!inner(organization_id)')
        .eq('stripe_active_entitlement_id', entitlement.id)
        .is('revoked_at', null)
        .single();

      if (!existingGrant) {
        this.logger.warn(
          `Feature grant not found for Active Entitlement ${entitlement.id}`,
        );
        return;
      }

      // Revoke the feature_grant
      const { error: revokeError } = await supabase
        .from('feature_grants')
        .update({
          revoked_at: new Date().toISOString(),
          stripe_synced_at: new Date().toISOString(),
          stripe_sync_status: 'synced',
        })
        .eq('id', existingGrant.id);

      if (revokeError) {
        this.logger.error(
          `Failed to revoke feature_grant ${existingGrant.id}:`,
          revokeError,
        );
        return;
      }

      // Log sync event
      await supabase.from('stripe_sync_events').insert({
        organization_id: (existingGrant as any).customers.organization_id,
        entity_type: 'feature_grant',
        entity_id: existingGrant.id,
        stripe_object_id: entitlement.id,
        operation: 'delete',
        status: 'success',
        triggered_by: 'webhook',
      });

      this.logger.log(
        `Feature grant revoked: ${existingGrant.id} for Active Entitlement ${entitlement.id}`,
      );
    } catch (error) {
      this.logger.error(
        'Error handling entitlements.active_entitlement.deleted:',
        error,
      );
    }
  }
}

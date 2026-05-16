import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import Stripe from 'stripe';
import { WebhookContext, WebhookHandler } from '../webhook.types';
import { WebhookRouter } from '../webhook.router';

/**
 * Handles customer.created, customer.updated, and customer.deleted events.
 * Syncs customer data from Stripe to the database.
 * Note: customer.deleted does inline feature_grants revocation (not via EntitlementService).
 */
@Injectable()
export class CustomerHandler implements WebhookHandler, OnModuleInit {
  private readonly logger = new Logger(CustomerHandler.name);

  constructor(private readonly router: WebhookRouter) {}

  onModuleInit(): void {
    this.router.registerHandler(
      ['customer.created', 'customer.updated', 'customer.deleted'],
      this,
    );
  }

  async handle(ctx: WebhookContext): Promise<void> {
    try {
      const customer = ctx.event.data.object as Stripe.Customer;

      switch (ctx.event.type) {
        case 'customer.created':
          await this.handleCustomerCreated(ctx, customer);
          break;

        case 'customer.updated':
          await this.handleCustomerUpdated(ctx, customer);
          break;

        case 'customer.deleted':
          await this.handleCustomerDeleted(ctx, customer);
          break;

        default:
          this.logger.warn(`Unexpected event type: ${ctx.event.type}`);
      }
    } catch (error) {
      this.logger.error('Error in CustomerHandler:', error);
    }
  }

  private async handleCustomerCreated(
    ctx: WebhookContext,
    customer: Stripe.Customer,
  ): Promise<void> {
    try {
      this.logger.log(`Customer created in Stripe: ${customer.id}`);

      const supabase = ctx.supabase;

      // Check if customer already exists (created via API)
      const { data: existing } = await supabase
        .from('customers')
        .select('id')
        .eq('stripe_customer_id', customer.id)
        .maybeSingle();

      if (existing) {
        this.logger.log(`Customer ${customer.id} already exists in database`);
        return;
      }

      // Lazy ingest: customer was created outside the API (Stripe Dashboard,
      // legacy script, or a flow that bypasses BOS checkout). Mirror it into
      // BOS so subsequent webhooks (subscription.created, etc.) find a row.
      const organizationId = await this.resolveOrganizationId(
        ctx,
        ctx.stripeAccountId,
      );
      if (!organizationId) {
        this.logger.warn(
          `Cannot lazy-ingest customer ${customer.id}: no organization for account ${ctx.stripeAccountId}`,
        );
        return;
      }

      const externalId =
        (typeof customer.metadata?.external_id === 'string' &&
          customer.metadata.external_id) ||
        (typeof customer.metadata?.external_user_id === 'string' &&
          customer.metadata.external_user_id) ||
        (typeof customer.metadata?.user_id === 'string' &&
          customer.metadata.user_id) ||
        null;

      const { error: insertError } = await supabase.from('customers').insert({
        organization_id: organizationId,
        stripe_customer_id: customer.id,
        email: customer.email?.toLowerCase() || null,
        name: customer.name || null,
        external_id: externalId,
        billing_address: customer.address
          ? {
              street: customer.address.line1 || '',
              city: customer.address.city || '',
              state: customer.address.state || '',
              postal_code: customer.address.postal_code || '',
              country: customer.address.country || '',
            }
          : {},
        metadata: (customer.metadata as any) || {},
      } as any);

      if (insertError) {
        // Concurrent insert (e.g., racing with API create) — safe to ignore.
        this.logger.warn(
          `Lazy ingest for customer ${customer.id} skipped: ${insertError.message}`,
        );
        return;
      }

      this.logger.log(`Lazy-ingested customer ${customer.id} into BOS`);
    } catch (error) {
      this.logger.error('Error handling customer.created:', error);
    }
  }

  // Maps a Stripe Connect account ID → BOS organization ID.
  // Resolution path per backend rules: stripe_id → accounts.id → organizations.account_id.
  private async resolveOrganizationId(
    ctx: WebhookContext,
    stripeAccountId: string | null,
  ): Promise<string | null> {
    if (!stripeAccountId) return null;

    const { data: account } = await ctx.supabase
      .from('accounts')
      .select('id')
      .eq('stripe_id', stripeAccountId)
      .maybeSingle();
    if (!account) return null;

    const { data: org } = await ctx.supabase
      .from('organizations')
      .select('id')
      .eq('account_id', account.id)
      .maybeSingle();

    return org?.id ?? null;
  }

  private async handleCustomerUpdated(
    ctx: WebhookContext,
    customer: Stripe.Customer,
  ): Promise<void> {
    try {
      this.logger.log(`Customer updated in Stripe: ${customer.id}`);

      const supabase = ctx.supabase;

      // Find customer by stripe_customer_id
      const { data: existingCustomer, error: fetchError } = await supabase
        .from('customers')
        .select('id, email')
        .eq('stripe_customer_id', customer.id)
        .single();

      if (fetchError || !existingCustomer) {
        this.logger.warn(`Customer ${customer.id} not found in database`);
        return;
      }

      // Update customer with Stripe data
      const updateData: any = {
        updated_at: new Date().toISOString(),
      };

      if (customer.email && customer.email !== existingCustomer.email) {
        updateData.email = customer.email.toLowerCase();
        // Note: Don't auto-verify email from Stripe
        updateData.email_verified = false;
      }

      if (customer.name) {
        updateData.name = customer.name;
      }

      if (customer.address) {
        updateData.billing_address = {
          street: customer.address.line1 || '',
          city: customer.address.city || '',
          state: customer.address.state || '',
          postal_code: customer.address.postal_code || '',
          country: customer.address.country || '',
        };
      }

      if (customer.metadata) {
        updateData.metadata = customer.metadata;

        // Sync external_id from metadata if present
        if (customer.metadata.external_id) {
          updateData.external_id = customer.metadata.external_id;
        }
      }

      const { error: updateError } = await supabase
        .from('customers')
        .update(updateData)
        .eq('id', existingCustomer.id);

      if (updateError) {
        this.logger.error(
          `Failed to update customer ${customer.id}:`,
          updateError,
        );
        return;
      }

      this.logger.log(`Customer ${customer.id} synced from Stripe`);
    } catch (error) {
      this.logger.error('Error handling customer.updated:', error);
    }
  }

  private async handleCustomerDeleted(
    ctx: WebhookContext,
    customer: Stripe.Customer,
  ): Promise<void> {
    try {
      this.logger.log(`Customer deleted in Stripe: ${customer.id}`);

      const supabase = ctx.supabase;

      // Find customer
      const { data: existingCustomer, error: fetchError } = await supabase
        .from('customers')
        .select('id, organization_id')
        .eq('stripe_customer_id', customer.id)
        .is('deleted_at', null)
        .single();

      if (fetchError || !existingCustomer) {
        this.logger.warn(`Customer ${customer.id} not found in database`);
        return;
      }

      // Soft delete customer
      const { error: deleteError } = await supabase
        .from('customers')
        .update({
          deleted_at: new Date().toISOString(),
          external_id: null, // Clear external_id to allow reuse
        })
        .eq('id', existingCustomer.id);

      if (deleteError) {
        this.logger.error(
          `Failed to soft delete customer ${customer.id}:`,
          deleteError,
        );
        return;
      }

      // Cancel active subscriptions
      await supabase
        .from('subscriptions')
        .update({
          status: 'canceled',
          deleted_at: new Date().toISOString(),
        })
        .eq('customer_id', existingCustomer.id)
        .eq('status', 'active');

      // Revoke feature grants
      await supabase
        .from('feature_grants')
        .update({ revoked_at: new Date().toISOString() })
        .eq('customer_id', existingCustomer.id)
        .is('revoked_at', null);

      this.logger.log(
        `Customer ${customer.id} soft deleted and related data cleaned up`,
      );
    } catch (error) {
      this.logger.error('Error handling customer.deleted:', error);
    }
  }
}

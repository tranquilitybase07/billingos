import {
  Injectable,
  Logger,
  NotFoundException,
  BadRequestException,
  ConflictException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Stripe from 'stripe';
import { SupabaseService } from '../supabase/supabase.service';
import { StripeService } from '../stripe/stripe.service';
import { Migration } from './entities/migration.entity';
import { StartMigrationDto } from './dto/start-migration.dto';

interface ImportMaps {
  products: Map<string, string>; // stripe_product_id → billingos product.id
  prices: Map<string, string>;   // stripe_price_id → billingos product_prices.id
  customers: Map<string, string>; // stripe_customer_id → billingos customers.id
}


@Injectable()
export class MigrationService {
  private readonly logger = new Logger(MigrationService.name);

  constructor(
    private readonly supabaseService: SupabaseService,
    private readonly stripeService: StripeService,
    private readonly configService: ConfigService,
  ) {}

  /**
   * Get the Supabase client cast as any — used for tables that exist in the DB
   * but haven't been added to the generated TypeScript types yet
   * (e.g. stripe_migrations, accounts.connect_type).
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private getDb(): any {
    return this.supabaseService.getClient();
  }

  /**
   * Generate the Stripe OAuth URL for connecting an existing Stripe account
   */
  generateOAuthUrl(organizationId: string): string {
    const clientId = this.configService.get<string>('STRIPE_CLIENT_ID');
    if (!clientId) {
      throw new BadRequestException('Stripe Connect OAuth is not configured');
    }

    const appUrl =
      this.configService.get<string>('APP_URL') || 'http://localhost:3000';
    const redirectUri = `${appUrl}/api/stripe/oauth/callback`;

    const params = new URLSearchParams({
      response_type: 'code',
      client_id: clientId,
      scope: 'read_write',
      redirect_uri: redirectUri,
      state: organizationId, // Pass org ID as state for callback
    });

    return `https://connect.stripe.com/oauth/authorize?${params.toString()}`;
  }

  /**
   * Handle OAuth callback: exchange code for connected account ID,
   * create account record, and link to organization.
   */
  async handleOAuthCallback(
    code: string,
    organizationId: string,
    userId: string,
  ): Promise<Migration> {
    const supabase: any = this.supabaseService.getClient();
    const stripe = this.stripeService.getClient();

    // Verify organization exists and user is a member
    const { data: org } = await supabase
      .from('organizations')
      .select('id, account_id, name')
      .eq('id', organizationId)
      .is('deleted_at', null)
      .single();

    if (!org) {
      throw new NotFoundException('Organization not found');
    }

    if (org.account_id) {
      throw new ConflictException('Organization already has a Stripe account');
    }

    const { data: membership } = await supabase
      .from('user_organizations')
      .select('user_id')
      .eq('organization_id', organizationId)
      .eq('user_id', userId)
      .is('deleted_at', null)
      .single();

    if (!membership) {
      throw new BadRequestException(
        'You are not a member of this organization',
      );
    }

    // Exchange authorization code for Stripe account ID
    let stripeUserId: string;
    try {
      const response = await (stripe.oauth as any).token({
        grant_type: 'authorization_code',
        code,
      });
      stripeUserId = response.stripe_user_id;
    } catch (error) {
      this.logger.error('Failed to exchange OAuth code:', error);
      throw new BadRequestException(
        `Failed to connect Stripe account: ${error.message}`,
      );
    }

    // Retrieve the connected account details
    const stripeAccount = await stripe.accounts.retrieve(stripeUserId);

    // Create account record
    const { data: account, error: accountError } = await supabase
      .from('accounts')
      .insert({
        account_type: 'stripe',
        admin_id: userId,
        stripe_id: stripeUserId,
        connect_type: 'standard',
        email: stripeAccount.email || null,
        country: stripeAccount.country || 'US',
        currency: (stripeAccount as any).default_currency || null,
        is_details_submitted: stripeAccount.details_submitted || false,
        is_charges_enabled: stripeAccount.charges_enabled || false,
        is_payouts_enabled: stripeAccount.payouts_enabled || false,
        business_type: stripeAccount.business_type || null,
        status: 'active',
        auto_created: false,
        test_mode: this.stripeService.isTestMode(),
        data: stripeAccount as any,
        platform_fee_percent:
          this.configService.get<number>('PLATFORM_FEE_PERCENT') || 60,
        platform_fee_fixed:
          this.configService.get<number>('PLATFORM_FEE_FIXED') || 10,
      })
      .select()
      .single();

    if (accountError || !account) {
      this.logger.error('Failed to create account record:', accountError);
      throw new BadRequestException('Failed to save Stripe account');
    }

    // Link account to organization
    const { error: orgUpdateError } = await supabase
      .from('organizations')
      .update({
        account_id: account.id,
        status: 'active',
        status_updated_at: new Date().toISOString(),
      })
      .eq('id', organizationId);

    if (orgUpdateError) {
      // Rollback account creation
      await supabase.from('accounts').delete().eq('id', account.id);
      throw new BadRequestException('Failed to link Stripe account to organization');
    }

    // Create a pending migration record
    const { data: migration, error: migrationError } = await supabase
      .from('stripe_migrations')
      .insert({
        organization_id: organizationId,
        status: 'pending',
        stripe_account_id: stripeUserId,
        include_archived: false,
      })
      .select()
      .single();

    if (migrationError || !migration) {
      this.logger.error('Failed to create migration record:', migrationError);
      throw new BadRequestException('Failed to create migration record');
    }

    this.logger.log(
      `OAuth callback complete: org ${organizationId} connected to Stripe account ${stripeUserId}`,
    );

    return migration as Migration;
  }

  /**
   * Start a migration import job for an organization
   */
  async startMigration(
    userId: string,
    dto: StartMigrationDto,
  ): Promise<Migration> {
    const supabase: any = this.supabaseService.getClient();
    const { organization_id, include_archived = false } = dto;

    // Verify user is member of org
    const { data: membership } = await supabase
      .from('user_organizations')
      .select('user_id')
      .eq('organization_id', organization_id)
      .eq('user_id', userId)
      .is('deleted_at', null)
      .single();

    if (!membership) {
      throw new BadRequestException(
        'You are not a member of this organization',
      );
    }

    // Get the org's Stripe account
    const { data: org } = await supabase
      .from('organizations')
      .select('account_id')
      .eq('id', organization_id)
      .is('deleted_at', null)
      .single();

    if (!org?.account_id) {
      throw new BadRequestException(
        'Organization does not have a connected Stripe account',
      );
    }

    const { data: account } = await supabase
      .from('accounts')
      .select('stripe_id, connect_type')
      .eq('id', org.account_id)
      .single();

    if (!account?.stripe_id) {
      throw new BadRequestException('Stripe account not found');
    }

    if ((account as any).connect_type !== 'standard') {
      throw new BadRequestException(
        'Migration is only available for Standard (OAuth-connected) Stripe accounts',
      );
    }

    // Check for an existing pending migration or create a new one
    let migration: Migration;
    const { data: existingMigration } = await supabase
      .from('stripe_migrations')
      .select('*')
      .eq('organization_id', organization_id)
      .in('status', ['pending', 'failed', 'partial'])
      .order('created_at', { ascending: false })
      .limit(1)
      .single();

    if (existingMigration) {
      const { data: updated } = await supabase
        .from('stripe_migrations')
        .update({
          status: 'in_progress',
          include_archived,
          started_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
          errors: [],
        })
        .eq('id', existingMigration.id)
        .select()
        .single();
      migration = updated as Migration;
    } else {
      const { data: created } = await supabase
        .from('stripe_migrations')
        .insert({
          organization_id,
          status: 'in_progress',
          stripe_account_id: account.stripe_id,
          include_archived,
          started_at: new Date().toISOString(),
        })
        .select()
        .single();
      migration = created as Migration;
    }

    if (!migration) {
      throw new BadRequestException('Failed to create migration record');
    }

    // Run import pipeline asynchronously (fire and forget — updates DB with progress)
    this.runImportPipeline(migration, account.stripe_id, organization_id).catch(
      (err) => {
        this.logger.error(
          `Import pipeline failed for migration ${migration.id}:`,
          err,
        );
      },
    );

    return migration;
  }

  /**
   * Get migration status by ID
   */
  async getMigrationStatus(
    migrationId: string,
    userId: string,
  ): Promise<Migration> {
    const supabase: any = this.supabaseService.getClient();

    const { data: migration } = await supabase
      .from('stripe_migrations')
      .select('*')
      .eq('id', migrationId)
      .single();

    if (!migration) {
      throw new NotFoundException('Migration not found');
    }

    // Verify user has access via organization membership
    const { data: membership } = await supabase
      .from('user_organizations')
      .select('user_id')
      .eq('organization_id', migration.organization_id)
      .eq('user_id', userId)
      .is('deleted_at', null)
      .single();

    if (!membership) {
      throw new NotFoundException('Migration not found');
    }

    return migration as Migration;
  }

  /**
   * Get most recent migration for an organization
   */
  async getLatestMigration(
    organizationId: string,
    userId: string,
  ): Promise<Migration | null> {
    const supabase: any = this.supabaseService.getClient();

    // Verify user membership
    const { data: membership } = await supabase
      .from('user_organizations')
      .select('user_id')
      .eq('organization_id', organizationId)
      .eq('user_id', userId)
      .is('deleted_at', null)
      .single();

    if (!membership) {
      throw new BadRequestException(
        'You are not a member of this organization',
      );
    }

    const { data: migration } = await supabase
      .from('stripe_migrations')
      .select('*')
      .eq('organization_id', organizationId)
      .order('created_at', { ascending: false })
      .limit(1)
      .single();

    return (migration as Migration) || null;
  }

  // ─────────────────────────────────────────────
  // Private import pipeline methods
  // ─────────────────────────────────────────────

  private async runImportPipeline(
    migration: Migration,
    stripeAccountId: string,
    organizationId: string,
  ): Promise<void> {
    const supabase: any = this.supabaseService.getClient();
    const errors: Array<{ entity: string; stripe_id: string; error: string }> =
      [];

    try {
      const maps: ImportMaps = {
        products: new Map(),
        prices: new Map(),
        customers: new Map(),
      };

      // 1. Import products
      await this.importProducts(migration, stripeAccountId, organizationId, maps, errors);

      // 2. Import prices (uses product map built above)
      await this.importPrices(migration, stripeAccountId, organizationId, maps, errors);

      // 3. Import customers
      await this.importCustomers(migration, stripeAccountId, organizationId, maps, errors);

      // 4. Import subscriptions
      await this.importSubscriptions(migration, stripeAccountId, organizationId, maps, errors);

      // Mark as completed or partial
      const finalStatus = errors.length > 0 ? 'partial' : 'completed';
      await supabase
        .from('stripe_migrations')
        .update({
          status: finalStatus,
          errors,
          completed_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq('id', migration.id);

      this.logger.log(
        `Migration ${migration.id} finished with status: ${finalStatus}`,
      );
    } catch (err) {
      this.logger.error(`Migration ${migration.id} failed:`, err);
      await supabase
        .from('stripe_migrations')
        .update({
          status: 'failed',
          errors: [
            ...errors,
            { entity: 'pipeline', stripe_id: '', error: err.message },
          ],
          updated_at: new Date().toISOString(),
        })
        .eq('id', migration.id);
    }
  }

  private async importProducts(
    migration: Migration,
    stripeAccountId: string,
    organizationId: string,
    maps: ImportMaps,
    errors: Array<{ entity: string; stripe_id: string; error: string }>,
  ): Promise<void> {
    const supabase: any = this.supabaseService.getClient();
    const stripe = this.stripeService.getClient();

    const listParams: Stripe.ProductListParams = { limit: 100 };
    if (!migration.include_archived) {
      listParams.active = true;
    }

    const products: Stripe.Product[] = [];
    for await (const product of stripe.products.list(listParams, {
      stripeAccount: stripeAccountId,
    })) {
      products.push(product);
    }

    await supabase
      .from('stripe_migrations')
      .update({ products_total: products.length, updated_at: new Date().toISOString() })
      .eq('id', migration.id);

    let imported = 0;
    for (const product of products) {
      try {
        // Skip one-time products (no recurring prices) — BillingOS is subscription-focused
        // We'll detect this when inserting; if no prices are recurring, skip
        const { data: existing } = await supabase
          .from('products')
          .select('id')
          .eq('organization_id', organizationId)
          .eq('stripe_product_id', product.id)
          .single();

        if (existing) {
          maps.products.set(product.id, existing.id);
          imported++;
          continue;
        }

        const { data: inserted, error } = await supabase
          .from('products')
          .insert({
            organization_id: organizationId,
            stripe_product_id: product.id,
            name: product.name,
            description: product.description || null,
            trial_days: 0,
            visible_in_pricing_table: true,
            version_status: 'current',
            is_archived: !product.active,
            metadata: product.metadata as any,
          })
          .select('id')
          .single();

        if (error) {
          // Could be a duplicate if already exists — re-check
          const { data: recheck } = await supabase
            .from('products')
            .select('id')
            .eq('organization_id', organizationId)
            .eq('stripe_product_id', product.id)
            .single();

          if (recheck) {
            maps.products.set(product.id, recheck.id);
            imported++;
          } else {
            errors.push({
              entity: 'product',
              stripe_id: product.id,
              error: error.message,
            });
          }
        } else if (inserted) {
          maps.products.set(product.id, inserted.id);
          imported++;
        }
      } catch (err) {
        errors.push({
          entity: 'product',
          stripe_id: product.id,
          error: err.message,
        });
      }

      // Update progress counter
      await supabase
        .from('stripe_migrations')
        .update({ products_imported: imported, updated_at: new Date().toISOString() })
        .eq('id', migration.id);
    }

    this.logger.log(
      `Products import complete: ${imported}/${products.length} for migration ${migration.id}`,
    );
  }

  private async importPrices(
    migration: Migration,
    stripeAccountId: string,
    organizationId: string,
    maps: ImportMaps,
    errors: Array<{ entity: string; stripe_id: string; error: string }>,
  ): Promise<void> {
    const supabase: any = this.supabaseService.getClient();
    const stripe = this.stripeService.getClient();

    const allPrices: Stripe.Price[] = [];
    const listParams: Stripe.PriceListParams = { limit: 100 };
    if (!migration.include_archived) {
      listParams.active = true;
    }

    for await (const price of stripe.prices.list(listParams, {
      stripeAccount: stripeAccountId,
    })) {
      // Only import prices for products we successfully imported
      if (price.product && maps.products.has(price.product as string)) {
        allPrices.push(price);
      }
    }

    await supabase
      .from('stripe_migrations')
      .update({ prices_total: allPrices.length, updated_at: new Date().toISOString() })
      .eq('id', migration.id);

    let imported = 0;
    for (const price of allPrices) {
      try {
        const localProductId = maps.products.get(price.product as string);
        if (!localProductId) continue;

        // Skip non-recurring prices (BillingOS is subscription-focused)
        if (!price.recurring) {
          this.logger.warn(
            `Skipping one-time price ${price.id} (no recurring interval)`,
          );
          continue;
        }

        const { data: existing } = await supabase
          .from('product_prices')
          .select('id')
          .eq('product_id', localProductId)
          .eq('stripe_price_id', price.id)
          .single();

        if (existing) {
          maps.prices.set(price.id, existing.id);
          imported++;
          continue;
        }

        const { data: inserted, error } = await supabase
          .from('product_prices')
          .insert({
            product_id: localProductId,
            stripe_price_id: price.id,
            amount_type: price.unit_amount === 0 ? 'FREE' : 'FIXED',
            price_amount: price.unit_amount ?? 0,
            price_currency: price.currency,
            recurring_interval: price.recurring?.interval ?? null,
            recurring_interval_count: price.recurring?.interval_count ?? 1,
            is_archived: !price.active,
          })
          .select('id')
          .single();

        if (error) {
          const { data: recheck } = await supabase
            .from('product_prices')
            .select('id')
            .eq('product_id', localProductId)
            .eq('stripe_price_id', price.id)
            .single();

          if (recheck) {
            maps.prices.set(price.id, recheck.id);
            imported++;
          } else {
            errors.push({
              entity: 'price',
              stripe_id: price.id,
              error: error.message,
            });
          }
        } else if (inserted) {
          maps.prices.set(price.id, inserted.id);
          imported++;
        }
      } catch (err) {
        errors.push({
          entity: 'price',
          stripe_id: price.id,
          error: err.message,
        });
      }

      await supabase
        .from('stripe_migrations')
        .update({ prices_imported: imported, updated_at: new Date().toISOString() })
        .eq('id', migration.id);
    }

    // Also update product recurring intervals from their first price
    await this.updateProductIntervalsFromPrices(maps, organizationId);

    this.logger.log(
      `Prices import complete: ${imported}/${allPrices.length} for migration ${migration.id}`,
    );
  }

  private async updateProductIntervalsFromPrices(
    maps: ImportMaps,
    organizationId: string,
  ): Promise<void> {
    const supabase: any = this.supabaseService.getClient();

    // For each imported product, get its first price and update recurring_interval
    for (const [, localProductId] of maps.products) {
      const { data: price } = await supabase
        .from('product_prices')
        .select('recurring_interval, recurring_interval_count')
        .eq('product_id', localProductId)
        .is('is_archived', false)
        .order('created_at', { ascending: true })
        .limit(1)
        .single();

      if (price?.recurring_interval) {
        await supabase
          .from('products')
          .update({
            recurring_interval: price.recurring_interval,
            recurring_interval_count: price.recurring_interval_count ?? 1,
          })
          .eq('id', localProductId)
          .eq('organization_id', organizationId);
      }
    }
  }

  private async importCustomers(
    migration: Migration,
    stripeAccountId: string,
    organizationId: string,
    maps: ImportMaps,
    errors: Array<{ entity: string; stripe_id: string; error: string }>,
  ): Promise<void> {
    const supabase: any = this.supabaseService.getClient();
    const stripe = this.stripeService.getClient();

    // Count customers first for progress tracking
    const customers: Stripe.Customer[] = [];
    for await (const customer of stripe.customers.list(
      { limit: 100 },
      { stripeAccount: stripeAccountId },
    )) {
      if (customer.deleted) continue;
      customers.push(customer as Stripe.Customer);
    }

    await supabase
      .from('stripe_migrations')
      .update({
        customers_total: customers.length,
        updated_at: new Date().toISOString(),
      })
      .eq('id', migration.id);

    let imported = 0;
    for (const customer of customers) {
      try {
        const stripeCustomer = customer as Stripe.Customer;

        // Check if already exists
        const { data: existing } = await supabase
          .from('customers')
          .select('id')
          .eq('organization_id', organizationId)
          .eq('stripe_customer_id', stripeCustomer.id)
          .is('deleted_at', null)
          .single();

        if (existing) {
          maps.customers.set(stripeCustomer.id, existing.id);
          imported++;
          await supabase
            .from('stripe_migrations')
            .update({ customers_imported: imported, updated_at: new Date().toISOString() })
            .eq('id', migration.id);
          continue;
        }

        if (!stripeCustomer.email) {
          // Customers without email can't be imported (email is required)
          this.logger.warn(
            `Skipping customer ${stripeCustomer.id} (no email)`,
          );
          continue;
        }

        // Map billing address from Stripe format
        const billingAddress = stripeCustomer.address
          ? {
              street: stripeCustomer.address.line1 || '',
              city: stripeCustomer.address.city || '',
              state: stripeCustomer.address.state || '',
              postal_code: stripeCustomer.address.postal_code || '',
              country: stripeCustomer.address.country || '',
            }
          : {};

        const { data: inserted, error } = await supabase
          .from('customers')
          .insert({
            organization_id: organizationId,
            stripe_customer_id: stripeCustomer.id,
            email: stripeCustomer.email.toLowerCase(),
            name: stripeCustomer.name || null,
            billing_address: billingAddress as any,
            metadata: (stripeCustomer.metadata || {}) as any,
            email_verified: false,
          })
          .select('id')
          .single();

        if (error) {
          // Handle email conflict — customer may already exist with a different stripe ID
          const { data: recheck } = await supabase
            .from('customers')
            .select('id')
            .eq('organization_id', organizationId)
            .ilike('email', stripeCustomer.email)
            .is('deleted_at', null)
            .single();

          if (recheck) {
            // Update the existing customer with the Stripe ID
            await supabase
              .from('customers')
              .update({ stripe_customer_id: stripeCustomer.id })
              .eq('id', recheck.id);
            maps.customers.set(stripeCustomer.id, recheck.id);
            imported++;
          } else {
            errors.push({
              entity: 'customer',
              stripe_id: stripeCustomer.id,
              error: error.message,
            });
          }
        } else if (inserted) {
          maps.customers.set(stripeCustomer.id, inserted.id);
          imported++;
        }
      } catch (err) {
        errors.push({
          entity: 'customer',
          stripe_id: customer.id,
          error: err.message,
        });
      }

      await supabase
        .from('stripe_migrations')
        .update({ customers_imported: imported, updated_at: new Date().toISOString() })
        .eq('id', migration.id);
    }

    this.logger.log(
      `Customers import complete: ${imported}/${customers.length} for migration ${migration.id}`,
    );
  }

  private async importSubscriptions(
    migration: Migration,
    stripeAccountId: string,
    organizationId: string,
    maps: ImportMaps,
    errors: Array<{ entity: string; stripe_id: string; error: string }>,
  ): Promise<void> {
    const supabase: any = this.supabaseService.getClient();
    const stripe = this.stripeService.getClient();

    const statuses: Stripe.SubscriptionListParams.Status[] = [
      'active',
      'trialing',
    ];
    if (migration.include_archived) {
      statuses.push('canceled');
    }

    const subscriptions: Stripe.Subscription[] = [];
    for (const status of statuses) {
      for await (const sub of stripe.subscriptions.list(
        { status, limit: 100 },
        { stripeAccount: stripeAccountId },
      )) {
        subscriptions.push(sub);
      }
    }

    await supabase
      .from('stripe_migrations')
      .update({
        subscriptions_total: subscriptions.length,
        updated_at: new Date().toISOString(),
      })
      .eq('id', migration.id);

    let imported = 0;
    for (const sub of subscriptions) {
      try {
        // Check if already exists
        const { data: existing } = await supabase
          .from('subscriptions')
          .select('id')
          .eq('organization_id', organizationId)
          .eq('stripe_subscription_id', sub.id)
          .single();

        if (existing) {
          imported++;
          await supabase
            .from('stripe_migrations')
            .update({ subscriptions_imported: imported, updated_at: new Date().toISOString() })
            .eq('id', migration.id);
          continue;
        }

        // Get first line item (v1: only import first item)
        const firstItem = sub.items.data[0];
        if (!firstItem) {
          errors.push({
            entity: 'subscription',
            stripe_id: sub.id,
            error: 'No line items found',
          });
          continue;
        }

        if (sub.items.data.length > 1) {
          this.logger.warn(
            `Subscription ${sub.id} has ${sub.items.data.length} items — only importing first item`,
          );
        }

        const stripePrice = firstItem.price;
        const stripePriceId = stripePrice.id;
        const stripeProductId =
          typeof stripePrice.product === 'string'
            ? stripePrice.product
            : stripePrice.product?.id;

        const localCustomerId = maps.customers.get(sub.customer as string);
        const localProductId = stripeProductId
          ? maps.products.get(stripeProductId)
          : undefined;
        const localPriceId = maps.prices.get(stripePriceId);

        if (!localCustomerId) {
          errors.push({
            entity: 'subscription',
            stripe_id: sub.id,
            error: `Customer ${sub.customer} not found in BillingOS`,
          });
          continue;
        }

        if (!localProductId || !localPriceId) {
          errors.push({
            entity: 'subscription',
            stripe_id: sub.id,
            error: `Product/price mapping not found (price: ${stripePriceId})`,
          });
          continue;
        }

        // Cast as any to access fields that may differ between Stripe API versions
        const subAny = sub as any;
        const { data: inserted, error } = await supabase
          .from('subscriptions')
          .insert({
            organization_id: organizationId,
            customer_id: localCustomerId,
            product_id: localProductId,
            price_id: localPriceId,
            stripe_subscription_id: sub.id,
            status: sub.status,
            amount: stripePrice.unit_amount ?? 0,
            currency: stripePrice.currency,
            current_period_start: subAny.current_period_start
              ? new Date(subAny.current_period_start * 1000).toISOString()
              : null,
            current_period_end: subAny.current_period_end
              ? new Date(subAny.current_period_end * 1000).toISOString()
              : null,
            trial_start: sub.trial_start
              ? new Date(sub.trial_start * 1000).toISOString()
              : null,
            trial_end: sub.trial_end
              ? new Date(sub.trial_end * 1000).toISOString()
              : null,
            cancel_at_period_end: sub.cancel_at_period_end,
            metadata: (sub.metadata || {}) as any,
          })
          .select('id')
          .single();

        if (error) {
          errors.push({
            entity: 'subscription',
            stripe_id: sub.id,
            error: error.message,
          });
        } else if (inserted) {
          imported++;
        }
      } catch (err) {
        errors.push({
          entity: 'subscription',
          stripe_id: sub.id,
          error: err.message,
        });
      }

      await supabase
        .from('stripe_migrations')
        .update({
          subscriptions_imported: imported,
          updated_at: new Date().toISOString(),
        })
        .eq('id', migration.id);
    }

    this.logger.log(
      `Subscriptions import complete: ${imported}/${subscriptions.length} for migration ${migration.id}`,
    );
  }
}

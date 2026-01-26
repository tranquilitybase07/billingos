import {
  Injectable,
  Logger,
  NotFoundException,
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Inject,
} from '@nestjs/common';
import { CACHE_MANAGER } from '@nestjs/cache-manager';
import { Cache } from 'cache-manager';
import { SupabaseService } from '../supabase/supabase.service';
import { StripeService } from '../stripe/stripe.service';
import { CreateCustomerDto } from './dto/create-customer.dto';
import { UpdateCustomerDto } from './dto/update-customer.dto';
import { ListCustomersDto, CustomerSortField } from './dto/list-customers.dto';
import {
  CustomerResponseDto,
  PaginatedCustomersResponseDto,
  CustomerStateResponseDto,
} from './dto/customer-response.dto';
import Stripe from 'stripe';

@Injectable()
export class CustomersService {
  private readonly logger = new Logger(CustomersService.name);

  constructor(
    private readonly supabaseService: SupabaseService,
    private readonly stripeService: StripeService,
    @Inject(CACHE_MANAGER) private cacheManager: Cache,
  ) {}

  /**
   * Create a new customer
   */
  async create(
    createDto: CreateCustomerDto,
  ): Promise<CustomerResponseDto> {
    const supabase = this.supabaseService.getClient();

    // 1. Validate email uniqueness per organization
    const { data: existingEmailCustomer } = await supabase
      .from('customers')
      .select('id')
      .eq('organization_id', createDto.organization_id)
      .ilike('email', createDto.email)
      .is('deleted_at', null)
      .single();

    if (existingEmailCustomer) {
      throw new ConflictException(
        'A customer with this email already exists in your organization',
      );
    }

    // 2. Validate external_id uniqueness per organization (if provided)
    if (createDto.external_id) {
      const { data: existingExternalIdCustomer } = await supabase
        .from('customers')
        .select('id')
        .eq('organization_id', createDto.organization_id)
        .eq('external_id', createDto.external_id)
        .is('deleted_at', null)
        .single();

      if (existingExternalIdCustomer) {
        throw new ConflictException(
          'A customer with this external_id already exists in your organization',
        );
      }
    }

    // 3. Get organization's Stripe Connect account
    const { data: org } = await supabase
      .from('organizations')
      .select('account_id')
      .eq('id', createDto.organization_id)
      .single();

    if (!org?.account_id) {
      throw new BadRequestException(
        'Organization does not have a connected Stripe account',
      );
    }

    const { data: account } = await supabase
      .from('accounts')
      .select('stripe_id')
      .eq('id', org.account_id)
      .single();

    if (!account?.stripe_id) {
      throw new BadRequestException('Stripe account not found');
    }

    // 4. Create customer in Stripe Connect account
    let stripeCustomer: Stripe.Customer | null = null;
    try {
      const stripe = this.stripeService.getClient();
      stripeCustomer = await stripe.customers.create(
        {
          email: createDto.email,
          name: createDto.name,
          metadata: {
            ...createDto.metadata,
            external_id: createDto.external_id || '',
          },
          address: createDto.billing_address
            ? {
                line1: createDto.billing_address.street || '',
                city: createDto.billing_address.city || '',
                state: createDto.billing_address.state || '',
                postal_code: createDto.billing_address.postal_code || '',
                country: createDto.billing_address.country || '',
              }
            : undefined,
        },
        {
          stripeAccount: account.stripe_id,
        },
      );

      this.logger.log(
        `Created Stripe customer: ${stripeCustomer.id} in account ${account.stripe_id}`,
      );
    } catch (error) {
      this.logger.error('Failed to create Stripe customer', error);
      throw new BadRequestException(
        `Failed to create customer in Stripe: ${error.message}`,
      );
    }

    // 5. Insert customer into database
    const { data: customer, error } = await supabase
      .from('customers')
      .insert({
        organization_id: createDto.organization_id,
        email: createDto.email.toLowerCase(),
        name: createDto.name || null,
        external_id: createDto.external_id || null,
        billing_address: (createDto.billing_address || {}) as any,
        stripe_customer_id: stripeCustomer.id,
        metadata: (createDto.metadata || {}) as any,
        email_verified: false,
      })
      .select()
      .single();

    if (error) {
      this.logger.error('Failed to insert customer into database', error);
      throw new BadRequestException(`Failed to create customer: ${error.message}`);
    }

    return this.mapToResponseDto(customer);
  }

  /**
   * Find all customers for an organization with filters and pagination
   */
  async findAll(
    organizationId: string,
    query: ListCustomersDto,
  ): Promise<PaginatedCustomersResponseDto> {
    const supabase = this.supabaseService.getClient();

    const { limit = 50, page = 1, email, external_id, query: searchQuery, sort_by, sort_order } = query;
    const offset = (page - 1) * limit;

    // Build query
    let supabaseQuery = supabase
      .from('customers')
      .select('*', { count: 'exact' })
      .eq('organization_id', organizationId)
      .is('deleted_at', null);

    // Apply filters
    if (email) {
      supabaseQuery = supabaseQuery.ilike('email', email);
    }

    if (external_id) {
      supabaseQuery = supabaseQuery.eq('external_id', external_id);
    }

    if (searchQuery) {
      supabaseQuery = supabaseQuery.or(
        `name.ilike.%${searchQuery}%,email.ilike.%${searchQuery}%,external_id.ilike.%${searchQuery}%`,
      );
    }

    // Apply sorting
    const sortField = sort_by || CustomerSortField.CREATED_AT;
    const sortDirection = sort_order || 'desc';
    supabaseQuery = supabaseQuery.order(sortField, { ascending: sortDirection === 'asc' });

    // Apply pagination
    supabaseQuery = supabaseQuery.range(offset, offset + limit - 1);

    const { data: customers, error, count } = await supabaseQuery;

    if (error) {
      this.logger.error('Failed to fetch customers', error);
      throw new BadRequestException(`Failed to fetch customers: ${error.message}`);
    }

    const total = count || 0;
    const totalPages = Math.ceil(total / limit);

    return {
      data: customers.map((customer) => this.mapToResponseDto(customer)),
      total,
      page,
      limit,
      total_pages: totalPages,
    };
  }

  /**
   * Find one customer by ID
   */
  async findOne(
    id: string,
    organizationId: string,
  ): Promise<CustomerResponseDto> {
    const supabase = this.supabaseService.getClient();

    const { data: customer, error } = await supabase
      .from('customers')
      .select('*')
      .eq('id', id)
      .eq('organization_id', organizationId)
      .is('deleted_at', null)
      .single();

    if (error || !customer) {
      throw new NotFoundException('Customer not found');
    }

    return this.mapToResponseDto(customer);
  }

  /**
   * Find one customer by external_id
   */
  async findOneByExternalId(
    externalId: string,
    organizationId: string,
  ): Promise<CustomerResponseDto> {
    const supabase = this.supabaseService.getClient();

    const { data: customer, error } = await supabase
      .from('customers')
      .select('*')
      .eq('external_id', externalId)
      .eq('organization_id', organizationId)
      .is('deleted_at', null)
      .single();

    if (error || !customer) {
      throw new NotFoundException('Customer not found');
    }

    return this.mapToResponseDto(customer);
  }

  /**
   * Update customer by ID
   */
  async update(
    id: string,
    organizationId: string,
    updateDto: UpdateCustomerDto,
  ): Promise<CustomerResponseDto> {
    const supabase = this.supabaseService.getClient();

    // 1. Find existing customer
    const { data: existingCustomer, error: findError } = await supabase
      .from('customers')
      .select('*')
      .eq('id', id)
      .eq('organization_id', organizationId)
      .is('deleted_at', null)
      .single();

    if (findError || !existingCustomer) {
      throw new NotFoundException('Customer not found');
    }

    // Cast to any to work around type issues until migration is run
    const existingCustomerData = existingCustomer as any;

    // 2. Validate email uniqueness if changed
    if ('email' in updateDto && updateDto.email && updateDto.email.toLowerCase() !== existingCustomerData.email) {
      const { data: emailConflict } = await supabase
        .from('customers')
        .select('id')
        .eq('organization_id', organizationId)
        .ilike('email', updateDto.email)
        .neq('id', id)
        .is('deleted_at', null)
        .single();

      if (emailConflict) {
        throw new ConflictException(
          'A customer with this email already exists in your organization',
        );
      }
    }

    // 3. Validate external_id uniqueness and immutability
    if ('external_id' in updateDto && updateDto.external_id) {
      // Check if external_id is being changed (can only set once)
      if (existingCustomerData.external_id && existingCustomerData.external_id !== updateDto.external_id) {
        throw new BadRequestException(
          'external_id cannot be changed once set. Current value: ' + existingCustomerData.external_id,
        );
      }

      // Check uniqueness if setting for first time
      if (!existingCustomerData.external_id) {
        const { data: externalIdConflict } = await supabase
          .from('customers')
          .select('id')
          .eq('organization_id', organizationId)
          .eq('external_id', updateDto.external_id)
          .is('deleted_at', null)
          .single();

        if (externalIdConflict) {
          throw new ConflictException(
            'A customer with this external_id already exists in your organization',
          );
        }
      }
    }

    // 4. Build update object
    const updateData: any = {
      updated_at: new Date().toISOString(),
    };

    if ('email' in updateDto && updateDto.email) {
      updateData.email = updateDto.email.toLowerCase();
      // Reset email_verified if email changed
      if (updateDto.email.toLowerCase() !== existingCustomerData.email) {
        updateData.email_verified = false;
      }
    }

    if ('name' in updateDto && updateDto.name !== undefined) {
      updateData.name = updateDto.name;
    }

    if ('external_id' in updateDto && updateDto.external_id && !existingCustomerData.external_id) {
      updateData.external_id = updateDto.external_id;
    }

    if ('billing_address' in updateDto && updateDto.billing_address !== undefined) {
      updateData.billing_address = updateDto.billing_address;
    }

    if ('metadata' in updateDto && updateDto.metadata !== undefined) {
      updateData.metadata = updateDto.metadata;
    }

    // 5. Update in database
    const { data: updatedCustomer, error: updateError } = await supabase
      .from('customers')
      .update(updateData)
      .eq('id', id)
      .select()
      .single();

    if (updateError) {
      this.logger.error('Failed to update customer', updateError);
      throw new BadRequestException(`Failed to update customer: ${updateError.message}`);
    }

    // 6. Sync to Stripe Connect account (if stripe_customer_id exists)
    if (existingCustomer.stripe_customer_id) {
      await this.syncToStripe(updatedCustomer);
    }

    // 7. Invalidate cache
    await this.invalidateCustomerCache(id);

    return this.mapToResponseDto(updatedCustomer);
  }

  /**
   * Update customer by external_id
   */
  async updateByExternalId(
    externalId: string,
    organizationId: string,
    updateDto: UpdateCustomerDto,
  ): Promise<CustomerResponseDto> {
    const customer = await this.findOneByExternalId(externalId, organizationId);
    return this.update(customer.id, organizationId, updateDto);
  }

  /**
   * Delete (soft delete) customer by ID
   */
  async delete(id: string, organizationId: string): Promise<void> {
    const supabase = this.supabaseService.getClient();

    // 1. Find customer
    const { data: customer, error: findError } = await supabase
      .from('customers')
      .select('*')
      .eq('id', id)
      .eq('organization_id', organizationId)
      .is('deleted_at', null)
      .single();

    if (findError || !customer) {
      throw new NotFoundException('Customer not found');
    }

    // 2. Cancel active subscriptions
    const { data: activeSubscriptions } = await supabase
      .from('subscriptions')
      .select('id, stripe_subscription_id')
      .eq('customer_id', id)
      .eq('status', 'active')
      .is('deleted_at', null);

    if (activeSubscriptions && activeSubscriptions.length > 0) {
      this.logger.log(`Cancelling ${activeSubscriptions.length} active subscriptions for customer ${id}`);

      // Cancel subscriptions in Stripe
      const stripe = this.stripeService.getClient();
      const { data: org } = await supabase
        .from('organizations')
        .select('account_id')
        .eq('id', organizationId)
        .single();

      if (org?.account_id) {
        const { data: account } = await supabase
          .from('accounts')
          .select('stripe_id')
          .eq('id', org.account_id)
          .single();

        if (account?.stripe_id) {
          for (const subscription of activeSubscriptions) {
            if (subscription.stripe_subscription_id) {
              try {
                await stripe.subscriptions.cancel(
                  subscription.stripe_subscription_id,
                  undefined,
                  { stripeAccount: account.stripe_id },
                );
              } catch (error) {
                this.logger.error(`Failed to cancel Stripe subscription ${subscription.stripe_subscription_id}`, error);
              }
            }
          }
        }
      }

      // Soft delete subscriptions
      await supabase
        .from('subscriptions')
        .update({
          status: 'canceled',
          deleted_at: new Date().toISOString(),
        })
        .eq('customer_id', id);
    }

    // 3. Revoke feature grants
    const { data: featureGrants } = await supabase
      .from('feature_grants')
      .select('id')
      .eq('customer_id', id)
      .is('revoked_at', null);

    if (featureGrants && featureGrants.length > 0) {
      this.logger.log(`Revoking ${featureGrants.length} feature grants for customer ${id}`);

      await supabase
        .from('feature_grants')
        .update({ revoked_at: new Date().toISOString() })
        .eq('customer_id', id);
    }

    // 4. Soft delete customer and clear external_id
    const { error: deleteError } = await supabase
      .from('customers')
      .update({
        deleted_at: new Date().toISOString(),
        external_id: null, // Clear external_id to allow reuse
      })
      .eq('id', id);

    if (deleteError) {
      this.logger.error('Failed to delete customer', deleteError);
      throw new BadRequestException(`Failed to delete customer: ${deleteError.message}`);
    }

    // 5. Invalidate cache
    await this.invalidateCustomerCache(id);

    this.logger.log(`Successfully deleted customer ${id}`);
  }

  /**
   * Delete customer by external_id
   */
  async deleteByExternalId(
    externalId: string,
    organizationId: string,
  ): Promise<void> {
    const customer = await this.findOneByExternalId(externalId, organizationId);
    await this.delete(customer.id, organizationId);
  }

  /**
   * Get comprehensive customer state (customer + subscriptions + features)
   * Uses Redis caching with 1-hour TTL
   */
  async getCustomerState(
    id: string,
    organizationId: string,
  ): Promise<CustomerStateResponseDto> {
    const cacheKey = `customer:state:${id}`;

    // Try to get from cache
    const cached = await this.cacheManager.get<CustomerStateResponseDto>(cacheKey);
    if (cached) {
      this.logger.log(`Customer state cache HIT for ${id}`);
      return cached;
    }

    this.logger.log(`Customer state cache MISS for ${id}`);

    const supabase = this.supabaseService.getClient();

    // 1. Get customer
    const customer = await this.findOne(id, organizationId);

    // 2. Get active subscriptions
    const { data: subscriptions } = await supabase
      .from('subscriptions')
      .select('*')
      .eq('customer_id', id)
      .eq('status', 'active')
      .is('deleted_at', null);

    // 3. Get granted features (using raw SQL to avoid type issues)
    const { data: featureGrants } = await supabase
      .from('feature_grants')
      .select(`
        id,
        feature_id,
        granted_at,
        features!inner (
          key,
          name
        )
      `)
      .eq('customer_id', id)
      .is('revoked_at', null);

    const state: CustomerStateResponseDto = {
      customer,
      active_subscriptions:
        subscriptions?.map((sub: any) => ({
          id: sub.id,
          status: sub.status,
          product_id: sub.product_id,
          price_id: sub.price_id,
          current_period_start: sub.current_period_start,
          current_period_end: sub.current_period_end,
          cancel_at_period_end: sub.cancel_at_period_end || false,
        })) || [],
      granted_features:
        (featureGrants as any)?.map((grant: any) => ({
          id: grant.id,
          feature_id: grant.feature_id,
          feature_key: grant.features?.key || '',
          feature_name: grant.features?.name || '',
          granted_at: grant.granted_at || new Date().toISOString(),
        })) || [],
    };

    // Cache for 1 hour (3600 seconds)
    await this.cacheManager.set(cacheKey, state, 3600000); // TTL in milliseconds

    return state;
  }

  /**
   * Invalidate customer state cache
   * Call this when customer, subscriptions, or feature grants change
   */
  async invalidateCustomerCache(customerId: string): Promise<void> {
    const cacheKey = `customer:state:${customerId}`;
    await this.cacheManager.del(cacheKey);
    this.logger.log(`Invalidated cache for customer ${customerId}`);
  }

  /**
   * Sync customer data to Stripe Connect account
   */
  private async syncToStripe(customer: any): Promise<void> {
    const supabase = this.supabaseService.getClient();

    try {
      // Get organization's Stripe account
      const { data: org } = await supabase
        .from('organizations')
        .select('account_id')
        .eq('id', customer.organization_id)
        .single();

      if (!org?.account_id) {
        this.logger.warn(`No Stripe account for organization ${customer.organization_id}`);
        return;
      }

      const { data: account } = await supabase
        .from('accounts')
        .select('stripe_id')
        .eq('id', org.account_id)
        .single();

      if (!account?.stripe_id || !customer.stripe_customer_id) {
        return;
      }

      // Update Stripe customer
      const stripe = this.stripeService.getClient();
      await stripe.customers.update(
        customer.stripe_customer_id,
        {
          email: customer.email,
          name: customer.name,
          metadata: {
            ...customer.metadata,
            external_id: customer.external_id || '',
          },
          address: customer.billing_address
            ? {
                line1: customer.billing_address.street || '',
                city: customer.billing_address.city || '',
                state: customer.billing_address.state || '',
                postal_code: customer.billing_address.postal_code || '',
                country: customer.billing_address.country || '',
              }
            : undefined,
        },
        {
          stripeAccount: account.stripe_id,
        },
      );

      this.logger.log(`Synced customer ${customer.id} to Stripe`);
    } catch (error) {
      this.logger.error(`Failed to sync customer to Stripe: ${error.message}`, error);
      // Don't throw - sync failures shouldn't block the operation
    }
  }

  /**
   * Map database customer to response DTO
   */
  private mapToResponseDto(customer: any): CustomerResponseDto {
    return {
      id: customer.id,
      organization_id: customer.organization_id,
      external_id: customer.external_id,
      email: customer.email,
      email_verified: customer.email_verified,
      name: customer.name,
      billing_address: customer.billing_address,
      stripe_customer_id: customer.stripe_customer_id,
      metadata: customer.metadata,
      created_at: customer.created_at,
      updated_at: customer.updated_at,
      deleted_at: customer.deleted_at,
    };
  }
}

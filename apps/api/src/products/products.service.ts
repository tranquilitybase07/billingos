/* eslint-disable @typescript-eslint/no-unsafe-call */
import {
  Injectable,
  Logger,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
} from '@nestjs/common';
import Stripe from 'stripe';
import { SupabaseService } from '../supabase/supabase.service';
import { StripeService } from '../stripe/stripe.service';
import { User } from '../user/entities/user.entity';
import { CreateProductDto } from './dto/create-product.dto';
import { UpdateProductDto } from './dto/update-product.dto';
import { PriceAmountType, CreatePriceDto } from './dto/create-price.dto';

@Injectable()
export class ProductsService {
  private readonly logger = new Logger(ProductsService.name);

  constructor(
    private readonly supabaseService: SupabaseService,
    private readonly stripeService: StripeService,
  ) {}

  /**
   * Create product with prices and features (atomic operation)
   */
  async create(user: User, createDto: CreateProductDto) {
    const supabase = this.supabaseService.getClient();

    // Verify organization exists and user is a member
    const { data: org, error: orgError } = await supabase
      .from('organizations')
      .select('id, account_id')
      .eq('id', createDto.organization_id)
      .is('deleted_at', null)
      .single();

    if (orgError || !org) {
      throw new NotFoundException('Organization not found');
    }

    // Verify user is member
    const { data: membership } = await supabase
      .from('user_organizations')
      .select('user_id')
      .eq('organization_id', createDto.organization_id)
      .eq('user_id', user.id)
      .is('deleted_at', null)
      .single();

    if (!membership) {
      throw new ForbiddenException('You are not a member of this organization');
    }

    // Get Stripe account ID
    if (!org.account_id) {
      throw new BadRequestException(
        'Organization must complete Stripe Connect onboarding first',
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

    try {
      // 1. Create product in Stripe
      const stripeProduct = await this.stripeService.createProduct(
        {
          name: createDto.name,
          description: createDto.description,
          metadata: {
            organization_id: createDto.organization_id,
            ...createDto.metadata,
          },
        },
        account.stripe_id,
      );

      this.logger.log(
        `Stripe product created: ${stripeProduct.id} for org ${createDto.organization_id}`,
      );

      // 2. Create prices in Stripe
      const stripePrices: Array<{
        stripe_price: Stripe.Price | null;
        dto: CreatePriceDto;
      }> = [];
      for (const priceDto of createDto.prices) {
        if (priceDto.amount_type === PriceAmountType.FIXED) {
          const stripePrice = await this.stripeService.createPrice(
            {
              product: stripeProduct.id,
              currency: priceDto.price_currency || 'usd',
              unit_amount: priceDto.price_amount,
              recurring: {
                interval: createDto.recurring_interval,
                interval_count: createDto.recurring_interval_count || 1,
              },
            },
            account.stripe_id,
          );
          stripePrices.push({
            stripe_price: stripePrice,
            dto: priceDto,
          });
        } else if (priceDto.amount_type === PriceAmountType.FREE) {
          // Free prices don't need Stripe price objects
          stripePrices.push({
            stripe_price: null,
            dto: priceDto,
          });
        }
      }

      this.logger.log(`Created ${stripePrices.length} prices in Stripe`);

      // 3. Start DB transaction
      // Insert product
      const { data: product, error: productError } = await supabase
        .from('products')
        .insert({
          organization_id: createDto.organization_id,
          name: createDto.name,
          description: createDto.description,
          recurring_interval: createDto.recurring_interval,
          recurring_interval_count: createDto.recurring_interval_count || 1,
          stripe_product_id: stripeProduct.id,
          trial_days: createDto.trial_days || 0,
          metadata: createDto.metadata || {},
          is_archived: false,
        })
        .select()
        .single();

      if (productError || !product) {
        this.logger.error('Failed to create product in DB:', productError);
        // Cleanup Stripe
        await this.stripeService.deleteProduct(
          stripeProduct.id,
          account.stripe_id,
        );
        throw new Error('Failed to create product');
      }

      // Insert prices
      const priceRecords: any[] = [];
      for (const { stripe_price, dto } of stripePrices) {
        const { data: priceRecord, error: priceError } = await supabase
          .from('product_prices')
          .insert({
            product_id: product.id,
            amount_type: dto.amount_type,
            price_amount: dto.price_amount || null,
            price_currency: dto.price_currency || 'usd',
            stripe_price_id: stripe_price?.id || null,
            is_archived: false,
          })
          .select()
          .single();

        if (priceError || !priceRecord) {
          this.logger.error('Failed to create price in DB:', priceError);
          // Cleanup
          await supabase.from('products').delete().eq('id', product.id);
          await this.stripeService.deleteProduct(
            stripeProduct.id,
            account.stripe_id,
          );
          throw new Error('Failed to create price');
        }

        priceRecords.push(priceRecord);
      }

      // Insert feature links
      const featureLinks: any[] = [];
      if (createDto.features && createDto.features.length > 0) {
        for (const featureDto of createDto.features) {
          // Verify feature exists and belongs to organization
          const { data: feature } = await supabase
            .from('features')
            .select('id')
            .eq('id', featureDto.feature_id)
            .eq('organization_id', createDto.organization_id)
            .single();

          if (!feature) {
            throw new NotFoundException(
              `Feature ${featureDto.feature_id} not found`,
            );
          }

          const { data: link, error: linkError } = await supabase
            .from('product_features')
            .insert({
              product_id: product.id,
              feature_id: featureDto.feature_id,
              display_order: featureDto.display_order,
              config: featureDto.config || {},
            })
            .select()
            .single();

          if (linkError || !link) {
            this.logger.error('Failed to link feature:', linkError);
            throw new Error('Failed to link feature');
          }

          featureLinks.push(link);
        }
      }

      this.logger.log(
        `Product created: ${product.id} with ${priceRecords.length} prices and ${featureLinks.length} features`,
      );

      // Return product with prices and features
      return await this.findOne(product.id, user.id);
    } catch (error) {
      this.logger.error('Error creating product:', error);
      throw new BadRequestException(
        error.message || 'Failed to create product',
      );
    }
  }

  /**
   * List all products for organization
   */
  async findAll(
    organizationId: string,
    userId: string,
    includeArchived = false,
    includeFeatures = true,
    includePrices = true,
  ) {
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

    // Build query
    let query = supabase
      .from('products')
      .select('*')
      .eq('organization_id', organizationId)
      .order('created_at', { ascending: false });

    if (!includeArchived) {
      query = query.eq('is_archived', false);
    }

    const { data: products, error } = await query;

    if (error) {
      throw new BadRequestException('Failed to fetch products');
    }

    // Fetch prices and features if requested
    const enrichedProducts: any[] = [];
    for (const product of products || []) {
      const enriched: any = { ...product };

      if (includePrices) {
        const { data: prices } = await supabase
          .from('product_prices')
          .select('*')
          .eq('product_id', product.id)
          .eq('is_archived', false)
          .order('created_at', { ascending: true });

        enriched.prices = prices || [];
      }

      if (includeFeatures) {
        const { data: featureLinks } = await supabase
          .from('product_features')
          .select(
            `
            display_order,
            config,
            features (
              id,
              name,
              title,
              description,
              type,
              properties
            )
          `,
          )
          .eq('product_id', product.id)
          .order('display_order', { ascending: true });

        enriched.features = featureLinks || [];
      }

      enrichedProducts.push(enriched);
    }

    return enrichedProducts;
  }

  /**
   * Get single product by ID
   */
  async findOne(id: string, userId: string) {
    const supabase = this.supabaseService.getClient();

    const { data: product, error } = await supabase
      .from('products')
      .select('*')
      .eq('id', id)
      .single();

    if (error || !product) {
      throw new NotFoundException('Product not found');
    }

    // Verify user has access
    const { data: membership } = await supabase
      .from('user_organizations')
      .select('user_id')
      .eq('organization_id', product.organization_id)
      .eq('user_id', userId)
      .is('deleted_at', null)
      .single();

    if (!membership) {
      throw new ForbiddenException('You do not have access to this product');
    }

    // Fetch prices
    const { data: prices } = await supabase
      .from('product_prices')
      .select('*')
      .eq('product_id', id)
      .order('created_at', { ascending: true });

    // Fetch features
    const { data: featureLinks } = await supabase
      .from('product_features')
      .select(
        `
        display_order,
        config,
        features (
          id,
          name,
          title,
          description,
          type,
          properties
        )
      `,
      )
      .eq('product_id', id)
      .order('display_order', { ascending: true });

    return {
      ...product,
      prices: prices || [],
      features: featureLinks || [],
    };
  }

  /**
   * Update product
   */
  async update(id: string, userId: string, updateDto: UpdateProductDto) {
    const supabase = this.supabaseService.getClient();

    // Verify product exists and user has access
    const product = await this.findOne(id, userId);

    const { data: updated, error } = await supabase
      .from('products')
      .update({
        name: updateDto.name,
        description: updateDto.description,
        trial_days: updateDto.trial_days,
        metadata: updateDto.metadata,
      })
      .eq('id', id)
      .select()
      .single();

    if (error || !updated) {
      throw new BadRequestException('Failed to update product');
    }

    // TODO: Update Stripe product as well
    if (product.stripe_product_id) {
      try {
        const { data: org } = await supabase
          .from('organizations')
          .select('account_id')
          .eq('id', product.organization_id)
          .single();

        if (org?.account_id) {
          const { data: account } = await supabase
            .from('accounts')
            .select('stripe_id')
            .eq('id', org.account_id)
            .single();

          if (account?.stripe_id) {
            await this.stripeService.updateProduct(
              product.stripe_product_id,
              {
                name: updateDto.name,
                description: updateDto.description,
              },
              account.stripe_id,
            );
          }
        }
      } catch (error) {
        this.logger.warn('Failed to update Stripe product:', error);
        // Don't fail the request if Stripe update fails
      }
    }

    return this.findOne(id, userId);
  }

  /**
   * Archive product (soft delete)
   */
  async remove(id: string, userId: string) {
    const supabase = this.supabaseService.getClient();

    // Verify product exists and user has access
    await this.findOne(id, userId);

    const { error } = await supabase
      .from('products')
      .update({ is_archived: true })
      .eq('id', id);

    if (error) {
      throw new BadRequestException('Failed to archive product');
    }

    this.logger.log(`Product archived: ${id}`);

    return { success: true };
  }
}

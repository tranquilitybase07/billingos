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
          // Use price-level recurring_interval if provided, otherwise use product-level
          const recurringInterval =
            priceDto.recurring_interval || createDto.recurring_interval;
          const recurringIntervalCount =
            priceDto.recurring_interval_count ||
            createDto.recurring_interval_count ||
            1;

          const stripePrice = await this.stripeService.createPrice(
            {
              product: stripeProduct.id,
              currency: priceDto.price_currency || 'usd',
              unit_amount: priceDto.price_amount,
              recurring: {
                interval: recurringInterval,
                interval_count: recurringIntervalCount,
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
        const recurringInterval =
          dto.recurring_interval || createDto.recurring_interval;
        const recurringIntervalCount =
          dto.recurring_interval_count || createDto.recurring_interval_count || 1;

        const { data: priceRecord, error: priceError } = await supabase
          .from('product_prices')
          .insert({
            product_id: product.id,
            amount_type: dto.amount_type,
            price_amount: dto.price_amount || null,
            price_currency: dto.price_currency || 'usd',
            recurring_interval: recurringInterval,
            recurring_interval_count: recurringIntervalCount,
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

      // Insert feature links and attach to Stripe Product
      const featureLinks: any[] = [];
      if (createDto.features && createDto.features.length > 0) {
        for (const featureDto of createDto.features) {
          // Verify feature exists and belongs to organization
          const { data: feature } = await supabase
            .from('features')
            .select('id, stripe_feature_id')
            .eq('id', featureDto.feature_id)
            .eq('organization_id', createDto.organization_id)
            .single();

          if (!feature) {
            throw new NotFoundException(
              `Feature ${featureDto.feature_id} not found`,
            );
          }

          // Create local link first
          const { data: link, error: linkError } = await supabase
            .from('product_features')
            .insert({
              product_id: product.id,
              feature_id: featureDto.feature_id,
              display_order: featureDto.display_order,
              config: featureDto.config || {},
              stripe_synced: false, // Will be updated after Stripe sync
            })
            .select()
            .single();

          if (linkError || !link) {
            this.logger.error('Failed to link feature:', linkError);
            throw new Error('Failed to link feature');
          }

          // Attach feature to Stripe Product (if feature is synced with Stripe)
          if (feature.stripe_feature_id) {
            try {
              // Returns ProductFeature object with ID
              const productFeature =
                await this.stripeService.attachFeatureToProduct({
                  productId: stripeProduct.id,
                  featureId: feature.stripe_feature_id,
                  stripeAccountId: account.stripe_id,
                });

              // Mark as synced in local DB and store ProductFeature ID
              await supabase
                .from('product_features')
                .update({
                  stripe_synced: true,
                  stripe_synced_at: new Date().toISOString(),
                  stripe_product_feature_id: productFeature.id,
                })
                .eq('product_id', product.id)
                .eq('feature_id', featureDto.feature_id);

              this.logger.log(
                `Attached feature ${feature.stripe_feature_id} to Stripe Product ${stripeProduct.id} (ProductFeature: ${productFeature.id})`,
              );
            } catch (error) {
              this.logger.error(
                `Failed to attach feature ${feature.stripe_feature_id} to Stripe Product:`,
                error,
              );
              // Don't fail the whole operation, but log it
              // The feature link is created locally, just not synced to Stripe
            }
          } else {
            this.logger.warn(
              `Feature ${featureDto.feature_id} is not synced to Stripe yet, skipping Stripe attachment`,
            );
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

    // Get Stripe account for syncing
    const { data: org } = await supabase
      .from('organizations')
      .select('account_id')
      .eq('id', product.organization_id)
      .single();

    let stripeAccountId: string | null = null;
    if (org?.account_id) {
      const { data: account } = await supabase
        .from('accounts')
        .select('stripe_id')
        .eq('id', org.account_id)
        .single();
      stripeAccountId = account?.stripe_id || null;
    }

    try {
      // 1. Update basic product fields
      if (
        updateDto.name ||
        updateDto.description !== undefined ||
        updateDto.trial_days !== undefined ||
        updateDto.metadata
      ) {
        const updateData: any = {};
        if (updateDto.name) updateData.name = updateDto.name;
        if (updateDto.description !== undefined)
          updateData.description = updateDto.description;
        if (updateDto.trial_days !== undefined)
          updateData.trial_days = updateDto.trial_days;
        if (updateDto.metadata) updateData.metadata = updateDto.metadata;

        const { error } = await supabase
          .from('products')
          .update(updateData)
          .eq('id', id);

        if (error) {
          throw new BadRequestException('Failed to update product');
        }

        // Update Stripe product
        if (product.stripe_product_id && stripeAccountId) {
          try {
            await this.stripeService.updateProduct(
              product.stripe_product_id,
              {
                name: updateDto.name,
                description: updateDto.description,
              },
              stripeAccountId,
            );
          } catch (error) {
            this.logger.warn('Failed to update Stripe product:', error);
          }
        }
      }

      // 2. Handle price operations
      if (updateDto.prices) {
        // Archive prices
        if (updateDto.prices.archive && updateDto.prices.archive.length > 0) {
          for (const priceId of updateDto.prices.archive) {
            // Archive in database
            const { error } = await supabase
              .from('product_prices')
              .update({ is_archived: true })
              .eq('id', priceId)
              .eq('product_id', id);

            if (error) {
              this.logger.error(`Failed to archive price ${priceId}:`, error);
              throw new BadRequestException(
                `Failed to archive price ${priceId}`,
              );
            }

            // Archive in Stripe (if stripe_price_id exists)
            const { data: priceRecord } = await supabase
              .from('product_prices')
              .select('stripe_price_id')
              .eq('id', priceId)
              .single();

            if (
              priceRecord?.stripe_price_id &&
              product.stripe_product_id &&
              stripeAccountId
            ) {
              try {
                await this.stripeService.archivePrice(
                  priceRecord.stripe_price_id,
                  stripeAccountId,
                );
              } catch (error) {
                this.logger.warn(
                  `Failed to archive Stripe price ${priceRecord.stripe_price_id}:`,
                  error,
                );
              }
            }
          }
        }

        // Create new prices
        if (updateDto.prices.create && updateDto.prices.create.length > 0) {
          for (const priceDto of updateDto.prices.create) {
            // Create in Stripe first
            let stripePriceId: string | null = null;
            if (priceDto.amount_type === 'fixed' && product.stripe_product_id && stripeAccountId) {
              const recurringInterval =
                priceDto.recurring_interval || product.recurring_interval;
              const recurringIntervalCount =
                priceDto.recurring_interval_count ||
                product.recurring_interval_count ||
                1;

              try {
                const stripePrice = await this.stripeService.createPrice(
                  {
                    product: product.stripe_product_id,
                    currency: priceDto.price_currency || 'usd',
                    unit_amount: priceDto.price_amount,
                    recurring: {
                      interval: recurringInterval as Stripe.Price.Recurring.Interval,
                      interval_count: recurringIntervalCount,
                    },
                  },
                  stripeAccountId,
                );
                stripePriceId = stripePrice.id;
              } catch (error) {
                this.logger.error('Failed to create Stripe price:', error);
                throw new BadRequestException('Failed to create new price');
              }
            }

            // Create in database
            const recurringInterval =
              priceDto.recurring_interval || product.recurring_interval;
            const recurringIntervalCount =
              priceDto.recurring_interval_count ||
              product.recurring_interval_count ||
              1;

            const { error } = await supabase
              .from('product_prices')
              .insert({
                product_id: id,
                amount_type: priceDto.amount_type,
                price_amount: priceDto.price_amount || null,
                price_currency: priceDto.price_currency || 'usd',
                recurring_interval: recurringInterval,
                recurring_interval_count: recurringIntervalCount,
                stripe_price_id: stripePriceId,
                is_archived: false,
              });

            if (error) {
              this.logger.error('Failed to create price in DB:', error);
              throw new BadRequestException('Failed to create new price');
            }
          }
        }
      }

      // 3. Handle feature operations
      if (updateDto.features) {
        // Unlink features
        if (updateDto.features.unlink && updateDto.features.unlink.length > 0) {
          for (const featureId of updateDto.features.unlink) {
            // Get Stripe product feature ID before deleting
            const { data: link } = await supabase
              .from('product_features')
              .select('stripe_product_feature_id')
              .eq('product_id', id)
              .eq('feature_id', featureId)
              .single();

            // Delete from database
            const { error } = await supabase
              .from('product_features')
              .delete()
              .eq('product_id', id)
              .eq('feature_id', featureId);

            if (error) {
              this.logger.error(`Failed to unlink feature ${featureId}:`, error);
              throw new BadRequestException(
                `Failed to unlink feature ${featureId}`,
              );
            }

            // Detach from Stripe
            if (
              link?.stripe_product_feature_id &&
              product.stripe_product_id &&
              stripeAccountId
            ) {
              try {
                await this.stripeService.detachFeatureFromProduct(
                  product.stripe_product_id,
                  link.stripe_product_feature_id,
                  stripeAccountId,
                );
              } catch (error) {
                this.logger.warn(
                  `Failed to detach feature from Stripe Product:`,
                  error,
                );
              }
            }
          }
        }

        // Link new features
        if (updateDto.features.link && updateDto.features.link.length > 0) {
          for (const featureDto of updateDto.features.link) {
            // Verify feature exists
            const { data: feature } = await supabase
              .from('features')
              .select('id, stripe_feature_id')
              .eq('id', featureDto.feature_id)
              .eq('organization_id', product.organization_id)
              .single();

            if (!feature) {
              throw new NotFoundException(
                `Feature ${featureDto.feature_id} not found`,
              );
            }

            // Create link in database
            const { error } = await supabase
              .from('product_features')
              .insert({
                product_id: id,
                feature_id: featureDto.feature_id,
                display_order: featureDto.display_order,
                config: featureDto.config || {},
                stripe_synced: false,
              });

            if (error) {
              this.logger.error('Failed to link feature:', error);
              throw new BadRequestException('Failed to link feature');
            }

            // Attach to Stripe Product
            if (
              feature.stripe_feature_id &&
              product.stripe_product_id &&
              stripeAccountId
            ) {
              try {
                const productFeature =
                  await this.stripeService.attachFeatureToProduct({
                    productId: product.stripe_product_id,
                    featureId: feature.stripe_feature_id,
                    stripeAccountId,
                  });

                await supabase
                  .from('product_features')
                  .update({
                    stripe_synced: true,
                    stripe_synced_at: new Date().toISOString(),
                    stripe_product_feature_id: productFeature.id,
                  })
                  .eq('product_id', id)
                  .eq('feature_id', featureDto.feature_id);
              } catch (error) {
                this.logger.error('Failed to attach feature to Stripe:', error);
              }
            }
          }
        }

        // Update existing feature links
        if (updateDto.features.update && updateDto.features.update.length > 0) {
          for (const updateLink of updateDto.features.update) {
            const updateData: any = {};
            if (updateLink.display_order !== undefined)
              updateData.display_order = updateLink.display_order;
            if (updateLink.config !== undefined)
              updateData.config = updateLink.config;

            const { error } = await supabase
              .from('product_features')
              .update(updateData)
              .eq('product_id', id)
              .eq('feature_id', updateLink.feature_id);

            if (error) {
              this.logger.error(
                `Failed to update feature link ${updateLink.feature_id}:`,
                error,
              );
              throw new BadRequestException(
                `Failed to update feature link ${updateLink.feature_id}`,
              );
            }
          }
        }
      }

      return this.findOne(id, userId);
    } catch (error) {
      this.logger.error('Error updating product:', error);
      throw error;
    }
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

  /**
   * Get subscription count for product
   */
  async getSubscriptionCount(id: string, userId: string) {
    const supabase = this.supabaseService.getClient();

    // Verify product exists and user has access
    await this.findOne(id, userId);

    // Count total subscriptions
    const { count: total, error: totalError } = await supabase
      .from('subscriptions')
      .select('*', { count: 'exact', head: true })
      .eq('product_id', id);

    if (totalError) {
      throw new BadRequestException('Failed to fetch subscription count');
    }

    // Count active subscriptions (active or trialing)
    const { count: active, error: activeError } = await supabase
      .from('subscriptions')
      .select('*', { count: 'exact', head: true })
      .eq('product_id', id)
      .in('status', ['active', 'trialing']);

    if (activeError) {
      throw new BadRequestException('Failed to fetch active subscription count');
    }

    // Count canceled subscriptions
    const { count: canceled, error: canceledError } = await supabase
      .from('subscriptions')
      .select('*', { count: 'exact', head: true })
      .eq('product_id', id)
      .eq('status', 'canceled');

    if (canceledError) {
      throw new BadRequestException('Failed to fetch canceled subscription count');
    }

    return {
      count: total || 0,
      active: active || 0,
      canceled: canceled || 0,
    };
  }
}

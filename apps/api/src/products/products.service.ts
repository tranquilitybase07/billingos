/* eslint-disable @typescript-eslint/no-unsafe-call */
import {
  Injectable,
  Logger,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
  Inject,
} from '@nestjs/common';
import * as fs from 'fs';
import { CACHE_MANAGER } from '@nestjs/cache-manager';
import { Cache } from 'cache-manager';
import Stripe from 'stripe';
import { SupabaseService } from '../supabase/supabase.service';
import { StripeService } from '../stripe/stripe.service';
import { User } from '../user/entities/user.entity';
import { CreateProductDto } from './dto/create-product.dto';
import { UpdateProductDto } from './dto/update-product.dto';
import { CreatePriceDto, PriceAmountType, RecurringInterval } from './dto/create-price.dto';

@Injectable()
export class ProductsService {
  private readonly logger = new Logger(ProductsService.name);

  constructor(
    private readonly supabaseService: SupabaseService,
    private readonly stripeService: StripeService,
    @Inject(CACHE_MANAGER) private cacheManager: Cache,
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
            feature_id,
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

    // Fetch prices (only active ones)
    const { data: prices } = await supabase
      .from('product_prices')
      .select('*')
      .eq('product_id', id)
      .eq('is_archived', false)
      .order('created_at', { ascending: true });

    // Fetch features
    const { data: featureLinks } = await supabase
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
   * Analyze if changes require versioning
   */
  private async analyzeChanges(
    product: any,
    updateDto: UpdateProductDto,
    userId: string,
  ): Promise<{
    requiresVersioning: boolean;
    reasons: string[];
  }> {
    const reasons: string[] = [];
    let requiresVersioning = false;

    // Check subscription count
    const subscriptionCount = await this.getSubscriptionCount(product.id, userId);

    // If no active subscriptions, no versioning needed
    if (subscriptionCount.count === 0) {
      return { requiresVersioning: false, reasons: [] };
    }

    // Check price changes
    if (updateDto.prices?.create || updateDto.prices?.archive) {
      requiresVersioning = true;
      if (updateDto.prices.create) {
        reasons.push(`Adding ${updateDto.prices.create.length} new price(s)`);
      }
      if (updateDto.prices.archive) {
        reasons.push(`Archiving ${updateDto.prices.archive.length} price(s)`);
      }
    }

    // Check feature removals
    if (updateDto.features?.unlink && updateDto.features.unlink.length > 0) {
      requiresVersioning = true;
      reasons.push(`Removing ${updateDto.features.unlink.length} feature(s)`);
    }

    // Check feature limit changes
    if (updateDto.features?.update) {
      const supabase = this.supabaseService.getClient();

      for (const featureUpdate of updateDto.features.update) {
        // Get current feature config
        const { data: currentFeature } = await supabase
          .from('product_features')
          .select('*, features!inner(name, type)')
          .eq('product_id', product.id)
          .eq('feature_id', featureUpdate.feature_id)
          .single();

        if (currentFeature) {
          const currentLimit = this.extractLimit(
            currentFeature.config,
            currentFeature.features.type,
          );
          const newLimit = this.extractLimit(
            featureUpdate.config,
            currentFeature.features.type,
          );

          // Check if limits are different
          // We handle null (Unlimited) as a valid state, so we check for inequality
          // explicitly. extractLimit returns null for types that don't support limits,
          // so null === null will be false (no versioning) for those types.
          if (newLimit !== currentLimit) {
            requiresVersioning = true;
            const formatLimit = (l: number | null) => (l === null ? 'Unlimited' : l);
            reasons.push(
              `Feature "${currentFeature.features.name}" limit changed from ${formatLimit(currentLimit)} to ${formatLimit(newLimit)}`,
            );
          } else {
            // Check for other config changes (e.g. boolean flags, metadata)
            // We strip null/undefined values for fair comparison if needed, 
            // but for now a direct stringify comparison is safer to catch any drift.
            const currentConfigStr = JSON.stringify(currentFeature.config || {});
            const newConfigStr = JSON.stringify(featureUpdate.config || {});
            
            if (currentConfigStr !== newConfigStr) {
              requiresVersioning = true;
              reasons.push(
                `Feature "${currentFeature.features.name}" configuration changed`,
              );
            } else if (currentFeature.display_order !== featureUpdate.display_order) {
               requiresVersioning = true;
               reasons.push(
                 `Feature "${currentFeature.features.name}" display order changed`,
               );
            }
          }
        }
      }
    }

    // Check trial period reduction
    if (
      updateDto.trial_days !== undefined &&
      updateDto.trial_days < product.trial_days
    ) {
      requiresVersioning = true;
      reasons.push(
        `Trial period reduced from ${product.trial_days} to ${updateDto.trial_days} days`,
      );
    }

    return { requiresVersioning, reasons };
  }

  /**
   * Extract limit value from feature config based on type
   */
  private extractLimit(config: any, featureType: string): number | null {
    if (!config) return null;

    switch (featureType) {
      case 'usage_quota':
      case 'numeric_limit':
        return config.limit ?? null;
      case 'boolean_flag':
        return null; // No limits for boolean features
      default:
        return config.limit ?? config.value ?? config.quantity ?? null;
    }
  }

  /**
   * Create a new version of a product
   */
  private async createProductVersion(
    currentProduct: any,
    updateDto: UpdateProductDto,
    userId: string,
    reason: string,
  ): Promise<any> {
    const supabase = this.supabaseService.getClient();

    // Get the latest version number
    const { data: latestVersionData } = await supabase
      .rpc('get_latest_product_version', {
        p_organization_id: currentProduct.organization_id,
        p_product_name: currentProduct.name,
      });

    const newVersion = (latestVersionData || 1) + 1;

    // Get Stripe account
    const { data: org } = await supabase
      .from('organizations')
      .select('account_id')
      .eq('id', currentProduct.organization_id)
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

    // Create new Stripe product for this version
    let stripeProductId: string | null = null;
    if (stripeAccountId) {
      const stripeProduct = await this.stripeService.createProduct(
        {
          name: `${currentProduct.name} (v${newVersion})`,
          description: updateDto.description || currentProduct.description,
          metadata: {
            organization_id: currentProduct.organization_id,
            billingos_version: String(newVersion),
            billingos_parent_id: currentProduct.id,
            ...updateDto.metadata,
          },
        },
        stripeAccountId,
      );
      stripeProductId = stripeProduct.id;
    }

    // Create new product version in database
    const newProductData = {
      organization_id: currentProduct.organization_id,
      name: currentProduct.name,
      description: updateDto.description ?? currentProduct.description,
      recurring_interval: currentProduct.recurring_interval,
      recurring_interval_count: currentProduct.recurring_interval_count,
      trial_days: updateDto.trial_days ?? currentProduct.trial_days,
      metadata: updateDto.metadata ?? currentProduct.metadata,
      stripe_product_id: stripeProductId,
      version: newVersion,
      parent_product_id: currentProduct.id,
      version_status: 'current',
      version_created_reason: reason,
      version_created_at: new Date().toISOString(),
      is_archived: false,
    };

    const { data: newProduct, error: createError } = await supabase
      .from('products')
      .insert(newProductData)
      .select()
      .single();

    if (createError) {
      // Clean up Stripe product if database insert fails
      if (stripeProductId && stripeAccountId) {
        await this.stripeService.deleteProduct(stripeProductId, stripeAccountId);
      }
      throw new BadRequestException('Failed to create product version');
    }

    // Update old product status
    await supabase
      .from('products')
      .update({
        version_status: 'superseded',
        latest_version_id: newProduct.id,
      })
      .eq('id', currentProduct.id);

    // Copy prices to new version (with modifications from updateDto)
    await this.copyPricesToNewVersion(
      currentProduct.id,
      newProduct.id,
      updateDto,
      stripeAccountId,
    );

    // Copy features to new version (with modifications from updateDto)
    await this.copyFeaturesToNewVersion(
      currentProduct.id,
      newProduct.id,
      updateDto,
      stripeAccountId,
    );

    return newProduct;
  }

  /**
   * Helper method to create a price record in both Stripe and database
   */
  private async createPriceRecord(
    productId: string,
    stripeProductId: string | null,
    priceDto: CreatePriceDto,
    productRecurringInterval: string,
    productRecurringIntervalCount: number,
    stripeAccountId: string | null,
  ): Promise<any> {
    const supabase = this.supabaseService.getClient();
    let stripePriceId: string | null = null;

    // Determine recurring interval (use price's interval or fall back to product's)
    const recurringInterval = priceDto.recurring_interval || productRecurringInterval;
    const recurringIntervalCount = priceDto.recurring_interval_count || productRecurringIntervalCount;

    // Create Stripe price for fixed price types
    if (priceDto.amount_type === 'fixed' && stripeAccountId && stripeProductId) {
      const stripePrice = await this.stripeService.createPrice(
        {
          product: stripeProductId,
          currency: priceDto.price_currency || 'usd',
          unit_amount: priceDto.price_amount || 0,
          recurring: {
            interval: recurringInterval as Stripe.Price.Recurring.Interval,
            interval_count: recurringIntervalCount,
          },
        },
        stripeAccountId,
      );
      stripePriceId = stripePrice.id;
    }

    // Insert price into database
    const { data: priceRecord, error: priceError } = await supabase
      .from('product_prices')
      .insert({
        product_id: productId,
        amount_type: priceDto.amount_type,
        price_amount: priceDto.price_amount || null,
        price_currency: priceDto.price_currency || 'usd',
        recurring_interval: recurringInterval,
        recurring_interval_count: recurringIntervalCount,
        stripe_price_id: stripePriceId,
        is_archived: false,
      })
      .select()
      .single();

    if (priceError || !priceRecord) {
      throw new Error(`Failed to create price: ${priceError?.message}`);
    }

    return priceRecord;
  }

  /**
   * Copy prices to new product version
   */
  private async copyPricesToNewVersion(
    oldProductId: string,
    newProductId: string,
    updateDto: UpdateProductDto,
    stripeAccountId: string | null,
  ): Promise<void> {
    const supabase = this.supabaseService.getClient();

    // Get current prices (excluding ones to be archived)
    const { data: currentPrices } = await supabase
      .from('product_prices')
      .select('*')
      .eq('product_id', oldProductId)
      .eq('is_archived', false);

    const pricesToKeep = currentPrices?.filter((price) => {
      // Exclude prices to be archived
      if (updateDto.prices?.archive?.includes(price.id)) {
        return false;
      }

      // Exclude prices being replaced by new prices with same interval and currency
      if (updateDto.prices?.create) {
        const isBeingReplaced = updateDto.prices.create.some(
          (newPrice) =>
            newPrice.recurring_interval === price.recurring_interval &&
            newPrice.price_currency === price.price_currency,
        );
        if (isBeingReplaced) {
          return false;
        }
      }

      return true;
    }) || [];

    // Get the new product's details once for all price operations
    const { data: newProduct } = await supabase
      .from('products')
      .select('stripe_product_id, recurring_interval, recurring_interval_count')
      .eq('id', newProductId)
      .single();

    // Copy existing prices (not being archived) using helper method
    for (const price of pricesToKeep) {
      // Convert the existing price data to match CreatePriceDto format
      const priceDto: CreatePriceDto = {
        amount_type: price.amount_type as PriceAmountType,
        price_amount: price.price_amount ?? undefined,
        price_currency: price.price_currency ?? undefined,
        recurring_interval: price.recurring_interval as RecurringInterval,
        recurring_interval_count: price.recurring_interval_count ?? undefined,
      };

      await this.createPriceRecord(
        newProductId,
        newProduct?.stripe_product_id || null,
        priceDto,
        newProduct?.recurring_interval || 'month',
        newProduct?.recurring_interval_count || 1,
        stripeAccountId,
      );
    }

    // Add new prices from updateDto (reuse the newProduct we already fetched)
    if (updateDto.prices?.create) {
      // Create new prices using the helper method
      for (const newPrice of updateDto.prices.create) {
        await this.createPriceRecord(
          newProductId,
          newProduct?.stripe_product_id || null,
          newPrice,
          newProduct?.recurring_interval || 'month',
          newProduct?.recurring_interval_count || 1,
          stripeAccountId,
        );
      }
    }
  }

  /**
   * Copy features to new product version
   */
  private async copyFeaturesToNewVersion(
    oldProductId: string,
    newProductId: string,
    updateDto: UpdateProductDto,
    stripeAccountId: string | null,
  ): Promise<void> {
    const supabase = this.supabaseService.getClient();

    // Get new product's Stripe ID
    const { data: newProduct } = await supabase
      .from('products')
      .select('stripe_product_id')
      .eq('id', newProductId)
      .single();

    // Get current features (excluding ones to be unlinked)
    const { data: currentFeatures } = await supabase
      .from('product_features')
      .select('*, features!inner(id, stripe_feature_id)')
      .eq('product_id', oldProductId);

    const featuresToKeep = currentFeatures?.filter(
      (feature) => !updateDto.features?.unlink?.includes(feature.feature_id),
    ) || [];

    // Copy existing features (not being unlinked) with any updates
    for (const feature of featuresToKeep) {
      const updateConfig = updateDto.features?.update?.find(
        (u) => u.feature_id === feature.feature_id,
      );

      const config = updateConfig?.config ?? feature.config;
      const displayOrder = updateConfig?.display_order ?? feature.display_order;

      // Insert feature link in database
      const { data: link } = await supabase.from('product_features').insert({
        product_id: newProductId,
        feature_id: feature.feature_id,
        display_order: displayOrder,
        config: config,
        stripe_synced: false,
      }).select().single();

      // Sync to Stripe if the feature has a Stripe ID
      const featureData = (feature as any).features;
      if (link && featureData?.stripe_feature_id && newProduct?.stripe_product_id && stripeAccountId) {
        try {
          const productFeature = await this.stripeService.attachFeatureToProduct({
            productId: newProduct.stripe_product_id,
            featureId: featureData.stripe_feature_id,
            stripeAccountId,
          });

          // Mark as synced
          await supabase
            .from('product_features')
            .update({
              stripe_synced: true,
              stripe_synced_at: new Date().toISOString(),
              stripe_product_feature_id: productFeature.id,
            })
            .eq('product_id', newProductId)
            .eq('feature_id', feature.feature_id);

          this.logger.log(
            `Synced feature ${featureData.stripe_feature_id} to Stripe Product ${newProduct.stripe_product_id}`,
          );
        } catch (error) {
          this.logger.error(
            `Failed to sync feature ${featureData.stripe_feature_id} to Stripe:`,
            error,
          );
          // Don't fail the operation, just log the error
        }
      }
    }

    // Add new features from updateDto
    if (updateDto.features?.link) {
      for (const newFeature of updateDto.features.link) {
        // Get feature details including Stripe ID
        const { data: featureData } = await supabase
          .from('features')
          .select('id, stripe_feature_id')
          .eq('id', newFeature.feature_id)
          .single();

        // Insert feature link in database
        const { data: link } = await supabase.from('product_features').insert({
          product_id: newProductId,
          feature_id: newFeature.feature_id,
          display_order: newFeature.display_order,
          config: newFeature.config || {},
          stripe_synced: false,
        }).select().single();

        // Sync to Stripe if the feature has a Stripe ID
        if (link && featureData?.stripe_feature_id && newProduct?.stripe_product_id && stripeAccountId) {
          try {
            const productFeature = await this.stripeService.attachFeatureToProduct({
              productId: newProduct.stripe_product_id,
              featureId: featureData.stripe_feature_id,
              stripeAccountId,
            });

            // Mark as synced
            await supabase
              .from('product_features')
              .update({
                stripe_synced: true,
                stripe_synced_at: new Date().toISOString(),
                stripe_product_feature_id: productFeature.id,
              })
              .eq('product_id', newProductId)
              .eq('feature_id', newFeature.feature_id);

            this.logger.log(
              `Synced new feature ${featureData.stripe_feature_id} to Stripe Product ${newProduct.stripe_product_id}`,
            );
          } catch (error) {
            this.logger.error(
              `Failed to sync new feature ${featureData.stripe_feature_id} to Stripe:`,
              error,
            );
            // Don't fail the operation, just log the error
          }
        }
      }
    }
  }

  /**
   * Update product
   */
  async update(id: string, userId: string, updateDto: UpdateProductDto) {
    const supabase = this.supabaseService.getClient();

    // Verify product exists and user has access
    const product = await this.findOne(id, userId);

    // Check if versioning is needed
    const versioningAnalysis = await this.analyzeChanges(product, updateDto, userId);

    // If versioning is required and there are active subscriptions, create new version
    if (versioningAnalysis.requiresVersioning) {
      const versionReason = versioningAnalysis.reasons.join('; ');
      const newProduct = await this.createProductVersion(
        product,
        updateDto,
        userId,
        versionReason,
      );

      // Return the new versioned product
      return this.findOne(newProduct.id, userId);
    }

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

  /**
   * Get subscriptions for a product with pagination
   */
  async getProductSubscriptions(id: string, userId: string, limit = 10, offset = 0) {
    const supabase = this.supabaseService.getClient();

    // Verify product exists and user has access
    const product = await this.findOne(id, userId);

    // Get subscriptions with customer details
    const { data: subscriptions, error, count } = await supabase
      .from('subscriptions')
      .select(`
        *,
        customer:customers(
          id,
          name,
          email,
          external_id,
          stripe_customer_id
        )
      `, { count: 'exact' })
      .eq('product_id', id)
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1);

    if (error) {
      this.logger.error('Failed to fetch product subscriptions:', error);
      throw new BadRequestException('Failed to fetch subscriptions');
    }

    return {
      subscriptions: subscriptions || [],
      total: count || 0,
      limit,
      offset,
      hasMore: (count || 0) > offset + limit,
    };
  }

  /**
   * Check if an update would require versioning (preview mode)
   */
  async checkVersioning(
    id: string,
    userId: string,
    updateDto: UpdateProductDto,
  ): Promise<{
    will_version: boolean;
    current_version: number;
    new_version: number | null;
    affected_subscriptions: number;
    reason: string;
    changes: string[];
  }> {
    const supabase = this.supabaseService.getClient();

    // Get product details
    const product = await this.findOne(id, userId);

    // Analyze if versioning would be needed
    const analysis = await this.analyzeChanges(product, updateDto, userId);

    // Get subscription count
    const subscriptionCount = await this.getSubscriptionCount(id, userId);

    // Get current version info
    const currentVersion = product.version || 1;
    let newVersion: number | null = null;

    if (analysis.requiresVersioning) {
      const { data: latestVersionData } = await supabase
        .rpc('get_latest_product_version', {
          p_organization_id: product.organization_id,
          p_product_name: product.name,
        });

      newVersion = (latestVersionData || currentVersion) + 1;
    }

    return {
      will_version: analysis.requiresVersioning,
      current_version: currentVersion,
      new_version: newVersion,
      affected_subscriptions: subscriptionCount.active || 0,
      reason: analysis.reasons.join('; '),
      changes: analysis.reasons,
    };
  }

  /**
   * Get all versions of a product
   */
  async getProductVersions(
    organizationId: string,
    productName: string,
    userId: string,
  ): Promise<{
    versions: any[];
    total_subscriptions: number;
    total_monthly_revenue: number;
    potential_revenue_if_migrated: number | null;
  }> {
    const supabase = this.supabaseService.getClient();

    // Verify user is member of organization
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

    // Get all versions using the database function
    const { data: versions, error } = await supabase.rpc('get_product_versions', {
      p_organization_id: organizationId,
      p_product_name: productName,
    });

    if (error) {
      throw new BadRequestException('Failed to fetch product versions');
    }

    // Calculate totals
    const totalSubscriptions = versions?.reduce((sum, v) => sum + Number(v.subscription_count || 0), 0) || 0;
    const totalMonthlyRevenue = versions?.reduce((sum, v) => sum + Number(v.total_mrr || 0), 0) || 0;

    // Get the latest version's price for potential revenue calculation
    const latestVersion = versions?.find(v => v.version_status === 'current');
    let potentialRevenue: number | null = null;

    if (latestVersion && totalSubscriptions > 0) {
      const avgPricePerSub = Number(latestVersion.total_mrr || 0) / Number(latestVersion.subscription_count || 1);
      potentialRevenue = Math.round(avgPricePerSub * totalSubscriptions);
    }

    return {
      versions: versions || [],
      total_subscriptions: totalSubscriptions,
      total_monthly_revenue: totalMonthlyRevenue,
      potential_revenue_if_migrated: potentialRevenue,
    };
  }

  /**
   * Get product versions by product ID
   */
  async getVersionsByProductId(
    productId: string,
    userId: string,
  ): Promise<any> {
    const supabase = this.supabaseService.getClient();

    // Get the product to find its name and organization
    const product = await this.findOne(productId, userId);

    return this.getProductVersions(
      product.organization_id,
      product.name,
      userId,
    );
  }

  /**
   * Sync subscriptions from Stripe to our database
   * Useful when webhooks fail or for initial migration
   */
  async syncSubscriptionsFromStripe(
    userId: string,
    stripeCustomerId: string,
    stripeAccountId?: string,
  ) {
    this.logger.log(`Syncing subscriptions for customer: ${stripeCustomerId}`);

    // Temporarily return not implemented while we fix type issues
    return {
      success: false,
      message: 'Sync functionality is temporarily disabled while we fix type issues. For now, please use a new test user.',
      recommendation: 'Create a new test subscription with a different email address to test the versioning system.',
    };

    /* Commenting out for now due to TypeScript issues
    const supabase = this.supabaseService.getClient();

    try {
      // List all subscriptions from Stripe for this customer
      const stripeSubscriptions = await this.stripeService.listCustomerSubscriptions({
        customerId: stripeCustomerId,
        stripeAccountId,
        status: 'all', // Get all statuses to sync everything
      });

      const syncResults: {
        synced: Array<any>;
        failed: Array<any>;
        skipped: Array<any>;
      } = {
        synced: [],
        failed: [],
        skipped: [],
      };

      for (const stripeSubscription of stripeSubscriptions.data) {
        try {
          // Check if subscription already exists in our database
          const { data: existingSubscription } = await supabase
            .from('subscriptions')
            .select('id, stripe_subscription_id')
            .eq('stripe_subscription_id', stripeSubscription.id)
            .single();

          if (existingSubscription) {
            // Subscription exists, update it with latest data from Stripe
            const { error: updateError } = await supabase
              .from('subscriptions')
              .update({
                status: stripeSubscription.status,
                current_period_start: stripeSubscription.current_period_start
                  ? new Date(stripeSubscription.current_period_start * 1000).toISOString()
                  : undefined,
                current_period_end: stripeSubscription.current_period_end
                  ? new Date(stripeSubscription.current_period_end * 1000).toISOString()
                  : undefined,
                cancel_at_period_end: stripeSubscription.cancel_at_period_end,
                canceled_at: stripeSubscription.canceled_at
                  ? new Date(stripeSubscription.canceled_at * 1000).toISOString()
                  : undefined,
                ended_at: stripeSubscription.ended_at
                  ? new Date(stripeSubscription.ended_at * 1000).toISOString()
                  : undefined,
                trial_start: stripeSubscription.trial_start
                  ? new Date(stripeSubscription.trial_start * 1000).toISOString()
                  : undefined,
                trial_end: stripeSubscription.trial_end
                  ? new Date(stripeSubscription.trial_end * 1000).toISOString()
                  : undefined,
                updated_at: new Date().toISOString(),
              })
              .eq('id', existingSubscription.id);

            if (updateError) {
              syncResults.failed.push({
                stripe_subscription_id: stripeSubscription.id,
                action: 'update',
                error: updateError.message,
              });
            } else {
              syncResults.skipped.push({
                stripe_subscription_id: stripeSubscription.id,
                action: 'already_exists_updated',
              });
            }
          } else {
            // Subscription doesn't exist, create it
            // First, we need to get the product information
            const firstItem = stripeSubscription.items.data[0];
            if (!firstItem || !firstItem.price) {
              syncResults.failed.push({
                stripe_subscription_id: stripeSubscription.id,
                action: 'create',
                error: 'Missing subscription items or price information',
              });
              continue;
            }

            const stripePrice = firstItem.price;
            const stripeProductId =
              typeof stripePrice.product === 'string'
                ? stripePrice.product
                : stripePrice.product?.id;

            if (!stripeProductId) {
              syncResults.failed.push({
                stripe_subscription_id: stripeSubscription.id,
                action: 'create',
                error: 'Missing product information in subscription',
              });
              continue;
            }

            // Find our product that matches this Stripe product
            const { data: product } = await supabase
              .from('products')
              .select('id, organization_id')
              .eq('stripe_product_id', stripeProductId)
              .single();

            if (!product) {
              syncResults.failed.push({
                stripe_subscription_id: stripeSubscription.id,
                action: 'create',
                error: `Product not found for Stripe product: ${stripeProductId}`,
              });
              continue;
            }

            // Find the customer
            let customerId: string;
            const { data: existingCustomer } = await supabase
              .from('customers')
              .select('id')
              .eq('stripe_customer_id', stripeCustomerId)
              .single();

            if (!existingCustomer) {
              // Create customer if it doesn't exist
              // Get customer email and name if customer is expanded
              let customerEmail: string | null = null;
              let customerName: string | null = null;

              if (typeof stripeSubscription.customer !== 'string' && stripeSubscription.customer) {
                // Customer is expanded
                const customer = stripeSubscription.customer as any; // Type assertion since Stripe types can be complex
                customerEmail = customer.email || null;
                customerName = customer.name || null;
              }

              const { data: newCustomer, error: customerError } = await supabase
                .from('customers')
                .insert({
                  organization_id: product.organization_id,
                  stripe_customer_id: stripeCustomerId,
                  email: customerEmail,
                  name: customerName,
                })
                .select()
                .single();

              if (customerError || !newCustomer) {
                syncResults.failed.push({
                  stripe_subscription_id: stripeSubscription.id,
                  action: 'create',
                  error: `Failed to create customer: ${customerError?.message}`,
                });
                continue;
              }
              customerId = newCustomer.id;
            } else {
              customerId = existingCustomer.id;
            }

            // Calculate the subscription amount (total of all items)
            const amount = stripeSubscription.items.data.reduce((total, item) => {
              return total + (item.price.unit_amount || 0) * item.quantity;
            }, 0);

            // Get currency from the price
            const currency = stripePrice.currency || 'usd';

            // Create the subscription
            const { data: newSubscription, error: createError } = await supabase
              .from('subscriptions')
              .insert({
                organization_id: product.organization_id,
                customer_id: customerId,
                product_id: product.id,
                stripe_subscription_id: stripeSubscription.id,
                status: stripeSubscription.status,
                amount: amount, // Required field: total amount in cents
                currency: currency, // Required field
                current_period_start: stripeSubscription.current_period_start
                  ? new Date(stripeSubscription.current_period_start * 1000).toISOString()
                  : new Date().toISOString(),
                current_period_end: stripeSubscription.current_period_end
                  ? new Date(stripeSubscription.current_period_end * 1000).toISOString()
                  : new Date().toISOString(),
                cancel_at_period_end: stripeSubscription.cancel_at_period_end || false,
                canceled_at: stripeSubscription.canceled_at
                  ? new Date(stripeSubscription.canceled_at * 1000).toISOString()
                  : undefined,
                ended_at: stripeSubscription.ended_at
                  ? new Date(stripeSubscription.ended_at * 1000).toISOString()
                  : undefined,
                trial_start: stripeSubscription.trial_start
                  ? new Date(stripeSubscription.trial_start * 1000).toISOString()
                  : undefined,
                trial_end: stripeSubscription.trial_end
                  ? new Date(stripeSubscription.trial_end * 1000).toISOString()
                  : undefined,
              })
              .select()
              .single();

            if (createError) {
              syncResults.failed.push({
                stripe_subscription_id: stripeSubscription.id,
                action: 'create',
                error: createError.message,
              });
            } else {
              syncResults.synced.push({
                stripe_subscription_id: stripeSubscription.id,
                subscription_id: newSubscription.id,
                action: 'created',
              });
            }
          }
        } catch (error) {
          syncResults.failed.push({
            stripe_subscription_id: stripeSubscription.id,
            error: error.message || 'Unknown error',
          });
        }
      }

      return {
        success: true,
        total: stripeSubscriptions.data.length,
        synced: syncResults.synced.length,
        skipped: syncResults.skipped.length,
        failed: syncResults.failed.length,
        details: syncResults,
      };
    } catch (error) {
      this.logger.error(`Failed to sync subscriptions: ${error.message}`);
      throw new BadRequestException(`Failed to sync subscriptions: ${error.message}`);
    }
    */
  }

  /**
   * Get revenue metrics for a product (MRR, 30-day revenue)
   * Uses caching to avoid expensive recalculation
   */
  async getRevenueMetrics(productId: string, userId: string) {
    // Verify user has access to this product
    await this.findOne(productId, userId);

    // Define cache keys
    const mrrCacheKey = `product-mrr:${productId}`;
    const revenue30dCacheKey = `product-rev30d:${productId}`;
    const metricsCacheKey = `product-metrics:${productId}`;

    // Try to get from cache first
    const cachedMetrics = await this.cacheManager.get(metricsCacheKey);
    if (cachedMetrics) {
      this.logger.debug(`Returning cached revenue metrics for product ${productId}`);
      return cachedMetrics;
    }

    const supabase = this.supabaseService.getClient();

    // Calculate MRR from active subscriptions
    const { data: subscriptions, error: mrrError } = await supabase
      .from('subscriptions')
      .select('amount')
      .eq('product_id', productId)
      .in('status', ['active', 'trialing'])
      .eq('cancel_at_period_end', false);

    if (mrrError) {
      this.logger.error(`Failed to calculate MRR: ${mrrError.message}`);
      throw new BadRequestException('Failed to calculate MRR');
    }

    const mrr = subscriptions?.reduce((sum, sub) => sum + (sub.amount || 0), 0) ?? 0;

    // Calculate revenue from last 30 days using payment_intents
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    const { data: payments, error: revenueError } = await supabase
      .from('payment_intents')
      .select('amount')
      .eq('product_id', productId)
      .eq('status', 'succeeded')
      .gte('created_at', thirtyDaysAgo.toISOString());

    if (revenueError) {
      this.logger.error(`Failed to calculate 30-day revenue: ${revenueError.message}`);
      throw new BadRequestException('Failed to calculate 30-day revenue');
    }

    const revenueLastThirtyDays = payments?.reduce((sum, payment) => sum + (payment.amount || 0), 0) ?? 0;

    // Calculate ARPU (Average Revenue Per User)
    const activeSubscriptionCount = subscriptions?.length ?? 0;
    const arpu = activeSubscriptionCount > 0 ? Math.round(mrr / activeSubscriptionCount) : 0;

    // Prepare response
    const metrics = {
      mrr,
      revenueLastThirtyDays,
      arpu,
      activeSubscriptionCount,
      currency: 'usd', // Default to USD, can be made dynamic based on product settings
    };

    // Cache the result with 5 minute TTL for MRR and 15 minutes for revenue
    await this.cacheManager.set(metricsCacheKey, metrics, 300); // 5 minutes in seconds

    this.logger.debug(`Calculated and cached revenue metrics for product ${productId}`);

    return metrics;
  }
}

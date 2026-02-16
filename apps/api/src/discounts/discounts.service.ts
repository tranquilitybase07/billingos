import {
  Injectable,
  Logger,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
} from '@nestjs/common';
import { SupabaseService } from '../supabase/supabase.service';
import { StripeService } from '../stripe/stripe.service';
import { CreateDiscountDto } from './dto/create-discount.dto';
import { UpdateDiscountDto } from './dto/update-discount.dto';

@Injectable()
export class DiscountsService {
  private readonly logger = new Logger(DiscountsService.name);

  constructor(
    private readonly supabaseService: SupabaseService,
    private readonly stripeService: StripeService,
  ) {}

  /**
   * Look up the Stripe Connect account ID for an organization
   */
  private async getStripeAccountId(organizationId: string): Promise<string | null> {
    const supabase = this.supabaseService.getClient();

    const { data: org } = await supabase
      .from('organizations')
      .select('id, account_id')
      .eq('id', organizationId)
      .is('deleted_at', null)
      .single();

    if (!org?.account_id) return null;

    const { data: account } = await supabase
      .from('accounts')
      .select('stripe_id')
      .eq('id', org.account_id)
      .single();

    return account?.stripe_id || null;
  }

  /**
   * Create a new discount
   */
  async create(userId: string, createDto: CreateDiscountDto) {
    this.logger.log(`Creating discount with payload: ${JSON.stringify(createDto)}`);
    const supabase = this.supabaseService.getClient();

    // Verify user is a member of the organization
    const { data: membership } = await supabase
      .from('user_organizations')
      .select('user_id')
      .eq('organization_id', createDto.organization_id)
      .eq('user_id', userId)
      .is('deleted_at', null)
      .single();

    if (!membership) {
      throw new ForbiddenException('You are not a member of this organization');
    }

    // Validate type-specific fields
    if (createDto.type === 'percentage') {
      if (createDto.basis_points == null) {
        throw new BadRequestException(
          'basis_points is required for percentage discounts',
        );
      }
    } else if (createDto.type === 'fixed') {
      if (createDto.amount == null) {
        throw new BadRequestException(
          'amount is required for fixed discounts',
        );
      }
      if (!createDto.currency) {
        throw new BadRequestException(
          'currency is required for fixed discounts',
        );
      }
    }

    // Check for duplicate code within the organization
    if (createDto.code) {
      const { data: existing } = await supabase
        .from('discounts')
        .select('id')
        .eq('organization_id', createDto.organization_id)
        .eq('code', createDto.code)
        .is('deleted_at', null)
        .maybeSingle();

      if (existing) {
        throw new BadRequestException(
          `A discount with code "${createDto.code}" already exists`,
        );
      }
    }

    // --- Stripe Sync: Create coupon on connected account ---
    let stripeCouponId: string | null = null;
    let stripePromotionCodeId: string | null = null;

    const stripeAccountId = await this.getStripeAccountId(createDto.organization_id);

    if (stripeAccountId) {
      try {
        // Build coupon params
        const couponParams: any = {
          name: createDto.name,
          duration: createDto.duration || 'once',
        };

        if (createDto.type === 'percentage') {
          // basis_points is stored as percentage value (e.g. 50 for 50%)
          couponParams.percent_off = createDto.basis_points;
        } else if (createDto.type === 'fixed') {
          couponParams.amount_off = createDto.amount;
          couponParams.currency = createDto.currency;
        }

        if (createDto.duration === 'repeating' && createDto.duration_in_months) {
          couponParams.duration_in_months = createDto.duration_in_months;
        }

        if (createDto.max_redemptions) {
          couponParams.max_redemptions = createDto.max_redemptions;
        }

        const stripeCoupon = await this.stripeService.createCoupon(
          couponParams,
          stripeAccountId,
        );
        stripeCouponId = stripeCoupon.id;
        this.logger.log(`Created Stripe coupon: ${stripeCouponId}`);

        // If discount has a code, create a promotion code linked to the coupon
        if (createDto.code) {
          const promoCode = await this.stripeService.createPromotionCode(
            {
              promotion: { coupon: stripeCouponId, type: 'coupon' },
              code: createDto.code,
            },
            stripeAccountId,
          );
          stripePromotionCodeId = promoCode.id;
          this.logger.log(`Created Stripe promotion code: ${stripePromotionCodeId}`);
        }
      } catch (stripeError) {
        this.logger.error('Failed to create Stripe coupon', stripeError);
        // Continue without Stripe — discount still saved locally
      }
    } else {
      this.logger.warn(
        `No Stripe account found for org ${createDto.organization_id}, skipping Stripe sync`,
      );
    }

    const { data, error } = await supabase
      .from('discounts')
      .insert({
        organization_id: createDto.organization_id,
        name: createDto.name,
        code: createDto.code || null,
        type: createDto.type,
        basis_points: createDto.basis_points || null,
        amount: createDto.amount || null,
        currency: createDto.currency || null,
        duration: createDto.duration || 'once',
        duration_in_months: createDto.duration_in_months || null,
        max_redemptions: createDto.max_redemptions || null,
        redemptions_count: 0,
        stripe_coupon_id: stripeCouponId,
        stripe_promotion_code_id: stripePromotionCodeId,
      })
      .select('*')
      .single();

    if (error) {
      this.logger.error('Failed to create discount', error);
      throw new BadRequestException('Failed to create discount');
    }

    // Save product associations if specific products selected
    if (createDto.product_ids && createDto.product_ids.length > 0) {
      const productRows = createDto.product_ids.map((productId) => ({
        discount_id: data.id,
        product_id: productId,
      }));

      const { error: productError } = await (supabase as any)
        .from('discount_products')
        .insert(productRows);

      if (productError) {
        this.logger.error('Failed to save discount products', productError);
        throw new BadRequestException(`Failed to save discount products: ${productError.message}`);
      }
    }

    return { ...data, product_ids: createDto.product_ids || [] };
  }

  /**
   * List all discounts for an organization
   */
  async findAll(
    organizationId: string,
    userId: string,
    query?: string,
    page = 1,
    limit = 20,
  ) {
    const supabase = this.supabaseService.getClient();

    // Verify user membership
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

    let queryBuilder = supabase
      .from('discounts')
      .select('*', { count: 'exact' })
      .eq('organization_id', organizationId)
      .is('deleted_at', null)
      .order('created_at', { ascending: false });

    // Search by name or code
    if (query) {
      queryBuilder = queryBuilder.or(
        `name.ilike.%${query}%,code.ilike.%${query}%`,
      );
    }

    // Pagination
    const offset = (page - 1) * limit;
    queryBuilder = queryBuilder.range(offset, offset + limit - 1);

    const { data, error, count } = await queryBuilder;

    if (error) {
      this.logger.error('Failed to fetch discounts', error);
      throw new BadRequestException('Failed to fetch discounts');
    }

    return {
      items: data || [],
      pagination: {
        total_count: count || 0,
        max_page: Math.ceil((count || 0) / limit),
      },
    };
  }

  /**
   * Get a single discount by ID
   */
  async findOne(id: string, userId: string) {
    const supabase = this.supabaseService.getClient();

    const { data, error } = await supabase
      .from('discounts')
      .select('*')
      .eq('id', id)
      .is('deleted_at', null)
      .single();

    if (error || !data) {
      throw new NotFoundException('Discount not found');
    }

    // Verify user membership
    const { data: membership } = await supabase
      .from('user_organizations')
      .select('user_id')
      .eq('organization_id', data.organization_id)
      .eq('user_id', userId)
      .is('deleted_at', null)
      .single();

    if (!membership) {
      throw new ForbiddenException('You are not a member of this organization');
    }

    // Fetch associated products
    const { data: products } = await (supabase as any)
      .from('discount_products')
      .select('product_id')
      .eq('discount_id', id);

    return {
      ...data,
      product_ids: products?.map((p: any) => p.product_id) || [],
    };
  }

  /**
   * Update a discount
   */
  async update(id: string, userId: string, updateDto: UpdateDiscountDto) {
    const supabase = this.supabaseService.getClient();

    // Verify discount exists and user has access
    const discount = await this.findOne(id, userId);

    // Build update payload (only include defined fields)
    const updatePayload: Record<string, any> = {};
    if (updateDto.name !== undefined) updatePayload.name = updateDto.name;
    if (updateDto.code !== undefined) updatePayload.code = updateDto.code;
    if (updateDto.type !== undefined) updatePayload.type = updateDto.type;
    if (updateDto.basis_points !== undefined)
      updatePayload.basis_points = updateDto.basis_points;
    if (updateDto.amount !== undefined) updatePayload.amount = updateDto.amount;
    if (updateDto.currency !== undefined)
      updatePayload.currency = updateDto.currency;
    if (updateDto.duration !== undefined)
      updatePayload.duration = updateDto.duration;
    if (updateDto.duration_in_months !== undefined)
      updatePayload.duration_in_months = updateDto.duration_in_months;
    if (updateDto.max_redemptions !== undefined)
      updatePayload.max_redemptions = updateDto.max_redemptions;

    // Check for duplicate code if code is being changed
    if (updateDto.code && updateDto.code !== discount.code) {
      const { data: existing } = await supabase
        .from('discounts')
        .select('id')
        .eq('organization_id', discount.organization_id)
        .eq('code', updateDto.code)
        .neq('id', id)
        .is('deleted_at', null)
        .maybeSingle();

      if (existing) {
        throw new BadRequestException(
          `A discount with code "${updateDto.code}" already exists`,
        );
      }
    }

    // --- Stripe Sync: Update coupon on connected account ---
    if (discount.stripe_coupon_id) {
      const stripeAccountId = await this.getStripeAccountId(discount.organization_id);

      if (stripeAccountId) {
        try {
          // Stripe only allows updating name and metadata on coupons
          await this.stripeService.updateCoupon(
            discount.stripe_coupon_id,
            { name: updateDto.name || discount.name },
            stripeAccountId,
          );
          this.logger.log(`Updated Stripe coupon: ${discount.stripe_coupon_id}`);

          // Handle promotion code changes
          if (updateDto.code !== undefined && updateDto.code !== discount.code) {
            // Deactivate old promotion code if exists
            if (discount.stripe_promotion_code_id) {
              await this.stripeService.deactivatePromotionCode(
                discount.stripe_promotion_code_id,
                stripeAccountId,
              );
              this.logger.log(
                `Deactivated old Stripe promotion code: ${discount.stripe_promotion_code_id}`,
              );
            }

            // Create new promotion code if a new code is provided
            if (updateDto.code) {
              const promoCode = await this.stripeService.createPromotionCode(
                {
                  promotion: { coupon: discount.stripe_coupon_id, type: 'coupon' },
                  code: updateDto.code,
                },
                stripeAccountId,
              );
              updatePayload.stripe_promotion_code_id = promoCode.id;
              this.logger.log(`Created new Stripe promotion code: ${promoCode.id}`);
            } else {
              updatePayload.stripe_promotion_code_id = null;
            }
          }
        } catch (stripeError) {
          this.logger.error('Failed to update Stripe coupon', stripeError);
          // Continue without Stripe sync
        }
      }
    }

    const { data, error } = await supabase
      .from('discounts')
      .update(updatePayload)
      .eq('id', id)
      .select('*')
      .single();

    if (error) {
      this.logger.error('Failed to update discount', error);
      throw new BadRequestException('Failed to update discount');
    }

    return data;
  }

  /**
   * Sync product associations for a discount
   */
  private async syncProductIds(discountId: string, productIds: string[]) {
    const supabase = this.supabaseService.getClient() as any;

    // Delete existing associations
    await supabase
      .from('discount_products')
      .delete()
      .eq('discount_id', discountId);

    // Insert new associations
    if (productIds.length > 0) {
      const productRows = productIds.map((productId) => ({
        discount_id: discountId,
        product_id: productId,
      }));

      const { error } = await supabase
        .from('discount_products')
        .insert(productRows);

      if (error) {
        this.logger.error('Failed to sync discount products', error);
      }
    }
  }

  /**
   * Soft delete a discount
   */
  async remove(id: string, userId: string) {
    const supabase = this.supabaseService.getClient();

    // Verify discount exists and user has access
    const discount = await this.findOne(id, userId);

    // --- Stripe Sync: Delete coupon on connected account ---
    if (discount.stripe_coupon_id) {
      const stripeAccountId = await this.getStripeAccountId(discount.organization_id);

      if (stripeAccountId) {
        try {
          // Deactivate promotion code first if exists
          if (discount.stripe_promotion_code_id) {
            await this.stripeService.deactivatePromotionCode(
              discount.stripe_promotion_code_id,
              stripeAccountId,
            );
            this.logger.log(
              `Deactivated Stripe promotion code: ${discount.stripe_promotion_code_id}`,
            );
          }

          // Delete the coupon
          await this.stripeService.deleteCoupon(
            discount.stripe_coupon_id,
            stripeAccountId,
          );
          this.logger.log(`Deleted Stripe coupon: ${discount.stripe_coupon_id}`);
        } catch (stripeError) {
          this.logger.error('Failed to delete Stripe coupon', stripeError);
          // Continue with local soft delete even if Stripe fails
        }
      }
    }

    const { error } = await supabase
      .from('discounts')
      .update({ deleted_at: new Date().toISOString() })
      .eq('id', id);

    if (error) {
      this.logger.error('Failed to delete discount', error);
      throw new BadRequestException('Failed to delete discount');
    }

    return { success: true };
  }

  /**
   * Find all applicable discounts for a specific product.
   * Returns discounts that apply to ALL products (no product_ids) + discounts specific to this product.
   */
  async findByProduct(productId: string, organizationId: string, userId: string) {
    const supabase = this.supabaseService.getClient();

    // Verify membership
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

    // Get all active discounts for the org
    const { data: allDiscounts, error } = await supabase
      .from('discounts')
      .select('*')
      .eq('organization_id', organizationId)
      .is('deleted_at', null);

    if (error) {
      this.logger.error('Failed to fetch discounts for product', error);
      throw new BadRequestException('Failed to fetch discounts');
    }

    if (!allDiscounts || allDiscounts.length === 0) {
      return [];
    }

    // Get product associations for these discounts
    const discountIds = allDiscounts.map((d) => d.id);
    const { data: associations } = await (supabase as any)
      .from('discount_products')
      .select('discount_id, product_id')
      .in('discount_id', discountIds);

    const assocMap = new Map<string, string[]>();
    if (associations) {
      for (const a of associations) {
        if (!assocMap.has(a.discount_id)) {
          assocMap.set(a.discount_id, []);
        }
        assocMap.get(a.discount_id)!.push(a.product_id);
      }
    }

    // Filter: include discounts with NO product associations (all products)
    // OR discounts that include this specific product
    return allDiscounts.filter((discount) => {
      const productIds = assocMap.get(discount.id);
      if (!productIds || productIds.length === 0) return true; // applies to all
      return productIds.includes(productId); // applies to this product
    });
  }
}

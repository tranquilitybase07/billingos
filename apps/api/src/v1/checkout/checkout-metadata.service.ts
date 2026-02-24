import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { SupabaseService } from '../../supabase/supabase.service';
import { CreateCheckoutDto } from './dto/create-checkout.dto';

/**
 * Service for managing checkout metadata
 * Implements Autum's pattern of storing checkout data separately from Stripe
 */
@Injectable()
export class CheckoutMetadataService {
  private readonly logger = new Logger(CheckoutMetadataService.name);

  constructor(private readonly supabaseService: SupabaseService) {}

  /**
   * Create checkout metadata record
   * This stores all checkout parameters in our database before creating Stripe session
   */
  async createMetadata(params: {
    organizationId: string;
    customerId?: string;
    productId: string;
    priceId: string;
    customerEmail: string;
    customerName?: string;
    productName: string;
    priceAmount: number;
    currency: string;
    billingInterval?: 'month' | 'year';
    billingIntervalCount?: number;
    trialPeriodDays?: number;
    shouldGrantTrial?: boolean;
    featuresToGrant?: any[];
    discountCode?: string;
    discountPercentage?: number;
    successUrl: string;
    cancelUrl: string;
    metadata?: Record<string, any>;
  }): Promise<{ id: string; expiresAt: Date | null }> {
    const supabase = this.supabaseService.getClient();

    const { data, error } = await supabase
      .from('checkout_metadata')
      .insert({
        organization_id: params.organizationId,
        customer_id: params.customerId || null,
        product_id: params.productId,
        price_id: params.priceId,
        customer_email: params.customerEmail,
        customer_name: params.customerName,
        product_name: params.productName,
        price_amount: params.priceAmount,
        currency: params.currency,
        billing_interval: params.billingInterval,
        billing_interval_count: params.billingIntervalCount || 1,
        trial_period_days: params.trialPeriodDays,
        should_grant_trial: params.shouldGrantTrial || false,
        features_to_grant: params.featuresToGrant || [],
        discount_code: params.discountCode,
        discount_percentage: params.discountPercentage,
        success_url: params.successUrl,
        cancel_url: params.cancelUrl,
        metadata: params.metadata || {},
        status: 'pending',
      })
      .select('id, expires_at')
      .single();

    if (error) {
      this.logger.error('Failed to create checkout metadata:', error);
      throw error;
    }

    this.logger.log(`Created checkout metadata: ${data.id}`);
    return {
      id: data.id,
      expiresAt: data.expires_at ? new Date(data.expires_at) : null,
    };
  }

  /**
   * Get checkout metadata by ID
   */
  async getMetadata(metadataId: string): Promise<any> {
    const supabase = this.supabaseService.getClient();

    const { data, error } = await supabase
      .from('checkout_metadata')
      .select('*')
      .eq('id', metadataId)
      .single();

    if (error || !data) {
      this.logger.error(`Metadata not found: ${metadataId}`, error);
      throw new NotFoundException('Checkout metadata not found');
    }

    // Check if expired
    if (data.expires_at && new Date(data.expires_at) < new Date() && data.status === 'pending') {
      this.logger.warn(`Checkout metadata ${metadataId} has expired`);
      await this.updateMetadataStatus(metadataId, 'expired');
      throw new NotFoundException('Checkout metadata has expired');
    }

    return data;
  }

  /**
   * Get metadata by Stripe checkout session ID
   */
  async getMetadataBySessionId(sessionId: string): Promise<any> {
    const supabase = this.supabaseService.getClient();

    const { data, error } = await supabase
      .from('checkout_metadata')
      .select('*')
      .eq('checkout_session_id', sessionId)
      .single();

    if (error || !data) {
      this.logger.error(`Metadata not found for session: ${sessionId}`, error);
      throw new NotFoundException('Checkout metadata not found for session');
    }

    return data;
  }

  /**
   * Update metadata with Stripe checkout session ID
   */
  async linkToCheckoutSession(
    metadataId: string,
    checkoutSessionId: string,
  ): Promise<void> {
    const supabase = this.supabaseService.getClient();

    const { error } = await supabase
      .from('checkout_metadata')
      .update({
        checkout_session_id: checkoutSessionId,
        status: 'processing',
        updated_at: new Date().toISOString(),
      })
      .eq('id', metadataId);

    if (error) {
      this.logger.error(
        `Failed to link metadata ${metadataId} to session ${checkoutSessionId}:`,
        error,
      );
      throw error;
    }

    this.logger.log(
      `Linked metadata ${metadataId} to checkout session ${checkoutSessionId}`,
    );
  }

  /**
   * Update metadata status
   */
  async updateMetadataStatus(
    metadataId: string,
    status: 'pending' | 'processing' | 'completed' | 'expired' | 'failed',
    subscriptionId?: string,
  ): Promise<void> {
    const supabase = this.supabaseService.getClient();

    const updateData: any = {
      status,
      updated_at: new Date().toISOString(),
    };

    if (status === 'completed') {
      updateData.completed_at = new Date().toISOString();
    }

    if (subscriptionId) {
      updateData.subscription_id = subscriptionId;
    }

    const { error } = await supabase
      .from('checkout_metadata')
      .update(updateData)
      .eq('id', metadataId);

    if (error) {
      this.logger.error(
        `Failed to update metadata ${metadataId} status to ${status}:`,
        error,
      );
      throw error;
    }

    this.logger.log(`Updated metadata ${metadataId} status to ${status}`);
  }

  /**
   * Clean up expired metadata (can be called by a cron job)
   */
  async cleanupExpiredMetadata(): Promise<number> {
    const supabase = this.supabaseService.getClient();

    const { data, error } = await supabase.rpc('cleanup_expired_checkout_metadata');

    if (error) {
      this.logger.error('Failed to cleanup expired metadata:', error);
      throw error;
    }

    this.logger.log(`Cleaned up ${data} expired checkout metadata records`);
    return data;
  }
}
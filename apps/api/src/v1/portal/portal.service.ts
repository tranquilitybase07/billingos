import { Injectable, Logger, NotFoundException, UnauthorizedException } from '@nestjs/common';
import { SupabaseService } from '../../supabase/supabase.service';
import { CreatePortalSessionDto } from './dto/create-portal-session.dto';
import {
  PortalData,
  PortalSubscription,
  PortalInvoice,
  PortalPaymentMethod,
  PortalCustomer,
} from './dto/portal-data.dto';

export interface PortalSession {
  id: string;
  customerId: string;
  organizationId: string;
  expiresAt: string;
}

export interface PortalSessionStatus {
  sessionId: string;
  isValid: boolean;
  expiresAt?: string;
  customerId?: string;
}

@Injectable()
export class PortalService {
  private readonly logger = new Logger(PortalService.name);

  constructor(private readonly supabaseService: SupabaseService) {}

  /**
   * Create a new portal session for a customer
   */
  async createPortalSession(
    organizationId: string,
    externalUserId: string,
    dto: CreatePortalSessionDto,
  ): Promise<PortalSession> {
    const supabase = this.supabaseService.getClient();

    // 1. Get or find customer
    let customerId: string;

    if (dto.customerId) {
      // Verify customer belongs to organization
      const { data: customer, error: customerError } = await supabase
        .from('customers')
        .select('id')
        .eq('id', dto.customerId)
        .eq('organization_id', organizationId)
        .single();

      if (customerError || !customer) {
        throw new NotFoundException('Customer not found or does not belong to organization');
      }

      customerId = customer.id;
    } else {
      // Find customer by external_id
      const { data: customer, error: customerError } = await supabase
        .from('customers')
        .select('id')
        .eq('organization_id', organizationId)
        .eq('external_id', externalUserId)
        .maybeSingle();

      if (customerError) {
        this.logger.error('Error finding customer:', customerError);
        throw new NotFoundException('Customer not found');
      }

      if (!customer) {
        throw new NotFoundException(
          'Customer not found. Customer must complete checkout before accessing portal.',
        );
      }

      customerId = customer.id;
    }

    // 2. Create portal session with 24-hour expiry
    const expiresAt = new Date();
    expiresAt.setHours(expiresAt.getHours() + 24); // 24 hour expiry for portal

    const { data: portalSession, error: sessionError } = await supabase
      .from('portal_sessions')
      .insert({
        customer_id: customerId,
        organization_id: organizationId,
        external_user_id: externalUserId,
        expires_at: expiresAt.toISOString(),
        metadata: dto.metadata || {},
      })
      .select('id, customer_id, organization_id, expires_at')
      .single();

    if (sessionError || !portalSession) {
      this.logger.error('Failed to create portal session:', sessionError);
      throw new Error('Failed to create portal session');
    }

    this.logger.log(
      `Created portal session ${portalSession.id} for customer ${customerId}`,
    );

    return {
      id: portalSession.id,
      customerId: portalSession.customer_id,
      organizationId: portalSession.organization_id,
      expiresAt: portalSession.expires_at,
    };
  }

  /**
   * Get portal session status and validate
   */
  async getPortalSessionStatus(sessionId: string): Promise<PortalSessionStatus> {
    const supabase = this.supabaseService.getClient();

    const { data: session, error } = await supabase
      .from('portal_sessions')
      .select('id, customer_id, expires_at')
      .eq('id', sessionId)
      .single();

    if (error || !session) {
      return {
        sessionId,
        isValid: false,
      };
    }

    // Check if expired
    const now = new Date();
    const expiresAt = new Date(session.expires_at);
    const isValid = expiresAt > now;

    // Update accessed_at timestamp
    if (isValid) {
      await supabase
        .from('portal_sessions')
        .update({ accessed_at: new Date().toISOString() })
        .eq('id', sessionId);
    }

    return {
      sessionId,
      isValid,
      expiresAt: session.expires_at,
      customerId: session.customer_id,
    };
  }

  /**
   * Get aggregated portal data for a session
   */
  async getPortalData(sessionId: string): Promise<PortalData> {
    const supabase = this.supabaseService.getClient();

    // 1. Validate session
    const sessionStatus = await this.getPortalSessionStatus(sessionId);
    if (!sessionStatus.isValid) {
      throw new UnauthorizedException('Portal session is invalid or expired');
    }

    const customerId = sessionStatus.customerId!;

    // 2. Get customer data
    const { data: customer, error: customerError } = await supabase
      .from('customers')
      .select('id, email, name, organization_id, organizations(name)')
      .eq('id', customerId)
      .single();

    if (customerError || !customer) {
      throw new NotFoundException('Customer not found');
    }

    const portalCustomer: PortalCustomer = {
      id: customer.id,
      email: customer.email || undefined,
      name: customer.name || undefined,
    };

    // 3. Get active subscriptions with product and price details
    const { data: subscriptions, error: subscriptionsError } = await supabase
      .from('subscriptions')
      .select(`
        id,
        status,
        current_period_start,
        current_period_end,
        cancel_at_period_end,
        canceled_at,
        trial_end,
        product:products (
          id,
          name,
          description
        ),
        price:product_prices (
          id,
          price_amount,
          price_currency,
          recurring_interval,
          recurring_interval_count
        )
      `)
      .eq('customer_id', customerId)
      .in('status', ['active', 'trialing', 'past_due', 'canceled']);

    const portalSubscriptions: PortalSubscription[] = [];
    if (subscriptions) {
      for (const sub of subscriptions) {
        const product = sub.product as any;
        const price = sub.price as any;

        // Get features for this product
        const { data: productFeatures } = await supabase
          .from('product_features')
          .select(`
            feature:features (
              id,
              name,
              description,
              feature_type,
              limit
            )
          `)
          .eq('product_id', product.id);

        const features = (productFeatures || []).map((pf: any) => ({
          id: pf.feature.id,
          name: pf.feature.name,
          description: pf.feature.description || undefined,
          limit: pf.feature.limit || undefined,
        }));

        portalSubscriptions.push({
          id: sub.id,
          status: sub.status,
          currentPeriodStart: sub.current_period_start,
          currentPeriodEnd: sub.current_period_end,
          cancelAtPeriodEnd: sub.cancel_at_period_end || false,
          canceledAt: sub.canceled_at || undefined,
          trialEnd: sub.trial_end || undefined,
          product: {
            id: product.id,
            name: product.name,
            description: product.description || undefined,
          },
          price: {
            id: price.id,
            amount: price.price_amount,
            currency: price.price_currency,
            interval: price.recurring_interval,
            intervalCount: price.recurring_interval_count || 1,
          },
          features,
        });
      }
    }

    // 4. Get invoices (mock data for now - would integrate with Stripe)
    // TODO: Fetch real invoices from Stripe
    const portalInvoices: PortalInvoice[] = [];

    // 5. Get payment methods (mock data for now - would integrate with Stripe)
    // TODO: Fetch real payment methods from Stripe
    const portalPaymentMethods: PortalPaymentMethod[] = [];

    // 6. Get organization name
    const organizationName = (customer.organizations as any)?.name || undefined;

    return {
      sessionId,
      customer: portalCustomer,
      subscriptions: portalSubscriptions,
      invoices: portalInvoices,
      paymentMethods: portalPaymentMethods,
      organizationName,
    };
  }
}

import { Injectable, Logger, BadRequestException } from '@nestjs/common';
import { SupabaseService } from '../../supabase/supabase.service';
import { StripeService } from '../../stripe/stripe.service';
import { CustomersService } from '../../customers/customers.service';
import { BillingCustomer } from './types';

/**
 * Resolves (get-or-create) a BillingCustomer for a checkout.
 *
 * Looks up by (organization_id, external_id). If no Stripe customer exists
 * on the connected account, creates one.
 */
@Injectable()
export class CustomerResolver {
  private readonly logger = new Logger(CustomerResolver.name);

  constructor(
    private readonly supabaseService: SupabaseService,
    private readonly stripeService: StripeService,
    private readonly customersService: CustomersService,
  ) {}

  async resolve(
    organizationId: string,
    externalUserId: string,
    stripeAccountId: string,
    email?: string,
    name?: string,
    metadata?: Record<string, unknown>,
  ): Promise<BillingCustomer> {
    const supabase = this.supabaseService.getClient();

    // Check if customer already exists in our database
    const { data: existing } = await supabase
      .from('customers')
      .select('id, stripe_customer_id')
      .eq('organization_id', organizationId)
      .eq('external_id', externalUserId)
      .maybeSingle();

    if (existing?.stripe_customer_id) {
      return {
        id: existing.id,
        stripeCustomerId: existing.stripe_customer_id,
        externalUserId,
        email,
        name,
      };
    }

    // Create new Stripe customer on the CONNECTED ACCOUNT
    const stripeCustomer = await this.stripeService
      .getClient()
      .customers.create(
        {
          email,
          name,
          metadata: {
            organizationId,
            externalUserId,
          },
        },
        { stripeAccount: stripeAccountId },
      );

    // Upsert in BOS database
    const customerResult = await this.customersService.upsertCustomer({
      organization_id: organizationId,
      external_id: externalUserId,
      email: email || '',
      name,
      stripe_customer_id: stripeCustomer.id,
      metadata: metadata
        ? Object.fromEntries(
            Object.entries(metadata).map(([k, v]) => [k, String(v)]),
          )
        : undefined,
    });

    return {
      id: customerResult.id,
      stripeCustomerId: stripeCustomer.id,
      externalUserId,
      email,
      name,
    };
  }
}

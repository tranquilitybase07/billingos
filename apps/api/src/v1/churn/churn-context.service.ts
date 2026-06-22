import {
  Injectable,
  Logger,
  NotFoundException,
  UnauthorizedException,
  BadRequestException,
} from '@nestjs/common';
import { SupabaseService } from '../../supabase/supabase.service';
import { BosSubscriptionResolver } from './resolvers/bos-subscription.resolver';
import { ChurnContext } from './resolvers/subscription-resolver.interface';

@Injectable()
export class ChurnContextService {
  private readonly logger = new Logger(ChurnContextService.name);

  constructor(
    private readonly supabaseService: SupabaseService,
    private readonly bosSubscriptionResolver: BosSubscriptionResolver,
  ) {}

  /**
   * Resolve a churn context from a portal session id (Phase 1 mount point).
   * Mirrors the existing portal cancel endpoint: the session id path param is
   * the credential — no SessionTokenAuthGuard. Phase 3 adds a churn-session path.
   */
  async resolveFromPortalSession(
    sessionId: string,
    subscriptionId: string,
  ): Promise<ChurnContext> {
    const supabase = this.supabaseService.getClient();

    const { data: session, error: sessionError } = await supabase
      .from('portal_sessions')
      .select('id, customer_id, organization_id, expires_at')
      .eq('id', sessionId)
      .single();

    if (sessionError || !session) {
      throw new UnauthorizedException('Portal session is invalid or expired');
    }
    if (new Date(session.expires_at) <= new Date()) {
      throw new UnauthorizedException('Portal session is invalid or expired');
    }

    const organizationId = session.organization_id;
    const customerId = session.customer_id;

    const { data: subscription, error: subError } = await supabase
      .from('subscriptions')
      .select('id')
      .eq('id', subscriptionId)
      .eq('customer_id', customerId)
      .eq('organization_id', organizationId)
      .single();

    if (subError || !subscription) {
      throw new NotFoundException(
        'Subscription not found or does not belong to customer',
      );
    }

    const stripeAccountId = await this.resolveStripeAccountId(organizationId);
    const flowId = await this.findEnabledFlowId(organizationId);

    return {
      organizationId,
      stripeAccountId,
      subscriptionRef: subscription.id,
      bosSubscriptionId: subscription.id,
      customerId,
      flowId,
      source: 'portal',
      resolver: this.bosSubscriptionResolver,
    };
  }

  async resolveStripeAccountId(organizationId: string): Promise<string> {
    const supabase = this.supabaseService.getClient();

    const { data: org, error: orgError } = await supabase
      .from('organizations')
      .select('account_id')
      .eq('id', organizationId)
      .single();

    if (orgError || !org?.account_id) {
      throw new NotFoundException('Organization account not found');
    }

    const { data: account } = await supabase
      .from('accounts')
      .select('stripe_id')
      .eq('id', org.account_id)
      .single();

    if (!account?.stripe_id) {
      throw new BadRequestException(
        'Stripe account not found for organization',
      );
    }

    return account.stripe_id;
  }

  async findEnabledFlowId(organizationId: string): Promise<string | undefined> {
    const supabase = this.supabaseService.getClient();

    const { data: flow } = await supabase
      .from('churn_flows')
      .select('id')
      .eq('organization_id', organizationId)
      .eq('enabled', true)
      .order('updated_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    return flow?.id ?? undefined;
  }
}

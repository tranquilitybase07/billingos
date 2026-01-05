import {
  Injectable,
  Logger,
  NotFoundException,
  ConflictException,
  ForbiddenException,
  BadRequestException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { SupabaseService } from '../supabase/supabase.service';
import { StripeService } from '../stripe/stripe.service';
import { User } from '../user/entities/user.entity';
import { CreateAccountDto } from './dto/create-account.dto';
import { Account } from './entities/account.entity';

@Injectable()
export class AccountService {
  private readonly logger = new Logger(AccountService.name);

  constructor(
    private readonly supabaseService: SupabaseService,
    private readonly stripeService: StripeService,
    private readonly configService: ConfigService,
  ) {}

  /**
   * Create a Stripe Connect account for an organization
   */
  async create(user: User, createDto: CreateAccountDto): Promise<Account> {
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

    // Check if organization already has an account
    if (org.account_id) {
      throw new ConflictException('Organization already has a Stripe account');
    }

    // Verify user is a member of the organization
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

    try {
      // Create Stripe Connect account
      const stripeAccount = await this.stripeService.createConnectAccount({
        email: createDto.email,
        country: createDto.country,
        businessType: createDto.business_type as any,
      });

      // Create account in database
      const { data: account, error } = await supabase
        .from('accounts')
        .insert({
          account_type: 'stripe',
          admin_id: user.id, // User who creates the account becomes admin
          stripe_id: stripeAccount.id,
          email: stripeAccount.email || createDto.email,
          country: stripeAccount.country || createDto.country,
          currency: stripeAccount.default_currency || null,
          is_details_submitted: stripeAccount.details_submitted || false,
          is_charges_enabled: stripeAccount.charges_enabled || false,
          is_payouts_enabled: stripeAccount.payouts_enabled || false,
          business_type: stripeAccount.business_type || createDto.business_type,
          status: 'onboarding_started',
          data: stripeAccount as any,
          // Platform fees: 0.6% + $0.10 (on top of Stripe's 2.9% + $0.30)
          // Merchant absorbs all fees - if product is $100, merchant receives $96.10
          platform_fee_percent:
            this.configService.get<number>('PLATFORM_FEE_PERCENT') || 60, // 0.6% in basis points
          platform_fee_fixed:
            this.configService.get<number>('PLATFORM_FEE_FIXED') || 10, // $0.10 in cents
        })
        .select()
        .single();

      if (error || !account) {
        this.logger.error('Failed to create account in database:', error);
        // Cleanup: delete Stripe account
        await this.stripeService.deleteConnectAccount(stripeAccount.id);
        throw new Error('Failed to create account');
      }

      // Link account to organization
      const { error: updateError } = await supabase
        .from('organizations')
        .update({
          account_id: account.id,
          status: 'onboarding_started',
          status_updated_at: new Date().toISOString(),
        })
        .eq('id', createDto.organization_id);

      if (updateError) {
        this.logger.error(
          'Failed to link account to organization:',
          updateError,
        );
        // Cleanup
        await supabase.from('accounts').delete().eq('id', account.id);
        await this.stripeService.deleteConnectAccount(stripeAccount.id);
        throw new Error('Failed to link account to organization');
      }

      this.logger.log(
        `Stripe Connect account created: ${account.id} for organization ${createDto.organization_id}`,
      );

      return account;
    } catch (error) {
      this.logger.error('Error creating Stripe Connect account:', error);
      throw new BadRequestException(
        error.message || 'Failed to create Stripe Connect account',
      );
    }
  }

  /**
   * Get account by ID
   */
  async findOne(id: string, userId: string): Promise<Account> {
    const supabase = this.supabaseService.getClient();

    const { data: account, error } = await supabase
      .from('accounts')
      .select('*')
      .eq('id', id)
      .is('deleted_at', null)
      .single();

    if (error || !account) {
      throw new NotFoundException('Account not found');
    }

    // Verify user has access (is admin or member of linked organization)
    const isAdmin = account.admin_id === userId;

    if (!isAdmin) {
      // Check if user is member of any organization using this account
      const { data: org } = await supabase
        .from('organizations')
        .select('id')
        .eq('account_id', id)
        .is('deleted_at', null)
        .single();

      if (org) {
        const { data: membership } = await supabase
          .from('user_organizations')
          .select('user_id')
          .eq('organization_id', org.id)
          .eq('user_id', userId)
          .is('deleted_at', null)
          .single();

        if (!membership) {
          throw new ForbiddenException(
            'You do not have access to this account',
          );
        }
      } else {
        throw new ForbiddenException('You do not have access to this account');
      }
    }

    return account;
  }

  /**
   * Get account by organization ID
   */
  async findByOrganization(
    organizationId: string,
    userId: string,
  ): Promise<Account | null> {
    const supabase = this.supabaseService.getClient();

    // First verify user is member of organization
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

    // Get organization with account_id
    const { data: org, error: orgError } = await supabase
      .from('organizations')
      .select('account_id')
      .eq('id', organizationId)
      .is('deleted_at', null)
      .single();

    if (orgError || !org) {
      throw new NotFoundException('Organization not found');
    }

    // If organization has no account, return null
    if (!org.account_id) {
      return null;
    }

    // Get the account
    const { data: account, error } = await supabase
      .from('accounts')
      .select('*')
      .eq('id', org.account_id)
      .is('deleted_at', null)
      .single();

    if (error || !account) {
      throw new NotFoundException('Account not found');
    }

    return account;
  }

  /**
   * Get Stripe onboarding link for account
   */
  async getOnboardingLink(
    accountId: string,
    userId: string,
    returnUrl?: string,
    refreshUrl?: string,
  ): Promise<{ url: string }> {
    const account = await this.findOne(accountId, userId);

    if (!account.stripe_id) {
      throw new BadRequestException('Account does not have a Stripe ID');
    }

    const appUrl =
      this.configService.get<string>('APP_URL') || 'http://localhost:3000';

    // Get organization to build return URL
    const supabase = this.supabaseService.getClient();
    const { data: org } = await supabase
      .from('organizations')
      .select('slug')
      .eq('account_id', accountId)
      .single();

    const defaultReturnUrl = org
      ? `${appUrl}/dashboard/${org.slug}/finance/account`
      : `${appUrl}/dashboard`;

    const defaultRefreshUrl = org
      ? `${appUrl}/dashboard/${org.slug}/finance/account`
      : `${appUrl}/dashboard`;

    try {
      const accountLink = await this.stripeService.createAccountLink({
        accountId: account.stripe_id,
        returnUrl: returnUrl || defaultReturnUrl,
        refreshUrl: refreshUrl || defaultRefreshUrl,
        type: 'account_onboarding',
      });

      this.logger.log(`Onboarding link created for account ${accountId}`);

      return { url: accountLink.url };
    } catch (error) {
      this.logger.error('Error creating onboarding link:', error);
      throw new BadRequestException('Failed to create onboarding link');
    }
  }

  /**
   * Get Stripe dashboard login link
   */
  async getDashboardLink(
    accountId: string,
    userId: string,
  ): Promise<{ url: string }> {
    const account = await this.findOne(accountId, userId);

    if (!account.stripe_id) {
      throw new BadRequestException('Account does not have a Stripe ID');
    }

    try {
      const loginLink = await this.stripeService.createDashboardLoginLink(
        account.stripe_id,
      );

      this.logger.log(`Dashboard link created for account ${accountId}`);

      return { url: loginLink.url };
    } catch (error) {
      this.logger.error('Error creating dashboard link:', error);
      throw new BadRequestException('Failed to create dashboard link');
    }
  }

  /**
   * Sync account data from Stripe
   */
  async syncFromStripe(accountId: string, userId: string): Promise<Account> {
    const account = await this.findOne(accountId, userId);

    if (!account.stripe_id) {
      throw new BadRequestException('Account does not have a Stripe ID');
    }

    try {
      const stripeAccount = await this.stripeService.getConnectAccount(
        account.stripe_id,
      );

      const supabase = this.supabaseService.getClient();

      const { data: updatedAccount, error } = await supabase
        .from('accounts')
        .update({
          is_details_submitted: stripeAccount.details_submitted || false,
          is_charges_enabled: stripeAccount.charges_enabled || false,
          is_payouts_enabled: stripeAccount.payouts_enabled || false,
          business_type: stripeAccount.business_type || null,
          email: stripeAccount.email || null,
          country: stripeAccount.country || account.country,
          currency: stripeAccount.default_currency || null,
          data: stripeAccount as any,
          updated_at: new Date().toISOString(),
        })
        .eq('id', accountId)
        .select()
        .single();

      if (error || !updatedAccount) {
        throw new Error('Failed to update account');
      }

      this.logger.log(`Account ${accountId} synced from Stripe`);

      // Update organization status if fully enabled
      if (stripeAccount.charges_enabled && stripeAccount.payouts_enabled) {
        await supabase
          .from('organizations')
          .update({
            status: 'active',
            status_updated_at: new Date().toISOString(),
          })
          .eq('account_id', accountId);
      }

      return updatedAccount;
    } catch (error) {
      this.logger.error('Error syncing account from Stripe:', error);
      throw new BadRequestException('Failed to sync account from Stripe');
    }
  }
}

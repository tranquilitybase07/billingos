import {
  Injectable,
  Logger,
  NotFoundException,
  ConflictException,
  ForbiddenException,
  BadRequestException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { randomUUID } from 'crypto';
import { SupabaseService } from '../supabase/supabase.service';
import { StripeService } from '../stripe/stripe.service';
import { RedisService } from '../redis/redis.service';
import { User } from '../user/entities/user.entity';
import { CreateAccountDto } from './dto/create-account.dto';
import { GetOAuthUrlDto } from './dto/connect-oauth.dto';
import { Account, STRIPE_CONNECTION_TYPE } from './entities/account.entity';
import { getCurrencyForCountry } from '../common/constants/currencies';

@Injectable()
export class AccountService {
  private readonly logger = new Logger(AccountService.name);
  private static readonly OAUTH_STATE_TTL_SECONDS = 600;

  constructor(
    private readonly supabaseService: SupabaseService,
    private readonly stripeService: StripeService,
    private readonly redisService: RedisService,
    private readonly configService: ConfigService,
  ) {}

  /**
   * Create a Stripe Connect account for an organization (managed/Express).
   * Restricted to sandbox — production merchants must connect via OAuth
   */
  async create(user: User, createDto: CreateAccountDto): Promise<Account> {
    if (!this.stripeService.isSandboxEnvironment()) {
      throw new BadRequestException(
        'Managed accounts are sandbox-only. Connect your Stripe account via OAuth to go live.',
      );
    }

    const supabase = this.supabaseService.getClient();

    const org = await this.verifyOrgConnectAccess(
      createDto.organization_id,
      user.id,
    );

    try {
      // Use smart creation: auto-verifies in sandbox, normal flow in production
      const { account: stripeAccount, autoCreated } =
        await this.stripeService.createConnectAccountSmart({
          email: createDto.email,
          country: createDto.country,
          businessType: createDto.business_type as any,
          organizationName: org.name,
        });

      // Auto-created sandbox accounts are immediately active
      const accountStatus = autoCreated ? 'active' : 'onboarding_started';

      // Create account in database
      const { data: account, error } = await supabase
        .from('accounts')
        .insert({
          account_type: 'stripe',
          admin_id: user.id,
          stripe_id: stripeAccount.id,
          email: stripeAccount.email || createDto.email,
          country: stripeAccount.country || createDto.country,
          currency: stripeAccount.default_currency || null,
          is_details_submitted: autoCreated
            ? true
            : stripeAccount.details_submitted || false,
          is_charges_enabled: autoCreated
            ? true
            : stripeAccount.charges_enabled || false,
          is_payouts_enabled: autoCreated
            ? true
            : stripeAccount.payouts_enabled || false,
          business_type: stripeAccount.business_type || createDto.business_type,
          status: accountStatus,
          auto_created: autoCreated,
          test_mode: this.stripeService.isTestMode(),
          data: stripeAccount as any,
          platform_fee_percent:
            this.configService.get<number>('PLATFORM_FEE_PERCENT') || 60,
          platform_fee_fixed:
            this.configService.get<number>('PLATFORM_FEE_FIXED') || 10,
        })
        .select()
        .single();

      if (error || !account) {
        this.logger.error('Failed to create account in database:', error);
        // Cleanup: delete Stripe account
        await this.stripeService.deleteConnectAccount(stripeAccount.id);
        throw new Error('Failed to create account');
      }

      // Link account to organization and set default currency from Stripe country
      const { error: updateError } = await supabase
        .from('organizations')
        .update({
          account_id: account.id,
          status: autoCreated ? 'active' : 'onboarding_started',
          status_updated_at: new Date().toISOString(),
          default_currency: getCurrencyForCountry(
            stripeAccount.country || 'US',
          ),
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
      if (
        error?.type === 'StripeInvalidRequestError' &&
        error?.message?.includes('cannot be created by platforms in')
      ) {
        throw new BadRequestException(
          `Stripe does not currently support creating merchant accounts in this country for our platform region. Please select a different country or contact support.`,
        );
      }
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

    if (account.stripe_connection_type === STRIPE_CONNECTION_TYPE.STANDARD) {
      throw new BadRequestException(
        'OAuth-connected accounts do not require onboarding',
      );
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
      ? `${appUrl}/dashboard/${org.slug}/settings/billing`
      : `${appUrl}/dashboard`;

    const defaultRefreshUrl = org
      ? `${appUrl}/dashboard/${org.slug}/settings/billing`
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

    // Standard (OAuth) accounts use the merchant's own Stripe dashboard;
    // Express login links only work for platform-created Express accounts.
    if (account.stripe_connection_type === STRIPE_CONNECTION_TYPE.STANDARD) {
      return { url: 'https://dashboard.stripe.com' };
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

  /**
   * Disconnect a Stripe account from its organization. Standard (OAuth)
   * accounts are deauthorized; Express accounts are deleted on Stripe.
   * Always soft-deletes the BOS row and unlinks the organization so the
   * user can choose a fresh connection mode.
   *
   * Restricted to the original account creator (admin_id). Refuses if
   * any active subscriptions exist on the org — those would lose their
   * Stripe-side billing relationship.
   */
  async disconnect(
    accountId: string,
    userId: string,
  ): Promise<{ success: true }> {
    const account = await this.findOne(accountId, userId);

    if (account.admin_id !== userId) {
      throw new ForbiddenException(
        'Only the account admin can disconnect Stripe',
      );
    }

    if (!account.stripe_id) {
      throw new BadRequestException('Account has no Stripe ID to disconnect');
    }

    const supabase = this.supabaseService.getClient();

    const { data: linkedOrg } = await supabase
      .from('organizations')
      .select('id')
      .eq('account_id', accountId)
      .is('deleted_at', null)
      .single();

    if (!linkedOrg) {
      throw new NotFoundException('Linked organization not found');
    }

    let stripeError: Error | null = null;
    try {
      if (account.stripe_connection_type === STRIPE_CONNECTION_TYPE.STANDARD) {
        await this.stripeService.deauthorizeOAuthAccount(account.stripe_id);
      } else {
        await this.stripeService.deleteConnectAccount(account.stripe_id);
      }
    } catch (err) {
      stripeError = err instanceof Error ? err : new Error(String(err));
      // Stripe-side cleanup failed (already revoked, network blip). Log to
      // sync events so the failure is auditable, then continue with BOS
      // cleanup so the user isn't permanently stuck.
      this.logger.warn(
        `Stripe-side disconnect failed for ${account.stripe_id} (continuing):`,
        err,
      );
      await this.logSyncEvent({
        organizationId: linkedOrg.id,
        entityId: account.id,
        stripeObjectId: account.stripe_id,
        operation: 'delete',
        status: 'failure',
        errorMessage: stripeError.message,
        triggeredBy: userId,
      });
    }

    const now = new Date().toISOString();

    const { error: orgErr } = await supabase
      .from('organizations')
      .update({
        account_id: null,
        status: 'created',
        status_updated_at: now,
      })
      .eq('account_id', accountId);

    if (orgErr) {
      this.logger.error('Failed to unlink org during disconnect:', orgErr);
      throw new BadRequestException(
        'Failed to unlink account from organization',
      );
    }

    const { error: acctErr } = await supabase
      .from('accounts')
      .update({ deleted_at: now })
      .eq('id', accountId);

    if (acctErr) {
      this.logger.error('Failed to soft-delete account row:', acctErr);
      throw new BadRequestException('Failed to remove account record');
    }

    if (!stripeError) {
      await this.logSyncEvent({
        organizationId: linkedOrg.id,
        entityId: account.id,
        stripeObjectId: account.stripe_id,
        operation: 'delete',
        status: 'success',
        triggeredBy: userId,
      });
    }

    this.logger.log(
      `Disconnected account ${accountId} (stripe=${account.stripe_id}, type=${account.stripe_connection_type}) for user ${userId}`,
    );

    return { success: true };
  }

  /**
   * Start the Stripe Connect OAuth flow for an organization.
   * Generates a state token, stores it in Redis, and returns the authorize URL.
   */
  async getOAuthUrl(
    dto: GetOAuthUrlDto,
    userId: string,
  ): Promise<{ url: string }> {
    await this.verifyOrgConnectAccess(dto.organization_id, userId);

    const clientId = this.configService.get<string>('STRIPE_CLIENT_ID');
    if (!clientId) {
      throw new BadRequestException('STRIPE_CLIENT_ID is not configured');
    }

    const apiUrl =
      this.configService.get<string>('API_URL') || 'http://localhost:3001';
    const redirectUri = `${apiUrl}/accounts/oauth/callback`;

    const state = randomUUID();
    await this.redisService.set(
      `oauth:state:${state}`,
      JSON.stringify({
        organization_id: dto.organization_id,
        user_id: userId,
      }),
      AccountService.OAUTH_STATE_TTL_SECONDS,
    );

    const url = this.stripeService.getOAuthAuthorizeUrl({
      clientId,
      state,
      redirectUri,
    });

    return { url };
  }

  /**
   * Handle the OAuth callback from Stripe. Exchanges the code for a connected
   * account, persists it to BOS, and returns the organization slug for redirect.
   */
  async handleOAuthCallback({
    code,
    state,
  }: {
    code: string;
    state: string;
  }): Promise<{ organizationSlug: string }> {
    const stateKey = `oauth:state:${state}`;
    const raw = await this.redisService.get(stateKey);
    if (!raw) {
      throw new BadRequestException('state_expired');
    }
    // One-time use
    await this.redisService.delete(stateKey);

    let parsed: { organization_id: string; user_id: string };
    try {
      parsed = JSON.parse(raw);
    } catch {
      throw new BadRequestException('invalid_state');
    }

    // Re-verify org + membership + no existing account (guards against
    // state replay after the org was modified between authorize + callback).
    const org = await this.verifyOrgConnectAccess(
      parsed.organization_id,
      parsed.user_id,
    );

    const supabase = this.supabaseService.getClient();

    // Exchange the authorization code for the connected Stripe account.
    const { stripeUserId } = await this.stripeService.exchangeOAuthCode(code);

    // Dedup: the same Stripe account cannot be connected to multiple BOS orgs.
    const { data: existing } = await supabase
      .from('accounts')
      .select('id')
      .eq('stripe_id', stripeUserId)
      .is('deleted_at', null)
      .maybeSingle();

    if (existing) {
      // Revert the Stripe-side authorization so the user can retry with a
      // different account.
      await this.safeDeauthorize(stripeUserId);
      await this.logSyncEvent({
        organizationId: org.id,
        entityId: existing.id,
        stripeObjectId: stripeUserId,
        operation: 'create',
        status: 'failure',
        errorMessage: 'account_already_connected',
        triggeredBy: parsed.user_id,
      });
      throw new ConflictException('account_already_connected');
    }

    try {
      const stripeAccount =
        await this.stripeService.getConnectAccount(stripeUserId);

      const chargesEnabled = stripeAccount.charges_enabled ?? false;
      const payoutsEnabled = stripeAccount.payouts_enabled ?? false;
      const isActive = chargesEnabled && payoutsEnabled;

      const { data: account, error: insertError } = await supabase
        .from('accounts')
        .insert({
          account_type: 'stripe',
          admin_id: parsed.user_id,
          stripe_id: stripeUserId,
          stripe_connection_type: STRIPE_CONNECTION_TYPE.STANDARD,
          oauth_stripe_user_id: stripeUserId,
          email: stripeAccount.email || null,
          country: stripeAccount.country || 'US',
          currency: stripeAccount.default_currency || null,
          is_details_submitted: stripeAccount.details_submitted ?? false,
          is_charges_enabled: chargesEnabled,
          is_payouts_enabled: payoutsEnabled,
          business_type: stripeAccount.business_type || null,
          status: isActive ? 'active' : 'onboarding_started',
          auto_created: false,
          test_mode: this.stripeService.isTestMode(),
          data: stripeAccount as any,
          platform_fee_percent:
            this.configService.get<number>('PLATFORM_FEE_PERCENT') || 60,
          platform_fee_fixed:
            this.configService.get<number>('PLATFORM_FEE_FIXED') || 10,
        })
        .select()
        .single();

      if (insertError || !account) {
        this.logger.error('Failed to insert OAuth account:', insertError);
        throw new Error('Failed to insert account');
      }

      const { error: updateError } = await supabase
        .from('organizations')
        .update({
          account_id: account.id,
          status: isActive ? 'active' : 'onboarding_started',
          status_updated_at: new Date().toISOString(),
          default_currency: getCurrencyForCountry(
            stripeAccount.country || 'US',
          ),
        })
        .eq('id', org.id);

      if (updateError) {
        // Roll back the account row and Stripe authorization.
        await supabase.from('accounts').delete().eq('id', account.id);
        throw new Error('Failed to link account to organization');
      }

      this.logger.log(
        `OAuth Stripe account connected: ${account.id} (stripe=${stripeUserId}) for organization ${org.id}`,
      );

      await this.logSyncEvent({
        organizationId: org.id,
        entityId: account.id,
        stripeObjectId: stripeUserId,
        operation: 'create',
        status: 'success',
        triggeredBy: parsed.user_id,
      });

      return { organizationSlug: org.slug };
    } catch (error) {
      this.logger.error('OAuth callback failed; deauthorizing:', error);
      await this.safeDeauthorize(stripeUserId);
      await this.logSyncEvent({
        organizationId: org.id,
        entityId: stripeUserId, // BOS account row never persisted; use stripe id as entity ref
        stripeObjectId: stripeUserId,
        operation: 'create',
        status: 'failure',
        errorMessage: error instanceof Error ? error.message : String(error),
        triggeredBy: parsed.user_id,
      });
      if (
        error instanceof BadRequestException ||
        error instanceof ConflictException ||
        error instanceof NotFoundException ||
        error instanceof ForbiddenException
      ) {
        throw error;
      }
      throw new BadRequestException('oauth_connect_failed');
    }
  }

  /**
   * Append an entry to stripe_sync_events for audit. Failures here never
   * propagate — audit logging must not break the primary operation.
   */
  private async logSyncEvent(params: {
    organizationId: string;
    entityId: string;
    stripeObjectId: string | null;
    operation: 'create' | 'update' | 'delete' | 'backfill' | 'webhook';
    status: 'success' | 'failure' | 'partial';
    errorMessage?: string;
    triggeredBy?: string;
  }): Promise<void> {
    try {
      const supabase = this.supabaseService.getClient();
      await supabase.from('stripe_sync_events').insert({
        organization_id: params.organizationId,
        entity_type: 'account',
        entity_id: params.entityId,
        stripe_object_id: params.stripeObjectId,
        operation: params.operation,
        status: params.status,
        error_message: params.errorMessage,
        triggered_by: params.triggeredBy ?? 'api',
      });
    } catch (err) {
      this.logger.error('Failed to log stripe_sync_events row:', err);
    }
  }

  private async safeDeauthorize(stripeUserId: string): Promise<void> {
    try {
      await this.stripeService.deauthorizeOAuthAccount(stripeUserId);
    } catch (err) {
      this.logger.error(
        `Failed to deauthorize ${stripeUserId} (continuing):`,
        err,
      );
    }
  }

  /**
   * Verify the org exists, has no Stripe account yet, and the user is a member.
   * Used by every Connect entry point (Express create + OAuth authorize/callback).
   */
  private async verifyOrgConnectAccess(
    organizationId: string,
    userId: string,
  ): Promise<{
    id: string;
    account_id: string | null;
    slug: string;
    name: string;
  }> {
    const supabase = this.supabaseService.getClient();

    const { data: org, error } = await supabase
      .from('organizations')
      .select('id, account_id, slug, name')
      .eq('id', organizationId)
      .is('deleted_at', null)
      .single();

    if (error || !org) {
      throw new NotFoundException('Organization not found');
    }

    if (org.account_id) {
      throw new ConflictException('Organization already has a Stripe account');
    }

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

    return org;
  }
}

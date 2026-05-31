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
import { AccountService } from '../account/account.service';
import { User } from '../user/entities/user.entity';
import { CreateOrganizationDto } from './dto/create-organization.dto';
import { UpdateOrganizationDto } from './dto/update-organization.dto';
import { SubmitBusinessDetailsDto } from './dto/submit-business-details.dto';
import {
  Organization,
  OrganizationMember,
  PaymentStatus,
  PaymentStep,
} from './entities/organization.entity';
import {
  getCurrencyForCountry,
  isSupportedCurrency,
} from '../common/constants/currencies';
import { UpdateCurrencyDto } from './dto/update-currency.dto';

@Injectable()
export class OrganizationService {
  private readonly logger = new Logger(OrganizationService.name);

  constructor(
    private readonly supabaseService: SupabaseService,
    private readonly stripeService: StripeService,
    private readonly accountService: AccountService,
    private readonly configService: ConfigService,
  ) {}

  /**
   * Create a new organization
   * Automatically adds the creator as a member
   */
  async create(
    user: User,
    createDto: CreateOrganizationDto,
  ): Promise<Organization> {
    const supabase = this.supabaseService.getClient();

    // Generate slug from name if not provided
    let slug = createDto.slug || this.generateSlug(createDto.name);

    // Check if slug is already taken
    const { data: existing } = await supabase
      .from('organizations')
      .select('id')
      .eq('slug', slug)
      .is('deleted_at', null)
      .single();

    if (existing) {
      // Try with a random suffix
      slug = `${slug}-${Math.random().toString(36).substring(2, 8)}`;
    }

    // Create organization
    const { data: organization, error } = await supabase
      .from('organizations')
      .insert({
        name: createDto.name,
        slug,
        email: createDto.email || user.email,
        website: createDto.website || null,
        status: 'created',
      })
      .select()
      .single();

    if (error) {
      this.logger.error('Failed to create organization:', error);
      throw new ConflictException('Failed to create organization');
    }

    // Add creator as member
    const { error: memberError } = await supabase
      .from('user_organizations')
      .insert({
        user_id: user.id,
        organization_id: organization.id,
      });

    if (memberError) {
      this.logger.error('Failed to add user to organization:', memberError);
      // Rollback: delete organization
      await supabase.from('organizations').delete().eq('id', organization.id);
      throw new ConflictException('Failed to add user to organization');
    }

    this.logger.log(
      `Organization created: ${organization.id} by user ${user.id}`,
    );

    // In sandbox mode, auto-create and auto-verify a Stripe test account.
    // Fire-and-forget to pre-warm the account; product/checkout flows lazily
    // call ensureSandboxStripeAccount() to self-heal if this hasn't finished
    // (or silently failed).
    if (this.configService.get<string>('NODE_ENV') === 'sandbox') {
      this.ensureSandboxStripeAccount(user, organization).catch((err) => {
        this.logger.error(
          `Failed to auto-create Stripe account for org ${organization.id} in sandbox:`,
          err,
        );
      });
    }

    return organization;
  }

  /**
   * Ensures a sandbox org has a verified Stripe test account, creating one if
   * missing, and returns its `accounts.id`. Idempotent: returns the existing
   * account_id when already provisioned. No-op outside sandbox (returns null),
   * letting callers surface the normal "complete onboarding" path.
   *
   * Used both as a fire-and-forget pre-warm at org creation and as a lazy
   * self-heal by flows that require an account (e.g. product creation), which
   * covers the timing window where the pre-warm hasn't finished yet.
   */
  async ensureSandboxStripeAccount(
    user: User,
    organization: { id: string; name: string },
  ): Promise<string | null> {
    const supabase = this.supabaseService.getClient();

    // Re-read in case the account was provisioned concurrently.
    const { data: org } = await supabase
      .from('organizations')
      .select('account_id')
      .eq('id', organization.id)
      .single();

    if (org?.account_id) return org.account_id;

    if (this.configService.get<string>('NODE_ENV') !== 'sandbox') return null;

    const { account: stripeAccount } =
      await this.stripeService.createConnectAccountSmart({
        email: user.email,
        country: 'US',
        organizationName: organization.name,
      });

    const { data: account, error: insertError } = await supabase
      .from('accounts')
      .insert({
        account_type: 'stripe',
        admin_id: user.id,
        stripe_id: stripeAccount.id,
        email: stripeAccount.email || user.email,
        country: stripeAccount.country || 'US',
        currency: stripeAccount.default_currency || 'usd',
        is_details_submitted: true,
        is_charges_enabled: true,
        is_payouts_enabled: true,
        business_type: 'individual',
        status: 'active',
        auto_created: true,
        test_mode: true,
        data: stripeAccount as any,
        platform_fee_percent: 60,
        platform_fee_fixed: 10,
      })
      .select()
      .single();

    if (insertError || !account) {
      this.logger.error('Failed to insert auto-created account:', insertError);
      return null;
    }

    await supabase
      .from('organizations')
      .update({
        account_id: account.id,
        status: 'active',
        status_updated_at: new Date().toISOString(),
        default_currency: getCurrencyForCountry(stripeAccount.country || 'US'),
      })
      .eq('id', organization.id);

    this.logger.log(
      `Auto-created Stripe test account ${stripeAccount.id} for org ${organization.id}`,
    );

    return account.id;
  }

  /**
   * Get all organizations for a user
   */
  async findAll(userId: string): Promise<Organization[]> {
    const supabase = this.supabaseService.getClient();

    // First get organization IDs for the user
    const { data: memberships, error: memberError } = await supabase
      .from('user_organizations')
      .select('organization_id')
      .eq('user_id', userId)
      .is('deleted_at', null);

    if (memberError) {
      this.logger.error('Failed to fetch user organizations:', memberError);
      throw new Error('Failed to fetch user organizations');
    }

    if (!memberships || memberships.length === 0) {
      return [];
    }

    const orgIds = memberships.map((m) => m.organization_id);

    // Then get organizations
    const { data, error } = await supabase
      .from('organizations')
      .select('*')
      .in('id', orgIds)
      .is('deleted_at', null)
      .order('created_at', { ascending: false });

    if (error) {
      this.logger.error('Failed to fetch organizations:', error);
      throw new Error('Failed to fetch organizations');
    }

    return data || [];
  }

  /**
   * Get organization by ID
   */
  async findOne(id: string, userId: string): Promise<Organization> {
    const supabase = this.supabaseService.getClient();

    // Check if user is member
    await this.checkMembership(id, userId);

    const { data, error } = await supabase
      .from('organizations')
      .select('*')
      .eq('id', id)
      .is('deleted_at', null)
      .single();

    if (error || !data) {
      throw new NotFoundException('Organization not found');
    }

    return data;
  }

  /**
   * Update organization
   */
  async update(
    id: string,
    userId: string,
    updateDto: UpdateOrganizationDto,
  ): Promise<Organization> {
    const supabase = this.supabaseService.getClient();

    // Check if user is admin (if account exists) or member (if no account yet)
    const org = await this.findOne(id, userId);

    if (org.account_id) {
      await this.checkIsAdmin(id, userId);
    } else {
      await this.checkMembership(id, userId);
    }

    const { data, error } = await supabase
      .from('organizations')
      .update(updateDto)
      .eq('id', id)
      .is('deleted_at', null)
      .select()
      .single();

    if (error || !data) {
      this.logger.error('Failed to update organization:', error);
      throw new Error('Failed to update organization');
    }

    this.logger.log(`Organization updated: ${id} by user ${userId}`);
    return data;
  }

  /**
   * Delete organization end-to-end.
   *
   * - Deauthorizes the OAuth-connected Stripe account (Standard). Express is
   *   paused product-side; reused teardown still handles it for parity with
   *   the standalone disconnect flow.
   * - Revokes all session tokens and API keys for the org (SDK calls 401).
   * - Soft-deletes memberships.
   * - Soft-deletes the org row and renames the slug so it can be re-used —
   *   idx_organizations_slug is a full-table UNIQUE index.
   *
   * Subscriptions, customers, invoices etc. on the merchant's Stripe account
   * are deliberately not touched. The UI warns the user that active
   * subscriptions will keep billing through Stripe.
   */
  async remove(id: string, userId: string): Promise<void> {
    const supabase = this.supabaseService.getClient();

    await this.checkIsAdmin(id, userId);

    const { data: org, error: loadErr } = await supabase
      .from('organizations')
      .select('id, slug, account_id')
      .eq('id', id)
      .is('deleted_at', null)
      .single();

    if (loadErr || !org) {
      throw new NotFoundException('Organization not found');
    }

    if (org.account_id) {
      await this.accountService.teardownForOrganizationDelete(id, userId);
    }

    const now = new Date().toISOString();

    const { error: tokenErr } = await supabase
      .from('session_tokens')
      .update({ revoked_at: now })
      .eq('organization_id', id)
      .is('revoked_at', null);

    if (tokenErr) {
      this.logger.error('Failed to revoke session tokens:', tokenErr);
      throw new Error('Failed to revoke session tokens');
    }

    const { error: keyErr } = await supabase
      .from('api_keys')
      .update({ revoked_at: now })
      .eq('organization_id', id)
      .is('revoked_at', null);

    if (keyErr) {
      this.logger.error('Failed to revoke API keys:', keyErr);
      throw new Error('Failed to revoke API keys');
    }

    const { error: memberErr } = await supabase
      .from('user_organizations')
      .update({ deleted_at: now })
      .eq('organization_id', id)
      .is('deleted_at', null);

    if (memberErr) {
      this.logger.error('Failed to soft-delete memberships:', memberErr);
      throw new Error('Failed to soft-delete memberships');
    }

    const freedSlug = `${org.slug}-deleted-${Date.now()}`;
    const { error: delErr } = await supabase
      .from('organizations')
      .update({ deleted_at: now, slug: freedSlug })
      .eq('id', id)
      .is('deleted_at', null);

    if (delErr) {
      this.logger.error('Failed to soft-delete organization:', delErr);
      throw new Error('Failed to delete organization');
    }

    this.logger.log(`Organization deleted: ${id} by user ${userId}`);
  }

  /**
   * Submit business details for onboarding
   */
  async submitBusinessDetails(
    id: string,
    userId: string,
    detailsDto: SubmitBusinessDetailsDto,
  ): Promise<Organization> {
    const supabase = this.supabaseService.getClient();

    // Check membership
    await this.checkMembership(id, userId);

    const { data, error } = await supabase
      .from('organizations')
      .update({
        details: detailsDto,
        details_submitted_at: new Date().toISOString(),
      })
      .eq('id', id)
      .is('deleted_at', null)
      .select()
      .single();

    if (error || !data) {
      this.logger.error('Failed to submit business details:', error);
      throw new Error('Failed to submit business details');
    }

    this.logger.log(`Business details submitted for organization: ${id}`);
    return data;
  }

  /**
   * Get organization members
   */
  async getMembers(
    organizationId: string,
    userId: string,
  ): Promise<OrganizationMember[]> {
    const supabase = this.supabaseService.getClient();

    // Check membership
    await this.checkMembership(organizationId, userId);

    // Get organization to find admin
    const { data: org } = await supabase
      .from('organizations')
      .select('account_id')
      .eq('id', organizationId)
      .single();

    let adminId: string | null = null;
    if (org?.account_id) {
      const { data: account } = await supabase
        .from('accounts')
        .select('admin_id')
        .eq('id', org.account_id)
        .single();

      adminId = account?.admin_id || null;
    }

    // Get members with user details
    const { data, error } = await supabase
      .from('user_organizations')
      .select(
        `
        *,
        users!inner (
          id,
          email,
          avatar_url
        )
      `,
      )
      .eq('organization_id', organizationId)
      .is('deleted_at', null);

    if (error) {
      this.logger.error('Failed to fetch members:', error);
      throw new Error('Failed to fetch members');
    }

    // Map and add is_admin flag
    return (data || []).map((member: any) => ({
      ...member,
      email: member.users.email,
      avatar_url: member.users.avatar_url,
      is_admin: member.user_id === adminId,
    }));
  }

  /**
   * Invite member to organization
   */
  async inviteMember(
    organizationId: string,
    userId: string,
    email: string,
  ): Promise<OrganizationMember> {
    const supabase = this.supabaseService.getClient();

    // Check if user is admin (if account exists) or member (if no account yet)
    const org = await this.findOne(organizationId, userId);

    if (org.account_id) {
      await this.checkIsAdmin(organizationId, userId);
    } else {
      await this.checkMembership(organizationId, userId);
    }

    // Find user by email
    const { data: existingUser } = await supabase
      .from('users')
      .select('id')
      .eq('email', email.toLowerCase())
      .is('deleted_at', null)
      .single();

    if (!existingUser) {
      throw new NotFoundException(
        'User not found. They need to sign up first before being invited.',
      );
    }

    const invitedUserId = existingUser.id;

    // Check if already a member
    const { data: existingMember } = await supabase
      .from('user_organizations')
      .select('user_id')
      .eq('organization_id', organizationId)
      .eq('user_id', invitedUserId)
      .is('deleted_at', null)
      .single();

    if (existingMember) {
      throw new ConflictException(
        'User is already a member of this organization',
      );
    }

    // Add to organization
    const { data, error } = await supabase
      .from('user_organizations')
      .insert({
        user_id: invitedUserId,
        organization_id: organizationId,
      })
      .select()
      .single();

    if (error) {
      this.logger.error('Failed to add member:', error);
      throw new ConflictException('Failed to add member to organization');
    }

    this.logger.log(
      `User ${invitedUserId} invited to organization ${organizationId}`,
    );

    // TODO: Send invitation email

    // Return member with user details
    const { data: userDetails } = await supabase
      .from('users')
      .select('id, email, avatar_url')
      .eq('id', invitedUserId)
      .single();

    return {
      ...data,
      email: userDetails?.email,
      avatar_url: userDetails?.avatar_url,
      is_admin: false,
    };
  }

  /**
   * Remove member from organization
   */
  async removeMember(
    organizationId: string,
    userId: string,
    memberUserId: string,
  ): Promise<void> {
    const supabase = this.supabaseService.getClient();

    // Only admin can remove members
    await this.checkIsAdmin(organizationId, userId);

    // Can't remove admin
    const { data: account } = await supabase
      .from('organizations')
      .select('account_id, accounts!inner(admin_id)')
      .eq('id', organizationId)
      .single();

    if (account?.accounts?.admin_id === memberUserId) {
      throw new ForbiddenException('Cannot remove organization admin');
    }

    // Soft delete membership
    const { error } = await supabase
      .from('user_organizations')
      .update({ deleted_at: new Date().toISOString() })
      .eq('organization_id', organizationId)
      .eq('user_id', memberUserId);

    if (error) {
      this.logger.error('Failed to remove member:', error);
      throw new Error('Failed to remove member');
    }

    this.logger.log(
      `User ${memberUserId} removed from organization ${organizationId}`,
    );
  }

  /**
   * Leave organization (non-admins only)
   */
  async leaveOrganization(
    organizationId: string,
    userId: string,
  ): Promise<void> {
    const supabase = this.supabaseService.getClient();

    // Check if user is admin
    const isAdmin = await this.isAdmin(organizationId, userId);

    if (isAdmin) {
      throw new ForbiddenException(
        'Admin cannot leave organization. Transfer ownership or delete the organization instead.',
      );
    }

    // Soft delete membership
    const { error } = await supabase
      .from('user_organizations')
      .update({ deleted_at: new Date().toISOString() })
      .eq('organization_id', organizationId)
      .eq('user_id', userId);

    if (error) {
      this.logger.error('Failed to leave organization:', error);
      throw new Error('Failed to leave organization');
    }

    this.logger.log(`User ${userId} left organization ${organizationId}`);
  }

  /**
   * Get payment setup status for organization
   */
  async getPaymentStatus(
    organizationId: string,
    userId: string,
  ): Promise<PaymentStatus> {
    const supabase = this.supabaseService.getClient();

    // Check membership
    await this.checkMembership(organizationId, userId);

    // Get organization with account
    const { data: org, error } = await supabase
      .from('organizations')
      .select('*, accounts(*)')
      .eq('id', organizationId)
      .is('deleted_at', null)
      .single();

    if (error || !org) {
      throw new NotFoundException('Organization not found');
    }

    const account = Array.isArray(org.accounts)
      ? org.accounts[0]
      : org.accounts;

    const steps: PaymentStep[] = [];

    // Step 1: Submit business details
    steps.push({
      id: 'business_details',
      title: 'Business Details',
      description: 'Tell us about your business',
      completed: !!org.details_submitted_at,
      href: `/dashboard/${org.slug}/onboarding`,
    });

    // Step 2: Setup Stripe account
    steps.push({
      id: 'setup_account',
      title: 'Setup Payouts',
      description: 'Connect your bank account with Stripe',
      completed: account?.is_payouts_enabled || false,
      href: `/dashboard/${org.slug}/settings/billing`,
    });

    // Step 3: Identity verification
    const { data: admin } = await supabase
      .from('users')
      .select('identity_verification_status')
      .eq('id', account?.admin_id || '')
      .single();

    steps.push({
      id: 'identity_verification',
      title: 'Identity Verification',
      description: 'Verify your identity',
      completed: admin?.identity_verification_status === 'verified',
      href: `/dashboard/${org.slug}/settings/billing`,
    });

    const paymentReady = steps.every((step) => step.completed);

    return {
      payment_ready: paymentReady,
      steps,
      account_status: !account
        ? 'not_created'
        : account.is_payouts_enabled
          ? 'active'
          : 'onboarding',
      is_details_submitted: !!org.details_submitted_at, // Check organization's business details submission
      is_charges_enabled: account?.is_charges_enabled,
      is_payouts_enabled: account?.is_payouts_enabled,
    };
  }

  /**
   * Generate a signed upload URL for organization avatar
   */
  async generateAvatarUploadUrl(
    orgId: string,
    userId: string,
    fileName: string,
    contentType: string,
  ): Promise<{ signedUrl: string; publicUrl: string; path: string }> {
    const supabase = this.supabaseService.getClient();

    // Check membership
    await this.checkMembership(orgId, userId);

    // Build storage path
    const timestamp = Date.now();
    const sanitizedName = fileName.replace(/[^a-zA-Z0-9._-]/g, '_');
    const path = `avatars/${orgId}/${timestamp}-${sanitizedName}`;

    // Create signed upload URL (valid 5 min)
    const { data, error } = await supabase.storage
      .from('org-assets')
      .createSignedUploadUrl(path);

    if (error || !data) {
      this.logger.error('Failed to generate upload URL:', error);
      throw new Error('Failed to generate upload URL');
    }

    // Compute public URL
    const { data: publicUrlData } = supabase.storage
      .from('org-assets')
      .getPublicUrl(path);

    return {
      signedUrl: data.signedUrl,
      publicUrl: publicUrlData.publicUrl,
      path,
    };
  }

  /**
   * Get onboarding status for an organization
   */
  async getOnboardingStatus(
    organizationId: string,
    userId: string,
    environment: 'sandbox' | 'production' = 'sandbox',
  ) {
    const supabase = this.supabaseService.getClient();

    await this.checkMembership(organizationId, userId);

    const { data: org } = await supabase
      .from('organizations')
      .select('*, accounts(*)')
      .eq('id', organizationId)
      .is('deleted_at', null)
      .single();

    if (!org) {
      throw new NotFoundException('Organization not found');
    }

    const account = Array.isArray(org.accounts)
      ? org.accounts[0]
      : org.accounts;

    if (environment === 'sandbox') {
      // Sandbox steps
      const { count: productCount } = await supabase
        .from('products')
        .select('*', { count: 'exact', head: true })
        .eq('organization_id', organizationId)
        .eq('is_archived', false)
        .neq('version_status', 'superseded');

      const { data: testKeys } = await supabase
        .from('api_keys')
        .select('id, last_used_at')
        .eq('organization_id', organizationId)
        .eq('environment', 'test')
        .is('revoked_at', null);

      const hasTestKeys = (testKeys?.length || 0) > 0;
      const sdkUsed = testKeys?.some((k) => k.last_used_at !== null) || false;

      const { count: paymentCount } = await supabase
        .from('payment_intents')
        .select('*', { count: 'exact', head: true })
        .eq('organization_id', organizationId)
        .eq('status', 'succeeded');

      const steps = [
        {
          id: 'create_org',
          label: 'Create organization',
          description: 'Set up your BillingOS organization',
          completed: true,
          href: `/dashboard/${org.slug}/settings`,
        },
        {
          id: 'create_product',
          label: 'Create a product',
          description: 'Define your first product with pricing',
          completed: (productCount || 0) > 0,
          href: `/dashboard/${org.slug}/products`,
        },
        {
          id: 'generate_test_keys',
          label: 'Generate test API keys',
          description: 'Create API keys for SDK integration',
          completed: hasTestKeys,
          href: `/dashboard/${org.slug}/settings/api-keys`,
        },
        {
          id: 'integrate_sdk',
          label: 'Integrate SDK',
          description: 'Make your first API call with the SDK',
          completed: sdkUsed,
          href: 'https://docs.billingos.dev/quickstart',
        },
        {
          id: 'test_payment',
          label: 'Make a test payment',
          description: 'Complete a test checkout flow',
          completed: (paymentCount || 0) > 0,
          href: `/dashboard/${org.slug}/finance`,
        },
      ];

      const completedCount = steps.filter((s) => s.completed).length;

      return {
        phase: 'sandbox' as const,
        steps,
        completed_count: completedCount,
        total_count: steps.length,
        all_complete: completedCount === steps.length,
      };
    }

    // Production steps
    const paymentReady =
      account?.is_charges_enabled && account?.is_payouts_enabled;

    const { count: productCount } = await supabase
      .from('products')
      .select('*', { count: 'exact', head: true })
      .eq('organization_id', organizationId)
      .eq('is_archived', false)
      .neq('version_status', 'superseded');

    const { data: liveKeys } = await supabase
      .from('api_keys')
      .select('id')
      .eq('organization_id', organizationId)
      .eq('environment', 'live')
      .is('revoked_at', null);

    const steps = [
      {
        id: 'verify_stripe',
        label: 'Verify Stripe account',
        description: 'Complete Stripe identity verification',
        completed: !!paymentReady,
        href: `/dashboard/${org.slug}/settings/billing`,
      },
      {
        id: 'create_products',
        label: 'Create products',
        description: 'Set up your product catalog',
        completed: (productCount || 0) > 0,
        href: `/dashboard/${org.slug}/products`,
      },
      {
        id: 'generate_live_keys',
        label: 'Generate production API keys',
        description: 'Create live API keys for production',
        completed: (liveKeys?.length || 0) > 0,
        href: `/dashboard/${org.slug}/settings/api-keys`,
      },
    ];

    const completedCount = steps.filter((s) => s.completed).length;

    return {
      phase: 'production' as const,
      steps,
      completed_count: completedCount,
      total_count: steps.length,
      all_complete: completedCount === steps.length,
    };
  }

  /**
   * Remove organization avatar from storage and clear avatar_url
   */
  async removeAvatar(orgId: string, userId: string): Promise<void> {
    const supabase = this.supabaseService.getClient();

    await this.checkMembership(orgId, userId);

    // Get current avatar URL to extract path
    const { data: org } = await supabase
      .from('organizations')
      .select('avatar_url')
      .eq('id', orgId)
      .single();

    if (org?.avatar_url) {
      // Extract path from public URL — path is after /object/public/org-assets/
      const match = org.avatar_url.match(/\/org-assets\/(.+)$/);
      if (match) {
        await supabase.storage.from('org-assets').remove([match[1]]);
      }
    }

    // Clear avatar_url on org
    await supabase
      .from('organizations')
      .update({ avatar_url: null })
      .eq('id', orgId);

    this.logger.log(`Avatar removed for organization: ${orgId}`);
  }

  /**
   * Helper: Generate slug from name
   */
  private generateSlug(name: string): string {
    return name
      .toLowerCase()
      .replace(/[^a-z0-9\s-]/g, '') // Remove special characters
      .replace(/\s+/g, '-') // Replace spaces with hyphens
      .replace(/-+/g, '-') // Replace multiple hyphens with single
      .replace(/^-|-$/g, ''); // Remove leading/trailing hyphens
  }

  /**
   * Helper: Check if user is member of organization
   */
  private async checkMembership(
    organizationId: string,
    userId: string,
  ): Promise<void> {
    const supabase = this.supabaseService.getClient();

    const { data, error } = await supabase
      .from('user_organizations')
      .select('user_id')
      .eq('organization_id', organizationId)
      .eq('user_id', userId)
      .is('deleted_at', null)
      .single();

    if (error || !data) {
      throw new ForbiddenException('You are not a member of this organization');
    }
  }

  /**
   * Helper: Check if user is admin of organization
   */
  private async checkIsAdmin(
    organizationId: string,
    userId: string,
  ): Promise<void> {
    const isAdmin = await this.isAdmin(organizationId, userId);

    if (!isAdmin) {
      throw new ForbiddenException(
        'Only organization admin can perform this action',
      );
    }
  }

  /**
   * Helper: Check if user is admin.
   *
   * Once a Stripe account is connected, the account's `admin_id` is the
   * sole admin. Before Stripe is connected there's no role distinction in
   * the data model, so any active member is treated as an admin — without
   * this fallback, orgs in the "created" state become un-administratable
   * (can't be updated, can't be deleted).
   */
  private async isAdmin(
    organizationId: string,
    userId: string,
  ): Promise<boolean> {
    const supabase = this.supabaseService.getClient();

    const { data: org } = await supabase
      .from('organizations')
      .select('account_id')
      .eq('id', organizationId)
      .is('deleted_at', null)
      .maybeSingle();

    if (!org) return false;

    if (org.account_id) {
      const { data: account } = await supabase
        .from('accounts')
        .select('admin_id')
        .eq('id', org.account_id)
        .is('deleted_at', null)
        .maybeSingle();

      return account?.admin_id === userId;
    }

    const { data: membership } = await supabase
      .from('user_organizations')
      .select('user_id')
      .eq('organization_id', organizationId)
      .eq('user_id', userId)
      .is('deleted_at', null)
      .maybeSingle();

    return !!membership;
  }

  /**
   * Update the organization's default charge currency.
   * Locked after first product is created (except in sandbox mode).
   */
  async updateCurrency(
    organizationId: string,
    userId: string,
    dto: UpdateCurrencyDto,
  ): Promise<{ default_currency: string }> {
    await this.checkMembership(organizationId, userId);

    const currency = dto.currency.toLowerCase();
    if (!isSupportedCurrency(currency)) {
      throw new BadRequestException(`Unsupported currency: ${dto.currency}`);
    }

    const supabase = this.supabaseService.getClient();

    // Lock check: prevent changes after first product (except sandbox)
    const isSandbox = process.env.NODE_ENV === 'sandbox';
    if (!isSandbox) {
      const { count } = await supabase
        .from('products')
        .select('id', { count: 'exact', head: true })
        .eq('organization_id', organizationId)
        .is('is_archived', false);

      if (count && count > 0) {
        throw new BadRequestException(
          'Currency cannot be changed after products have been created',
        );
      }
    }

    const { error } = await supabase
      .from('organizations')
      .update({ default_currency: currency })
      .eq('id', organizationId);

    if (error) {
      throw new BadRequestException('Failed to update currency');
    }

    return { default_currency: currency };
  }

  /**
   * Get the default currency for an organization.
   * Returns 'usd' as fallback.
   */
  async getDefaultCurrency(organizationId: string): Promise<string> {
    const supabase = this.supabaseService.getClient();

    const { data } = await supabase
      .from('organizations')
      .select('default_currency')
      .eq('id', organizationId)
      .single();

    return data?.default_currency || 'usd';
  }
}

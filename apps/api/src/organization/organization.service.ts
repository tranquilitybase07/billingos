import {
  Injectable,
  Logger,
  NotFoundException,
  ConflictException,
  ForbiddenException,
  BadRequestException,
  GoneException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { randomBytes, createHash } from 'crypto';
import { SupabaseService } from '../supabase/supabase.service';
import { StripeService } from '../stripe/stripe.service';
import { EmailService } from '../email/email.service';
import { User } from '../user/entities/user.entity';
import { CreateOrganizationDto } from './dto/create-organization.dto';
import { UpdateOrganizationDto } from './dto/update-organization.dto';
import { SubmitBusinessDetailsDto } from './dto/submit-business-details.dto';
import {
  InvitationLookup,
  Organization,
  OrganizationInvitation,
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
    private readonly configService: ConfigService,
    private readonly emailService: EmailService,
  ) {}

  private hashToken(rawToken: string): string {
    return createHash('sha256').update(rawToken).digest('hex');
  }

  private buildInviteUrl(rawToken: string): string {
    const appUrl =
      this.configService.get<string>('APP_URL') ||
      this.configService.get<string>('NEXT_PUBLIC_APP_URL') ||
      'http://localhost:3000';
    return `${appUrl.replace(/\/$/, '')}/invite/${rawToken}`;
  }

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

    // In sandbox mode, auto-create and auto-verify a Stripe test account
    if (this.configService.get<string>('NODE_ENV') === 'sandbox') {
      this.autoCreateSandboxStripeAccount(user, organization).catch((err) => {
        this.logger.error(
          `Failed to auto-create Stripe account for org ${organization.id} in sandbox:`,
          err,
        );
      });
    }

    return organization;
  }

  /**
   * Auto-creates a verified Stripe test account for sandbox orgs.
   * Runs asynchronously — org creation never blocks on this.
   */
  private async autoCreateSandboxStripeAccount(
    user: User,
    organization: any,
  ): Promise<void> {
    const supabase = this.supabaseService.getClient();

    // Check org doesn't already have an account
    const { data: org } = await supabase
      .from('organizations')
      .select('account_id')
      .eq('id', organization.id)
      .single();

    if (org?.account_id) return;

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
      return;
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
   * Delete organization (soft delete)
   */
  async remove(id: string, userId: string): Promise<void> {
    const supabase = this.supabaseService.getClient();

    // Only admin can delete
    await this.checkIsAdmin(id, userId);

    const { error } = await supabase
      .from('organizations')
      .update({ deleted_at: new Date().toISOString() })
      .eq('id', id);

    if (error) {
      this.logger.error('Failed to delete organization:', error);
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
   * Create a pending invitation and email the invitee a magic accept link.
   * Works regardless of whether the invitee already has an account.
   */
  async inviteMember(
    organizationId: string,
    userId: string,
    email: string,
    role: 'admin' | 'member' = 'member',
  ): Promise<OrganizationInvitation> {
    const supabase = this.supabaseService.getClient();
    const normalizedEmail = email.toLowerCase().trim();

    const org = await this.findOne(organizationId, userId);

    if (org.account_id) {
      await this.checkIsAdmin(organizationId, userId);
    } else {
      await this.checkMembership(organizationId, userId);
    }

    // Reject if invitee already has an active membership
    const { data: existingMember } = await supabase
      .from('user_organizations')
      .select('user_id, users!inner(email)')
      .eq('organization_id', organizationId)
      .is('deleted_at', null)
      .eq('users.email', normalizedEmail)
      .maybeSingle();

    if (existingMember) {
      throw new ConflictException(
        'A member with this email already belongs to the organization',
      );
    }

    // Reject if a pending invite already exists for this email
    const { data: existingPending } = await supabase
      .from('organization_invitations')
      .select('id')
      .eq('organization_id', organizationId)
      .eq('email', normalizedEmail)
      .eq('status', 'pending')
      .maybeSingle();

    if (existingPending) {
      throw new ConflictException(
        'An invitation has already been sent to this email. Resend or revoke it from the Members page.',
      );
    }

    const rawToken = randomBytes(32).toString('hex');
    const tokenHash = this.hashToken(rawToken);

    const { data: invitation, error } = await supabase
      .from('organization_invitations')
      .insert({
        organization_id: organizationId,
        email: normalizedEmail,
        role,
        token_hash: tokenHash,
        invited_by: userId,
      })
      .select()
      .single();

    if (error || !invitation) {
      this.logger.error('Failed to create invitation:', error);
      throw new ConflictException('Failed to create invitation');
    }

    const { data: inviter } = await supabase
      .from('users')
      .select('email')
      .eq('id', userId)
      .single();

    await this.emailService.sendInvitationEmail({
      to: normalizedEmail,
      organizationName: org.name,
      inviterEmail: inviter?.email || 'BillingOS',
      inviteUrl: this.buildInviteUrl(rawToken),
      expiresAt: new Date(invitation.expires_at),
    });

    this.logger.log(
      `Invitation ${invitation.id} sent to ${normalizedEmail} for org ${organizationId}`,
    );

    return {
      id: invitation.id,
      organization_id: invitation.organization_id,
      email: invitation.email,
      role: invitation.role as 'admin' | 'member',
      status: invitation.status as OrganizationInvitation['status'],
      expires_at: invitation.expires_at,
      accepted_at: invitation.accepted_at,
      invited_by: invitation.invited_by,
      invited_by_email: inviter?.email,
      created_at: invitation.created_at,
    };
  }

  /**
   * List pending invitations for the Members page.
   */
  async listInvitations(
    organizationId: string,
    userId: string,
  ): Promise<OrganizationInvitation[]> {
    const supabase = this.supabaseService.getClient();
    await this.checkMembership(organizationId, userId);

    const { data, error } = await supabase
      .from('organization_invitations')
      .select(
        'id, organization_id, email, role, status, expires_at, accepted_at, invited_by, created_at, users:invited_by(email)',
      )
      .eq('organization_id', organizationId)
      .eq('status', 'pending')
      .order('created_at', { ascending: false });

    if (error) {
      this.logger.error('Failed to list invitations:', error);
      throw new Error('Failed to list invitations');
    }

    return (data || []).map((row: any) => ({
      id: row.id,
      organization_id: row.organization_id,
      email: row.email,
      role: row.role,
      status: row.status,
      expires_at: row.expires_at,
      accepted_at: row.accepted_at,
      invited_by: row.invited_by,
      invited_by_email: row.users?.email,
      created_at: row.created_at,
    }));
  }

  /**
   * Revoke a pending invitation.
   */
  async revokeInvitation(
    organizationId: string,
    userId: string,
    invitationId: string,
  ): Promise<void> {
    const supabase = this.supabaseService.getClient();
    await this.checkIsAdmin(organizationId, userId);

    const { data, error } = await supabase
      .from('organization_invitations')
      .update({ status: 'revoked' })
      .eq('id', invitationId)
      .eq('organization_id', organizationId)
      .eq('status', 'pending')
      .select('id')
      .maybeSingle();

    if (error) {
      this.logger.error('Failed to revoke invitation:', error);
      throw new Error('Failed to revoke invitation');
    }

    if (!data) {
      throw new NotFoundException('Pending invitation not found');
    }
  }

  /**
   * Resend the invitation email. Rotates the token and bumps expiry.
   */
  async resendInvitation(
    organizationId: string,
    userId: string,
    invitationId: string,
  ): Promise<OrganizationInvitation> {
    const supabase = this.supabaseService.getClient();
    await this.checkIsAdmin(organizationId, userId);

    const { data: existing } = await supabase
      .from('organization_invitations')
      .select('id, email, status')
      .eq('id', invitationId)
      .eq('organization_id', organizationId)
      .single();

    if (!existing || existing.status !== 'pending') {
      throw new NotFoundException('Pending invitation not found');
    }

    const rawToken = randomBytes(32).toString('hex');
    const tokenHash = this.hashToken(rawToken);
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

    const { data: invitation, error } = await supabase
      .from('organization_invitations')
      .update({
        token_hash: tokenHash,
        expires_at: expiresAt.toISOString(),
      })
      .eq('id', invitationId)
      .select()
      .single();

    if (error || !invitation) {
      this.logger.error('Failed to resend invitation:', error);
      throw new Error('Failed to resend invitation');
    }

    const org = await this.findOne(organizationId, userId);
    const { data: inviter } = await supabase
      .from('users')
      .select('email')
      .eq('id', userId)
      .single();

    await this.emailService.sendInvitationEmail({
      to: invitation.email,
      organizationName: org.name,
      inviterEmail: inviter?.email || 'BillingOS',
      inviteUrl: this.buildInviteUrl(rawToken),
      expiresAt,
    });

    return {
      id: invitation.id,
      organization_id: invitation.organization_id,
      email: invitation.email,
      role: invitation.role as 'admin' | 'member',
      status: invitation.status as OrganizationInvitation['status'],
      expires_at: invitation.expires_at,
      accepted_at: invitation.accepted_at,
      invited_by: invitation.invited_by,
      invited_by_email: inviter?.email,
      created_at: invitation.created_at,
    };
  }

  /**
   * Public lookup for the /invite/[token] page. Hashes the raw token and joins org + inviter.
   */
  async lookupInvitation(rawToken: string): Promise<InvitationLookup> {
    const supabase = this.supabaseService.getClient();
    const tokenHash = this.hashToken(rawToken);

    const { data: invitation } = await supabase
      .from('organization_invitations')
      .select(
        `
        id,
        email,
        role,
        status,
        expires_at,
        organization:organizations!inner ( id, name, slug, avatar_url ),
        inviter:users!organization_invitations_invited_by_fkey ( email )
        `,
      )
      .eq('token_hash', tokenHash)
      .single();

    if (!invitation) {
      throw new NotFoundException('Invitation not found');
    }

    if (invitation.status !== 'pending') {
      throw new GoneException(`Invitation already ${invitation.status}`);
    }

    if (new Date(invitation.expires_at) < new Date()) {
      await supabase
        .from('organization_invitations')
        .update({ status: 'expired' })
        .eq('id', invitation.id);
      throw new GoneException('Invitation has expired');
    }

    const org: any = Array.isArray(invitation.organization)
      ? invitation.organization[0]
      : invitation.organization;
    const inviter: any = Array.isArray(invitation.inviter)
      ? invitation.inviter[0]
      : invitation.inviter;

    return {
      id: invitation.id,
      email: invitation.email,
      role: invitation.role as 'admin' | 'member',
      status: invitation.status as InvitationLookup['status'],
      expires_at: invitation.expires_at,
      organization: {
        id: org?.id,
        name: org?.name,
        slug: org?.slug,
        avatar_url: org?.avatar_url ?? null,
      },
      inviter: {
        email: inviter?.email ?? '',
      },
    };
  }

  /**
   * Accept an invitation. Caller must be authenticated; their email must match
   * the invitation. Creates the membership and marks the invitation accepted.
   */
  async acceptInvitation(
    rawToken: string,
    user: User,
  ): Promise<{ organizationSlug: string; organizationId: string }> {
    const supabase = this.supabaseService.getClient();
    const tokenHash = this.hashToken(rawToken);

    const { data: invitation } = await supabase
      .from('organization_invitations')
      .select('id, organization_id, email, status, expires_at')
      .eq('token_hash', tokenHash)
      .single();

    if (!invitation) {
      throw new NotFoundException('Invitation not found');
    }

    if (invitation.status !== 'pending') {
      throw new GoneException(`Invitation already ${invitation.status}`);
    }

    if (new Date(invitation.expires_at) < new Date()) {
      await supabase
        .from('organization_invitations')
        .update({ status: 'expired' })
        .eq('id', invitation.id);
      throw new GoneException('Invitation has expired');
    }

    if (invitation.email.toLowerCase() !== user.email.toLowerCase()) {
      throw new ForbiddenException(
        `This invitation was sent to ${invitation.email}. Sign in with that email to accept.`,
      );
    }

    // Reactivate a soft-deleted membership if one exists, otherwise insert.
    const { data: existingMembership } = await supabase
      .from('user_organizations')
      .select('user_id, deleted_at')
      .eq('organization_id', invitation.organization_id)
      .eq('user_id', user.id)
      .maybeSingle();

    if (existingMembership) {
      if (existingMembership.deleted_at) {
        const { error: reactivateErr } = await supabase
          .from('user_organizations')
          .update({ deleted_at: null })
          .eq('organization_id', invitation.organization_id)
          .eq('user_id', user.id);
        if (reactivateErr) {
          this.logger.error('Failed to reactivate membership:', reactivateErr);
          throw new Error('Failed to accept invitation');
        }
      }
    } else {
      const { error: insertErr } = await supabase
        .from('user_organizations')
        .insert({
          user_id: user.id,
          organization_id: invitation.organization_id,
        });
      if (insertErr) {
        this.logger.error('Failed to create membership:', insertErr);
        throw new Error('Failed to accept invitation');
      }
    }

    await supabase
      .from('organization_invitations')
      .update({
        status: 'accepted',
        accepted_at: new Date().toISOString(),
        accepted_by: user.id,
      })
      .eq('id', invitation.id);

    // Mark the user as onboarded so middleware doesn't bounce them to /onboarding.
    await supabase
      .from('users')
      .update({ onboarding_step: 'complete' })
      .eq('id', user.id)
      .neq('onboarding_step', 'complete');

    const { data: org } = await supabase
      .from('organizations')
      .select('slug')
      .eq('id', invitation.organization_id)
      .single();

    this.logger.log(
      `User ${user.id} accepted invitation ${invitation.id} for org ${invitation.organization_id}`,
    );

    return {
      organizationSlug: org?.slug ?? '',
      organizationId: invitation.organization_id,
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
   * Helper: Check if user is admin
   */
  private async isAdmin(
    organizationId: string,
    userId: string,
  ): Promise<boolean> {
    const supabase = this.supabaseService.getClient();

    const { data } = await supabase
      .from('organizations')
      .select('accounts!inner(admin_id)')
      .eq('id', organizationId)
      .single();

    return data?.accounts?.admin_id === userId;
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

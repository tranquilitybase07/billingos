import {
  Injectable,
  Logger,
  NotFoundException,
  ConflictException,
  ForbiddenException,
} from '@nestjs/common';
import { SupabaseService } from '../supabase/supabase.service';
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

@Injectable()
export class OrganizationService {
  private readonly logger = new Logger(OrganizationService.name);

  constructor(private readonly supabaseService: SupabaseService) {}

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
    return organization;
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
      href: `/dashboard/${org.slug}/finance/account`,
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
      href: `/dashboard/${org.slug}/finance/account`,
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
      is_details_submitted: account?.is_details_submitted,
      is_charges_enabled: account?.is_charges_enabled,
      is_payouts_enabled: account?.is_payouts_enabled,
    };
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
}

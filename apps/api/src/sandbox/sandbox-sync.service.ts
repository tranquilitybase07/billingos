import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createClient, SupabaseClient } from '@supabase/supabase-js';

export interface SyncResult {
  success: boolean;
  action: 'created' | 'updated' | 'already_exists';
  userId: string;
  email?: string;
}

@Injectable()
export class SandboxSyncService {
  private readonly logger = new Logger(SandboxSyncService.name);
  private readonly prodSupabase: SupabaseClient | null = null;
  private readonly sandboxSupabase: SupabaseClient | null = null;
  private readonly isConfigured: boolean = false;

  constructor(private configService: ConfigService) {
    const prodUrl = this.configService.get<string>('SUPABASE_URL');
    const prodKey = this.configService.get<string>('SUPABASE_SERVICE_ROLE_KEY');
    const sandboxUrl = this.configService.get<string>('SANDBOX_SUPABASE_URL');
    const sandboxKey = this.configService.get<string>(
      'SANDBOX_SUPABASE_SERVICE_ROLE_KEY',
    );

    if (prodUrl && prodKey && sandboxUrl && sandboxKey) {
      this.prodSupabase = createClient(prodUrl, prodKey, {
        auth: { persistSession: false },
      });
      this.sandboxSupabase = createClient(sandboxUrl, sandboxKey, {
        auth: { persistSession: false },
      });
      this.isConfigured = true;
      this.logger.log('SandboxSyncService initialized with both environments');
    } else {
      this.logger.warn(
        'SandboxSyncService: missing env vars (SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, SANDBOX_SUPABASE_URL, SANDBOX_SUPABASE_SERVICE_ROLE_KEY). Sync endpoint will be unavailable.',
      );
    }
  }

  get available(): boolean {
    return this.isConfigured;
  }

  async syncUserToSandbox(userId: string): Promise<SyncResult> {
    if (!this.isConfigured || !this.prodSupabase || !this.sandboxSupabase) {
      throw new Error('User sync is only available on the production backend');
    }

    this.logger.log(`Starting sync for user: ${userId}`);

    // Check if user already exists in sandbox
    const { data: existingUser } = await this.sandboxSupabase
      .from('users')
      .select('id, updated_at')
      .eq('id', userId)
      .single();

    if (existingUser) {
      const shouldUpdate = await this.shouldUpdateUser(
        userId,
        existingUser.updated_at,
      );
      if (shouldUpdate) {
        return this.updateSandboxUser(userId);
      }
      return { success: true, action: 'already_exists', userId };
    }

    // Fetch user from production auth
    const {
      data: { user: authUser },
      error: authError,
    } = await this.prodSupabase.auth.admin.getUserById(userId);

    if (authError || !authUser) {
      throw new Error(`User not found in production: ${authError?.message}`);
    }

    // Create user in sandbox auth.users
    const { error: createAuthError } =
      await this.sandboxSupabase.auth.admin.createUser({
        id: authUser.id,
        email: authUser.email!,
        email_confirm: true,
        phone: authUser.phone,
        app_metadata: {
          ...authUser.app_metadata,
          synced_from_production: true,
          sync_date: new Date().toISOString(),
        },
        user_metadata: authUser.user_metadata,
      });

    if (
      createAuthError &&
      !createAuthError.message.includes('already exists')
    ) {
      throw new Error(
        `Failed to create auth user in sandbox: ${createAuthError.message}`,
      );
    }

    // Sync public.users record
    const { data: publicUser } = await this.prodSupabase
      .from('users')
      .select('*')
      .eq('id', userId)
      .single();

    if (publicUser) {
      // Destructure out prod-specific fields so they're never sent to sandbox
      // (sandbox schema may not have all these columns)
      const { stripe_customer_id, subscription_id, last_login_at, ...sandboxUser } = publicUser;
      const { error: insertError } = await this.sandboxSupabase
        .from('users')
        .insert(sandboxUser);

      if (insertError && !insertError.message.includes('duplicate')) {
        throw new Error(
          `Failed to create public user in sandbox: ${insertError.message}`,
        );
      }
    }

    // Sync organization memberships
    await this.syncUserOrganizations(userId);

    this.logger.log(`Successfully synced user ${userId} to sandbox`);
    return { success: true, action: 'created', userId, email: authUser.email };
  }

  async verifyUserExists(userId: string): Promise<boolean> {
    if (!this.sandboxSupabase) return false;
    const { data, error } = await this.sandboxSupabase
      .from('users')
      .select('id')
      .eq('id', userId)
      .single();
    return !error && !!data;
  }

  private async syncUserOrganizations(userId: string): Promise<void> {
    if (!this.prodSupabase || !this.sandboxSupabase) return;

    const { data: memberships, error } = await this.prodSupabase
      .from('user_organizations')
      .select('*, organization:organizations(*)')
      .eq('user_id', userId);

    if (error || !memberships?.length) return;

    for (const membership of memberships) {
      if (membership.organization) {
        await this.sandboxSupabase.from('organizations').upsert({
          id: membership.organization.id,
          name: membership.organization.name,
          slug: membership.organization.slug,
          email: membership.organization.email,
          website: membership.organization.website,
          // Reset production-specific fields
          account_id: null,
          status: 'created',
        });
      }

      await this.sandboxSupabase.from('user_organizations').upsert({
        id: membership.id,
        user_id: membership.user_id,
        organization_id: membership.organization_id,
        role: membership.role,
      });
    }

    this.logger.log(
      `Synced ${memberships.length} organization(s) for user ${userId}`,
    );
  }

  private async shouldUpdateUser(
    userId: string,
    lastSyncDate: string,
  ): Promise<boolean> {
    if (!this.prodSupabase) return false;
    const { data: prodUser } = await this.prodSupabase
      .from('users')
      .select('updated_at')
      .eq('id', userId)
      .single();

    if (!prodUser) return false;
    return new Date(prodUser.updated_at) > new Date(lastSyncDate);
  }

  private async updateSandboxUser(userId: string): Promise<SyncResult> {
    if (!this.prodSupabase || !this.sandboxSupabase) {
      throw new Error('Not configured');
    }

    const { data: prodUser } = await this.prodSupabase
      .from('users')
      .select('*')
      .eq('id', userId)
      .single();

    if (!prodUser) throw new Error('User not found in production');

    const { stripe_customer_id, subscription_id, last_login_at, ...sandboxUser } = prodUser;
    const { error } = await this.sandboxSupabase
      .from('users')
      .update({ ...sandboxUser, updated_at: new Date().toISOString() })
      .eq('id', userId);

    if (error)
      throw new Error(`Failed to update user in sandbox: ${error.message}`);

    await this.syncUserOrganizations(userId);
    return { success: true, action: 'updated', userId };
  }
}

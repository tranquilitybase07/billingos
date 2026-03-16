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
      // Always clean up synced prod org memberships, even if user data is up to date
      await this.cleanupSyncedOrgMemberships(userId);
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

    const alreadyExists =
      createAuthError?.message.includes('already exists') ||
      createAuthError?.message.includes('already been registered') ||
      createAuthError?.message.includes('already registered');
    if (createAuthError && !alreadyExists) {
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
      const {
        stripe_customer_id: _sci1,
        subscription_id: _si1,
        last_login_at: _lla1,
        ...sandboxUser
      } = publicUser;
      const { error: insertError } = await this.sandboxSupabase
        .from('users')
        .upsert(sandboxUser, { onConflict: 'id' });

      if (insertError) {
        throw new Error(
          `Failed to create public user in sandbox: ${insertError.message}`,
        );
      }
    }

    // Clean up any synced prod org memberships from sandbox
    await this.cleanupSyncedOrgMemberships(userId);

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

  private async cleanupSyncedOrgMemberships(userId: string): Promise<void> {
    if (!this.prodSupabase || !this.sandboxSupabase) return;

    const { data: prodMemberships, error } = await this.prodSupabase
      .from('user_organizations')
      .select('organization_id')
      .eq('user_id', userId);

    if (error || !prodMemberships?.length) return;

    const prodOrgIds = prodMemberships.map((m) => m.organization_id);

    const { error: deleteError } = await this.sandboxSupabase
      .from('user_organizations')
      .delete()
      .eq('user_id', userId)
      .in('organization_id', prodOrgIds);

    if (deleteError) {
      this.logger.warn(
        `Failed to clean up synced org memberships for user ${userId}: ${deleteError.message}`,
      );
      return;
    }

    this.logger.log(
      `Cleaned up ${prodOrgIds.length} synced org membership(s) for user ${userId}`,
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

    const {
      stripe_customer_id: _sci2,
      subscription_id: _si2,
      last_login_at: _lla2,
      ...sandboxUser
    } = prodUser;
    const { error } = await this.sandboxSupabase
      .from('users')
      .update({ ...sandboxUser, updated_at: new Date().toISOString() })
      .eq('id', userId);

    if (error)
      throw new Error(`Failed to update user in sandbox: ${error.message}`);

    await this.cleanupSyncedOrgMemberships(userId);
    return { success: true, action: 'updated', userId };
  }
}

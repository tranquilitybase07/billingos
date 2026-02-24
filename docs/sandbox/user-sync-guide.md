# User Synchronization Implementation Guide

## Overview

This guide provides detailed implementation instructions for synchronizing users between production and sandbox environments in BillingOS. User synchronization is essential because while JWT tokens can be validated across environments with a shared secret, user records must exist in both databases.

## The Problem

When using separate Supabase projects for production and sandbox:
1. JWT tokens validate (shared secret) ✅
2. But user records don't exist in sandbox ❌
3. Result: Authentication succeeds but user lookup fails

## The Solution: Lazy User Synchronization

Synchronize users from production to sandbox when they first access the sandbox environment. This approach:
- Minimizes unnecessary syncs
- Keeps sandbox data clean
- Handles both email and OAuth users
- Maintains data isolation

## Implementation Steps

### Step 1: Database Preparation

Ensure both Supabase projects have identical schema:

```sql
-- Run these migrations on BOTH production and sandbox databases

-- Users table (extends auth.users)
CREATE TABLE IF NOT EXISTS public.users (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  full_name TEXT,
  avatar_url TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Organizations table
CREATE TABLE IF NOT EXISTS public.organizations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  slug TEXT UNIQUE NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- User-Organization relationships
CREATE TABLE IF NOT EXISTS public.user_organizations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES public.users(id) ON DELETE CASCADE,
  organization_id UUID REFERENCES public.organizations(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK (role IN ('admin', 'member')),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(user_id, organization_id)
);

-- Add RLS policies (same for both environments)
ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.organizations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_organizations ENABLE ROW LEVEL SECURITY;
```

### Step 2: Backend Sync Service Implementation

Create a dedicated service for handling user synchronization:

```typescript
// apps/api/src/sandbox/sandbox-sync.service.ts
import { Injectable, Logger } from '@nestjs/common';
import { createClient } from '@supabase/supabase-js';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class SandboxSyncService {
  private readonly logger = new Logger(SandboxSyncService.name);
  private readonly prodSupabase;
  private readonly sandboxSupabase;

  constructor(private configService: ConfigService) {
    // Initialize production Supabase client with service role
    this.prodSupabase = createClient(
      this.configService.get('PROD_SUPABASE_URL'),
      this.configService.get('PROD_SUPABASE_SERVICE_ROLE_KEY'),
      { auth: { persistSession: false } }
    );

    // Initialize sandbox Supabase client with service role
    this.sandboxSupabase = createClient(
      this.configService.get('SANDBOX_SUPABASE_URL'),
      this.configService.get('SANDBOX_SUPABASE_SERVICE_ROLE_KEY'),
      { auth: { persistSession: false } }
    );
  }

  async syncUserToSandbox(userId: string): Promise<any> {
    this.logger.log(`Starting sync for user: ${userId}`);

    try {
      // Step 1: Check if user already exists in sandbox
      const { data: existingUser } = await this.sandboxSupabase
        .from('users')
        .select('id, updated_at')
        .eq('id', userId)
        .single();

      if (existingUser) {
        this.logger.log(`User ${userId} already exists in sandbox`);

        // Check if we should update (e.g., if prod user was updated recently)
        const shouldUpdate = await this.shouldUpdateUser(userId, existingUser.updated_at);

        if (shouldUpdate) {
          return await this.updateSandboxUser(userId);
        }

        return {
          success: true,
          action: 'already_exists',
          userId,
        };
      }

      // Step 2: Fetch user from production auth.users
      const { data: { user: authUser }, error: authError } =
        await this.prodSupabase.auth.admin.getUserById(userId);

      if (authError || !authUser) {
        throw new Error(`User not found in production: ${authError?.message}`);
      }

      // Step 3: Create user in sandbox auth.users
      const { error: createAuthError } = await this.sandboxSupabase.auth.admin.createUser({
        id: authUser.id,
        email: authUser.email!,
        email_confirm: true,
        phone: authUser.phone,
        phone_confirm: authUser.phone_confirmed_at ? true : false,
        app_metadata: {
          ...authUser.app_metadata,
          synced_from_production: true,
          sync_date: new Date().toISOString(),
        },
        user_metadata: authUser.user_metadata,
      });

      if (createAuthError && createAuthError.message !== 'User already exists') {
        throw new Error(`Failed to create auth user: ${createAuthError.message}`);
      }

      // Step 4: Fetch and sync public.users data
      const { data: publicUser, error: publicError } = await this.prodSupabase
        .from('users')
        .select('*')
        .eq('id', userId)
        .single();

      if (publicError) {
        this.logger.warn(`No public user record found: ${publicError.message}`);
      }

      if (publicUser) {
        // Create user in sandbox public.users
        const { error: insertError } = await this.sandboxSupabase
          .from('users')
          .insert({
            ...publicUser,
            // Reset any production-specific fields
            stripe_customer_id: null,
            subscription_id: null,
            last_login_at: null,
          });

        if (insertError) {
          throw new Error(`Failed to create public user: ${insertError.message}`);
        }
      }

      // Step 5: Sync organization memberships
      await this.syncUserOrganizations(userId);

      // Step 6: Log successful sync
      await this.logSyncEvent(userId, 'created');

      this.logger.log(`Successfully synced user ${userId} to sandbox`);

      return {
        success: true,
        action: 'created',
        userId,
        email: authUser.email,
      };

    } catch (error) {
      this.logger.error(`Failed to sync user ${userId}:`, error);
      throw error;
    }
  }

  private async syncUserOrganizations(userId: string): Promise<void> {
    // Fetch user's organizations from production
    const { data: memberships, error } = await this.prodSupabase
      .from('user_organizations')
      .select(`
        *,
        organization:organizations(*)
      `)
      .eq('user_id', userId);

    if (error || !memberships || memberships.length === 0) {
      this.logger.log(`No organization memberships found for user ${userId}`);
      return;
    }

    // Sync each organization and membership
    for (const membership of memberships) {
      if (membership.organization) {
        // Create organization in sandbox if it doesn't exist
        await this.sandboxSupabase
          .from('organizations')
          .upsert({
            id: membership.organization.id,
            name: membership.organization.name,
            slug: membership.organization.slug,
            // Reset production-specific fields
            stripe_account_id: null,
            stripe_customer_id: null,
          })
          .select()
          .single();

        // Create membership
        await this.sandboxSupabase
          .from('user_organizations')
          .upsert({
            id: membership.id,
            user_id: membership.user_id,
            organization_id: membership.organization_id,
            role: membership.role,
          });
      }
    }

    this.logger.log(`Synced ${memberships.length} organization(s) for user ${userId}`);
  }

  private async shouldUpdateUser(userId: string, lastSyncDate: string): Promise<boolean> {
    // Check if production user was updated after last sync
    const { data: prodUser } = await this.prodSupabase
      .from('users')
      .select('updated_at')
      .eq('id', userId)
      .single();

    if (!prodUser) return false;

    const prodUpdated = new Date(prodUser.updated_at);
    const lastSync = new Date(lastSyncDate);

    return prodUpdated > lastSync;
  }

  private async updateSandboxUser(userId: string): Promise<any> {
    // Fetch latest data from production
    const { data: prodUser } = await this.prodSupabase
      .from('users')
      .select('*')
      .eq('id', userId)
      .single();

    if (!prodUser) {
      throw new Error('User not found in production');
    }

    // Update sandbox user
    const { error } = await this.sandboxSupabase
      .from('users')
      .update({
        ...prodUser,
        // Keep sandbox-specific fields
        stripe_customer_id: undefined,
        subscription_id: undefined,
        updated_at: new Date().toISOString(),
      })
      .eq('id', userId);

    if (error) {
      throw new Error(`Failed to update user: ${error.message}`);
    }

    // Re-sync organizations
    await this.syncUserOrganizations(userId);

    return {
      success: true,
      action: 'updated',
      userId,
    };
  }

  private async logSyncEvent(userId: string, action: string): Promise<void> {
    // Optional: Log sync events for auditing
    try {
      await this.sandboxSupabase
        .from('sync_logs')
        .insert({
          user_id: userId,
          action,
          synced_at: new Date().toISOString(),
          environment: 'sandbox',
        });
    } catch (error) {
      this.logger.warn(`Failed to log sync event: ${error}`);
    }
  }

  async verifyUserExists(userId: string, environment: 'production' | 'sandbox'): Promise<boolean> {
    const client = environment === 'production' ? this.prodSupabase : this.sandboxSupabase;

    const { data, error } = await client
      .from('users')
      .select('id')
      .eq('id', userId)
      .single();

    return !error && !!data;
  }
}
```

### Step 3: Controller Implementation

Create an API endpoint for triggering user synchronization:

```typescript
// apps/api/src/sandbox/sandbox-sync.controller.ts
import {
  Controller,
  Post,
  Body,
  UseGuards,
  ForbiddenException,
  BadRequestException
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { SandboxSyncService } from './sandbox-sync.service';

@Controller('api')
export class SandboxSyncController {
  constructor(private readonly syncService: SandboxSyncService) {}

  @Post('sync-user-to-sandbox')
  @UseGuards(JwtAuthGuard)
  async syncUserToSandbox(
    @CurrentUser() currentUser: any,
    @Body() body: { userId: string }
  ) {
    // Security: Users can only sync themselves (unless admin)
    if (currentUser.id !== body.userId && !currentUser.app_metadata?.is_admin) {
      throw new ForbiddenException('You can only sync your own account');
    }

    try {
      const result = await this.syncService.syncUserToSandbox(body.userId);

      return {
        success: true,
        message: 'User successfully synced to sandbox',
        ...result,
      };
    } catch (error: any) {
      throw new BadRequestException(
        `Failed to sync user: ${error.message || 'Unknown error'}`
      );
    }
  }

  @Post('verify-sandbox-user')
  @UseGuards(JwtAuthGuard)
  async verifyUserInSandbox(
    @CurrentUser() currentUser: any,
    @Body() body: { userId: string }
  ) {
    if (currentUser.id !== body.userId && !currentUser.app_metadata?.is_admin) {
      throw new ForbiddenException('You can only verify your own account');
    }

    const exists = await this.syncService.verifyUserExists(body.userId, 'sandbox');

    return {
      exists,
      userId: body.userId,
    };
  }
}
```

### Step 4: Frontend Implementation

#### Environment Switcher Component

```typescript
// components/EnvironmentSwitcher.tsx
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useSupabase } from '@/hooks/useSupabase';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/components/ui/select';
import { AlertCircle, Loader2 } from 'lucide-react';
import { toast } from 'sonner';

export function EnvironmentSwitcher() {
  const router = useRouter();
  const { user } = useSupabase();
  const [isSyncing, setIsSyncing] = useState(false);
  const [environment, setEnvironment] = useState(() => {
    return localStorage.getItem('billingos-environment') || 'production';
  });

  const handleEnvironmentSwitch = async (newEnv: string) => {
    if (newEnv === environment) return;

    // If switching to sandbox, ensure user is synced
    if (newEnv === 'sandbox') {
      setIsSyncing(true);

      try {
        // First, verify if user exists in sandbox
        const verifyResponse = await fetch('/api/verify-sandbox-user', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${await user.getAccessToken()}`,
          },
          body: JSON.stringify({ userId: user.id }),
        });

        const verifyResult = await verifyResponse.json();

        // If user doesn't exist, sync them
        if (!verifyResult.exists) {
          toast.info('Setting up your sandbox environment...');

          const syncResponse = await fetch('/api/sync-user-to-sandbox', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${await user.getAccessToken()}`,
            },
            body: JSON.stringify({ userId: user.id }),
          });

          if (!syncResponse.ok) {
            const error = await syncResponse.json();
            throw new Error(error.message || 'Sync failed');
          }

          const syncResult = await syncResponse.json();

          toast.success(
            syncResult.action === 'created'
              ? 'Sandbox environment created successfully!'
              : 'Sandbox environment updated successfully!'
          );
        }

        // Switch environment
        localStorage.setItem('billingos-environment', newEnv);
        setEnvironment(newEnv);

        // Reload to reinitialize all clients with sandbox config
        window.location.reload();

      } catch (error: any) {
        console.error('Failed to switch to sandbox:', error);
        toast.error(`Failed to switch environment: ${error.message}`);
        setIsSyncing(false);
        return;
      }
    } else {
      // Switching back to production (no sync needed)
      localStorage.setItem('billingos-environment', newEnv);
      setEnvironment(newEnv);
      window.location.reload();
    }
  };

  return (
    <div className="flex items-center gap-2">
      {environment === 'sandbox' && (
        <div className="flex items-center gap-1 px-2 py-1 bg-orange-500 text-white rounded text-sm font-medium">
          <AlertCircle className="w-3 h-3" />
          TEST MODE
        </div>
      )}

      <Select
        value={environment}
        onValueChange={handleEnvironmentSwitch}
        disabled={isSyncing}
      >
        <SelectTrigger className="w-32">
          {isSyncing ? (
            <div className="flex items-center gap-2">
              <Loader2 className="w-4 h-4 animate-spin" />
              <span>Syncing...</span>
            </div>
          ) : (
            <SelectValue />
          )}
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="production">Production</SelectItem>
          <SelectItem value="sandbox">
            <div className="flex items-center gap-2">
              <span>Sandbox</span>
              <span className="text-xs text-muted-foreground">(Test)</span>
            </div>
          </SelectItem>
        </SelectContent>
      </Select>
    </div>
  );
}
```

#### OAuth Callback Handler

```typescript
// app/auth/callback/route.ts
import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs';
import { cookies } from 'next/headers';
import { NextRequest, NextResponse } from 'next/server';

export async function GET(request: NextRequest) {
  const requestUrl = new URL(request.url);
  const code = requestUrl.searchParams.get('code');
  const targetEnv = requestUrl.searchParams.get('env') || 'production';

  if (code) {
    const supabase = createRouteHandlerClient({ cookies });

    // Exchange code for session (this happens in production)
    const { data: { user }, error } = await supabase.auth.exchangeCodeForSession(code);

    if (!error && user && targetEnv === 'sandbox') {
      // User authenticated via OAuth and wants sandbox
      // Trigger sync to sandbox
      try {
        const response = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/sync-user-to-sandbox`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': request.headers.get('Authorization') || '',
          },
          body: JSON.stringify({ userId: user.id }),
        });

        if (!response.ok) {
          console.error('Failed to sync OAuth user to sandbox');
          // Continue to production as fallback
          return NextResponse.redirect(new URL('/dashboard', requestUrl.origin));
        }

        // Set environment preference and redirect
        const redirectUrl = new URL('/dashboard', requestUrl.origin);
        redirectUrl.searchParams.set('env', 'sandbox');
        redirectUrl.searchParams.set('oauth_sync', 'true');

        const response = NextResponse.redirect(redirectUrl);
        response.cookies.set('billingos-environment', 'sandbox', {
          httpOnly: false,
          secure: process.env.NODE_ENV === 'production',
          sameSite: 'lax',
          maxAge: 60 * 60 * 24 * 30, // 30 days
        });

        return response;
      } catch (error) {
        console.error('Sync error:', error);
      }
    }
  }

  // Default redirect to dashboard
  return NextResponse.redirect(new URL('/dashboard', requestUrl.origin));
}
```

### Step 5: Environment Configuration

Add the necessary environment variables:

```env
# .env (Backend - NestJS)
# Production Supabase
PROD_SUPABASE_URL=https://your-prod-project.supabase.co
PROD_SUPABASE_SERVICE_ROLE_KEY=your-prod-service-role-key

# Sandbox Supabase
SANDBOX_SUPABASE_URL=https://your-sandbox-project.supabase.co
SANDBOX_SUPABASE_SERVICE_ROLE_KEY=your-sandbox-service-role-key

# Shared JWT secret (MUST be the same for both projects)
SUPABASE_JWT_SECRET=your-shared-jwt-secret-minimum-32-chars
```

```env
# .env.local (Frontend - Next.js)
# Environment-specific URLs (dynamically selected based on user preference)
NEXT_PUBLIC_PROD_SUPABASE_URL=https://your-prod-project.supabase.co
NEXT_PUBLIC_PROD_SUPABASE_ANON_KEY=your-prod-anon-key
NEXT_PUBLIC_PROD_API_URL=https://api.billingos.dev

NEXT_PUBLIC_SANDBOX_SUPABASE_URL=https://your-sandbox-project.supabase.co
NEXT_PUBLIC_SANDBOX_SUPABASE_ANON_KEY=your-sandbox-anon-key
NEXT_PUBLIC_SANDBOX_API_URL=https://sandbox-api.billingos.dev
```

### Step 6: Module Registration

Register the sync service and controller in your NestJS app:

```typescript
// apps/api/src/sandbox/sandbox.module.ts
import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { SandboxSyncService } from './sandbox-sync.service';
import { SandboxSyncController } from './sandbox-sync.controller';

@Module({
  imports: [ConfigModule],
  controllers: [SandboxSyncController],
  providers: [SandboxSyncService],
  exports: [SandboxSyncService],
})
export class SandboxModule {}
```

```typescript
// apps/api/src/app.module.ts
import { Module } from '@nestjs/common';
// ... other imports
import { SandboxModule } from './sandbox/sandbox.module';

@Module({
  imports: [
    // ... other modules
    SandboxModule,
  ],
})
export class AppModule {}
```

## Testing the Implementation

### 1. Test Email Signup Sync

```bash
# 1. Create user in production via email
# 2. Switch to sandbox environment
# 3. Verify user is synced
# 4. Check that sandbox has no production data
```

### 2. Test OAuth Sync

```bash
# 1. Sign up with Google/GitHub (creates user in production)
# 2. Switch to sandbox
# 3. Verify OAuth user is properly synced
# 4. Confirm authentication works in sandbox
```

### 3. Test Data Isolation

```bash
# 1. Create data in production (products, subscriptions)
# 2. Switch to sandbox
# 3. Verify production data is NOT in sandbox
# 4. Create test data in sandbox
# 5. Switch back to production
# 6. Verify sandbox data is NOT in production
```

### 4. Test Update Sync

```bash
# 1. Update user profile in production
# 2. Switch to sandbox (should trigger update sync)
# 3. Verify updates are reflected in sandbox
```

## Security Best Practices

1. **Service Role Keys**: Never expose service role keys to frontend
2. **User Validation**: Only allow users to sync their own accounts
3. **Rate Limiting**: Implement rate limiting on sync endpoints
4. **Audit Logging**: Log all sync operations for security audit
5. **Data Sanitization**: Clear production-specific data when syncing
6. **Error Handling**: Never expose internal errors to users

## Troubleshooting

### Common Issues and Solutions

#### 1. "User already exists" Error
**Cause**: User was partially created in a previous failed sync
**Solution**: Implement upsert logic or cleanup partial records

#### 2. JWT Token Valid but User Not Found
**Cause**: User not synced to sandbox
**Solution**: Ensure sync happens before environment switch

#### 3. OAuth User Can't Access Sandbox
**Cause**: OAuth creates user in production, not synced to sandbox
**Solution**: Implement OAuth callback handler with auto-sync

#### 4. Organization Data Missing
**Cause**: Organizations not synced with user
**Solution**: Include organization sync in user sync process

#### 5. Slow Sync Performance
**Cause**: Syncing too much data at once
**Solution**: Implement selective sync, only sync essential data

## Monitoring and Maintenance

### Metrics to Track

```typescript
// Track these metrics for monitoring
interface SyncMetrics {
  totalSyncs: number;
  successfulSyncs: number;
  failedSyncs: number;
  averageSyncTime: number;
  syncsByType: {
    email: number;
    oauth: number;
  };
  errorTypes: Record<string, number>;
}
```

### Regular Maintenance Tasks

1. **Clean Orphaned Records**: Remove sandbox users without production counterparts
2. **Sync Verification**: Periodically verify sync integrity
3. **Performance Optimization**: Monitor and optimize slow syncs
4. **Security Audits**: Review sync logs for suspicious activity

## Future Enhancements

1. **Selective Data Sync**: Let users choose what data to sync
2. **Bulk Organization Sync**: Sync entire organizations at once
3. **Scheduled Sync**: Auto-sync updates periodically
4. **Sync History UI**: Show users their sync history
5. **Team Sync**: Sync entire teams with one action
6. **Data Seeding**: Pre-populate sandbox with sample data

---

This comprehensive guide provides everything needed to implement user synchronization between production and sandbox environments in BillingOS, ensuring a seamless experience for both email and OAuth users while maintaining complete data isolation.
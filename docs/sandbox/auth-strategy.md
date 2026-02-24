# BillingOS Sandbox Authentication Strategy

## Overview

This document details the authentication strategy for BillingOS sandbox mode, explaining how users can seamlessly access both production and sandbox environments with a single account.

## Core Principle: Shared JWT Secret + User Synchronization

The authentication strategy requires two components:
1. **Shared JWT secret** between production and sandbox Supabase projects for token validation
2. **User synchronization** to ensure user records exist in both databases

**Important:** Having the same JWT secret only validates the token signature. Users must exist in both databases for the system to work properly.

## Architecture

```
                    User Login
                        ↓
                Production Supabase
                (Issues JWT Token)
                        ↓
                  User Sync
              (Lazy or Immediate)
                    ↙       ↘
        Production DB      Sandbox DB
        (User exists)      (User synced)
                    ↓       ↓
        JWT Token (with shared secret)
                    ↙       ↘
        Production API    Sandbox API
        (Validates JWT)   (Validates JWT)
        (Finds user ✓)    (Finds user ✓)
```

## Implementation Details

### 1. Supabase Configuration

Both Supabase projects must be configured with identical JWT secrets:

#### Production Supabase
```env
# supabase/config.toml (production)
[auth]
jwt_secret = "your-shared-jwt-secret-minimum-32-characters-long"
```

#### Sandbox Supabase
```env
# supabase/config.toml (sandbox)
[auth]
jwt_secret = "your-shared-jwt-secret-minimum-32-characters-long"  # SAME SECRET
```

### 2. User Synchronization

#### The Problem
JWT tokens validate across both projects with shared secret, but user records must exist in both databases. Without synchronization:
- Token validates ✅
- User lookup fails ❌
- API calls fail with "user not found"

#### Solution: Lazy User Synchronization
Sync users to sandbox when they first switch environments:

```typescript
// api/sync-user-to-sandbox.ts
export async function syncUserToSandbox(userId: string) {
  // Use service role keys for admin access
  const prodSupabase = createClient(
    PROD_SUPABASE_URL,
    PROD_SERVICE_ROLE_KEY
  );

  const sandboxSupabase = createClient(
    SANDBOX_SUPABASE_URL,
    SANDBOX_SERVICE_ROLE_KEY
  );

  // Fetch user from production
  const { data: prodUser } = await prodSupabase.auth.admin.getUserById(userId);

  if (!prodUser) {
    throw new Error('User not found in production');
  }

  try {
    // Create user in sandbox auth.users table
    await sandboxSupabase.auth.admin.createUser({
      id: prodUser.id,  // IMPORTANT: Keep same ID
      email: prodUser.email,
      email_confirm: true,
      app_metadata: prodUser.app_metadata,
      user_metadata: prodUser.user_metadata,
    });

    // Also sync to public.users table
    const { data: publicUser } = await prodSupabase
      .from('users')
      .select('*')
      .eq('id', userId)
      .single();

    if (publicUser) {
      await sandboxSupabase
        .from('users')
        .upsert({
          ...publicUser,
          // Reset any production-specific data
          stripe_customer_id: null,
          subscription_id: null,
        });
    }

    // Sync organization memberships
    const { data: orgMemberships } = await prodSupabase
      .from('user_organizations')
      .select('*')
      .eq('user_id', userId);

    if (orgMemberships?.length > 0) {
      // Create organizations if they don't exist
      for (const membership of orgMemberships) {
        const { data: org } = await prodSupabase
          .from('organizations')
          .select('*')
          .eq('id', membership.organization_id)
          .single();

        if (org) {
          await sandboxSupabase
            .from('organizations')
            .upsert({
              ...org,
              // Reset production-specific fields
              stripe_account_id: null,
              stripe_customer_id: null,
            });
        }
      }

      // Create memberships
      await sandboxSupabase
        .from('user_organizations')
        .upsert(orgMemberships);
    }

    return { success: true, userId };
  } catch (error) {
    if (error.code === 'user_already_exists') {
      // User already synced, update instead
      await updateSandboxUser(userId);
      return { success: true, userId, updated: true };
    }
    throw error;
  }
}
```

### 3. User Authentication Flow

#### Initial Login
```typescript
// User logs in once (typically to production)
const supabase = createClient(PRODUCTION_SUPABASE_URL, PRODUCTION_ANON_KEY);

const { data: { session }, error } = await supabase.auth.signInWithPassword({
  email: 'user@example.com',
  password: 'password123'
});

// Store the session token
localStorage.setItem('supabase.auth.token', session.access_token);
```

#### Switching to Sandbox
```typescript
// When user switches to sandbox, ensure they're synced first
async function switchToSandbox() {
  const { data: { user } } = await supabase.auth.getUser();

  // Call backend to sync user
  const response = await fetch('/api/sync-user-to-sandbox', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${session.access_token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ userId: user.id }),
  });

  if (!response.ok) {
    throw new Error('Failed to sync user to sandbox');
  }

  // Now safe to switch environments
  localStorage.setItem('environment', 'sandbox');

  // Reload to reinitialize with sandbox configuration
  window.location.reload();
}
```

### 4. OAuth Authentication Handling

#### The OAuth Challenge
OAuth providers (Google, GitHub) can only redirect to one URL. They create users in whichever Supabase project they redirect to, requiring special handling for sandbox access.

#### OAuth Flow with Synchronization
```typescript
// Handle OAuth callback with environment awareness
export async function handleOAuthCallback(req: Request) {
  const url = new URL(req.url);
  const environment = url.searchParams.get('env') || 'production';

  // User was created in production by OAuth
  if (environment === 'production') {
    // Standard OAuth handling
    return handleProductionOAuth(req);
  }

  // User wants sandbox but OAuth created them in production
  if (environment === 'sandbox') {
    // Get the user from production first
    const { data: { user } } = await prodSupabase.auth.getUser();

    // Sync to sandbox
    await syncUserToSandbox(user.id);

    // Redirect to sandbox environment
    return Response.redirect('/dashboard?env=sandbox');
  }
}
```

#### Configure OAuth Providers
Each OAuth provider needs to accept both redirect URLs:

**Google OAuth Console:**
```
Authorized redirect URIs:
- https://your-prod-project.supabase.co/auth/v1/callback
- https://your-sandbox-project.supabase.co/auth/v1/callback
```

**GitHub OAuth App Settings:**
```
Authorization callback URL:
- Add both production and sandbox Supabase URLs
```

#### Smart OAuth Login
Let users choose environment before OAuth:

```typescript
// components/OAuthLogin.tsx
export function OAuthLogin() {
  const [environment, setEnvironment] = useState<'production' | 'sandbox'>('production');

  const loginWithGoogle = async () => {
    // Store intended environment
    localStorage.setItem('oauth_target_env', environment);

    // Always OAuth through production (where user will be created)
    await prodSupabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: `${window.location.origin}/auth/callback?env=${environment}`,
      },
    });
  };

  return (
    <div>
      <Select value={environment} onValueChange={setEnvironment}>
        <SelectItem value="production">Production</SelectItem>
        <SelectItem value="sandbox">Sandbox (Test Mode)</SelectItem>
      </Select>
      <Button onClick={loginWithGoogle}>
        Continue with Google
      </Button>
    </div>
  );
}
```

#### OAuth Callback Handler
```typescript
// app/auth/callback/route.ts
export async function GET(request: Request) {
  const url = new URL(request.url);
  const environment = url.searchParams.get('env') || 'production';
  const code = url.searchParams.get('code');

  // Exchange code for session in production
  const { data: { user }, error } = await prodSupabase.auth.exchangeCodeForSession(code);

  if (error) {
    return Response.redirect('/login?error=oauth_error');
  }

  // If user wants sandbox, sync them
  if (environment === 'sandbox' && user) {
    try {
      await syncUserToSandbox(user.id);

      // Set environment preference
      localStorage.setItem('environment', 'sandbox');

      return Response.redirect('/dashboard?env=sandbox&synced=true');
    } catch (syncError) {
      console.error('Failed to sync user to sandbox:', syncError);
      // Fallback to production
      return Response.redirect('/dashboard?env=production&sync_failed=true');
    }
  }

  // Default to production
  return Response.redirect('/dashboard');
}
```

### 5. Frontend Environment Switching

#### Environment Manager with User Sync
```typescript
// lib/auth/environment-manager.ts
export class EnvironmentManager {
  private currentEnvironment: 'production' | 'sandbox' = 'production';
  private session: Session | null = null;

  async switchEnvironment(env: 'production' | 'sandbox') {
    // Store current session
    const currentSupabase = this.getSupabaseClient();
    const { data: { session, user } } = await currentSupabase.auth.getSession();

    if (!session || !user) {
      throw new Error('No active session');
    }

    // If switching to sandbox, ensure user is synced
    if (env === 'sandbox') {
      const syncResponse = await fetch('/api/sync-user-to-sandbox', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${session.access_token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ userId: user.id }),
      });

      if (!syncResponse.ok) {
        const error = await syncResponse.json();
        throw new Error(`Failed to sync user to sandbox: ${error.message}`);
      }

      const syncResult = await syncResponse.json();
      console.log('User synced to sandbox:', syncResult);
    }

    // Switch environment
    this.currentEnvironment = env;
    localStorage.setItem('billingos-environment', env);

    // Apply session to new environment's Supabase client
    const newSupabase = this.getSupabaseClient();
    await newSupabase.auth.setSession({
      access_token: session.access_token,
      refresh_token: session.refresh_token
    });

    // Reload to reinitialize all services
    window.location.reload();
  }

  private getSupabaseClient() {
    const config = environmentConfig[this.currentEnvironment];
    return createClient(config.supabaseUrl, config.supabaseAnonKey);
  }
}
```

### 6. Backend Implementation

#### JWT Validation

Both backend deployments validate JWTs the same way:

#### NestJS JWT Strategy
```typescript
// src/auth/strategies/jwt.strategy.ts
@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(private configService: ConfigService) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: configService.get<string>('SUPABASE_JWT_SECRET'), // Same secret in both environments
    });
  }

  async validate(payload: any) {
    // Token is valid regardless of which Supabase project issued it
    return {
      userId: payload.sub,
      email: payload.email,
      environment: process.env.NODE_ENV // 'production' or 'sandbox'
    };
  }
}
```

#### User Sync API Endpoint
```typescript
// apps/api/src/sandbox/sandbox-sync.controller.ts
@Controller('api/sync-user-to-sandbox')
@UseGuards(JwtAuthGuard)
export class SandboxSyncController {
  constructor(
    private readonly syncService: SandboxSyncService,
  ) {}

  @Post()
  async syncUserToSandbox(
    @CurrentUser() user: User,
    @Body() dto: { userId: string },
  ) {
    // Verify user is syncing themselves or is admin
    if (user.id !== dto.userId && !user.isAdmin) {
      throw new ForbiddenException('Cannot sync other users');
    }

    try {
      const result = await this.syncService.syncUserToSandbox(dto.userId);
      return {
        success: true,
        ...result,
      };
    } catch (error) {
      throw new BadRequestException(`Sync failed: ${error.message}`);
    }
  }
}
```

### 7. API Client Configuration

#### Dynamic Backend Selection
```typescript
// lib/api/client.ts
export class ApiClient {
  private baseUrl: string;
  private supabase: SupabaseClient;

  constructor() {
    const env = this.getEnvironment();
    const config = environmentConfig[env];

    this.baseUrl = config.apiUrl;
    this.supabase = createClient(config.supabaseUrl, config.supabaseAnonKey);
  }

  async makeRequest(endpoint: string, options: RequestInit = {}) {
    // Get current session token
    const { data: { session } } = await this.supabase.auth.getSession();

    if (!session) {
      throw new Error('No authenticated session');
    }

    // Make request with auth header
    const response = await fetch(`${this.baseUrl}${endpoint}`, {
      ...options,
      headers: {
        ...options.headers,
        'Authorization': `Bearer ${session.access_token}`,
        'Content-Type': 'application/json',
      },
    });

    return response.json();
  }

  private getEnvironment(): 'production' | 'sandbox' {
    return localStorage.getItem('billingos-environment') as any || 'production';
  }
}
```

## User Experience

### 1. First-Time Setup
1. User creates account in production (via email or OAuth)
2. Completes onboarding in production
3. Sandbox environment available after first sync

### 2. Switching Environments
1. User clicks environment toggle in dashboard
2. Selects "Sandbox" from dropdown
3. System syncs user to sandbox (first time only)
4. Page reloads with sandbox data
5. Visual indicators show test mode active

### 3. Seamless Access
- Same email/password works in both environments
- No need to log in again when switching
- Session persists across environment changes
- OAuth providers work through synchronization
- First sandbox access triggers automatic sync

## Security Considerations

### 1. Token Security
- JWTs are signed with same secret (secure)
- Tokens expire normally (1 hour default)
- Refresh tokens work in both environments
- No security compromise from shared secret
- User must exist in database for token to be useful

### 2. Data Isolation
- Despite shared auth, data is completely separate
- Each environment has its own database
- No cross-contamination possible
- RLS policies work independently

### 3. API Key Separation
- API keys are environment-specific
- `sk_test_*` only works with sandbox
- `sk_live_*` only works with production
- Additional layer of environment enforcement

### 4. User Synchronization Security
- Only sync minimal required data
- Reset production-specific fields (Stripe IDs, etc.)
- Use service role keys securely (never expose to frontend)
- Audit log all sync operations

## Alternative Approaches Considered

### 1. Separate Auth Projects
**Pros:**
- Complete isolation
- Different user pools possible

**Cons:**
- Users need separate accounts
- Poor UX for switching
- More complex implementation

### 2. Service Role User Sync
**Pros:**
- Automatic user synchronization
- Consistent user data

**Cons:**
- Complex implementation
- Potential sync issues
- Additional API calls

### 3. Custom Auth Service
**Pros:**
- Full control over auth flow
- Custom claims and metadata

**Cons:**
- Significant development effort
- Maintenance burden
- Security risks

## Why This Approach Works

1. **Secure**: Shared JWT secret + controlled user sync
2. **User-Friendly**: Single login for both environments
3. **OAuth Compatible**: Handles social logins properly
4. **Industry Standard**: Similar to how major platforms handle it
5. **Maintainable**: Sync logic is straightforward and auditable

## Implementation Checklist

### Phase 1: Supabase Setup
- [ ] Configure production Supabase with JWT secret
- [ ] Configure sandbox Supabase with same JWT secret
- [ ] Verify token validation works across projects
- [ ] Test session management

### Phase 2: Frontend Integration
- [ ] Implement environment manager
- [ ] Add environment toggle component
- [ ] Update API client for dynamic routing
- [ ] Add visual indicators for sandbox mode

### Phase 3: Backend Configuration
- [ ] Deploy both backends with same JWT secret
- [ ] Verify JWT strategy works in both
- [ ] Test API endpoints with shared tokens
- [ ] Ensure proper environment detection

### Phase 4: Testing
- [ ] Test login flow
- [ ] Test environment switching
- [ ] Verify data isolation
- [ ] Test token expiration and refresh
- [ ] Test OAuth providers

## Troubleshooting Guide

### Common Issues

#### 1. Token Invalid in Sandbox
**Cause**: Different JWT secrets
**Solution**: Ensure both projects use identical JWT secret

#### 2. User Not Found in Sandbox
**Cause**: User not synced to sandbox database
**Solution**: Run user sync before switching environments

#### 3. Session Lost on Switch
**Cause**: Frontend not transferring session
**Solution**: Implement proper session transfer in environment manager

#### 4. API Calls Failing
**Cause**: Wrong backend URL or missing auth header
**Solution**: Verify environment config and auth header inclusion

#### 5. OAuth Not Working
**Cause**: User created in production but not synced to sandbox
**Solution**: Implement OAuth callback handler with automatic sync

#### 6. Sync Failing
**Cause**: Service role keys not configured or incorrect
**Solution**: Verify service role keys have admin access in both projects

## Best Practices

1. **Always Start in Sandbox**: New users should test in sandbox first
2. **Clear Visual Indicators**: Never let users forget which environment they're in
3. **Confirm Environment Switch**: Show confirmation dialog when switching
4. **Log Environment Actions**: Track environment switches for debugging
5. **Regular Token Refresh**: Ensure tokens are refreshed before expiration

## Migration Path

### For Existing Users
1. No action required for production use
2. Sandbox becomes available immediately
3. First sandbox access creates user record
4. Existing session works in both environments

### For New Users
1. Sign up in production (default)
2. Sandbox available immediately after signup
3. Encouraged to test in sandbox first
4. Switch to production when ready

## Monitoring & Logging

### Key Metrics to Track
- Environment switch frequency
- Token validation failures
- Session duration per environment
- API calls per environment
- User confusion indicators (rapid switching)

### Logging Strategy
```typescript
// Log environment switches
logger.info('Environment switched', {
  userId: user.id,
  from: 'production',
  to: 'sandbox',
  timestamp: new Date().toISOString()
});

// Log authentication events
logger.info('Authentication', {
  userId: user.id,
  environment: currentEnvironment,
  event: 'login' | 'logout' | 'refresh',
  success: boolean
});
```

## Future Enhancements

### Potential Improvements
1. **Environment-Specific Permissions**: Different access levels per environment
2. **Sandbox Data Seeding**: Copy production data to sandbox for testing
3. **Automated Sandbox Cleanup**: Periodic cleanup of old test data
4. **Team Environment Preferences**: Shared team sandbox environments
5. **Environment Activity Logs**: Detailed audit trail per environment

---

This authentication strategy provides a secure, user-friendly approach to managing access across production and sandbox environments while maintaining complete data isolation.
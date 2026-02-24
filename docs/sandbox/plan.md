# BillingOS Sandbox Mode Implementation Plan

## Overview

This document outlines the complete implementation plan for adding sandbox mode to BillingOS, allowing merchants to test their integrations without affecting production data or processing real payments.

## Architecture Decision

After analyzing Autumn and Flowglad's implementations, we've decided on a **separate infrastructure approach** with shared authentication.

### Final Architecture

```
FRONTEND (Single Deployment):
- URL: app.billingos.dev
- Single Vercel deployment
- Environment toggle in UI
- Dynamic backend routing based on selected environment

BACKEND (Two Separate Deployments):
- Production: api.billingos.dev (Railway)
- Sandbox: sandbox-api.billingos.dev (Railway)
- Complete isolation between environments
- Same codebase, different environment variables

DATABASE (Two Separate Supabase Projects):
- Production: billingos-prod
- Sandbox: billingos-sandbox
- Shared JWT secret for authentication
- Complete data isolation
```

### Why Separate Infrastructure?

1. **Industry Standard**: Stripe, Plaid, and other payment companies use separate infrastructure
2. **Zero Risk**: No possibility of mixing test and production data
3. **Simpler Code**: No need for livemode checks throughout the codebase
4. **Better Performance**: No test data bloating production tables
5. **Peace of Mind**: Complete isolation worth the small additional cost (~$30-45/month)

## Authentication Strategy

### JWT Token Sharing + User Synchronization

Authentication requires two components:
1. **Shared JWT secret** between both Supabase projects for token validation
2. **User synchronization** to ensure user records exist in both databases

**How it works:**
1. User logs in via production Supabase (email or OAuth)
2. JWT token is validated by both environments (shared secret)
3. On first sandbox access, user is synced from production to sandbox
4. Frontend stores environment preference in localStorage
5. API calls routed to correct backend based on selection

**Important:** The shared JWT secret only validates tokens. Users must be synced to sandbox database for the system to work.

**Configuration:**
```env
# Both Supabase projects use same secret
SUPABASE_JWT_SECRET=your-shared-secret-here

# Service role keys for user synchronization
PROD_SUPABASE_SERVICE_ROLE_KEY=service-role-key-prod
SANDBOX_SUPABASE_SERVICE_ROLE_KEY=service-role-key-sandbox
```

## Implementation Phases

### Phase 1: Infrastructure Setup (Week 1)

#### 1.1 Create Sandbox Supabase Project
- [ ] Create new Supabase project: billingos-sandbox
- [ ] Configure with same JWT secret as production
- [ ] Run existing migrations on sandbox database
- [ ] Set up RLS policies (identical to production)

#### 1.2 Deploy Sandbox Backend
- [ ] Create sandbox-api.billingos.dev on Railway
- [ ] Configure environment variables:
  ```env
  NODE_ENV=sandbox
  DATABASE_URL=<sandbox-supabase-url>
  SUPABASE_URL=<sandbox-supabase-url>
  SUPABASE_SERVICE_ROLE_KEY=<sandbox-service-key>
  STRIPE_SECRET_KEY=sk_test_...
  STRIPE_WEBHOOK_SECRET=whsec_test_...
  ```
- [ ] Deploy same NestJS codebase
- [ ] Verify API endpoints are accessible

#### 1.3 Configure Stripe Test Mode
- [ ] Set up test webhook endpoint for sandbox
- [ ] Configure test Stripe Connect settings
- [ ] Add test products and prices in Stripe

### Phase 2: Backend User Synchronization (Week 2)

#### 2.1 Create Sync Service
```typescript
// apps/api/src/sandbox/sandbox-sync.service.ts
@Injectable()
export class SandboxSyncService {
  async syncUserToSandbox(userId: string) {
    // Fetch user from production
    // Create/update in sandbox
    // Sync organization memberships
    // Return sync status
  }
}
```

#### 2.2 Add Sync API Endpoint
- [ ] Create `/api/sync-user-to-sandbox` endpoint
- [ ] Implement proper authorization checks
- [ ] Add rate limiting to prevent abuse
- [ ] Log all sync operations for audit

#### 2.3 Handle OAuth Users
- [ ] Implement OAuth callback handler
- [ ] Auto-sync OAuth users to sandbox
- [ ] Configure OAuth providers with both redirect URLs

### Phase 3: Frontend Implementation (Week 2-3)

#### 3.1 Environment Configuration
```typescript
// lib/config/environment.ts
export type Environment = 'production' | 'sandbox';

export const environmentConfig = {
  production: {
    apiUrl: 'https://api.billingos.dev',
    supabaseUrl: process.env.NEXT_PUBLIC_SUPABASE_URL,
    supabaseAnonKey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    stripePublishableKey: process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY
  },
  sandbox: {
    apiUrl: 'https://sandbox-api.billingos.dev',
    supabaseUrl: process.env.NEXT_PUBLIC_SANDBOX_SUPABASE_URL,
    supabaseAnonKey: process.env.NEXT_PUBLIC_SANDBOX_SUPABASE_ANON_KEY,
    stripePublishableKey: process.env.NEXT_PUBLIC_SANDBOX_STRIPE_PUBLISHABLE_KEY
  }
};
```

#### 3.2 Environment Context Provider with User Sync
```typescript
// providers/EnvironmentProvider.tsx
export const EnvironmentProvider: React.FC = ({ children }) => {
  const [environment, setEnvironment] = useState<Environment>(() => {
    return localStorage.getItem('billingos-environment') || 'production';
  });

  const switchEnvironment = async (env: Environment) => {
    // If switching to sandbox, ensure user is synced first
    if (env === 'sandbox') {
      const { data: { user } } = await supabase.auth.getUser();

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
    }

    localStorage.setItem('billingos-environment', env);
    setEnvironment(env);
    window.location.reload(); // Reload to reinitialize all clients
  };

  return (
    <EnvironmentContext.Provider value={{ environment, switchEnvironment }}>
      {children}
    </EnvironmentContext.Provider>
  );
};
```

#### 3.3 Environment Toggle Component
```typescript
// components/EnvironmentToggle.tsx
export function EnvironmentToggle() {
  const { environment, switchEnvironment } = useEnvironment();

  return (
    <div className="flex items-center gap-2">
      {environment === 'sandbox' && (
        <Badge className="bg-orange-500">TEST MODE</Badge>
      )}
      <Select
        value={environment}
        onValueChange={(value) => switchEnvironment(value as Environment)}
      >
        <SelectTrigger className="w-32">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="production">Production</SelectItem>
          <SelectItem value="sandbox">Sandbox</SelectItem>
        </SelectContent>
      </Select>
    </div>
  );
}
```

#### 3.4 Dynamic API Client
```typescript
// lib/api/client.ts
class ApiClient {
  private baseUrl: string;

  constructor() {
    const env = getEnvironment();
    this.baseUrl = environmentConfig[env].apiUrl;
  }

  async request(path: string, options: RequestInit = {}) {
    const response = await fetch(`${this.baseUrl}${path}`, {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        ...options.headers,
      },
    });

    if (!response.ok) {
      throw new Error(`API request failed: ${response.statusText}`);
    }

    return response.json();
  }
}

export const apiClient = new ApiClient();
```

#### 3.5 Test Mode Banner
```typescript
// components/TestModeBanner.tsx
export function TestModeBanner() {
  const { environment } = useEnvironment();

  if (environment !== 'sandbox') return null;

  return (
    <div className="bg-orange-500 text-white text-center py-2 px-4">
      <div className="flex items-center justify-center gap-2">
        <AlertCircle className="h-4 w-4" />
        <span className="font-medium">Test Mode Active</span>
        <span className="text-sm opacity-90">
          No real payments will be processed
        </span>
      </div>
    </div>
  );
}
```

### Phase 4: Backend Adjustments (Week 3)

#### 4.1 Environment Detection
```typescript
// src/common/decorators/environment.decorator.ts
export const Environment = createParamDecorator(
  (data: unknown, ctx: ExecutionContext) => {
    const request = ctx.switchToHttp().getRequest();
    // Environment determined by which backend is being called
    return process.env.NODE_ENV === 'sandbox' ? 'sandbox' : 'production';
  },
);
```

#### 4.2 Stripe Client Configuration
```typescript
// src/stripe/stripe.service.ts
@Injectable()
export class StripeService {
  private stripe: Stripe;

  constructor(private configService: ConfigService) {
    // Use test keys for sandbox, live keys for production
    const key = this.configService.get<string>('STRIPE_SECRET_KEY');
    this.stripe = new Stripe(key, {
      apiVersion: '2023-10-16',
    });
  }

  // Methods remain the same, Stripe handles test/live based on keys
}
```

### Phase 5: SDK Updates (Week 3)

#### 5.1 Update BillingOS SDK
```typescript
// SDK configuration
export class BillingOS {
  constructor(config: {
    apiKey: string;
    environment?: 'production' | 'sandbox';
  }) {
    this.environment = config.environment || this.detectEnvironment(config.apiKey);
    this.apiUrl = this.environment === 'sandbox'
      ? 'https://sandbox-api.billingos.dev'
      : 'https://api.billingos.dev';
  }

  private detectEnvironment(apiKey: string): 'production' | 'sandbox' {
    return apiKey.startsWith('sk_test_') || apiKey.startsWith('pk_test_')
      ? 'sandbox'
      : 'production';
  }
}
```

### Phase 6: Testing & Documentation (Week 4)

#### 6.1 Testing Checklist
- [ ] User can switch between environments
- [ ] User sync works for email signup
- [ ] User sync works for OAuth (Google, GitHub)
- [ ] Sandbox data is completely isolated from production
- [ ] Test Stripe payments work in sandbox
- [ ] API keys correctly route to appropriate environment
- [ ] Visual indicators clearly show current environment
- [ ] No cross-contamination between environments
- [ ] Session persists after environment switch

#### 6.2 Documentation Updates
- [ ] API documentation with sandbox endpoints
- [ ] SDK integration guide for sandbox testing
- [ ] Best practices for testing in sandbox
- [ ] Migration guide for existing users

## Security Considerations

### Data Isolation
- Complete database separation ensures no data leakage
- Different Stripe accounts for test and live modes
- Separate webhook secrets for each environment

### Access Control
- Same authentication for both environments
- API keys determine which environment is accessed
- Frontend clearly indicates current environment

### Best Practices
1. Always start development in sandbox
2. Test payment flows thoroughly before production
3. Use test credit cards in sandbox only
4. Clear visual indicators prevent confusion
5. Regularly clean sandbox data if needed

## Cost Analysis

### Additional Infrastructure Costs
- Supabase Sandbox: ~$25/month (or free tier)
- Railway Sandbox API: ~$5-20/month
- Vercel: No additional cost (same deployment)
- **Total: ~$30-45/month**

### ROI Justification
- Prevents production incidents
- Enables safe testing
- Industry-standard approach
- Customer confidence in platform
- Reduced debugging time

## Migration Strategy

### For New Users
1. Sandbox available immediately
2. Start with sandbox for initial testing
3. Move to production when ready

### For Existing Users
1. Production continues unchanged
2. Sandbox becomes available via toggle
3. Can copy products/settings to sandbox for testing
4. No migration required

## Success Metrics

- Zero production incidents from test data
- Increased developer confidence
- Faster integration testing
- Positive user feedback on sandbox experience
- Reduced support tickets about testing

## Timeline

- **Week 1**: Infrastructure setup
- **Week 2**: User synchronization & OAuth handling
- **Week 2-3**: Frontend implementation
- **Week 3**: Backend adjustments & SDK updates
- **Week 4**: Testing & documentation

Total implementation time: 4 weeks

## Comparison with Alternatives

### Why Not Single Database with Flags?
- Risk of data contamination
- Performance impact from test data
- Complex queries with livemode checks
- Harder to maintain

### Why Not Separate Schemas?
- More complex than separate projects
- Still shares same database instance
- Potential for configuration errors

### Why This Approach Wins
- Complete isolation (like Stripe)
- Simple mental model
- Industry best practice
- Worth the small extra cost

## Next Steps

1. Get approval for additional infrastructure costs
2. Create sandbox Supabase project
3. Set up Railway deployment for sandbox API
4. Begin frontend implementation
5. Update documentation and SDK

---

This plan provides a comprehensive, production-ready sandbox mode that follows industry best practices while maintaining simplicity and security.
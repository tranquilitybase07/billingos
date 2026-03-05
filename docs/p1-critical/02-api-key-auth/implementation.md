# 🔑 API Key Authentication - Step-by-Step Implementation

**Time Estimate:** 4 hours
**Prerequisites:** Security Audit completed, security utilities available

## 📋 Pre-Implementation Checklist

- [ ] Security audit completed
- [ ] Security utilities (`maskApiKey`, etc.) available
- [ ] Create branch: `git checkout -b feat/api-key-auth`
- [ ] Database accessible via Supabase

## 🛠️ Implementation Steps

### Step 1: Database Migration (30 minutes)

#### 1.1 Create Migration File

```bash
cd supabase
supabase migration new add_api_key_types
```

#### 1.2 Add Migration SQL

**File:** `supabase/migrations/[timestamp]_add_api_key_types.sql`

```sql
-- Create enums for key types
CREATE TYPE api_key_type AS ENUM ('secret', 'publishable');
CREATE TYPE api_key_environment AS ENUM ('test', 'live');

-- Add new columns to api_keys table
ALTER TABLE api_keys
ADD COLUMN IF NOT EXISTS key_type api_key_type DEFAULT 'secret',
ADD COLUMN IF NOT EXISTS environment api_key_environment DEFAULT 'test',
ADD COLUMN IF NOT EXISTS key_prefix VARCHAR(10),
ADD COLUMN IF NOT EXISTS key_hash VARCHAR(255),
ADD COLUMN IF NOT EXISTS allowed_origins TEXT[],
ADD COLUMN IF NOT EXISTS metadata JSONB DEFAULT '{}',
ADD COLUMN IF NOT EXISTS revoked_at TIMESTAMP,
ADD COLUMN IF NOT EXISTS expires_at TIMESTAMP;

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_api_keys_key_prefix ON api_keys(key_prefix);
CREATE INDEX IF NOT EXISTS idx_api_keys_key_hash ON api_keys(key_hash);
CREATE INDEX IF NOT EXISTS idx_api_keys_org_env ON api_keys(organization_id, environment);

-- Add constraint to ensure key_hash is unique
ALTER TABLE api_keys
ADD CONSTRAINT unique_key_hash UNIQUE (key_hash);

-- Drop the old 'key' column if it exists (we'll use key_hash now)
ALTER TABLE api_keys
DROP COLUMN IF EXISTS key;

-- Update RLS policies if needed
ALTER TABLE api_keys ENABLE ROW LEVEL SECURITY;

-- Policy for organizations to manage their own keys
CREATE POLICY "Organizations can manage own API keys" ON api_keys
    FOR ALL
    TO authenticated
    USING (
        organization_id IN (
            SELECT organization_id
            FROM user_organizations
            WHERE user_id = auth.uid()
            AND role = 'admin'
        )
    );
```

#### 1.3 Apply Migration and Generate Types

```bash
# Apply migration
supabase db push

# Generate new TypeScript types
supabase gen types typescript --local > ../packages/shared/types/database.ts
```

### Step 2: API Key Service Enhancement (1 hour)

#### 2.1 Create API Key Types

**File:** `apps/api/src/api-keys/types/api-key.types.ts`

```typescript
export enum ApiKeyType {
  SECRET = 'secret',
  PUBLISHABLE = 'publishable',
}

export enum ApiKeyEnvironment {
  TEST = 'test',
  LIVE = 'live',
}

export interface ApiKeyPrefix {
  type: ApiKeyType;
  environment: ApiKeyEnvironment;
  prefix: string;
}

export const API_KEY_PREFIXES: ApiKeyPrefix[] = [
  { type: ApiKeyType.SECRET, environment: ApiKeyEnvironment.TEST, prefix: 'sk_test' },
  { type: ApiKeyType.SECRET, environment: ApiKeyEnvironment.LIVE, prefix: 'sk_live' },
  { type: ApiKeyType.PUBLISHABLE, environment: ApiKeyEnvironment.TEST, prefix: 'pk_test' },
  { type: ApiKeyType.PUBLISHABLE, environment: ApiKeyEnvironment.LIVE, prefix: 'pk_live' },
];

export interface ApiKeyContext {
  type: 'api_key';
  keyType: ApiKeyType;
  environment: ApiKeyEnvironment;
  organizationId: string;
  keyId: string;
  keyName: string;
  allowedOrigins?: string[];
  metadata?: Record<string, any>;
}

export interface GenerateApiKeyDto {
  name: string;
  type: ApiKeyType;
  environment: ApiKeyEnvironment;
  organizationId: string;
  allowedOrigins?: string[];
  metadata?: Record<string, any>;
  expiresAt?: Date;
}
```

#### 2.2 Update API Keys Service

**File:** `apps/api/src/api-keys/api-keys.service.ts`

```typescript
import { Injectable, BadRequestException, UnauthorizedException } from '@nestjs/common';
import { createHash, randomBytes } from 'crypto';
import { SupabaseService } from '../supabase/supabase.service';
import {
  ApiKeyType,
  ApiKeyEnvironment,
  API_KEY_PREFIXES,
  GenerateApiKeyDto,
  ApiKeyContext
} from './types/api-key.types';
import { maskApiKey } from '../common/utils/security.utils';
import { securityLogger } from '../common/utils/security-logger';

@Injectable()
export class ApiKeysService {
  constructor(private readonly supabase: SupabaseService) {}

  /**
   * Generate a new API key with proper prefix
   */
  async generateApiKey(dto: GenerateApiKeyDto) {
    // Find the correct prefix
    const prefixConfig = API_KEY_PREFIXES.find(
      p => p.type === dto.type && p.environment === dto.environment
    );

    if (!prefixConfig) {
      throw new BadRequestException('Invalid key type or environment');
    }

    // Generate random key part (32 chars)
    const randomPart = randomBytes(24).toString('base64url').slice(0, 32);
    const fullKey = `${prefixConfig.prefix}_${randomPart}`;

    // Create SHA-256 hash of the key
    const keyHash = this.hashApiKey(fullKey);

    // Store in database (only the hash)
    const { data, error } = await this.supabase
      .getClient()
      .from('api_keys')
      .insert({
        organization_id: dto.organizationId,
        name: dto.name,
        key_type: dto.type,
        environment: dto.environment,
        key_prefix: fullKey.substring(0, 10), // Store first 10 chars for identification
        key_hash: keyHash,
        allowed_origins: dto.allowedOrigins || null,
        metadata: dto.metadata || {},
        expires_at: dto.expiresAt || null,
      })
      .select()
      .single();

    if (error) {
      throw new BadRequestException(`Failed to create API key: ${error.message}`);
    }

    // Return the key only once (never stored in plain text)
    return {
      id: data.id,
      key: fullKey, // Only returned during creation
      name: data.name,
      type: data.key_type,
      environment: data.environment,
      createdAt: data.created_at,
      expiresAt: data.expires_at,
      // Masked version for display
      displayKey: maskApiKey(fullKey),
    };
  }

  /**
   * Validate an API key and return context
   */
  async validateApiKey(apiKey: string): Promise<ApiKeyContext | null> {
    // Parse the key prefix
    const keyInfo = this.parseApiKey(apiKey);
    if (!keyInfo) {
      securityLogger.securityViolation('invalid_api_key_format', {
        key: maskApiKey(apiKey)
      }, 'system');
      return null;
    }

    // Hash the provided key
    const keyHash = this.hashApiKey(apiKey);

    // Look up in database by hash
    const { data, error } = await this.supabase
      .getClient()
      .from('api_keys')
      .select(`
        *,
        organizations (
          id,
          name,
          status
        )
      `)
      .eq('key_hash', keyHash)
      .single();

    if (error || !data) {
      securityLogger.securityViolation('api_key_not_found', {
        keyPrefix: maskApiKey(apiKey),
      }, 'system');
      return null;
    }

    // Check if key is revoked
    if (data.revoked_at) {
      securityLogger.securityViolation('api_key_revoked', {
        keyId: data.id,
        revokedAt: data.revoked_at,
      }, 'system');
      return null;
    }

    // Check if key is expired
    if (data.expires_at && new Date(data.expires_at) < new Date()) {
      securityLogger.securityViolation('api_key_expired', {
        keyId: data.id,
        expiredAt: data.expires_at,
      }, 'system');
      return null;
    }

    // Check if organization is active
    if (data.organizations?.status !== 'active') {
      securityLogger.securityViolation('organization_inactive', {
        orgId: data.organization_id,
        status: data.organizations?.status,
      }, 'system');
      return null;
    }

    // Update last used timestamp (async, don't wait)
    this.updateLastUsed(data.id).catch(err =>
      console.error('Failed to update last_used_at:', err)
    );

    // Return validated context
    return {
      type: 'api_key',
      keyType: data.key_type as ApiKeyType,
      environment: data.environment as ApiKeyEnvironment,
      organizationId: data.organization_id,
      keyId: data.id,
      keyName: data.name,
      allowedOrigins: data.allowed_origins,
      metadata: data.metadata,
    };
  }

  /**
   * Parse API key to extract type and environment
   */
  private parseApiKey(apiKey: string): ApiKeyPrefix | null {
    if (!apiKey || apiKey.length < 10) {
      return null;
    }

    const prefix = apiKey.substring(0, 7); // sk_test, pk_live, etc.
    return API_KEY_PREFIXES.find(p => apiKey.startsWith(p.prefix)) || null;
  }

  /**
   * Create SHA-256 hash of API key
   */
  private hashApiKey(apiKey: string): string {
    return createHash('sha256').update(apiKey).digest('hex');
  }

  /**
   * Update last used timestamp for a key
   */
  private async updateLastUsed(keyId: string): Promise<void> {
    await this.supabase
      .getClient()
      .from('api_keys')
      .update({ last_used_at: new Date().toISOString() })
      .eq('id', keyId);
  }

  /**
   * List API keys for an organization (returns masked keys)
   */
  async listApiKeys(organizationId: string) {
    const { data, error } = await this.supabase
      .getClient()
      .from('api_keys')
      .select('id, name, key_type, environment, key_prefix, created_at, last_used_at, expires_at, revoked_at')
      .eq('organization_id', organizationId)
      .order('created_at', { ascending: false });

    if (error) {
      throw new BadRequestException(`Failed to list API keys: ${error.message}`);
    }

    return data.map(key => ({
      ...key,
      displayKey: key.key_prefix ? `${key.key_prefix}...` : 'N/A',
    }));
  }

  /**
   * Revoke an API key
   */
  async revokeApiKey(keyId: string, organizationId: string) {
    const { error } = await this.supabase
      .getClient()
      .from('api_keys')
      .update({ revoked_at: new Date().toISOString() })
      .eq('id', keyId)
      .eq('organization_id', organizationId);

    if (error) {
      throw new BadRequestException(`Failed to revoke API key: ${error.message}`);
    }

    securityLogger.apiKeyUsage(`Revoked key ${keyId}`, 'revoke', 'system');
  }
}
```

### Step 3: Authentication Guards (1 hour)

#### 3.1 Create API Key Strategy

**File:** `apps/api/src/auth/strategies/api-key.strategy.ts`

```typescript
import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { Strategy } from 'passport-custom';
import { Request } from 'express';
import { ApiKeysService } from '../../api-keys/api-keys.service';
import { ApiKeyContext } from '../../api-keys/types/api-key.types';

@Injectable()
export class ApiKeyStrategy extends PassportStrategy(Strategy, 'api-key') {
  constructor(private readonly apiKeysService: ApiKeysService) {
    super();
  }

  async validate(req: Request): Promise<ApiKeyContext> {
    const apiKey = this.extractApiKey(req);

    if (!apiKey) {
      throw new UnauthorizedException('API key required');
    }

    const context = await this.apiKeysService.validateApiKey(apiKey);

    if (!context) {
      throw new UnauthorizedException('Invalid API key');
    }

    return context;
  }

  private extractApiKey(req: Request): string | null {
    const authHeader = req.headers.authorization;

    if (!authHeader) {
      return null;
    }

    const [type, key] = authHeader.split(' ');

    if (type !== 'Bearer') {
      return null;
    }

    // Check if it's an API key (starts with sk_ or pk_)
    if (!key || (!key.startsWith('sk_') && !key.startsWith('pk_'))) {
      return null;
    }

    return key;
  }
}
```

#### 3.2 Create Combined Auth Guard

**File:** `apps/api/src/auth/guards/combined-auth.guard.ts`

```typescript
import { Injectable, ExecutionContext, UnauthorizedException } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { Reflector } from '@nestjs/core';
import { IS_PUBLIC_KEY } from '../decorators/public.decorator';
import { ApiKeyType } from '../../api-keys/types/api-key.types';

@Injectable()
export class CombinedAuthGuard extends AuthGuard(['jwt', 'api-key']) {
  constructor(private reflector: Reflector) {
    super();
  }

  canActivate(context: ExecutionContext) {
    // Check if route is public
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (isPublic) {
      return true;
    }

    return super.canActivate(context);
  }

  handleRequest(err: any, user: any, info: any, context: ExecutionContext) {
    if (err || !user) {
      throw err || new UnauthorizedException('Authentication required');
    }

    // If it's an API key auth, check endpoint restrictions
    if (user.type === 'api_key' && user.keyType === ApiKeyType.PUBLISHABLE) {
      const request = context.switchToHttp().getRequest();
      const isAllowed = this.isEndpointAllowedForPublishableKey(
        request.method,
        request.route.path
      );

      if (!isAllowed) {
        throw new UnauthorizedException(
          'This endpoint cannot be accessed with a publishable key'
        );
      }
    }

    return user;
  }

  private isEndpointAllowedForPublishableKey(method: string, path: string): boolean {
    // Define allowed endpoints for publishable keys
    const allowedEndpoints = [
      { method: 'GET', path: '/api/v1/products' },
      { method: 'GET', path: '/api/v1/products/:id' },
      { method: 'GET', path: '/api/v1/features' },
      { method: 'GET', path: '/api/v1/checkout/session/:id' },
      { method: 'POST', path: '/api/v1/checkout/create-session' },
      { method: 'GET', path: '/api/v1/customer/portal' },
      { method: 'GET', path: '/api/v1/customer/subscription' },
      // Add more safe endpoints as needed
    ];

    return allowedEndpoints.some(
      endpoint => endpoint.method === method && this.pathMatches(path, endpoint.path)
    );
  }

  private pathMatches(actualPath: string, pattern: string): boolean {
    // Simple path matching (you might want to use a proper router for this)
    const regex = pattern.replace(/:[^/]+/g, '[^/]+');
    return new RegExp(`^${regex}$`).test(actualPath);
  }
}
```

#### 3.3 Create Current Auth Decorator

**File:** `apps/api/src/auth/decorators/current-auth.decorator.ts`

```typescript
import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import { ApiKeyContext } from '../../api-keys/types/api-key.types';

export interface AuthContext {
  type: 'jwt' | 'api_key';
  userId?: string; // For JWT auth
  organizationId?: string; // For both
  apiKeyContext?: ApiKeyContext; // For API key auth
}

export const CurrentAuth = createParamDecorator(
  (data: unknown, ctx: ExecutionContext): AuthContext => {
    const request = ctx.switchToHttp().getRequest();
    const user = request.user;

    if (!user) {
      return null;
    }

    // Check if it's API key auth
    if (user.type === 'api_key') {
      return {
        type: 'api_key',
        organizationId: user.organizationId,
        apiKeyContext: user,
      };
    }

    // Otherwise it's JWT auth
    return {
      type: 'jwt',
      userId: user.id,
      organizationId: user.organizationId, // If available
    };
  }
);
```

### Step 4: Update Controllers (30 minutes)

#### 4.1 Update V1 Controller to Use Combined Auth

**File:** `apps/api/src/v1/v1.controller.ts`

```typescript
import { Controller, Get, Post, Body, Param, UseGuards } from '@nestjs/common';
import { CombinedAuthGuard } from '../auth/guards/combined-auth.guard';
import { CurrentAuth, AuthContext } from '../auth/decorators/current-auth.decorator';
import { securityLogger } from '../common/utils/security-logger';

@Controller('api/v1')
@UseGuards(CombinedAuthGuard) // Use combined auth for all v1 endpoints
export class V1Controller {
  @Get('products')
  async getProducts(@CurrentAuth() auth: AuthContext) {
    // Log API key usage if applicable
    if (auth.type === 'api_key') {
      securityLogger.apiKeyUsage(
        auth.apiKeyContext.keyId,
        'GET /api/v1/products',
        (auth as any).requestId || 'no-request-id'
      );
    }

    // Return products based on organization
    const organizationId = auth.organizationId ||
      (auth.userId ? await this.getUserOrganization(auth.userId) : null);

    return this.productsService.findAll(organizationId);
  }

  @Post('checkout/create-session')
  async createCheckoutSession(
    @Body() dto: CreateCheckoutDto,
    @CurrentAuth() auth: AuthContext,
  ) {
    // Publishable keys can create checkout sessions
    if (auth.type === 'api_key' && auth.apiKeyContext.keyType === 'publishable') {
      // Validate CORS if needed
      // Additional security checks for browser requests
    }

    return this.checkoutService.createSession(dto, auth.organizationId);
  }

  // ... other endpoints
}
```

#### 4.2 Update API Keys Controller

**File:** `apps/api/src/api-keys/api-keys.controller.ts`

```typescript
import {
  Controller,
  Get,
  Post,
  Delete,
  Body,
  Param,
  UseGuards
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { ApiKeysService } from './api-keys.service';
import { CreateApiKeyDto } from './dto/create-api-key.dto';

@Controller('api-keys')
@UseGuards(JwtAuthGuard) // Only JWT auth for managing keys
export class ApiKeysController {
  constructor(private readonly apiKeysService: ApiKeysService) {}

  @Post()
  async createApiKey(
    @Body() dto: CreateApiKeyDto,
    @CurrentUser() user: any,
  ) {
    // Verify user has permission to create keys for this org
    const hasPermission = await this.verifyOrgPermission(
      user.id,
      dto.organizationId,
      'admin'
    );

    if (!hasPermission) {
      throw new ForbiddenException('No permission to create API keys');
    }

    return this.apiKeysService.generateApiKey({
      ...dto,
      organizationId: dto.organizationId,
    });
  }

  @Get(':organizationId')
  async listApiKeys(
    @Param('organizationId') organizationId: string,
    @CurrentUser() user: any,
  ) {
    // Verify user can view keys for this org
    const hasPermission = await this.verifyOrgPermission(
      user.id,
      organizationId,
      'member'
    );

    if (!hasPermission) {
      throw new ForbiddenException('No permission to view API keys');
    }

    return this.apiKeysService.listApiKeys(organizationId);
  }

  @Delete(':keyId')
  async revokeApiKey(
    @Param('keyId') keyId: string,
    @CurrentUser() user: any,
  ) {
    // Get key details to verify org
    const key = await this.apiKeysService.getKeyById(keyId);

    const hasPermission = await this.verifyOrgPermission(
      user.id,
      key.organization_id,
      'admin'
    );

    if (!hasPermission) {
      throw new ForbiddenException('No permission to revoke API keys');
    }

    return this.apiKeysService.revokeApiKey(keyId, key.organization_id);
  }

  private async verifyOrgPermission(
    userId: string,
    organizationId: string,
    requiredRole: 'admin' | 'member'
  ): Promise<boolean> {
    // Check user's role in organization
    const { data } = await this.supabase
      .getClient()
      .from('user_organizations')
      .select('role')
      .eq('user_id', userId)
      .eq('organization_id', organizationId)
      .single();

    if (!data) return false;

    if (requiredRole === 'member') {
      return true; // Any role is sufficient
    }

    return data.role === 'admin';
  }
}
```

### Step 5: Create DTOs (15 minutes)

**File:** `apps/api/src/api-keys/dto/create-api-key.dto.ts`

```typescript
import { IsString, IsEnum, IsOptional, IsArray, IsUUID, IsObject } from 'class-validator';
import { ApiKeyType, ApiKeyEnvironment } from '../types/api-key.types';

export class CreateApiKeyDto {
  @IsString()
  name: string;

  @IsEnum(ApiKeyType)
  type: ApiKeyType;

  @IsEnum(ApiKeyEnvironment)
  environment: ApiKeyEnvironment;

  @IsUUID()
  organizationId: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  allowedOrigins?: string[];

  @IsOptional()
  @IsObject()
  metadata?: Record<string, any>;

  @IsOptional()
  expiresAt?: Date;
}
```

### Step 6: Update Module Configuration (15 minutes)

**File:** `apps/api/src/auth/auth.module.ts`

```typescript
import { Module } from '@nestjs/common';
import { PassportModule } from '@nestjs/passport';
import { JwtStrategy } from './strategies/jwt.strategy';
import { ApiKeyStrategy } from './strategies/api-key.strategy';
import { ApiKeysModule } from '../api-keys/api-keys.module';

@Module({
  imports: [
    PassportModule.register({ defaultStrategy: 'jwt' }),
    ApiKeysModule, // Import API keys module
  ],
  providers: [
    JwtStrategy,
    ApiKeyStrategy, // Add API key strategy
  ],
  exports: [PassportModule],
})
export class AuthModule {}
```

**File:** `apps/api/src/app.module.ts`

```typescript
import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { CombinedAuthGuard } from './auth/guards/combined-auth.guard';
// ... other imports

@Module({
  imports: [
    // ... existing modules
  ],
  providers: [
    // Set combined auth as global default (can be overridden per route)
    {
      provide: APP_GUARD,
      useClass: CombinedAuthGuard,
    },
  ],
})
export class AppModule {}
```

## ✅ Verification Steps

### 1. Test Key Generation

```bash
# Generate a test secret key
curl -X POST http://localhost:3001/api-keys \
  -H "Authorization: Bearer $JWT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Test Secret Key",
    "type": "secret",
    "environment": "test",
    "organizationId": "YOUR_ORG_ID"
  }'

# Should return:
# {
#   "id": "...",
#   "key": "sk_test_abcdef...", // Save this - only shown once!
#   "displayKey": "sk_test...wxyz",
#   ...
# }
```

### 2. Test Secret Key Auth

```bash
# Use the generated secret key
curl http://localhost:3001/api/v1/products \
  -H "Authorization: Bearer sk_test_YOUR_KEY_HERE"

# Should return products
```

### 3. Test Publishable Key Restrictions

```bash
# Generate a publishable key
curl -X POST http://localhost:3001/api-keys \
  -H "Authorization: Bearer $JWT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Test Publishable Key",
    "type": "publishable",
    "environment": "test",
    "organizationId": "YOUR_ORG_ID"
  }'

# Try to access restricted endpoint (should fail)
curl -X DELETE http://localhost:3001/api/v1/products/123 \
  -H "Authorization: Bearer pk_test_YOUR_KEY_HERE"

# Should return: "This endpoint cannot be accessed with a publishable key"

# Try allowed endpoint (should work)
curl http://localhost:3001/api/v1/products \
  -H "Authorization: Bearer pk_test_YOUR_KEY_HERE"

# Should return products
```

### 4. Verify JWT Still Works

```bash
# Login and get JWT token, then:
curl http://localhost:3001/api/v1/products \
  -H "Authorization: Bearer $JWT_TOKEN"

# Should still work as before
```

### 5. Test Key Revocation

```bash
# Revoke a key
curl -X DELETE http://localhost:3001/api-keys/KEY_ID \
  -H "Authorization: Bearer $JWT_TOKEN"

# Try to use revoked key
curl http://localhost:3001/api/v1/products \
  -H "Authorization: Bearer sk_test_REVOKED_KEY"

# Should return: "Invalid API key"
```

## 🎯 Completion Checklist

- [ ] Database migration applied
- [ ] TypeScript types regenerated
- [ ] API key service implemented
- [ ] API key strategy created
- [ ] Combined auth guard working
- [ ] Controllers updated to use new auth
- [ ] Secret keys working on all endpoints
- [ ] Publishable keys restricted properly
- [ ] JWT auth still functional
- [ ] Keys properly hashed in database
- [ ] Key masking in logs
- [ ] All tests passing

## 🚀 Next Steps

1. Commit your changes:
```bash
git add .
git commit -m "feat: implement API key authentication with sk/pk key types"
```

2. Test with the BillingOS SDK
3. Move on to Rate Limiting implementation

---

**Important:** Save any generated API keys securely - they're only shown once during creation!
# 🧪 API Key Authentication - Testing Guide

**Purpose:** Comprehensive testing of the API key authentication system

## 📋 Testing Overview

This guide covers unit tests, integration tests, and manual testing procedures for the API key authentication feature.

## 🔧 Unit Tests

### API Key Service Tests

**File:** `apps/api/src/api-keys/api-keys.service.spec.ts`

```typescript
import { Test, TestingModule } from '@nestjs/testing';
import { ApiKeysService } from './api-keys.service';
import { SupabaseService } from '../supabase/supabase.service';
import { ApiKeyType, ApiKeyEnvironment } from './types/api-key.types';
import { createHash } from 'crypto';

describe('ApiKeysService', () => {
  let service: ApiKeysService;
  let supabaseMock: jest.Mocked<SupabaseService>;

  beforeEach(async () => {
    const supabaseClientMock = {
      from: jest.fn().mockReturnThis(),
      select: jest.fn().mockReturnThis(),
      insert: jest.fn().mockReturnThis(),
      update: jest.fn().mockReturnThis(),
      eq: jest.fn().mockReturnThis(),
      single: jest.fn(),
      order: jest.fn().mockReturnThis(),
    };

    supabaseMock = {
      getClient: jest.fn().mockReturnValue(supabaseClientMock),
    } as any;

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ApiKeysService,
        {
          provide: SupabaseService,
          useValue: supabaseMock,
        },
      ],
    }).compile();

    service = module.get<ApiKeysService>(ApiKeysService);
  });

  describe('generateApiKey', () => {
    it('should generate secret test key with correct prefix', async () => {
      const dto = {
        name: 'Test Key',
        type: ApiKeyType.SECRET,
        environment: ApiKeyEnvironment.TEST,
        organizationId: 'org-123',
      };

      supabaseMock.getClient().single.mockResolvedValue({
        data: {
          id: 'key-123',
          ...dto,
          created_at: new Date(),
        },
        error: null,
      });

      const result = await service.generateApiKey(dto);

      expect(result.key).toMatch(/^sk_test_[a-zA-Z0-9]{32}$/);
      expect(result.displayKey).toMatch(/^sk_test\.\.\./);
      expect(result.type).toBe(ApiKeyType.SECRET);
    });

    it('should generate publishable live key with correct prefix', async () => {
      const dto = {
        name: 'Live Publishable Key',
        type: ApiKeyType.PUBLISHABLE,
        environment: ApiKeyEnvironment.LIVE,
        organizationId: 'org-123',
      };

      supabaseMock.getClient().single.mockResolvedValue({
        data: {
          id: 'key-456',
          ...dto,
          created_at: new Date(),
        },
        error: null,
      });

      const result = await service.generateApiKey(dto);

      expect(result.key).toMatch(/^pk_live_[a-zA-Z0-9]{32}$/);
      expect(result.displayKey).toMatch(/^pk_live\.\.\./);
      expect(result.type).toBe(ApiKeyType.PUBLISHABLE);
    });

    it('should store only the hash of the key', async () => {
      const dto = {
        name: 'Hash Test Key',
        type: ApiKeyType.SECRET,
        environment: ApiKeyEnvironment.TEST,
        organizationId: 'org-123',
      };

      let insertedData: any;
      supabaseMock.getClient().insert.mockImplementation((data) => {
        insertedData = data;
        return supabaseMock.getClient();
      });

      supabaseMock.getClient().single.mockResolvedValue({
        data: { id: 'key-789', ...dto },
        error: null,
      });

      const result = await service.generateApiKey(dto);

      // Verify that key_hash is stored, not the plain key
      expect(insertedData.key_hash).toBeDefined();
      expect(insertedData.key_hash).toHaveLength(64); // SHA-256 hex length
      expect(insertedData.key).toBeUndefined();

      // Verify hash matches the generated key
      const expectedHash = createHash('sha256').update(result.key).digest('hex');
      expect(insertedData.key_hash).toBe(expectedHash);
    });

    it('should handle allowed origins for publishable keys', async () => {
      const dto = {
        name: 'CORS Test Key',
        type: ApiKeyType.PUBLISHABLE,
        environment: ApiKeyEnvironment.TEST,
        organizationId: 'org-123',
        allowedOrigins: ['http://localhost:3000', 'https://example.com'],
      };

      let insertedData: any;
      supabaseMock.getClient().insert.mockImplementation((data) => {
        insertedData = data;
        return supabaseMock.getClient();
      });

      supabaseMock.getClient().single.mockResolvedValue({
        data: { id: 'key-cors', ...dto },
        error: null,
      });

      await service.generateApiKey(dto);

      expect(insertedData.allowed_origins).toEqual(dto.allowedOrigins);
    });
  });

  describe('validateApiKey', () => {
    it('should validate a correct secret key', async () => {
      const apiKey = 'sk_test_validkey123456789012345678901234';
      const keyHash = createHash('sha256').update(apiKey).digest('hex');

      supabaseMock.getClient().single.mockResolvedValue({
        data: {
          id: 'key-123',
          key_hash: keyHash,
          key_type: 'secret',
          environment: 'test',
          organization_id: 'org-123',
          name: 'Test Key',
          organizations: {
            id: 'org-123',
            name: 'Test Org',
            status: 'active',
          },
        },
        error: null,
      });

      const result = await service.validateApiKey(apiKey);

      expect(result).toBeDefined();
      expect(result.keyType).toBe(ApiKeyType.SECRET);
      expect(result.environment).toBe(ApiKeyEnvironment.TEST);
      expect(result.organizationId).toBe('org-123');
    });

    it('should reject an invalid key format', async () => {
      const result = await service.validateApiKey('invalid_key');
      expect(result).toBeNull();
    });

    it('should reject a revoked key', async () => {
      const apiKey = 'sk_test_revokedkey12345678901234567890';

      supabaseMock.getClient().single.mockResolvedValue({
        data: {
          id: 'key-revoked',
          key_hash: 'hash',
          revoked_at: new Date('2024-01-01'),
          organizations: { status: 'active' },
        },
        error: null,
      });

      const result = await service.validateApiKey(apiKey);
      expect(result).toBeNull();
    });

    it('should reject an expired key', async () => {
      const apiKey = 'sk_test_expiredkey12345678901234567890';

      supabaseMock.getClient().single.mockResolvedValue({
        data: {
          id: 'key-expired',
          key_hash: 'hash',
          expires_at: new Date('2020-01-01'),
          organizations: { status: 'active' },
        },
        error: null,
      });

      const result = await service.validateApiKey(apiKey);
      expect(result).toBeNull();
    });

    it('should reject key from inactive organization', async () => {
      const apiKey = 'sk_test_inactiveorg1234567890123456789';

      supabaseMock.getClient().single.mockResolvedValue({
        data: {
          id: 'key-inactive',
          key_hash: 'hash',
          organizations: {
            id: 'org-inactive',
            status: 'suspended',
          },
        },
        error: null,
      });

      const result = await service.validateApiKey(apiKey);
      expect(result).toBeNull();
    });
  });

  describe('parseApiKey', () => {
    it('should correctly parse different key types', () => {
      const testCases = [
        { key: 'sk_test_abc123', expected: { type: 'secret', env: 'test' } },
        { key: 'sk_live_xyz789', expected: { type: 'secret', env: 'live' } },
        { key: 'pk_test_def456', expected: { type: 'publishable', env: 'test' } },
        { key: 'pk_live_ghi789', expected: { type: 'publishable', env: 'live' } },
      ];

      testCases.forEach(({ key, expected }) => {
        const parsed = service['parseApiKey'](key);
        expect(parsed).toBeDefined();
        expect(parsed.type).toBe(expected.type);
        expect(parsed.environment).toBe(expected.env);
      });
    });

    it('should return null for invalid keys', () => {
      const invalidKeys = ['', 'invalid', 'sk_', 'test_key', 'Bearer token'];

      invalidKeys.forEach(key => {
        const parsed = service['parseApiKey'](key);
        expect(parsed).toBeNull();
      });
    });
  });
});
```

### Combined Auth Guard Tests

**File:** `apps/api/src/auth/guards/combined-auth.guard.spec.ts`

```typescript
import { Test, TestingModule } from '@nestjs/testing';
import { ExecutionContext, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { CombinedAuthGuard } from './combined-auth.guard';
import { ApiKeyType } from '../../api-keys/types/api-key.types';

describe('CombinedAuthGuard', () => {
  let guard: CombinedAuthGuard;
  let reflector: Reflector;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CombinedAuthGuard,
        {
          provide: Reflector,
          useValue: {
            getAllAndOverride: jest.fn(),
          },
        },
      ],
    }).compile();

    guard = module.get<CombinedAuthGuard>(CombinedAuthGuard);
    reflector = module.get<Reflector>(Reflector);
  });

  describe('handleRequest', () => {
    let context: ExecutionContext;

    beforeEach(() => {
      context = {
        switchToHttp: () => ({
          getRequest: () => ({
            method: 'GET',
            route: { path: '/api/v1/products' },
          }),
        }),
      } as ExecutionContext;
    });

    it('should allow JWT auth on all endpoints', () => {
      const user = {
        type: 'jwt',
        id: 'user-123',
        email: 'test@example.com',
      };

      const result = guard.handleRequest(null, user, null, context);
      expect(result).toBe(user);
    });

    it('should allow secret keys on all endpoints', () => {
      const user = {
        type: 'api_key',
        keyType: ApiKeyType.SECRET,
        organizationId: 'org-123',
      };

      const result = guard.handleRequest(null, user, null, context);
      expect(result).toBe(user);
    });

    it('should allow publishable keys on whitelisted endpoints', () => {
      const user = {
        type: 'api_key',
        keyType: ApiKeyType.PUBLISHABLE,
        organizationId: 'org-123',
      };

      context = {
        switchToHttp: () => ({
          getRequest: () => ({
            method: 'GET',
            route: { path: '/api/v1/products' },
          }),
        }),
      } as ExecutionContext;

      const result = guard.handleRequest(null, user, null, context);
      expect(result).toBe(user);
    });

    it('should reject publishable keys on restricted endpoints', () => {
      const user = {
        type: 'api_key',
        keyType: ApiKeyType.PUBLISHABLE,
        organizationId: 'org-123',
      };

      context = {
        switchToHttp: () => ({
          getRequest: () => ({
            method: 'DELETE',
            route: { path: '/api/v1/products/123' },
          }),
        }),
      } as ExecutionContext;

      expect(() => guard.handleRequest(null, user, null, context)).toThrow(
        UnauthorizedException
      );
    });

    it('should throw UnauthorizedException when no user', () => {
      expect(() => guard.handleRequest(null, null, null, context)).toThrow(
        UnauthorizedException
      );
    });
  });

  describe('pathMatches', () => {
    it('should match exact paths', () => {
      expect(guard['pathMatches']('/api/v1/products', '/api/v1/products')).toBe(true);
      expect(guard['pathMatches']('/api/v1/products', '/api/v1/customers')).toBe(false);
    });

    it('should match paths with parameters', () => {
      expect(guard['pathMatches']('/api/v1/products/123', '/api/v1/products/:id')).toBe(true);
      expect(guard['pathMatches']('/api/v1/products/abc-def', '/api/v1/products/:id')).toBe(true);
      expect(guard['pathMatches']('/api/v1/products', '/api/v1/products/:id')).toBe(false);
    });
  });
});
```

## 🧪 Integration Tests

**File:** `apps/api/test/api-key-auth.e2e-spec.ts`

```typescript
import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import * as request from 'supertest';
import { AppModule } from '../src/app.module';
import { ApiKeysService } from '../src/api-keys/api-keys.service';
import { ApiKeyType, ApiKeyEnvironment } from '../src/api-keys/types/api-key.types';

describe('API Key Authentication (e2e)', () => {
  let app: INestApplication;
  let apiKeysService: ApiKeysService;
  let jwtToken: string;
  let organizationId: string;
  let secretKey: string;
  let publishableKey: string;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    apiKeysService = moduleFixture.get<ApiKeysService>(ApiKeysService);
    await app.init();

    // Setup: Login and get JWT token
    // This assumes you have a test user and organization
    const loginResponse = await request(app.getHttpServer())
      .post('/auth/login')
      .send({
        email: 'test@example.com',
        password: 'testpassword',
      });

    jwtToken = loginResponse.body.token;
    organizationId = loginResponse.body.user.organizationId;

    // Generate test API keys
    const secretKeyResult = await apiKeysService.generateApiKey({
      name: 'E2E Test Secret Key',
      type: ApiKeyType.SECRET,
      environment: ApiKeyEnvironment.TEST,
      organizationId,
    });
    secretKey = secretKeyResult.key;

    const publishableKeyResult = await apiKeysService.generateApiKey({
      name: 'E2E Test Publishable Key',
      type: ApiKeyType.PUBLISHABLE,
      environment: ApiKeyEnvironment.TEST,
      organizationId,
      allowedOrigins: ['http://localhost:3000'],
    });
    publishableKey = publishableKeyResult.key;
  });

  afterAll(async () => {
    await app.close();
  });

  describe('JWT Authentication', () => {
    it('should still work with JWT token', () => {
      return request(app.getHttpServer())
        .get('/api/v1/products')
        .set('Authorization', `Bearer ${jwtToken}`)
        .expect(200);
    });
  });

  describe('Secret Key Authentication', () => {
    it('should authenticate with secret key', () => {
      return request(app.getHttpServer())
        .get('/api/v1/products')
        .set('Authorization', `Bearer ${secretKey}`)
        .expect(200);
    });

    it('should allow all endpoints with secret key', () => {
      // Test various endpoints
      const endpoints = [
        { method: 'get', path: '/api/v1/products' },
        { method: 'post', path: '/api/v1/products', body: { name: 'Test' } },
        { method: 'get', path: '/api/v1/customers' },
        { method: 'post', path: '/api/v1/subscriptions', body: {} },
      ];

      const requests = endpoints.map(endpoint => {
        const req = request(app.getHttpServer())[endpoint.method](endpoint.path)
          .set('Authorization', `Bearer ${secretKey}`);

        if (endpoint.body) {
          req.send(endpoint.body);
        }

        return req.expect(res => {
          expect([200, 201, 404]).toContain(res.status);
        });
      });

      return Promise.all(requests);
    });

    it('should reject invalid secret key', () => {
      return request(app.getHttpServer())
        .get('/api/v1/products')
        .set('Authorization', 'Bearer sk_test_invalid')
        .expect(401);
    });
  });

  describe('Publishable Key Authentication', () => {
    it('should authenticate with publishable key on allowed endpoints', () => {
      return request(app.getHttpServer())
        .get('/api/v1/products')
        .set('Authorization', `Bearer ${publishableKey}`)
        .expect(200);
    });

    it('should reject publishable key on restricted endpoints', () => {
      return request(app.getHttpServer())
        .delete('/api/v1/products/123')
        .set('Authorization', `Bearer ${publishableKey}`)
        .expect(401)
        .expect(res => {
          expect(res.body.message).toContain('cannot be accessed with a publishable key');
        });
    });

    it('should allow checkout creation with publishable key', () => {
      return request(app.getHttpServer())
        .post('/api/v1/checkout/create-session')
        .set('Authorization', `Bearer ${publishableKey}`)
        .send({
          productId: 'prod-123',
          customerId: 'cust-456',
        })
        .expect(res => {
          expect([200, 201]).toContain(res.status);
        });
    });
  });

  describe('Key Management', () => {
    it('should list API keys for organization', () => {
      return request(app.getHttpServer())
        .get(`/api-keys/${organizationId}`)
        .set('Authorization', `Bearer ${jwtToken}`)
        .expect(200)
        .expect(res => {
          expect(Array.isArray(res.body)).toBe(true);
          expect(res.body.length).toBeGreaterThan(0);
          // Verify keys are masked
          res.body.forEach(key => {
            expect(key.displayKey).toMatch(/^(sk|pk)_(test|live)\.\.\.$/);
            expect(key.key_hash).toBeUndefined(); // Never expose hash
          });
        });
    });

    it('should revoke an API key', async () => {
      // Create a key to revoke
      const keyToRevoke = await apiKeysService.generateApiKey({
        name: 'Key to Revoke',
        type: ApiKeyType.SECRET,
        environment: ApiKeyEnvironment.TEST,
        organizationId,
      });

      // Revoke it
      await request(app.getHttpServer())
        .delete(`/api-keys/${keyToRevoke.id}`)
        .set('Authorization', `Bearer ${jwtToken}`)
        .expect(200);

      // Try to use revoked key
      return request(app.getHttpServer())
        .get('/api/v1/products')
        .set('Authorization', `Bearer ${keyToRevoke.key}`)
        .expect(401);
    });
  });

  describe('Mixed Authentication', () => {
    it('should handle requests with no authentication', () => {
      return request(app.getHttpServer())
        .get('/api/v1/products')
        .expect(401);
    });

    it('should handle malformed authorization headers', () => {
      const badHeaders = [
        'NotBearer token',
        'Bearer',
        'Bearer ',
        'token_without_bearer',
      ];

      const requests = badHeaders.map(header =>
        request(app.getHttpServer())
          .get('/api/v1/products')
          .set('Authorization', header)
          .expect(401)
      );

      return Promise.all(requests);
    });
  });
});
```

## 📊 Manual Testing Scripts

### 1. Complete API Key Test Suite

**Create file:** `scripts/test-api-keys.sh`

```bash
#!/bin/bash

API_URL="http://localhost:3001"
JWT_TOKEN="YOUR_JWT_TOKEN_HERE"
ORG_ID="YOUR_ORG_ID_HERE"

echo "🔑 API Key Authentication Test Suite"
echo "====================================="
echo ""

# Function to print colored output
print_result() {
    if [ $1 -eq 0 ]; then
        echo -e "\033[0;32m✅ $2\033[0m"
    else
        echo -e "\033[0;31m❌ $2\033[0m"
    fi
}

# 1. Generate Secret Key
echo "1. Generating Secret Key..."
SECRET_KEY_RESPONSE=$(curl -s -X POST "$API_URL/api-keys" \
    -H "Authorization: Bearer $JWT_TOKEN" \
    -H "Content-Type: application/json" \
    -d '{
        "name": "Test Secret Key",
        "type": "secret",
        "environment": "test",
        "organizationId": "'$ORG_ID'"
    }')

SECRET_KEY=$(echo $SECRET_KEY_RESPONSE | jq -r '.key')
SECRET_KEY_ID=$(echo $SECRET_KEY_RESPONSE | jq -r '.id')

if [ "$SECRET_KEY" != "null" ]; then
    print_result 0 "Secret key generated: ${SECRET_KEY:0:15}..."
else
    print_result 1 "Failed to generate secret key"
    echo $SECRET_KEY_RESPONSE
fi
echo ""

# 2. Generate Publishable Key
echo "2. Generating Publishable Key..."
PK_RESPONSE=$(curl -s -X POST "$API_URL/api-keys" \
    -H "Authorization: Bearer $JWT_TOKEN" \
    -H "Content-Type: application/json" \
    -d '{
        "name": "Test Publishable Key",
        "type": "publishable",
        "environment": "test",
        "organizationId": "'$ORG_ID'",
        "allowedOrigins": ["http://localhost:3000"]
    }')

PUBLISHABLE_KEY=$(echo $PK_RESPONSE | jq -r '.key')

if [ "$PUBLISHABLE_KEY" != "null" ]; then
    print_result 0 "Publishable key generated: ${PUBLISHABLE_KEY:0:15}..."
else
    print_result 1 "Failed to generate publishable key"
fi
echo ""

# 3. Test Secret Key on Public Endpoint
echo "3. Testing Secret Key on Public Endpoint..."
RESPONSE=$(curl -s -o /dev/null -w "%{http_code}" \
    -H "Authorization: Bearer $SECRET_KEY" \
    "$API_URL/api/v1/products")

if [ "$RESPONSE" = "200" ]; then
    print_result 0 "Secret key works on public endpoint"
else
    print_result 1 "Secret key failed (HTTP $RESPONSE)"
fi
echo ""

# 4. Test Secret Key on Restricted Endpoint
echo "4. Testing Secret Key on Restricted Endpoint..."
RESPONSE=$(curl -s -o /dev/null -w "%{http_code}" \
    -X DELETE \
    -H "Authorization: Bearer $SECRET_KEY" \
    "$API_URL/api/v1/products/123")

if [ "$RESPONSE" = "200" ] || [ "$RESPONSE" = "404" ]; then
    print_result 0 "Secret key works on restricted endpoint"
else
    print_result 1 "Secret key failed on restricted endpoint (HTTP $RESPONSE)"
fi
echo ""

# 5. Test Publishable Key on Allowed Endpoint
echo "5. Testing Publishable Key on Allowed Endpoint..."
RESPONSE=$(curl -s -o /dev/null -w "%{http_code}" \
    -H "Authorization: Bearer $PUBLISHABLE_KEY" \
    "$API_URL/api/v1/products")

if [ "$RESPONSE" = "200" ]; then
    print_result 0 "Publishable key works on allowed endpoint"
else
    print_result 1 "Publishable key failed (HTTP $RESPONSE)"
fi
echo ""

# 6. Test Publishable Key on Restricted Endpoint
echo "6. Testing Publishable Key on Restricted Endpoint..."
RESPONSE=$(curl -s -o /dev/null -w "%{http_code}" \
    -X DELETE \
    -H "Authorization: Bearer $PUBLISHABLE_KEY" \
    "$API_URL/api/v1/products/123")

if [ "$RESPONSE" = "401" ] || [ "$RESPONSE" = "403" ]; then
    print_result 0 "Publishable key correctly rejected on restricted endpoint"
else
    print_result 1 "Publishable key should be rejected (got HTTP $RESPONSE)"
fi
echo ""

# 7. List API Keys
echo "7. Listing API Keys..."
KEYS=$(curl -s -H "Authorization: Bearer $JWT_TOKEN" \
    "$API_URL/api-keys/$ORG_ID")

KEY_COUNT=$(echo $KEYS | jq '. | length')
if [ "$KEY_COUNT" -gt 0 ]; then
    print_result 0 "Found $KEY_COUNT API keys"
    echo $KEYS | jq '.[] | {name: .name, type: .key_type, status: .status}'
else
    print_result 1 "No keys found or error listing keys"
fi
echo ""

# 8. Revoke Secret Key
echo "8. Revoking Secret Key..."
REVOKE_RESPONSE=$(curl -s -o /dev/null -w "%{http_code}" \
    -X DELETE \
    -H "Authorization: Bearer $JWT_TOKEN" \
    "$API_URL/api-keys/$SECRET_KEY_ID")

if [ "$REVOKE_RESPONSE" = "200" ] || [ "$REVOKE_RESPONSE" = "204" ]; then
    print_result 0 "Key revoked successfully"
else
    print_result 1 "Failed to revoke key (HTTP $REVOKE_RESPONSE)"
fi
echo ""

# 9. Test Revoked Key
echo "9. Testing Revoked Key..."
RESPONSE=$(curl -s -o /dev/null -w "%{http_code}" \
    -H "Authorization: Bearer $SECRET_KEY" \
    "$API_URL/api/v1/products")

if [ "$RESPONSE" = "401" ]; then
    print_result 0 "Revoked key correctly rejected"
else
    print_result 1 "Revoked key should be rejected (got HTTP $RESPONSE)"
fi
echo ""

# 10. Test JWT Still Works
echo "10. Testing JWT Authentication..."
RESPONSE=$(curl -s -o /dev/null -w "%{http_code}" \
    -H "Authorization: Bearer $JWT_TOKEN" \
    "$API_URL/api/v1/products")

if [ "$RESPONSE" = "200" ]; then
    print_result 0 "JWT authentication still works"
else
    print_result 1 "JWT authentication failed (HTTP $RESPONSE)"
fi

echo ""
echo "====================================="
echo "✅ API Key Authentication Tests Complete!"
```

### 2. SDK Integration Test

**Create file:** `scripts/test-sdk-with-keys.js`

```javascript
// Test the BillingOS SDK with API keys
const BillingOS = require('@billingos/sdk'); // Assuming SDK is installed

async function testSDKAuthentication() {
  console.log('🧪 Testing BillingOS SDK with API Keys\n');

  // Test with Secret Key
  console.log('1. Testing with Secret Key...');
  try {
    const secretClient = new BillingOS({
      apiKey: 'sk_test_YOUR_SECRET_KEY_HERE',
      baseURL: 'http://localhost:3001',
    });

    const products = await secretClient.products.list();
    console.log('✅ Secret key works! Found', products.length, 'products');

    // Try to create a product (should work with secret key)
    const newProduct = await secretClient.products.create({
      name: 'Test Product',
      price: 999,
    });
    console.log('✅ Created product with secret key:', newProduct.id);
  } catch (error) {
    console.log('❌ Secret key failed:', error.message);
  }

  console.log('\n2. Testing with Publishable Key...');
  try {
    const publishableClient = new BillingOS({
      apiKey: 'pk_test_YOUR_PUBLISHABLE_KEY_HERE',
      baseURL: 'http://localhost:3001',
    });

    const products = await publishableClient.products.list();
    console.log('✅ Publishable key works! Found', products.length, 'products');

    // Try to create a checkout session (should work)
    const session = await publishableClient.checkout.createSession({
      productId: products[0]?.id,
      customerId: 'cust-123',
    });
    console.log('✅ Created checkout session with publishable key');

    // Try to delete a product (should fail)
    try {
      await publishableClient.products.delete('prod-123');
      console.log('❌ Publishable key should not allow delete!');
    } catch (error) {
      console.log('✅ Publishable key correctly rejected for delete');
    }
  } catch (error) {
    console.log('❌ Publishable key failed:', error.message);
  }

  console.log('\n3. Testing Key Validation...');
  try {
    const invalidClient = new BillingOS({
      apiKey: 'sk_test_invalid_key_12345',
      baseURL: 'http://localhost:3001',
    });

    await invalidClient.products.list();
    console.log('❌ Invalid key should be rejected!');
  } catch (error) {
    console.log('✅ Invalid key correctly rejected:', error.message);
  }

  console.log('\n✅ SDK Integration Tests Complete!');
}

testSDKAuthentication().catch(console.error);
```

## 🎯 Testing Checklist

### Pre-Deployment Checklist
- [ ] All unit tests pass
- [ ] All integration tests pass
- [ ] Manual testing script runs successfully
- [ ] SDK integration works with both key types
- [ ] JWT authentication still functional
- [ ] Key generation creates unique keys
- [ ] Key hashing verified (no plain text storage)
- [ ] Key masking in logs confirmed
- [ ] Publishable key restrictions enforced
- [ ] Key revocation works immediately
- [ ] Expired keys are rejected
- [ ] Organization status affects key validity
- [ ] CORS validation for publishable keys
- [ ] Rate limiting applies per key (if implemented)
- [ ] Performance impact < 50ms per request

### Security Testing
- [ ] Cannot retrieve plain text key after creation
- [ ] Cannot access restricted endpoints with publishable key
- [ ] Revoked keys immediately stop working
- [ ] Keys from inactive orgs are rejected
- [ ] Invalid key formats return 401
- [ ] No key hash exposed in API responses
- [ ] Keys are masked in all error messages

## 🆘 Troubleshooting

### Issue: "Invalid API key" error with valid key
```bash
# Check if key exists in database
psql $DATABASE_URL -c "SELECT id, key_prefix, revoked_at, expires_at FROM api_keys WHERE key_prefix LIKE 'sk_test%';"

# Verify hash is being generated correctly
echo -n "your_api_key_here" | sha256sum
```

### Issue: Publishable key rejected on allowed endpoint
```typescript
// Add debug logging to CombinedAuthGuard
console.log('Endpoint:', request.method, request.route.path);
console.log('Is allowed:', this.isEndpointAllowedForPublishableKey(...));
```

### Issue: JWT auth broken after adding API keys
```bash
# Test JWT separately
curl -H "Authorization: Bearer $JWT_TOKEN" http://localhost:3001/api/users/me

# Check if combined guard is registered correctly
grep -r "CombinedAuthGuard" apps/api/src/
```

---

**Remember:** Always test both authentication methods (JWT and API keys) after any changes to ensure backward compatibility!
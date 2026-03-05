# 🧪 Security Audit - Testing Guide

**Purpose:** Verify that all security improvements are working correctly

## 📋 Testing Overview

This guide covers both automated tests and manual verification steps to ensure the security audit was successful.

## 🔧 Automated Tests

### Create Test File

**File:** `apps/api/src/common/utils/security.utils.spec.ts`

```typescript
import {
  maskApiKey,
  maskEmail,
  sanitizeError,
  generateRequestId,
} from './security.utils';

describe('Security Utils', () => {
  describe('maskApiKey', () => {
    it('should mask valid API keys', () => {
      const key = 'sk_test_abcdefghijklmnopqrstuvwxyz';
      const masked = maskApiKey(key);
      expect(masked).toBe('sk_test...wxyz');
    });

    it('should handle null/undefined keys', () => {
      expect(maskApiKey(null)).toBe('no-key-provided');
      expect(maskApiKey(undefined)).toBe('no-key-provided');
      expect(maskApiKey('')).toBe('no-key-provided');
    });

    it('should not mask short keys', () => {
      expect(maskApiKey('short')).toBe('invalid-key-format');
      expect(maskApiKey('sk_test_abc')).toBe('invalid-key-format');
    });

    it('should mask different key types', () => {
      expect(maskApiKey('pk_test_1234567890abcdef')).toBe('pk_test...cdef');
      expect(maskApiKey('sk_live_1234567890abcdef')).toBe('sk_live...cdef');
    });
  });

  describe('maskEmail', () => {
    it('should mask valid emails', () => {
      expect(maskEmail('john.doe@example.com')).toBe('jo***@example.com');
      expect(maskEmail('a@test.com')).toBe('***@test.com');
    });

    it('should handle invalid emails', () => {
      expect(maskEmail(null)).toBe('no-email');
      expect(maskEmail('')).toBe('no-email');
      expect(maskEmail('not-an-email')).toBe('invalid-email');
    });
  });

  describe('sanitizeError', () => {
    it('should remove API keys from error messages', () => {
      const error = {
        message: 'Invalid key: sk_test_abcdefghijklmnopqrstuvwxyz',
      };
      const sanitized = sanitizeError(error);
      expect(sanitized).not.toContain('sk_test_abcdefghijklmnopqrstuvwxyz');
      expect(sanitized).toContain('sk_test...wxyz');
    });

    it('should remove passwords from error messages', () => {
      const error = {
        message: 'Login failed for user with password: MySecret123!',
      };
      const sanitized = sanitizeError(error);
      expect(sanitized).not.toContain('MySecret123');
      expect(sanitized).toContain('[REDACTED]');
    });

    it('should remove emails from error messages', () => {
      const error = {
        message: 'User john.doe@example.com not found',
      };
      const sanitized = sanitizeError(error);
      expect(sanitized).not.toContain('john.doe@example.com');
      expect(sanitized).toContain('jo***@example.com');
    });

    it('should handle complex error messages', () => {
      const error = {
        message: 'Auth failed: token="abc123", secret="xyz789", email=test@test.com',
      };
      const sanitized = sanitizeError(error);
      expect(sanitized).toContain('token: [REDACTED]');
      expect(sanitized).toContain('secret: [REDACTED]');
      expect(sanitized).not.toContain('abc123');
      expect(sanitized).not.toContain('xyz789');
    });
  });

  describe('generateRequestId', () => {
    it('should generate unique request IDs', () => {
      const id1 = generateRequestId();
      const id2 = generateRequestId();

      expect(id1).toMatch(/^req_[a-z0-9]+_[a-z0-9]+$/);
      expect(id2).toMatch(/^req_[a-z0-9]+_[a-z0-9]+$/);
      expect(id1).not.toBe(id2);
    });

    it('should include timestamp component', () => {
      const id = generateRequestId();
      const parts = id.split('_');
      expect(parts).toHaveLength(3);
      expect(parts[0]).toBe('req');
    });
  });
});
```

### Request ID Middleware Test

**File:** `apps/api/src/common/middleware/request-id.middleware.spec.ts`

```typescript
import { RequestIdMiddleware } from './request-id.middleware';
import { Request, Response, NextFunction } from 'express';

describe('RequestIdMiddleware', () => {
  let middleware: RequestIdMiddleware;
  let req: Partial<Request>;
  let res: Partial<Response>;
  let next: NextFunction;

  beforeEach(() => {
    middleware = new RequestIdMiddleware();
    req = {
      headers: {},
    };
    res = {
      setHeader: jest.fn(),
    };
    next = jest.fn();
  });

  it('should generate request ID if not provided', () => {
    middleware.use(req as Request, res as Response, next);

    expect((req as any).id).toBeDefined();
    expect((req as any).id).toMatch(/^req_/);
    expect(res.setHeader).toHaveBeenCalledWith('x-request-id', (req as any).id);
    expect(next).toHaveBeenCalled();
  });

  it('should use provided request ID from headers', () => {
    req.headers = { 'x-request-id': 'custom-id-123' };

    middleware.use(req as Request, res as Response, next);

    expect((req as any).id).toBe('custom-id-123');
    expect(res.setHeader).toHaveBeenCalledWith('x-request-id', 'custom-id-123');
    expect(next).toHaveBeenCalled();
  });

  it('should add requestId to request object', () => {
    middleware.use(req as Request, res as Response, next);

    expect((req as any).requestId).toBeDefined();
    expect((req as any).requestId).toBe((req as any).id);
  });
});
```

### Response Sanitization Test

**File:** `apps/api/src/common/interceptors/response-sanitize.interceptor.spec.ts`

```typescript
import { ResponseSanitizeInterceptor } from './response-sanitize.interceptor';
import { of } from 'rxjs';
import { ExecutionContext, CallHandler } from '@nestjs/common';

describe('ResponseSanitizeInterceptor', () => {
  let interceptor: ResponseSanitizeInterceptor;
  let context: ExecutionContext;
  let next: CallHandler;

  beforeEach(() => {
    interceptor = new ResponseSanitizeInterceptor();

    context = {
      switchToHttp: () => ({
        getRequest: () => ({ requestId: 'test-req-123' }),
      }),
    } as ExecutionContext;

    next = {
      handle: () => of({}),
    };
  });

  it('should add request ID to response', (done) => {
    const response = { data: 'test' };
    next.handle = () => of(response);

    interceptor.intercept(context, next).subscribe((result) => {
      expect(result.requestId).toBe('test-req-123');
      done();
    });
  });

  it('should remove blacklisted fields', (done) => {
    const response = {
      id: '123',
      email: 'test@test.com',
      password: 'secret123',
      hashedPassword: 'hash',
      apiKeyHash: 'keyhash',
    };
    next.handle = () => of(response);

    interceptor.intercept(context, next).subscribe((result) => {
      expect(result.id).toBe('123');
      expect(result.email).toBe('test@test.com');
      expect(result.password).toBeUndefined();
      expect(result.hashedPassword).toBeUndefined();
      expect(result.apiKeyHash).toBeUndefined();
      done();
    });
  });

  it('should mask API keys in response', (done) => {
    const response = {
      apiKey: 'sk_test_1234567890abcdef',
      api_key: 'sk_live_abcdefghijklmnop',
    };
    next.handle = () => of(response);

    interceptor.intercept(context, next).subscribe((result) => {
      expect(result.apiKey).toBe('[REDACTED]');
      expect(result.api_key).toBe('[REDACTED]');
      done();
    });
  });

  it('should handle nested objects', (done) => {
    const response = {
      user: {
        id: '123',
        password: 'should-be-removed',
        profile: {
          name: 'John',
          apiKeyHash: 'should-be-removed',
        },
      },
    };
    next.handle = () => of(response);

    interceptor.intercept(context, next).subscribe((result) => {
      expect(result.user.id).toBe('123');
      expect(result.user.password).toBeUndefined();
      expect(result.user.profile.name).toBe('John');
      expect(result.user.profile.apiKeyHash).toBeUndefined();
      done();
    });
  });

  it('should handle arrays', (done) => {
    const response = [
      { id: '1', password: 'secret1' },
      { id: '2', password: 'secret2' },
    ];
    next.handle = () => of(response);

    interceptor.intercept(context, next).subscribe((result) => {
      expect(result[0].id).toBe('1');
      expect(result[0].password).toBeUndefined();
      expect(result[1].id).toBe('2');
      expect(result[1].password).toBeUndefined();
      done();
    });
  });
});
```

## 🧪 Manual Testing Scripts

### 1. Security Audit Verification Script

**Create file:** `scripts/verify-security-audit.sh`

```bash
#!/bin/bash

echo "🔒 Security Audit Verification Script"
echo "======================================"
echo ""

# Color codes
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Counter for issues
ISSUES=0

echo "1. Checking for TODO/FIXME comments..."
TODO_COUNT=$(grep -r "TODO\|FIXME\|XXX\|HACK" apps/api/src/ --include="*.ts" 2>/dev/null | grep -v node_modules | wc -l)
if [ $TODO_COUNT -gt 0 ]; then
    echo -e "${RED}❌ Found $TODO_COUNT TODO/FIXME comments${NC}"
    grep -r "TODO\|FIXME\|XXX\|HACK" apps/api/src/ --include="*.ts" | grep -v node_modules | head -5
    ISSUES=$((ISSUES + 1))
else
    echo -e "${GREEN}✅ No TODO/FIXME comments found${NC}"
fi
echo ""

echo "2. Checking for console.log statements..."
CONSOLE_COUNT=$(grep -r "console\.\(log\|error\|warn\|debug\)" apps/api/src/ --include="*.ts" 2>/dev/null | grep -v ".spec.ts" | wc -l)
if [ $CONSOLE_COUNT -gt 0 ]; then
    echo -e "${RED}❌ Found $CONSOLE_COUNT console statements${NC}"
    grep -r "console\.\(log\|error\|warn\|debug\)" apps/api/src/ --include="*.ts" | grep -v ".spec.ts" | head -5
    ISSUES=$((ISSUES + 1))
else
    echo -e "${GREEN}✅ No console statements found${NC}"
fi
echo ""

echo "3. Checking for security utils..."
if [ -f "apps/api/src/common/utils/security.utils.ts" ]; then
    echo -e "${GREEN}✅ Security utils file exists${NC}"
else
    echo -e "${RED}❌ Security utils file missing${NC}"
    ISSUES=$((ISSUES + 1))
fi
echo ""

echo "4. Checking for request ID middleware..."
if [ -f "apps/api/src/common/middleware/request-id.middleware.ts" ]; then
    echo -e "${GREEN}✅ Request ID middleware exists${NC}"
else
    echo -e "${RED}❌ Request ID middleware missing${NC}"
    ISSUES=$((ISSUES + 1))
fi
echo ""

echo "5. Checking for response sanitization..."
if [ -f "apps/api/src/common/interceptors/response-sanitize.interceptor.ts" ]; then
    echo -e "${GREEN}✅ Response sanitization interceptor exists${NC}"
else
    echo -e "${RED}❌ Response sanitization interceptor missing${NC}"
    ISSUES=$((ISSUES + 1))
fi
echo ""

echo "6. Checking for exposed sensitive fields..."
SENSITIVE_COUNT=$(grep -r "password\|secret\|apiKeyHash\|webhookSecret" apps/api/src/ --include="*.controller.ts" 2>/dev/null | grep -v "sanitize\|mask\|blacklist" | wc -l)
if [ $SENSITIVE_COUNT -gt 5 ]; then
    echo -e "${YELLOW}⚠️  Found $SENSITIVE_COUNT potential sensitive field exposures (review needed)${NC}"
else
    echo -e "${GREEN}✅ Sensitive field exposure looks good${NC}"
fi
echo ""

echo "======================================"
if [ $ISSUES -eq 0 ]; then
    echo -e "${GREEN}✅ Security audit passed! All checks completed.${NC}"
    exit 0
else
    echo -e "${RED}❌ Security audit failed: $ISSUES issues found${NC}"
    exit 1
fi
```

### 2. API Testing Script

**Create file:** `scripts/test-security-features.sh`

```bash
#!/bin/bash

API_URL="http://localhost:3001"
echo "🧪 Testing Security Features"
echo "============================"
echo ""

# Test 1: Request ID Header
echo "Test 1: Request ID Header"
echo "-------------------------"
RESPONSE=$(curl -s -I "$API_URL/api/v1/products" 2>/dev/null | grep -i "x-request-id")
if [ -n "$RESPONSE" ]; then
    echo "✅ Request ID header present:"
    echo "   $RESPONSE"
else
    echo "❌ Request ID header missing"
fi
echo ""

# Test 2: Custom Request ID
echo "Test 2: Custom Request ID"
echo "-------------------------"
CUSTOM_ID="custom-test-id-123"
RESPONSE=$(curl -s -I -H "x-request-id: $CUSTOM_ID" "$API_URL/api/v1/products" 2>/dev/null | grep -i "x-request-id")
if echo "$RESPONSE" | grep -q "$CUSTOM_ID"; then
    echo "✅ Custom request ID accepted:"
    echo "   $RESPONSE"
else
    echo "❌ Custom request ID not working"
fi
echo ""

# Test 3: API Key Masking (trigger an error)
echo "Test 3: API Key Masking"
echo "-------------------------"
echo "Sending invalid API key..."
RESPONSE=$(curl -s -H "Authorization: Bearer sk_test_verylongapikeythatshouldbmasked123456" "$API_URL/api/v1/products")
echo "Response: $RESPONSE"
echo "(Check server logs - key should be masked)"
echo ""

# Test 4: Security Headers
echo "Test 4: Security Headers"
echo "-------------------------"
HEADERS=$(curl -s -I "$API_URL/api/v1/products" 2>/dev/null)
echo "Checking security headers..."

check_header() {
    if echo "$HEADERS" | grep -qi "$1"; then
        echo "✅ $1 present"
    else
        echo "⚠️  $1 missing (configure in production)"
    fi
}

check_header "X-Frame-Options"
check_header "X-Content-Type-Options"
check_header "X-XSS-Protection"
echo ""

# Test 5: Response Sanitization
echo "Test 5: Response Sanitization"
echo "------------------------------"
echo "Testing if sensitive fields are removed..."
echo "(This requires a valid JWT token - skip if not available)"
echo ""

echo "============================"
echo "✅ Security feature tests complete!"
echo "Review server logs for masked values."
```

### 3. Load Testing for Request IDs

**Create file:** `scripts/load-test-request-ids.js`

```javascript
const http = require('http');

console.log('🚀 Load Testing Request IDs\n');

const requests = [];
const requestCount = 100;

// Generate multiple concurrent requests
for (let i = 0; i < requestCount; i++) {
  const promise = new Promise((resolve, reject) => {
    const options = {
      hostname: 'localhost',
      port: 3001,
      path: '/api/v1/products',
      method: 'GET',
      headers: i % 2 === 0 ? {} : { 'x-request-id': `custom-${i}` },
    };

    const req = http.request(options, (res) => {
      const requestId = res.headers['x-request-id'];
      resolve({
        index: i,
        status: res.statusCode,
        requestId,
        custom: i % 2 !== 0,
      });
    });

    req.on('error', reject);
    req.end();
  });

  requests.push(promise);
}

// Wait for all requests to complete
Promise.all(requests)
  .then((results) => {
    console.log(`Completed ${results.length} requests\n`);

    // Check for unique request IDs
    const ids = new Set(results.map(r => r.requestId));
    console.log(`Unique request IDs: ${ids.size}/${results.length}`);

    // Check custom IDs
    const customResults = results.filter(r => r.custom);
    const customMatches = customResults.filter(r =>
      r.requestId && r.requestId.startsWith('custom-')
    );
    console.log(`Custom IDs preserved: ${customMatches.length}/${customResults.length}`);

    // Summary
    if (ids.size === results.length) {
      console.log('\n✅ All request IDs are unique!');
    } else {
      console.log('\n⚠️ Some request IDs are not unique');
    }
  })
  .catch((error) => {
    console.error('❌ Error during load test:', error);
  });
```

## 📊 Integration Test Suite

**File:** `apps/api/test/security-audit.e2e-spec.ts`

```typescript
import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import * as request from 'supertest';
import { AppModule } from '../src/app.module';

describe('Security Audit (e2e)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  describe('Request ID Functionality', () => {
    it('should generate request ID for requests', () => {
      return request(app.getHttpServer())
        .get('/api/v1/products')
        .expect((res) => {
          expect(res.headers['x-request-id']).toBeDefined();
          expect(res.headers['x-request-id']).toMatch(/^req_/);
        });
    });

    it('should use provided request ID', () => {
      const customId = 'custom-test-id-123';
      return request(app.getHttpServer())
        .get('/api/v1/products')
        .set('x-request-id', customId)
        .expect((res) => {
          expect(res.headers['x-request-id']).toBe(customId);
        });
    });

    it('should include request ID in response body', () => {
      return request(app.getHttpServer())
        .get('/api/v1/products')
        .expect((res) => {
          if (typeof res.body === 'object') {
            expect(res.body.requestId).toBeDefined();
          }
        });
    });
  });

  describe('Response Sanitization', () => {
    it('should not expose sensitive fields', () => {
      // This test assumes you have a user endpoint
      return request(app.getHttpServer())
        .get('/api/users/test')
        .expect((res) => {
          if (res.body && typeof res.body === 'object') {
            expect(res.body.password).toBeUndefined();
            expect(res.body.hashedPassword).toBeUndefined();
            expect(res.body.apiKeyHash).toBeUndefined();
            expect(res.body.webhookSecret).toBeUndefined();
          }
        });
    });
  });

  describe('Error Message Sanitization', () => {
    it('should mask API keys in error messages', () => {
      const longApiKey = 'sk_test_abcdefghijklmnopqrstuvwxyz123456';
      return request(app.getHttpServer())
        .get('/api/v1/products')
        .set('Authorization', `Bearer ${longApiKey}`)
        .expect((res) => {
          if (res.status >= 400 && res.body.error) {
            expect(res.body.error.message).not.toContain(longApiKey);
          }
        });
    });
  });
});
```

## 🔍 Manual Testing Checklist

### Before Security Audit
- [ ] Note presence of TODO comments in auth code
- [ ] Note console.log statements in production code
- [ ] Check if API keys are fully visible in logs
- [ ] Check if request tracing is difficult

### After Security Audit
- [ ] ✅ No TODO/FIXME comments in auth code
- [ ] ✅ No console.log in production code
- [ ] ✅ API keys are masked in all logs
- [ ] ✅ Request IDs present in all responses
- [ ] ✅ Sensitive fields removed from responses
- [ ] ✅ Security logger capturing auth events
- [ ] ✅ Webhook validation logged properly
- [ ] ✅ All automated tests passing

## 📈 Performance Testing

### Measure Auth Performance Impact

```bash
# Before security audit
ab -n 1000 -c 10 http://localhost:3001/api/v1/products > before-audit.txt

# After security audit
ab -n 1000 -c 10 http://localhost:3001/api/v1/products > after-audit.txt

# Compare results
echo "Before:"
grep "Time per request" before-audit.txt

echo "After:"
grep "Time per request" after-audit.txt

# Expected: Less than 10% performance impact
```

## 🎯 Success Criteria

The security audit is complete when:

1. **Code Quality**
   - Zero TODO/FIXME comments in production code
   - Zero console.log statements (except in tests)
   - All sensitive operations logged properly

2. **Security Features**
   - Request IDs on every request/response
   - API keys always masked in logs
   - Sensitive fields never in responses
   - All Stripe webhooks validated

3. **Testing**
   - All automated tests pass
   - Manual verification complete
   - Performance impact < 10%

4. **Documentation**
   - Security utils documented
   - Testing procedures documented
   - Team aware of new patterns

## 🆘 Common Issues & Solutions

### Issue: Tests fail with "Cannot find module"
```bash
# Solution: Ensure all new files are compiled
cd apps/api
pnpm build
pnpm test
```

### Issue: Request IDs not showing in logs
```typescript
// Solution: Ensure logger includes context
this.logger.log('Message', { requestId: req.requestId });
```

### Issue: Sensitive data still appearing
```typescript
// Solution: Add field to blacklist in interceptor
private readonly blacklistedFields = [
  'password',
  'yourNewField', // Add here
];
```

---

**Remember:** Security is an ongoing process. These tests should be run regularly, especially before deployments!
# 🧪 Rate Limiting - Testing Guide

**Purpose:** Comprehensive testing of the rate limiting implementation

## 📋 Testing Overview

This guide covers unit tests, integration tests, load tests, and manual verification procedures for the rate limiting feature.

## 🔧 Unit Tests

### Rate Limit Guard Tests

**File:** `apps/api/src/common/guards/organization-rate-limit.guard.spec.ts`

```typescript
import { Test, TestingModule } from '@nestjs/testing';
import { ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ThrottlerException } from '@nestjs/throttler';
import { OrganizationRateLimitGuard } from './organization-rate-limit.guard';
import { rateLimitConfig } from '../../config/rate-limit.config';

describe('OrganizationRateLimitGuard', () => {
  let guard: OrganizationRateLimitGuard;
  let reflector: Reflector;
  let mockStorage: Map<string, any>;

  beforeEach(async () => {
    mockStorage = new Map();
    reflector = new Reflector();
    guard = new OrganizationRateLimitGuard(reflector);

    // Mock storage service
    guard['storageService'] = {
      increment: jest.fn(async (key: string, ttl: number) => {
        const record = mockStorage.get(key) || { totalHits: 0, expiresAt: Date.now() + ttl };
        record.totalHits++;
        mockStorage.set(key, record);
        return {
          totalHits: record.totalHits,
          timeToExpire: Math.max(0, record.expiresAt - Date.now()),
        };
      }),
    };
  });

  describe('canActivate', () => {
    let context: ExecutionContext;

    beforeEach(() => {
      context = {
        switchToHttp: () => ({
          getRequest: () => ({
            user: { organizationId: 'org-123', type: 'jwt' },
            route: { path: '/api/v1/products' },
            method: 'GET',
            requestId: 'req-123',
          }),
          getResponse: () => ({
            setHeader: jest.fn(),
          }),
        }),
      } as any;
    });

    it('should allow requests under the limit', async () => {
      const result = await guard.canActivate(context);
      expect(result).toBe(true);
    });

    it('should block requests over the limit', async () => {
      // Simulate hitting the limit
      const key = 'org_org-123';
      mockStorage.set(key, {
        totalHits: rateLimitConfig.organization.limit,
        expiresAt: Date.now() + 60000,
      });

      await expect(guard.canActivate(context)).rejects.toThrow(ThrottlerException);
    });

    it('should skip rate limiting when no organization context', async () => {
      context = {
        switchToHttp: () => ({
          getRequest: () => ({
            user: { type: 'jwt' }, // No organizationId
            route: { path: '/api/v1/products' },
          }),
          getResponse: () => ({
            setHeader: jest.fn(),
          }),
        }),
      } as any;

      const result = await guard.canActivate(context);
      expect(result).toBe(true);
    });

    it('should set correct rate limit headers', async () => {
      const mockSetHeader = jest.fn();
      context = {
        switchToHttp: () => ({
          getRequest: () => ({
            user: { organizationId: 'org-123' },
            route: { path: '/api/v1/products' },
          }),
          getResponse: () => ({
            setHeader: mockSetHeader,
          }),
        }),
      } as any;

      await guard.canActivate(context);

      expect(mockSetHeader).toHaveBeenCalledWith('X-RateLimit-Limit', expect.any(Number));
      expect(mockSetHeader).toHaveBeenCalledWith('X-RateLimit-Remaining', expect.any(Number));
      expect(mockSetHeader).toHaveBeenCalledWith('X-RateLimit-Reset', expect.any(Number));
    });

    it('should apply endpoint-specific limits', async () => {
      context = {
        switchToHttp: () => ({
          getRequest: () => ({
            user: { organizationId: 'org-123' },
            route: { path: '/api/v1/checkout/create-session' },
            method: 'POST',
          }),
          getResponse: () => ({
            setHeader: jest.fn(),
          }),
        }),
      } as any;

      // Checkout endpoint has lower limit (50)
      const key = 'org_org-123';
      mockStorage.set(key, {
        totalHits: 49,
        expiresAt: Date.now() + 60000,
      });

      // Should allow at 49
      const result = await guard.canActivate(context);
      expect(result).toBe(true);

      // Should block at 51
      mockStorage.set(key, {
        totalHits: 51,
        expiresAt: Date.now() + 60000,
      });

      await expect(guard.canActivate(context)).rejects.toThrow(ThrottlerException);
    });

    it('should handle graceful degradation on storage failure', async () => {
      guard['storageService'].increment = jest.fn().mockRejectedValue(new Error('Storage failed'));

      rateLimitConfig.features.enableGracefulDegradation = true;

      // Should allow request despite storage failure
      const result = await guard.canActivate(context);
      expect(result).toBe(true);
    });
  });

  describe('generateKey', () => {
    it('should generate correct key for organization', () => {
      const context = {
        switchToHttp: () => ({
          getRequest: () => ({
            user: { organizationId: 'org-456' },
          }),
        }),
      } as any;

      const key = guard['generateKey'](context);
      expect(key).toBe('org_org-456');
    });
  });

  describe('pathMatches', () => {
    it('should match exact paths', () => {
      expect(guard['pathMatches']('/api/v1/products', '/api/v1/products')).toBe(true);
      expect(guard['pathMatches']('/api/v1/products', '/api/v1/customers')).toBe(false);
    });

    it('should match wildcard patterns', () => {
      expect(guard['pathMatches']('/api/v1/analytics/revenue', '/api/v1/analytics/*')).toBe(true);
      expect(guard['pathMatches']('/api/v1/products/123', '/api/v1/products/*')).toBe(true);
      expect(guard['pathMatches']('/api/v2/products', '/api/v1/*')).toBe(false);
    });
  });
});
```

### Storage Service Tests

**File:** `apps/api/src/common/services/throttler-storage.service.spec.ts`

```typescript
import { CustomThrottlerStorage } from './throttler-storage.service';

describe('CustomThrottlerStorage', () => {
  let storage: CustomThrottlerStorage;

  beforeEach(() => {
    storage = new CustomThrottlerStorage();
    jest.useFakeTimers();
  });

  afterEach(() => {
    storage.onModuleDestroy();
    jest.useRealTimers();
  });

  describe('increment', () => {
    it('should create new record for first hit', async () => {
      const result = await storage.increment('test-key', 60000);
      expect(result.totalHits).toBe(1);
      expect(result.timeToExpire).toBe(60000);
    });

    it('should increment existing record', async () => {
      await storage.increment('test-key', 60000);
      const result = await storage.increment('test-key', 60000);
      expect(result.totalHits).toBe(2);
    });

    it('should reset after TTL expiry', async () => {
      await storage.increment('test-key', 1000);

      // Advance time past TTL
      jest.advanceTimersByTime(1001);

      const result = await storage.increment('test-key', 60000);
      expect(result.totalHits).toBe(1);
    });

    it('should handle multiple keys independently', async () => {
      const result1 = await storage.increment('key-1', 60000);
      const result2 = await storage.increment('key-2', 60000);
      const result3 = await storage.increment('key-1', 60000);

      expect(result1.totalHits).toBe(1);
      expect(result2.totalHits).toBe(1);
      expect(result3.totalHits).toBe(2);
    });
  });

  describe('cleanup', () => {
    it('should remove expired entries', async () => {
      await storage.increment('key-1', 1000);
      await storage.increment('key-2', 60000);

      // Advance time to expire key-1 but not key-2
      jest.advanceTimersByTime(1001);

      // Trigger cleanup
      storage['cleanup']();

      // key-1 should be reset, key-2 should persist
      const result1 = await storage.increment('key-1', 60000);
      const result2 = await storage.increment('key-2', 60000);

      expect(result1.totalHits).toBe(1); // Reset
      expect(result2.totalHits).toBe(2); // Incremented
    });

    it('should run cleanup periodically', () => {
      const cleanupSpy = jest.spyOn(storage as any, 'cleanup');

      // Advance time by 1 minute
      jest.advanceTimersByTime(60000);

      expect(cleanupSpy).toHaveBeenCalled();
    });
  });

  describe('memory management', () => {
    it('should handle large number of keys', async () => {
      const promises = [];
      for (let i = 0; i < 1000; i++) {
        promises.push(storage.increment(`key-${i}`, 60000));
      }

      const results = await Promise.all(promises);
      expect(results).toHaveLength(1000);
      expect(results.every(r => r.totalHits === 1)).toBe(true);
    });
  });
});
```

## 🧪 Integration Tests

**File:** `apps/api/test/rate-limiting.e2e-spec.ts`

```typescript
import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import * as request from 'supertest';
import { AppModule } from '../src/app.module';

describe('Rate Limiting (e2e)', () => {
  let app: INestApplication;
  let apiKey: string;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    await app.init();

    // Get an API key for testing (assuming test data exists)
    apiKey = process.env.TEST_API_KEY || 'sk_test_123';
  });

  afterAll(async () => {
    await app.close();
  });

  describe('Global IP Rate Limiting', () => {
    it('should enforce global rate limits', async () => {
      const requests = [];

      // Make 110 requests (limit is 100)
      for (let i = 0; i < 110; i++) {
        requests.push(
          request(app.getHttpServer())
            .get('/api/v1/products')
            .set('X-Forwarded-For', '192.168.1.1') // Same IP
        );
      }

      const responses = await Promise.all(requests);

      // First 100 should succeed
      const successCount = responses.filter(r => r.status === 200).length;
      const rateLimitedCount = responses.filter(r => r.status === 429).length;

      expect(successCount).toBeGreaterThanOrEqual(95); // Allow some margin
      expect(rateLimitedCount).toBeGreaterThan(0);
    });

    it('should track different IPs separately', async () => {
      const promises = [];

      // Make requests from different IPs
      for (let i = 0; i < 10; i++) {
        promises.push(
          request(app.getHttpServer())
            .get('/api/v1/products')
            .set('X-Forwarded-For', `192.168.1.${i}`)
        );
      }

      const responses = await Promise.all(promises);

      // All should succeed as they're from different IPs
      expect(responses.every(r => r.status === 200 || r.status === 401)).toBe(true);
    });
  });

  describe('Organization Rate Limiting', () => {
    it('should enforce organization-specific limits', async () => {
      const requests = [];

      // Make requests with API key (organization context)
      for (let i = 0; i < 20; i++) {
        requests.push(
          request(app.getHttpServer())
            .get('/api/v1/products')
            .set('Authorization', `Bearer ${apiKey}`)
        );
      }

      const responses = await Promise.all(requests);
      const lastResponse = responses[responses.length - 1];

      // Check for rate limit headers
      expect(lastResponse.headers['x-ratelimit-limit']).toBeDefined();
      expect(lastResponse.headers['x-ratelimit-remaining']).toBeDefined();
      expect(lastResponse.headers['x-ratelimit-reset']).toBeDefined();
    });
  });

  describe('Endpoint-Specific Rate Limiting', () => {
    it('should apply stricter limits to checkout endpoint', async () => {
      const requests = [];

      // Checkout limit is 50 per minute
      for (let i = 0; i < 60; i++) {
        requests.push(
          request(app.getHttpServer())
            .post('/api/v1/checkout/create-session')
            .set('Authorization', `Bearer ${apiKey}`)
            .send({ productId: 'prod-123' })
        );
      }

      const responses = await Promise.all(requests);
      const rateLimited = responses.filter(r => r.status === 429);

      // Should hit rate limit before 60 requests
      expect(rateLimited.length).toBeGreaterThan(0);
    });

    it('should apply lower limits to analytics endpoints', async () => {
      const requests = [];

      // Analytics limit is 20 per minute
      for (let i = 0; i < 25; i++) {
        requests.push(
          request(app.getHttpServer())
            .get('/api/v1/analytics/revenue')
            .set('Authorization', `Bearer ${apiKey}`)
        );
      }

      const responses = await Promise.all(requests);
      const successCount = responses.filter(r => r.status < 429).length;

      // Should allow approximately 20 requests
      expect(successCount).toBeLessThanOrEqual(22); // Allow small margin
    });
  });

  describe('Rate Limit Headers', () => {
    it('should include proper rate limit headers', async () => {
      const response = await request(app.getHttpServer())
        .get('/api/v1/products')
        .set('Authorization', `Bearer ${apiKey}`);

      expect(response.headers['x-ratelimit-limit']).toBeDefined();
      expect(response.headers['x-ratelimit-remaining']).toBeDefined();
      expect(response.headers['x-ratelimit-reset']).toBeDefined();

      const limit = parseInt(response.headers['x-ratelimit-limit']);
      const remaining = parseInt(response.headers['x-ratelimit-remaining']);
      const reset = parseInt(response.headers['x-ratelimit-reset']);

      expect(limit).toBeGreaterThan(0);
      expect(remaining).toBeLessThanOrEqual(limit);
      expect(reset).toBeGreaterThan(Date.now() / 1000);
    });

    it('should include Retry-After header when rate limited', async () => {
      // Make many requests to trigger rate limit
      const requests = [];
      for (let i = 0; i < 200; i++) {
        requests.push(
          request(app.getHttpServer())
            .get('/api/v1/products')
            .set('X-Forwarded-For', '10.0.0.1')
        );
      }

      const responses = await Promise.all(requests);
      const rateLimited = responses.find(r => r.status === 429);

      if (rateLimited) {
        expect(rateLimited.headers['retry-after']).toBeDefined();
        const retryAfter = parseInt(rateLimited.headers['retry-after']);
        expect(retryAfter).toBeGreaterThan(0);
        expect(retryAfter).toBeLessThanOrEqual(60);
      }
    });
  });

  describe('Health Check Bypass', () => {
    it('should never rate limit health checks', async () => {
      const requests = [];

      // Make many health check requests
      for (let i = 0; i < 200; i++) {
        requests.push(
          request(app.getHttpServer()).get('/health')
        );
      }

      const responses = await Promise.all(requests);

      // All should succeed
      expect(responses.every(r => r.status === 200)).toBe(true);
    });
  });

  describe('429 Error Response', () => {
    it('should return proper error format when rate limited', async () => {
      // Trigger rate limit
      const requests = [];
      for (let i = 0; i < 200; i++) {
        requests.push(
          request(app.getHttpServer())
            .get('/api/v1/products')
            .set('X-Forwarded-For', '10.0.0.2')
        );
      }

      const responses = await Promise.all(requests);
      const rateLimited = responses.find(r => r.status === 429);

      if (rateLimited) {
        expect(rateLimited.body).toHaveProperty('statusCode', 429);
        expect(rateLimited.body).toHaveProperty('message');
        expect(rateLimited.body).toHaveProperty('error', 'Too Many Requests');
        expect(rateLimited.body).toHaveProperty('requestId');
      }
    });
  });
});
```

## 📊 Load Testing Scripts

### 1. Rate Limit Verification Script

**Create file:** `scripts/test-rate-limits.sh`

```bash
#!/bin/bash

API_URL="http://localhost:3001"
API_KEY="sk_test_YOUR_KEY_HERE"

echo "🚦 Rate Limiting Test Suite"
echo "============================"
echo ""

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

# Function to test rate limits
test_rate_limit() {
    local endpoint=$1
    local method=$2
    local limit=$3
    local auth=$4
    local data=$5

    echo "Testing: $method $endpoint (Limit: $limit/min)"
    echo -n "Progress: "

    local success_count=0
    local rate_limited_count=0

    for i in $(seq 1 $((limit + 10))); do
        if [ "$auth" = "true" ]; then
            AUTH_HEADER="-H \"Authorization: Bearer $API_KEY\""
        else
            AUTH_HEADER=""
        fi

        if [ "$data" != "" ]; then
            DATA_FLAG="-d '$data' -H 'Content-Type: application/json'"
        else
            DATA_FLAG=""
        fi

        STATUS=$(curl -s -o /dev/null -w "%{http_code}" \
            -X $method \
            $AUTH_HEADER \
            $DATA_FLAG \
            "$API_URL$endpoint")

        if [ "$STATUS" = "200" ] || [ "$STATUS" = "201" ]; then
            ((success_count++))
            echo -n "."
        elif [ "$STATUS" = "429" ]; then
            ((rate_limited_count++))
            echo -n "X"
        else
            echo -n "?"
        fi

        if [ $((i % 10)) -eq 0 ]; then
            echo -n " "
        fi
    done

    echo ""
    echo "Results: $success_count successful, $rate_limited_count rate limited"

    if [ $rate_limited_count -gt 0 ]; then
        echo -e "${GREEN}✅ Rate limiting is working!${NC}"
    else
        echo -e "${RED}❌ Rate limiting might not be working${NC}"
    fi
    echo ""
}

# Test 1: Global Rate Limit
echo "1. Global Rate Limit Test (100/min)"
echo "------------------------------------"
test_rate_limit "/api/v1/products" "GET" 100 false ""

# Test 2: Organization Rate Limit
echo "2. Organization Rate Limit Test (1000/min)"
echo "------------------------------------------"
test_rate_limit "/api/v1/products" "GET" 50 true ""

# Test 3: Checkout Endpoint Limit
echo "3. Checkout Endpoint Limit (50/min)"
echo "------------------------------------"
test_rate_limit "/api/v1/checkout/create-session" "POST" 50 true '{"productId":"prod-123"}'

# Test 4: Analytics Endpoint Limit
echo "4. Analytics Endpoint Limit (20/min)"
echo "-------------------------------------"
test_rate_limit "/api/v1/analytics/revenue" "GET" 20 true ""

# Test 5: Health Check (Should Never Limit)
echo "5. Health Check Test (No Limit)"
echo "--------------------------------"
echo -n "Making 200 requests: "
HEALTH_SUCCESS=0
for i in {1..200}; do
    STATUS=$(curl -s -o /dev/null -w "%{http_code}" "$API_URL/health")
    if [ "$STATUS" = "200" ]; then
        ((HEALTH_SUCCESS++))
    fi
    if [ $((i % 20)) -eq 0 ]; then
        echo -n "."
    fi
done
echo ""
if [ $HEALTH_SUCCESS -eq 200 ]; then
    echo -e "${GREEN}✅ Health check never rate limited!${NC}"
else
    echo -e "${RED}❌ Health check was rate limited ($HEALTH_SUCCESS/200 succeeded)${NC}"
fi
echo ""

# Test 6: Check Headers
echo "6. Rate Limit Headers Test"
echo "--------------------------"
HEADERS=$(curl -s -I -H "Authorization: Bearer $API_KEY" "$API_URL/api/v1/products")
echo "$HEADERS" | grep -E "X-RateLimit-" | while read line; do
    echo "  $line"
done

echo ""
echo "============================"
echo "✅ Rate Limit Tests Complete!"
```

### 2. Concurrent Load Test

**Create file:** `scripts/concurrent-load-test.js`

```javascript
const http = require('http');
const https = require('https');

// Configuration
const config = {
  host: 'localhost',
  port: 3001,
  endpoint: '/api/v1/products',
  apiKey: 'sk_test_YOUR_KEY_HERE',
  concurrentUsers: 10,
  requestsPerUser: 100,
  delayBetweenRequests: 100, // ms
};

// Statistics
const stats = {
  success: 0,
  rateLimited: 0,
  errors: 0,
  startTime: Date.now(),
  responseTimes: [],
};

// Make a single request
function makeRequest(userId) {
  return new Promise((resolve) => {
    const startTime = Date.now();

    const options = {
      hostname: config.host,
      port: config.port,
      path: config.endpoint,
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${config.apiKey}`,
        'X-User-Id': userId, // Track which simulated user
      },
    };

    const req = http.request(options, (res) => {
      const responseTime = Date.now() - startTime;
      stats.responseTimes.push(responseTime);

      if (res.statusCode === 200) {
        stats.success++;
      } else if (res.statusCode === 429) {
        stats.rateLimited++;
        console.log(`User ${userId} rate limited. Headers:`, {
          limit: res.headers['x-ratelimit-limit'],
          remaining: res.headers['x-ratelimit-remaining'],
          reset: res.headers['x-ratelimit-reset'],
          retryAfter: res.headers['retry-after'],
        });
      } else {
        stats.errors++;
      }

      resolve(res.statusCode);
    });

    req.on('error', (error) => {
      stats.errors++;
      resolve(null);
    });

    req.end();
  });
}

// Simulate a user making multiple requests
async function simulateUser(userId) {
  console.log(`User ${userId} starting...`);

  for (let i = 0; i < config.requestsPerUser; i++) {
    await makeRequest(userId);

    // Random delay to simulate real usage
    const delay = config.delayBetweenRequests + Math.random() * 100;
    await new Promise(resolve => setTimeout(resolve, delay));

    // Progress indicator
    if ((i + 1) % 10 === 0) {
      console.log(`User ${userId}: ${i + 1}/${config.requestsPerUser} requests`);
    }
  }

  console.log(`User ${userId} completed`);
}

// Run the load test
async function runLoadTest() {
  console.log('🚦 Concurrent Load Test');
  console.log('========================');
  console.log(`Users: ${config.concurrentUsers}`);
  console.log(`Requests per user: ${config.requestsPerUser}`);
  console.log(`Total requests: ${config.concurrentUsers * config.requestsPerUser}`);
  console.log('');

  // Start all users concurrently
  const userPromises = [];
  for (let i = 1; i <= config.concurrentUsers; i++) {
    userPromises.push(simulateUser(i));
  }

  // Wait for all users to complete
  await Promise.all(userPromises);

  // Calculate statistics
  const duration = (Date.now() - stats.startTime) / 1000;
  const totalRequests = config.concurrentUsers * config.requestsPerUser;
  const avgResponseTime = stats.responseTimes.reduce((a, b) => a + b, 0) / stats.responseTimes.length;
  const maxResponseTime = Math.max(...stats.responseTimes);
  const minResponseTime = Math.min(...stats.responseTimes);

  // Print results
  console.log('');
  console.log('Results');
  console.log('=======');
  console.log(`Duration: ${duration.toFixed(2)} seconds`);
  console.log(`Requests/sec: ${(totalRequests / duration).toFixed(2)}`);
  console.log('');
  console.log('Status Codes:');
  console.log(`  200 OK: ${stats.success} (${(stats.success / totalRequests * 100).toFixed(1)}%)`);
  console.log(`  429 Rate Limited: ${stats.rateLimited} (${(stats.rateLimited / totalRequests * 100).toFixed(1)}%)`);
  console.log(`  Errors: ${stats.errors}`);
  console.log('');
  console.log('Response Times:');
  console.log(`  Average: ${avgResponseTime.toFixed(2)}ms`);
  console.log(`  Min: ${minResponseTime}ms`);
  console.log(`  Max: ${maxResponseTime}ms`);
  console.log('');

  if (stats.rateLimited > 0) {
    console.log('✅ Rate limiting is working correctly!');
  } else {
    console.log('⚠️ No rate limiting detected. Check configuration.');
  }
}

// Run the test
runLoadTest().catch(console.error);
```

## 🎯 Manual Testing Checklist

### Basic Functionality
- [ ] Global rate limit enforced (100/min per IP)
- [ ] Organization rate limit enforced (1000/min)
- [ ] Endpoint-specific limits working
- [ ] Rate limit headers present in responses
- [ ] 429 status code returned when limited
- [ ] Retry-After header included

### Headers Verification
- [ ] X-RateLimit-Limit shows correct limit
- [ ] X-RateLimit-Remaining decrements properly
- [ ] X-RateLimit-Reset shows future timestamp
- [ ] Headers update on each request

### Edge Cases
- [ ] Health endpoint never rate limited
- [ ] Different IPs tracked separately
- [ ] Different organizations tracked separately
- [ ] Rate limits reset after TTL
- [ ] Graceful degradation on storage failure

### API Key Types
- [ ] Secret keys get higher limits
- [ ] Publishable keys get lower limits
- [ ] JWT auth respects organization limits

### Performance
- [ ] Response time < 50ms overhead
- [ ] Memory usage stable
- [ ] No memory leaks after extended use
- [ ] Cleanup removes expired entries

## 📈 Monitoring Dashboard

Create a simple monitoring page to visualize rate limiting:

**File:** `apps/web/src/app/dashboard/[organization]/rate-limits/page.tsx`

```typescript
'use client';

import { useState, useEffect } from 'react';
import { apiClient } from '@/lib/api/client';

export default function RateLimitsPage() {
  const [metrics, setMetrics] = useState({
    current: 0,
    limit: 1000,
    remaining: 1000,
    resetTime: 0,
  });

  useEffect(() => {
    // Make a test request to get rate limit headers
    const checkRateLimits = async () => {
      try {
        const response = await fetch('/api/v1/products', {
          method: 'HEAD',
        });

        setMetrics({
          limit: parseInt(response.headers.get('X-RateLimit-Limit') || '1000'),
          remaining: parseInt(response.headers.get('X-RateLimit-Remaining') || '1000'),
          resetTime: parseInt(response.headers.get('X-RateLimit-Reset') || '0'),
          current: 0,
        });
      } catch (error) {
        console.error('Failed to fetch rate limits:', error);
      }
    };

    checkRateLimits();
    const interval = setInterval(checkRateLimits, 5000);
    return () => clearInterval(interval);
  }, []);

  const usagePercentage = ((metrics.limit - metrics.remaining) / metrics.limit) * 100;
  const resetIn = Math.max(0, metrics.resetTime - Math.floor(Date.now() / 1000));

  return (
    <div className="p-6">
      <h1 className="text-2xl font-bold mb-6">Rate Limits</h1>

      <div className="bg-white rounded-lg shadow p-6">
        <h2 className="text-lg font-semibold mb-4">Current Usage</h2>

        <div className="mb-4">
          <div className="flex justify-between mb-2">
            <span>API Calls</span>
            <span>{metrics.limit - metrics.remaining} / {metrics.limit}</span>
          </div>

          <div className="w-full bg-gray-200 rounded-full h-2">
            <div
              className={`h-2 rounded-full ${
                usagePercentage > 80 ? 'bg-red-500' :
                usagePercentage > 60 ? 'bg-yellow-500' :
                'bg-green-500'
              }`}
              style={{ width: `${usagePercentage}%` }}
            />
          </div>
        </div>

        <div className="text-sm text-gray-600">
          <p>Remaining: {metrics.remaining} requests</p>
          <p>Resets in: {resetIn} seconds</p>
        </div>
      </div>
    </div>
  );
}
```

## 🆘 Troubleshooting

### Issue: Rate limits not being enforced
```bash
# Check if throttler module is loaded
curl -v http://localhost:3001/api/v1/products 2>&1 | grep -i "x-ratelimit"

# If no headers, check logs
tail -f apps/api/logs/app.log | grep -i "throttle"
```

### Issue: Different limits than expected
```typescript
// Add debug logging to guard
console.log('Endpoint limit:', this.getLimit(context));
console.log('Storage key:', this.generateKey(context));
```

### Issue: Memory growing unbounded
```bash
# Monitor Node.js memory
node --inspect apps/api/dist/main.js
# Open chrome://inspect and take heap snapshots
```

---

**Remember:** Always test rate limiting under realistic load conditions before going to production!
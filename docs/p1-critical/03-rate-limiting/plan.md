# 🚦 Rate Limiting - Implementation Plan

**Priority:** P1 - Critical
**Estimated Time:** 3 hours
**Complexity:** Medium
**Dependencies:** Security Audit (completed)

## 📋 Overview

Implement a three-tier rate limiting system to protect the API from abuse while maintaining good performance for legitimate users. Using NestJS Throttler for simplicity and efficiency.

## 🎯 Why Rate Limiting Matters

### Business Impact
- **Cost Protection**: Prevent runaway API usage that increases infrastructure costs
- **Fair Usage**: Ensure all customers get fair access to resources
- **Attack Prevention**: Mitigate DDoS and brute force attempts
- **Predictable Performance**: Maintain consistent response times for all users
- **Monetization Ready**: Foundation for usage-based billing tiers

### Technical Impact
- **System Stability**: Prevent server overload and crashes
- **Database Protection**: Avoid connection pool exhaustion
- **Memory Management**: Control memory usage from concurrent requests
- **Stripe Protection**: Stay within Stripe API rate limits
- **Graceful Degradation**: System remains functional under load

## 🏗️ Architecture Design

### Three-Tier Rate Limiting Strategy

```
Level 1: Global (IP-based)
├── Purpose: Prevent DDoS, bot attacks
├── Limit: 100 requests/minute per IP
└── Applies to: All endpoints

Level 2: Organization (API Key based)
├── Purpose: Fair usage per customer
├── Limit: 1000 requests/minute per org
└── Applies to: Authenticated requests

Level 3: Endpoint-Specific
├── Purpose: Protect expensive operations
├── Examples:
│   ├── Checkout: 50/min per customer
│   ├── Webhook: 100/min per org
│   └── Analytics: 20/min per org
└── Applies to: Specific costly endpoints
```

### Rate Limit Response Headers

```
X-RateLimit-Limit: 1000        # Maximum requests allowed
X-RateLimit-Remaining: 950     # Requests remaining
X-RateLimit-Reset: 1640995200  # Unix timestamp when limit resets
Retry-After: 60                 # Seconds until retry (when limited)
```

## 📊 Current State Analysis

### What BillingOS Has
- ✅ Request ID tracking (from security audit)
- ✅ API key authentication
- ✅ Organization context in requests
- ❌ No rate limiting at all
- ❌ No usage tracking
- ❌ No abuse prevention

### What Autumn Does (Reference)
- Redis-backed rate limiting with Upstash
- Separate limits for different operations
- Customer-level granularity for usage tracking
- Graceful degradation if rate limiter fails
- Development/test environment bypass

### Our Approach (Pragmatic for MVP)
- In-memory rate limiting (sufficient for < 1K req/day)
- NestJS Throttler (simpler than Autumn's Hono setup)
- Three tiers of limits
- Optional Redis upgrade path for scale
- Graceful bypass on rate limiter failure

## 🔧 Implementation Components

### 1. NestJS Throttler Setup
```typescript
@Module({
  imports: [
    ThrottlerModule.forRoot({
      ttl: 60,        // Time window in seconds
      limit: 100,     // Requests per window
      storage: new ThrottlerStorageService(), // In-memory default
    }),
  ],
})
```

### 2. Custom Storage Adapter (Optional)
- In-memory for MVP (default)
- Redis adapter for production scale
- Fallback to in-memory if Redis fails

### 3. Rate Limit Guards

```typescript
// Global rate limiting
@UseGuards(ThrottlerGuard)

// Custom organization-based limiting
@UseGuards(OrganizationRateLimitGuard)

// Endpoint-specific limiting
@Throttle(50, 60) // 50 requests per 60 seconds
```

### 4. Rate Limit Skip Rules
```typescript
// Skip for health checks
@SkipThrottle()
@Get('health')

// Skip for webhook endpoints (validated differently)
@SkipThrottle()
@Post('stripe/webhooks')
```

## 📝 Detailed Requirements

### Global Rate Limiting (Level 1)
- **Identifier**: IP address
- **Default Limit**: 100 req/min
- **Applies To**: All endpoints except health
- **Headers**: Standard rate limit headers
- **Response**: 429 Too Many Requests

### Organization Rate Limiting (Level 2)
- **Identifier**: Organization ID (from auth context)
- **Default Limit**: 1000 req/min
- **Applies To**: Authenticated requests only
- **Customizable**: Per organization tier (future)
- **Tracking**: Store in organization metadata

### Endpoint-Specific Limits (Level 3)

| Endpoint | Limit | Window | Reason |
|----------|-------|---------|--------|
| POST /checkout/create | 50/min | Per customer | Stripe limits |
| GET /analytics/* | 20/min | Per org | Expensive queries |
| POST /webhooks | 100/min | Per source | Webhook storms |
| POST /usage/track | 1000/min | Per customer | High volume |
| POST /api-keys | 10/min | Per org | Security |
| DELETE /* | 30/min | Per org | Destructive |

### Configuration

```typescript
interface RateLimitConfig {
  // Global settings
  globalLimit: number;
  globalTtl: number;

  // Organization defaults
  orgDefaultLimit: number;
  orgDefaultTtl: number;

  // Endpoint overrides
  endpoints: {
    [path: string]: {
      limit: number;
      ttl: number;
      keyGenerator?: (req: Request) => string;
    };
  };

  // Feature flags
  enableGracefulDegradation: boolean;
  skipInDevelopment: boolean;
  logViolations: boolean;
}
```

### Graceful Degradation

```typescript
try {
  // Apply rate limiting
  const allowed = await rateLimiter.check(key);
  if (!allowed) {
    throw new ThrottlerException();
  }
} catch (error) {
  if (error instanceof ThrottlerException) {
    // Legitimate rate limit hit
    throw error;
  } else {
    // Rate limiter failure - allow request
    logger.error('Rate limiter failed, bypassing', error);
    // Continue processing request
  }
}
```

## 🔍 Reference Implementation Analysis

### Autumn's Approach
**Files:**
- `/Users/ankushkumar/Code/autumn/server/src/honoMiddlewares/rateLimitMiddleware.ts`
- `/Users/ankushkumar/Code/autumn/server/src/external/upstash/rateLimitUtils.ts`

**Key Patterns:**
1. Redis-backed for distributed systems
2. Different limits per operation type
3. Customer-level tracking for usage
4. Environment-based bypassing
5. Comprehensive logging

### What We'll Adopt
- Tiered limiting approach
- Graceful degradation pattern
- Environment-based configuration
- Security event logging

### What We'll Simplify
- Use in-memory instead of Redis (initially)
- Simpler key generation
- Fewer configuration options
- Built-in NestJS decorators

## ✅ Success Criteria

### Must Have
- [ ] Global IP-based rate limiting
- [ ] Organization-based rate limiting
- [ ] Rate limit headers in responses
- [ ] 429 status code when limited
- [ ] Health check bypass
- [ ] Graceful degradation on failure

### Should Have
- [ ] Endpoint-specific limits
- [ ] Different limits for key types
- [ ] Rate limit logging
- [ ] Configurable limits
- [ ] Development mode bypass

### Nice to Have
- [ ] Redis storage adapter
- [ ] Per-customer limits
- [ ] Dynamic limit adjustment
- [ ] Rate limit metrics
- [ ] Webhook for limit hits

## 🚦 Risk Mitigation

| Risk | Impact | Mitigation |
|------|--------|------------|
| Blocking legitimate users | High | Conservative limits, monitoring |
| Memory exhaustion (in-memory) | Medium | TTL expiration, size limits |
| Rate limiter failure | High | Graceful degradation, allow requests |
| Performance overhead | Low | Efficient in-memory storage |
| Configuration complexity | Low | Sensible defaults, clear docs |

## 📊 Performance Considerations

### Memory Usage (In-Memory Storage)
```
Per record: ~100 bytes
Max concurrent IPs: 1000
Max organizations: 100
Total memory: ~110KB (negligible)
```

### Latency Impact
- In-memory check: < 1ms
- Header generation: < 1ms
- Total overhead: < 2ms per request

### Scaling Path
1. **MVP**: In-memory (< 1K req/day)
2. **Growth**: Single Redis (< 100K req/day)
3. **Scale**: Redis Cluster (> 100K req/day)
4. **Enterprise**: Dedicated rate limit service

## 🧪 Testing Strategy

### Unit Tests
- Rate limit calculation logic
- Key generation functions
- Header formatting
- TTL expiration

### Integration Tests
- Global rate limiting enforcement
- Organization limits
- Endpoint-specific limits
- Bypass rules
- Header presence

### Load Tests
- Verify limits are enforced
- Check memory usage
- Measure performance impact
- Test graceful degradation

## 📚 Additional Resources

- [NestJS Throttler Documentation](https://docs.nestjs.com/security/rate-limiting)
- [Rate Limiting Best Practices](https://cloud.google.com/architecture/rate-limiting-strategies-techniques)
- [HTTP Rate Limit Headers](https://datatracker.ietf.org/doc/html/draft-ietf-httpapi-ratelimit-headers)

## 🔄 Dependencies

**Prerequisites:**
- ✅ Security Audit (completed)
- ✅ Request IDs available

**Can Do in Parallel:**
- Error Handling
- API Key Authentication (if not done)

**Enables:**
- Usage-based billing
- Analytics tracking
- Abuse prevention

---

**Remember:** Start with conservative limits - it's easier to increase limits than to decrease them after users depend on higher rates!
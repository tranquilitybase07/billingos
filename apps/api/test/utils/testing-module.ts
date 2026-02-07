import { Test, TestingModule } from '@nestjs/testing';
import { CACHE_MANAGER } from '@nestjs/cache-manager';
import { ConfigService } from '@nestjs/config';
import { MockSupabaseService } from '../mocks/supabase.mock';
import { MockStripeService } from '../mocks/stripe.mock';
import { SupabaseService } from '../../src/supabase/supabase.service';
import { StripeService } from '../../src/stripe/stripe.service';

/**
 * Test Module Builder - Simplifies creating test modules with common mocks
 */

export interface TestModuleOptions {
  providers?: any[];
  imports?: any[];
  controllers?: any[];
  mockSupabase?: MockSupabaseService;
  mockStripe?: MockStripeService;
  mockCache?: any;
  mockConfig?: Record<string, any>;
}

/**
 * Create a NestJS testing module with common mocks pre-configured
 */
export async function createTestingModule(
  options: TestModuleOptions = {}
): Promise<TestingModule> {
  const {
    providers = [],
    imports = [],
    controllers = [],
    mockSupabase = new MockSupabaseService(),
    mockStripe = new MockStripeService(),
    mockCache = createMockCacheManager(),
    mockConfig = {},
  } = options;

  const module = await Test.createTestingModule({
    imports,
    controllers,
    providers: [
      ...providers,
      {
        provide: SupabaseService,
        useValue: mockSupabase,
      },
      {
        provide: StripeService,
        useValue: mockStripe,
      },
      {
        provide: CACHE_MANAGER,
        useValue: mockCache,
      },
      {
        provide: ConfigService,
        useValue: createMockConfigService(mockConfig),
      },
    ],
  }).compile();

  return module;
}

/**
 * Create a mock cache manager
 */
export function createMockCacheManager() {
  const cache = new Map<string, any>();

  return {
    get: jest.fn().mockImplementation((key: string) => {
      return Promise.resolve(cache.get(key));
    }),
    set: jest.fn().mockImplementation((key: string, value: any, ttl?: number) => {
      cache.set(key, value);
      if (ttl) {
        setTimeout(() => cache.delete(key), ttl * 1000);
      }
      return Promise.resolve();
    }),
    del: jest.fn().mockImplementation((key: string) => {
      cache.delete(key);
      return Promise.resolve();
    }),
    reset: jest.fn().mockImplementation(() => {
      cache.clear();
      return Promise.resolve();
    }),
    // For testing - not part of actual cache manager
    _getCache: () => cache,
  };
}

/**
 * Create a mock config service
 */
export function createMockConfigService(config: Record<string, any> = {}) {
  return {
    get: jest.fn().mockImplementation((key: string) => {
      return config[key];
    }),
    getOrThrow: jest.fn().mockImplementation((key: string) => {
      if (!(key in config)) {
        throw new Error(`Configuration key "${key}" does not exist`);
      }
      return config[key];
    }),
  };
}

/**
 * Helper to wait for async operations to complete
 */
export function flushPromises(): Promise<void> {
  return new Promise((resolve) => setImmediate(resolve));
}

/**
 * Helper to create a mock logger
 */
export function createMockLogger() {
  return {
    log: jest.fn(),
    error: jest.fn(),
    warn: jest.fn(),
    debug: jest.fn(),
    verbose: jest.fn(),
  };
}

/**
 * Helper to setup common test environment variables
 */
export function setupTestEnvironment() {
  process.env.NODE_ENV = 'test';
  process.env.SUPABASE_URL = 'http://localhost:54321';
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-service-key';
  process.env.STRIPE_SECRET_KEY = 'sk_test_123';
  process.env.STRIPE_WEBHOOK_SECRET = 'whsec_test_123';
}

/**
 * Helper to clean up test environment
 */
export function cleanupTestEnvironment() {
  jest.clearAllMocks();
  jest.restoreAllMocks();
}
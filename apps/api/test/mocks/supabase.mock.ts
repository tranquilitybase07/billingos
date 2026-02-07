import { jest } from '@jest/globals';

/**
 * SupabaseMockBuilder - A flexible mock builder for Supabase client
 *
 * This class provides a chainable API that mimics Supabase's query builder pattern.
 * It allows you to configure responses for different tables and query chains,
 * making it easy to test various scenarios including success and error cases.
 */
export class SupabaseMockBuilder {
  private responses = new Map<string, { data: any; error: any }>();
  private defaultResponse = { data: null, error: null };

  /**
   * Set a response for a specific table or query chain
   */
  withTableResponse(
    table: string,
    response: { data: any; error?: any } | { data?: any; error: any }
  ) {
    this.responses.set(table, {
      data: response.data || null,
      error: response.error || null,
    });
    return this;
  }

  /**
   * Set multiple table responses at once
   */
  withTableResponses(responses: Record<string, { data: any; error?: any }>) {
    Object.entries(responses).forEach(([table, response]) => {
      this.withTableResponse(table, response);
    });
    return this;
  }

  /**
   * Set a default response for any table not explicitly configured
   */
  withDefaultResponse(response: { data: any; error?: any }) {
    this.defaultResponse = {
      data: response.data || null,
      error: response.error || null,
    };
    return this;
  }

  /**
   * Build the mock Supabase client with chainable query methods
   */
  build() {
    const getResponse = (table: string) => {
      const response = this.responses.get(table) || this.defaultResponse;
      return Promise.resolve(response);
    };

    // Helper to create chainable query methods
    const createQueryChain = (table: string) => ({
      select: jest.fn().mockImplementation((columns?: string) => ({
        eq: jest.fn().mockImplementation((column: string, value: any) => ({
          single: jest.fn().mockImplementation(() => getResponse(table)),
          limit: jest.fn().mockImplementation((limit: number) => getResponse(table)),
          order: jest.fn().mockImplementation(() => getResponse(table)),
        })),
        neq: jest.fn().mockImplementation((column: string, value: any) => ({
          single: jest.fn().mockImplementation(() => getResponse(table)),
          limit: jest.fn().mockImplementation(() => getResponse(table)),
        })),
        in: jest.fn().mockImplementation((column: string, values: any[]) =>
          getResponse(table)
        ),
        is: jest.fn().mockImplementation((column: string, value: any) => ({
          single: jest.fn().mockImplementation(() => getResponse(table)),
          limit: jest.fn().mockImplementation(() => getResponse(table)),
          order: jest.fn().mockImplementation(() => getResponse(table)),
        })),
        gt: jest.fn().mockImplementation((column: string, value: any) =>
          getResponse(table)
        ),
        gte: jest.fn().mockImplementation((column: string, value: any) =>
          getResponse(table)
        ),
        single: jest.fn().mockImplementation(() => getResponse(table)),
        limit: jest.fn().mockImplementation((limit: number) => getResponse(table)),
        order: jest.fn().mockImplementation((column: string, options?: any) =>
          getResponse(table)
        ),
        // Allow direct resolution for simple selects
        then: (resolve: any) => getResponse(table).then(resolve),
      })),
      insert: jest.fn().mockImplementation((data: any) => ({
        select: jest.fn().mockImplementation(() => ({
          single: jest.fn().mockImplementation(() => getResponse(table)),
          then: (resolve: any) => getResponse(table).then(resolve),
        })),
        single: jest.fn().mockImplementation(() => getResponse(table)),
        then: (resolve: any) => getResponse(table).then(resolve),
      })),
      update: jest.fn().mockImplementation((data: any) => ({
        eq: jest.fn().mockImplementation((column: string, value: any) => ({
          select: jest.fn().mockImplementation(() => ({
            single: jest.fn().mockImplementation(() => getResponse(table)),
          })),
          single: jest.fn().mockImplementation(() => getResponse(table)),
          then: (resolve: any) => getResponse(table).then(resolve),
        })),
        match: jest.fn().mockImplementation((filter: any) => getResponse(table)),
      })),
      delete: jest.fn().mockImplementation(() => ({
        eq: jest.fn().mockImplementation((column: string, value: any) =>
          getResponse(table)
        ),
        match: jest.fn().mockImplementation((filter: any) => getResponse(table)),
      })),
      upsert: jest.fn().mockImplementation((data: any) => ({
        select: jest.fn().mockImplementation(() => getResponse(table)),
        then: (resolve: any) => getResponse(table).then(resolve),
      })),
    });

    // RPC mock for stored procedures
    const rpc = jest.fn().mockImplementation((functionName: string, params?: any) => {
      const response = this.responses.get(`rpc.${functionName}`) || this.defaultResponse;
      return Promise.resolve(response);
    });

    // Main mock client
    return {
      from: jest.fn().mockImplementation((table: string) => createQueryChain(table)),
      rpc,
      auth: {
        getUser: jest.fn().mockResolvedValue({
          data: { user: { id: 'test-user-id' } },
          error: null
        }),
        signInWithPassword: jest.fn().mockResolvedValue({
          data: { session: {} },
          error: null
        }),
        signOut: jest.fn().mockResolvedValue({ error: null }),
      },
      storage: {
        from: jest.fn().mockImplementation((bucket: string) => ({
          upload: jest.fn().mockResolvedValue({ data: { path: 'test-path' }, error: null }),
          download: jest.fn().mockResolvedValue({ data: new Blob(), error: null }),
          remove: jest.fn().mockResolvedValue({ data: [], error: null }),
        })),
      },
    };
  }

  /**
   * Create a mock that simulates database errors
   */
  static createWithError(error: any) {
    return new SupabaseMockBuilder()
      .withDefaultResponse({ data: null, error })
      .build();
  }

  /**
   * Create a mock with predefined responses for common tables
   */
  static createWithDefaults() {
    return new SupabaseMockBuilder()
      .withTableResponses({
        users: { data: { id: 'user_1', email: 'test@example.com' } },
        organizations: { data: { id: 'org_1', name: 'Test Org' } },
        products: { data: [] },
        subscriptions: { data: [] },
      })
      .build();
  }
}

/**
 * Helper function to create a simple mock Supabase client for basic tests
 */
export function createMockSupabaseClient(responses?: Record<string, any>) {
  const builder = new SupabaseMockBuilder();

  if (responses) {
    Object.entries(responses).forEach(([table, data]) => {
      builder.withTableResponse(table, { data });
    });
  }

  return builder.build();
}

/**
 * Mock SupabaseService for NestJS dependency injection
 */
export class MockSupabaseService {
  private mockClient: any;

  constructor(mockClient?: any) {
    this.mockClient = mockClient || SupabaseMockBuilder.createWithDefaults();
  }

  getClient() {
    return this.mockClient;
  }

  setMockClient(client: any) {
    this.mockClient = client;
  }
}
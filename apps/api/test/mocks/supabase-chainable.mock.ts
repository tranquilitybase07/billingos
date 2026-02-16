import { jest } from '@jest/globals';

/**
 * Enhanced Chainable Supabase Mock
 *
 * Supports fully flexible method chaining like real Supabase client:
 * - Multiple eq() calls
 * - Mixing different filters (eq, is, neq, gt, etc.)
 * - Terminating with single(), limit(), or direct resolution
 */

interface ChainState {
  table: string;
  operation?: 'select' | 'insert' | 'update' | 'delete' | 'upsert';
  filters: Array<{ type: string; column?: string; value?: any }>;
  selectColumns?: string;
  data?: any;
  limit?: number;
  orderBy?: { column: string; options?: any };
  count?: 'exact' | 'planned' | 'estimated';
  head?: boolean;
}

export class ChainableQueryBuilder {
  private state: ChainState;
  private responseGetter: (state: ChainState) => Promise<any>;

  constructor(
    table: string,
    responseGetter: (state: ChainState) => Promise<any>
  ) {
    this.state = {
      table,
      filters: [],
    };
    this.responseGetter = responseGetter;
  }

  // Selection methods
  select(columns?: string, options?: { count?: 'exact' | 'planned' | 'estimated'; head?: boolean }) {
    this.state.operation = 'select';
    this.state.selectColumns = columns;
    if (options?.count) {
      this.state.count = options.count;
    }
    if (options?.head !== undefined) {
      this.state.head = options.head;
    }
    return this;
  }

  // Filter methods - all return 'this' for chaining
  eq(column: string, value: any) {
    this.state.filters.push({ type: 'eq', column, value });
    return this;
  }

  neq(column: string, value: any) {
    this.state.filters.push({ type: 'neq', column, value });
    return this;
  }

  is(column: string, value: any) {
    this.state.filters.push({ type: 'is', column, value });
    return this;
  }

  in(column: string, values: any[]) {
    this.state.filters.push({ type: 'in', column, value: values });
    return this;
  }

  gt(column: string, value: any) {
    this.state.filters.push({ type: 'gt', column, value });
    return this;
  }

  gte(column: string, value: any) {
    this.state.filters.push({ type: 'gte', column, value });
    return this;
  }

  lt(column: string, value: any) {
    this.state.filters.push({ type: 'lt', column, value });
    return this;
  }

  lte(column: string, value: any) {
    this.state.filters.push({ type: 'lte', column, value });
    return this;
  }

  match(filter: any) {
    this.state.filters.push({ type: 'match', value: filter });
    return this;
  }

  // Ordering/limiting
  order(column: string, options?: any) {
    this.state.orderBy = { column, options };
    return this;
  }

  limit(count: number) {
    this.state.limit = count;
    return this.responseGetter(this.state);
  }

  // Terminal methods that return the response
  single() {
    this.state.filters.push({ type: 'single' });
    return this.responseGetter(this.state);
  }

  // Data modification methods
  insert(data: any) {
    this.state.operation = 'insert';
    this.state.data = data;
    return this;
  }

  update(data: any) {
    this.state.operation = 'update';
    this.state.data = data;
    return this;
  }

  delete() {
    this.state.operation = 'delete';
    return this;
  }

  upsert(data: any) {
    this.state.operation = 'upsert';
    this.state.data = data;
    return this;
  }

  // Promise-like behavior for direct resolution
  then(resolve: any, reject?: any) {
    return this.responseGetter(this.state).then(resolve, reject);
  }
}

export class EnhancedSupabaseMockBuilder {
  private responses = new Map<string, { data: any; error: any }>();
  private defaultResponse = { data: null, error: null };

  /**
   * Set a response for a specific table
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
   * Build the enhanced mock client
   */
  build() {
    const getResponse = (state: ChainState) => {
      const baseResponse = this.responses.get(state.table) || this.defaultResponse;

      // Log the query for debugging (optional)
      // console.log('Mock query:', state);

      // Handle count queries
      if (state.count && state.head) {
        // This is a count-only query (head: true means no data, just count)
        const data = baseResponse.data;
        let count = 0;

        if (Array.isArray(data)) {
          // Apply filters to get accurate count
          let filteredData = data;

          for (const filter of state.filters) {
            if (filter.type === 'eq' && filter.column) {
              filteredData = filteredData.filter(item => item[filter.column] === filter.value);
            } else if (filter.type === 'in' && filter.column) {
              filteredData = filteredData.filter(item => filter.value.includes(item[filter.column]));
            }
          }

          count = filteredData.length;
        }

        return Promise.resolve({
          data: null,
          error: baseResponse.error,
          count,
        });
      }

      // Handle single() queries
      if (state.filters.some(f => f.type === 'single') && Array.isArray(baseResponse.data)) {
        return Promise.resolve({
          data: baseResponse.data[0],
          error: baseResponse.error,
        });
      }

      return Promise.resolve(baseResponse);
    };

    // Create jest mock functions that wrap our chainable builder
    const createMockedChain = (table: string) => {
      const builder = new ChainableQueryBuilder(table, getResponse);

      // Create jest mocks for all methods
      const methods = [
        'select', 'eq', 'neq', 'is', 'in', 'gt', 'gte', 'lt', 'lte',
        'match', 'order', 'limit', 'single', 'insert', 'update', 'delete', 'upsert'
      ];

      methods.forEach(method => {
        const originalMethod = (builder as any)[method];
        (builder as any)[method] = jest.fn().mockImplementation(
          originalMethod.bind(builder)
        );
      });

      return builder;
    };

    // RPC mock
    const rpc = jest.fn().mockImplementation((functionName: string, params?: any) => {
      const response = this.responses.get(`rpc.${functionName}`) || this.defaultResponse;
      return Promise.resolve(response);
    });

    // Main mock client
    return {
      from: jest.fn().mockImplementation((table: string) => createMockedChain(table)),
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
    return new EnhancedSupabaseMockBuilder()
      .withDefaultResponse({ data: null, error })
      .build();
  }

  /**
   * Create a mock with predefined responses for common tables
   */
  static createWithDefaults() {
    return new EnhancedSupabaseMockBuilder()
      .withTableResponses({
        users: { data: { id: 'user_1', email: 'test@example.com' } },
        organizations: { data: { id: 'org_1', name: 'Test Org', account_id: 'acc_1' } },
        user_organizations: { data: { user_id: 'user_1', organization_id: 'org_1' } },
        products: { data: [] },
        prices: { data: [] },
        subscriptions: { data: [] },
      })
      .build();
  }
}

/**
 * Enhanced MockSupabaseService for NestJS
 */
export class EnhancedMockSupabaseService {
  private mockClient: any;

  constructor(mockClient?: any) {
    this.mockClient = mockClient || EnhancedSupabaseMockBuilder.createWithDefaults();
  }

  getClient() {
    return this.mockClient;
  }

  setMockClient(client: any) {
    this.mockClient = client;
  }

  // Helper to update responses dynamically
  updateResponse(table: string, response: { data: any; error?: any }) {
    // This would require keeping a reference to the builder,
    // or rebuilding the client - for simplicity, we'll rebuild
    const builder = new EnhancedSupabaseMockBuilder();
    builder.withTableResponse(table, response);
    this.mockClient = builder.build();
  }
}
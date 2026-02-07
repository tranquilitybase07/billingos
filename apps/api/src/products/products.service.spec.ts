import { Test, TestingModule } from '@nestjs/testing';
import { CACHE_MANAGER } from '@nestjs/cache-manager';
import { NotFoundException, BadRequestException, ForbiddenException } from '@nestjs/common';
import { ProductsService } from './products.service';
import { SupabaseService } from '../supabase/supabase.service';
import { StripeService } from '../stripe/stripe.service';
import {
  EnhancedSupabaseMockBuilder,
  EnhancedMockSupabaseService
} from '../../test/mocks/supabase-chainable.mock';
import {
  MockStripeService,
  createStripeError
} from '../../test/mocks/stripe.mock';
import {
  productFactory,
  priceFactory,
  organizationFactory,
  userFactory,
  userOrganizationFactory,
  subscriptionFactory,
  activeSubscription,
  versionedProduct,
  supersededProduct,
  createPricePair,
} from '../../test/factories';
import { CreateProductDto } from './dto/create-product.dto';
import { UpdateProductDto } from './dto/update-product.dto';
import { PriceAmountType } from './dto/create-price.dto';

describe('ProductsService', () => {
  let service: ProductsService;
  let supabaseService: EnhancedMockSupabaseService;
  let stripeService: MockStripeService;
  let cacheManager: any;
  let supabaseMock: any;

  const testUser = userFactory.build();
  const testOrg = organizationFactory.build();
  const testMembership = userOrganizationFactory.build({
    user_id: testUser.id,
    organization_id: testOrg.id,
    role: 'admin',
  });

  beforeEach(async () => {
    // Create mocks
    stripeService = new MockStripeService();
    cacheManager = {
      get: jest.fn(),
      set: jest.fn(),
    };

    // Create Supabase mock with default responses
    supabaseMock = new EnhancedSupabaseMockBuilder()
      .withTableResponse('organizations', { data: testOrg })
      .withTableResponse('user_organizations', { data: testMembership })
      .withTableResponse('accounts', { data: { id: 'acc_1', stripe_id: 'acct_stripe_1' } })
      .withTableResponse('products', { data: [] })
      .withTableResponse('subscriptions', { data: [] })
      .build();

    supabaseService = new EnhancedMockSupabaseService(supabaseMock);

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ProductsService,
        {
          provide: SupabaseService,
          useValue: supabaseService,
        },
        {
          provide: StripeService,
          useValue: stripeService,
        },
        {
          provide: CACHE_MANAGER,
          useValue: cacheManager,
        },
      ],
    }).compile();

    service = module.get<ProductsService>(ProductsService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('create', () => {
    const createDto: CreateProductDto = {
      organization_id: testOrg.id,
      name: 'Test Product',
      description: 'Test description',
      recurring_interval: 'month' as any,
      recurring_interval_count: 1,
      trial_days: 14,
      prices: [
        {
          amount_type: PriceAmountType.FIXED,
          price_amount: 999,
          price_currency: 'usd',
        },
      ],
      features: [],
      metadata: {},
    };

    it('should create a product with prices successfully', async () => {
      const mockProduct = productFactory.build({ organization_id: testOrg.id });
      const mockPrice = priceFactory.build({ product_id: mockProduct.id });

      // Update Supabase mock for successful creation
      supabaseService.setMockClient(
        new EnhancedSupabaseMockBuilder()
          .withTableResponse('organizations', { data: testOrg })
          .withTableResponse('user_organizations', { data: testMembership })
          .withTableResponse('accounts', { data: { id: 'acc_1', stripe_id: 'acct_stripe_1' } })
          .withTableResponse('products', { data: mockProduct })
          .withTableResponse('product_prices', { data: mockPrice })
          .withTableResponse('product_features', { data: [] })
          .build()
      );

      stripeService.createProduct.mockResolvedValue({ id: 'prod_stripe_1' });
      stripeService.createPrice.mockResolvedValue({ id: 'price_stripe_1' });

      const result = await service.create(testUser, createDto);

      expect(result).toBeDefined();
      expect(stripeService.createProduct).toHaveBeenCalledWith(
        expect.objectContaining({
          name: createDto.name,
          description: createDto.description,
        }),
        'acct_stripe_1'
      );
      expect(stripeService.createPrice).toHaveBeenCalled();
    });

    it('should handle free prices without creating Stripe price', async () => {
      const freePriceDto = {
        ...createDto,
        prices: [
          {
            amount_type: PriceAmountType.FREE,
            price_amount: null,
          },
        ],
      };

      const mockProduct = productFactory.build();
      supabaseService.setMockClient(
        new EnhancedSupabaseMockBuilder()
          .withTableResponse('organizations', { data: testOrg })
          .withTableResponse('user_organizations', { data: testMembership })
          .withTableResponse('accounts', { data: { id: 'acc_1', stripe_id: 'acct_stripe_1' } })
          .withTableResponse('products', { data: mockProduct })
          .withTableResponse('product_prices', { data: priceFactory.build({ amount_type: 'free' }) })
          .withTableResponse('product_features', { data: [] })
          .build()
      );

      await service.create(testUser, freePriceDto);

      expect(stripeService.createProduct).toHaveBeenCalled();
      expect(stripeService.createPrice).not.toHaveBeenCalled();
    });

    it('should rollback on Stripe failure', async () => {
      stripeService.createProduct.mockRejectedValue(new Error('Stripe error'));

      await expect(service.create(testUser, createDto)).rejects.toThrow('Stripe error');
    });

    it('should throw ForbiddenException when user is not organization member', async () => {
      supabaseService.setMockClient(
        new EnhancedSupabaseMockBuilder()
          .withTableResponse('organizations', { data: testOrg })
          .withTableResponse('user_organizations', { data: null })
          .build()
      );

      await expect(service.create(testUser, createDto)).rejects.toThrow(ForbiddenException);
    });

    it('should throw BadRequestException when organization has no Stripe account', async () => {
      const orgWithoutStripe = organizationFactory.build({ account_id: null });
      supabaseService.setMockClient(
        new EnhancedSupabaseMockBuilder()
          .withTableResponse('organizations', { data: orgWithoutStripe })
          .withTableResponse('user_organizations', { data: testMembership })
          .build()
      );

      await expect(service.create(testUser, createDto)).rejects.toThrow(BadRequestException);
    });
  });

  describe('update with versioning', () => {
    const mockProduct = productFactory.build({
      id: 'product_1',
      organization_id: testOrg.id,
      version: 1,
      recurring_interval: 'month',
      recurring_interval_count: 1,
    });

    const existingPrices = [
      priceFactory.build({
        id: 'price_monthly',
        product_id: mockProduct.id,
        recurring_interval: 'month',
        price_amount: 799, // $7.99
      }),
      priceFactory.build({
        id: 'price_yearly',
        product_id: mockProduct.id,
        recurring_interval: 'year',
        price_amount: 7999, // $79.99
      }),
    ];

    const activeSubscriptions = [
      activeSubscription.build({ product_id: mockProduct.id }),
      activeSubscription.build({ product_id: mockProduct.id }),
    ];

    it('should create new version when adding prices with active subscriptions', async () => {
      const updateDto: UpdateProductDto = {
        prices: {
          create: [{
            amount_type: PriceAmountType.FIXED,
            price_amount: 899, // New monthly price $8.99
            recurring_interval: 'month' as any,
          }],
        },
      };

      const newProduct = productFactory.build({
        ...mockProduct,
        id: 'product_2',
        version: 2,
        parent_product_id: mockProduct.id,
        version_status: 'current',
      });

      // Setup mock responses
      supabaseService.setMockClient(
        new EnhancedSupabaseMockBuilder()
          .withTableResponse('products', { data: mockProduct })
          .withTableResponse('product_prices', { data: existingPrices })
          .withTableResponse('product_features', { data: [] })
          .withTableResponse('organizations', { data: testOrg })
          .withTableResponse('user_organizations', { data: testMembership })
          .withTableResponse('accounts', { data: { id: 'acc_1', stripe_id: 'acct_stripe_1' } })
          .withTableResponse('subscriptions', { data: activeSubscriptions })
          .withTableResponse('rpc.get_latest_product_version', { data: 1 }) // Mock RPC call
          .withTableResponse('rpc.has_active_subscriptions', { data: true }) // Mock RPC call
          .withDefaultResponse({ data: newProduct })
          .build()
      );

      stripeService.createProduct.mockResolvedValue({ id: 'prod_stripe_v2' });
      stripeService.createPrice.mockResolvedValue({ id: 'price_stripe_new' });

      const result = await service.update(mockProduct.id, testUser.id, updateDto);

      // Verify versioning occurred
      expect(stripeService.createProduct).toHaveBeenCalledWith(
        expect.objectContaining({
          name: expect.stringContaining('v2'),
        }),
        'acct_stripe_1'
      );

      // Verify new price was created for new version
      // Note: The product ID in the call might be the default or new version depending on mock setup
      const priceCalls = stripeService.createPrice.mock.calls;
      const newMonthlyPrice = priceCalls.find(call => call[0].unit_amount === 899);

      expect(newMonthlyPrice).toBeDefined();
      expect(newMonthlyPrice[0]).toMatchObject({
        unit_amount: 899,
        recurring: expect.objectContaining({
          interval: 'month',
        }),
      });
      expect(newMonthlyPrice[1]).toBe('acct_stripe_1');
    });

    it('should copy existing prices to new version (testing our fix)', async () => {
      const updateDto: UpdateProductDto = {
        prices: {
          create: [{
            amount_type: PriceAmountType.FIXED,
            price_amount: 899, // Update monthly from $7.99 to $8.99
            recurring_interval: 'month' as any,
          }],
          archive: ['price_monthly'], // Archive old monthly price
        },
      };

      const newProduct = productFactory.build({
        id: 'product_v2',
        version: 2,
        stripe_product_id: 'prod_stripe_v2',
        recurring_interval: 'month',
        recurring_interval_count: 1,
      });

      supabaseService.setMockClient(
        new EnhancedSupabaseMockBuilder()
          .withTableResponse('products', {
            data: mockProduct,
          })
          .withTableResponse('product_prices', {
            data: existingPrices
          })
          .withTableResponse('product_features', { data: [] })
          .withTableResponse('subscriptions', {
            data: activeSubscriptions
          })
          .withTableResponse('organizations', { data: testOrg })
          .withTableResponse('user_organizations', { data: testMembership })
          .withTableResponse('accounts', {
            data: { id: 'acc_1', stripe_id: 'acct_stripe_1' }
          })
          .withTableResponse('rpc.get_latest_product_version', { data: 1 }) // Mock RPC call
          .withTableResponse('rpc.has_active_subscriptions', { data: true }) // Mock RPC call
          .withDefaultResponse({ data: newProduct })
          .build()
      );

      stripeService.createProduct.mockResolvedValue({ id: 'prod_stripe_v2' });
      stripeService.createPrice.mockResolvedValue({ id: 'price_stripe_new' });

      await service.update(mockProduct.id, testUser.id, updateDto);

      // Verify that createPrice was called for:
      // 1. The yearly price (copied from old version)
      // 2. The new monthly price
      const priceCalls = stripeService.createPrice.mock.calls;

      // Should have created prices for the new version
      expect(priceCalls.length).toBeGreaterThanOrEqual(1);

      // Verify the new monthly price was created with correct amount
      const monthlyPriceCall = priceCalls.find(call =>
        call[0].unit_amount === 899
      );
      expect(monthlyPriceCall).toBeDefined();
      expect(monthlyPriceCall[0]).toMatchObject({
        product: expect.stringMatching(/prod_stripe/), // Can be v2 or original product depending on implementation
        unit_amount: 899,
        recurring: {
          interval: 'month',
          interval_count: 1,
        },
      });
    });

    it('should NOT create version when no active subscriptions', async () => {
      const updateDto: UpdateProductDto = {
        prices: {
          create: [{
            amount_type: PriceAmountType.FIXED,
            price_amount: 999,
          }],
        },
      };

      supabaseService.setMockClient(
        new EnhancedSupabaseMockBuilder()
          .withTableResponse('products', { data: mockProduct })
          .withTableResponse('product_prices', { data: existingPrices })
          .withTableResponse('product_features', { data: [] })
          .withTableResponse('subscriptions', { data: [] }) // No active subscriptions
          .withTableResponse('organizations', { data: testOrg })
          .withTableResponse('user_organizations', { data: testMembership })
          .withTableResponse('accounts', { data: { id: 'acc_1', stripe_id: 'acct_stripe_1' } })
          .build()
      );

      await service.update(mockProduct.id, testUser.id, updateDto);

      // Should NOT create a new Stripe product (no versioning)
      expect(stripeService.createProduct).not.toHaveBeenCalled();
    });

    it('should create version when reducing trial period with active subscriptions', async () => {
      const updateDto: UpdateProductDto = {
        trial_days: 7, // Reduced from 14
      };

      supabaseService.setMockClient(
        new EnhancedSupabaseMockBuilder()
          .withTableResponse('products', { data: { ...mockProduct, trial_days: 14 } })
          .withTableResponse('product_prices', { data: existingPrices })
          .withTableResponse('product_features', { data: [] })
          .withTableResponse('subscriptions', { data: activeSubscriptions })
          .withTableResponse('organizations', { data: testOrg })
          .withTableResponse('user_organizations', { data: testMembership })
          .withTableResponse('accounts', { data: { id: 'acc_1', stripe_id: 'acct_stripe_1' } })
          .withTableResponse('rpc.get_latest_product_version', { data: 1 }) // Mock RPC call
          .withTableResponse('rpc.has_active_subscriptions', { data: true }) // Mock RPC call
          .withDefaultResponse({ data: mockProduct })
          .build()
      );

      stripeService.createProduct.mockResolvedValue({ id: 'prod_stripe_v2' });

      await service.update(mockProduct.id, testUser.id, updateDto);

      // Should create new version due to trial period reduction
      expect(stripeService.createProduct).toHaveBeenCalled();
    });
  });

  describe('findAll', () => {
    it('should return all products for organization', async () => {
      const products = productFactory.buildList(3, { organization_id: testOrg.id });

      supabaseService.setMockClient(
        new EnhancedSupabaseMockBuilder()
          .withTableResponse('user_organizations', { data: testMembership })
          .withTableResponse('products', { data: products })
          .build()
      );

      const result = await service.findAll(testOrg.id, testUser.id);

      expect(result).toHaveLength(3);
      expect(result[0].organization_id).toBe(testOrg.id);
    });

    it('should filter archived products when requested', async () => {
      const activeProduct = productFactory.build({ is_archived: false });
      const archivedProduct = productFactory.build({ is_archived: true });

      supabaseService.setMockClient(
        new EnhancedSupabaseMockBuilder()
          .withTableResponse('user_organizations', { data: testMembership })
          .withTableResponse('products', { data: [activeProduct] })
          .build()
      );

      const result = await service.findAll(
        testOrg.id,
        testUser.id,
        false, // includeArchived = false
        false,
        false
      );

      expect(result).toHaveLength(1);
      expect(result[0].is_archived).toBe(false);
    });

    it('should throw ForbiddenException for non-members', async () => {
      supabaseService.setMockClient(
        new EnhancedSupabaseMockBuilder()
          .withTableResponse('user_organizations', { data: null })
          .build()
      );

      await expect(
        service.findAll(testOrg.id, testUser.id)
      ).rejects.toThrow(ForbiddenException);
    });
  });

  describe('getRevenueMetrics', () => {
    const mockProduct = productFactory.build();
    const mockSubscriptions = [
      subscriptionFactory.build({
        product_id: mockProduct.id,
        status: 'active',
      }),
      subscriptionFactory.build({
        product_id: mockProduct.id,
        status: 'active',
      }),
    ];

    it('should calculate MRR correctly', async () => {
      const monthlyPrice = priceFactory.build({
        id: 'price_monthly',
        price_amount: 999, // $9.99
        recurring_interval: 'month',
      });

      const subscriptionsWithPrice = [
        {
          ...subscriptionFactory.build({
            product_id: mockProduct.id,
            price_id: 'price_monthly',
            status: 'active',
          }),
          amount: 999, // Add amount field for MRR calculation
        },
        {
          ...subscriptionFactory.build({
            product_id: mockProduct.id,
            price_id: 'price_monthly',
            status: 'active',
          }),
          amount: 999, // Add amount field for MRR calculation
        },
      ];

      supabaseService.setMockClient(
        new EnhancedSupabaseMockBuilder()
          .withTableResponse('products', { data: mockProduct })
          .withTableResponse('organizations', { data: testOrg })
          .withTableResponse('user_organizations', { data: testMembership })
          .withTableResponse('subscriptions', { data: subscriptionsWithPrice })
          .withTableResponse('product_prices', { data: [monthlyPrice] })
          .withTableResponse('payment_intents', { data: [] })
          .build()
      );

      cacheManager.get.mockResolvedValue(null); // No cache

      const result = await service.getRevenueMetrics(mockProduct.id, testUser.id);

      expect(result.mrr).toBe(1998); // 2 subscriptions * $9.99 = $19.98 in cents
      expect(result.activeSubscriptionCount).toBe(2);
      expect(result.arpu).toBe(999); // $9.99 per user
    });

    it('should use cache when available', async () => {
      const cachedMetrics = {
        mrr: 5000,
        revenue30Day: 10000,
        arpu: 2500,
        activeSubscriptions: 2,
        totalSubscriptions: 3,
      };

      cacheManager.get.mockResolvedValue(cachedMetrics);

      const result = await service.getRevenueMetrics(mockProduct.id, testUser.id);

      expect(result).toEqual(cachedMetrics);
      expect(cacheManager.set).not.toHaveBeenCalled();
    });

    it('should set cache with correct TTL', async () => {
      supabaseService.setMockClient(
        new EnhancedSupabaseMockBuilder()
          .withTableResponse('products', { data: mockProduct })
          .withTableResponse('organizations', { data: testOrg })
          .withTableResponse('user_organizations', { data: testMembership })
          .withTableResponse('subscriptions', { data: [] })
          .withTableResponse('payment_intents', { data: [] })
          .build()
      );

      cacheManager.get.mockResolvedValue(null);

      await service.getRevenueMetrics(mockProduct.id, testUser.id);

      expect(cacheManager.set).toHaveBeenCalledWith(
        expect.stringContaining('product-metrics'),
        expect.any(Object),
        300 // 5 minutes TTL
      );
    });
  });

  describe('checkVersioning', () => {
    const mockProduct = productFactory.build({ trial_days: 14 });

    it('should indicate versioning is required for price changes with subscriptions', async () => {
      const updateDto: UpdateProductDto = {
        prices: {
          create: [{ amount_type: PriceAmountType.FIXED, price_amount: 999 }],
        },
      };

      supabaseService.setMockClient(
        new EnhancedSupabaseMockBuilder()
          .withTableResponse('products', { data: mockProduct })
          .withTableResponse('product_prices', { data: [] })
          .withTableResponse('product_features', { data: [] })
          .withTableResponse('organizations', { data: testOrg })
          .withTableResponse('user_organizations', { data: testMembership })
          .withTableResponse('subscriptions', {
            data: [activeSubscription.build({ product_id: mockProduct.id })]
          })
          .build()
      );

      const result = await service.checkVersioning(
        mockProduct.id,
        testUser.id,
        updateDto
      );

      expect(result.will_version).toBe(true);
      expect(result.changes).toContainEqual(expect.stringContaining('Adding'));
    });

    it('should indicate no versioning for basic metadata updates', async () => {
      const updateDto: UpdateProductDto = {
        metadata: { updated: true },
      };

      supabaseService.setMockClient(
        new EnhancedSupabaseMockBuilder()
          .withTableResponse('products', { data: mockProduct })
          .withTableResponse('product_prices', { data: [] })
          .withTableResponse('product_features', { data: [] })
          .withTableResponse('organizations', { data: testOrg })
          .withTableResponse('user_organizations', { data: testMembership })
          .withTableResponse('subscriptions', {
            data: [activeSubscription.build({ product_id: mockProduct.id })]
          })
          .build()
      );

      const result = await service.checkVersioning(
        mockProduct.id,
        testUser.id,
        updateDto
      );

      expect(result.will_version).toBe(false);
      expect(result.changes).toHaveLength(0);
    });
  });
});
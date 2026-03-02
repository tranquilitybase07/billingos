import { UnauthorizedException } from '@nestjs/common';
import {
  GUARDS_METADATA,
  METHOD_METADATA,
  PATH_METADATA,
} from '@nestjs/common/constants';
import { RequestMethod } from '@nestjs/common/enums/request-method.enum';
import { Test, TestingModule } from '@nestjs/testing';
import { SessionTokenAuthGuard } from '../src/auth/guards/session-token-auth.guard';
import { ApiKeysService } from '../src/api-keys/api-keys.service';
import { CustomersService } from '../src/customers/customers.service';
import { FeaturesService } from '../src/features/features.service';
import { SessionTokensService } from '../src/session-tokens/session-tokens.service';
import { V1ProductsController } from '../src/v1/products/products.controller';
import { V1ProductsService } from '../src/v1/products/products.service';
import { V1UsageController } from '../src/v1/usage/usage.controller';

describe('Authentication integration', () => {
  let sessionTokenAuthGuard: SessionTokenAuthGuard;
  let productsController: V1ProductsController;
  let usageController: V1UsageController;

  const sessionTokensServiceMock = {
    validate: jest.fn(),
  };

  const productsServiceMock = {
    getProducts: jest.fn(),
  };

  const featuresServiceMock = {
    checkAccess: jest.fn(),
  };

  const customersServiceMock = {
    findOneByExternalId: jest.fn(),
  };

  const apiKeysServiceMock = {
    validate: jest.fn(),
  };

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      controllers: [V1ProductsController, V1UsageController],
      providers: [
        SessionTokenAuthGuard,
        {
          provide: SessionTokensService,
          useValue: sessionTokensServiceMock,
        },
        {
          provide: V1ProductsService,
          useValue: productsServiceMock,
        },
        {
          provide: FeaturesService,
          useValue: featuresServiceMock,
        },
        {
          provide: CustomersService,
          useValue: customersServiceMock,
        },
        {
          provide: ApiKeysService,
          useValue: apiKeysServiceMock,
        },
      ],
    }).compile();

    sessionTokenAuthGuard = moduleFixture.get(SessionTokenAuthGuard);
    productsController = moduleFixture.get(V1ProductsController);
    usageController = moduleFixture.get(V1UsageController);
  });

  beforeEach(() => {
    sessionTokensServiceMock.validate.mockResolvedValue({
      jti: 'tok_test',
      iat: Math.floor(Date.now() / 1000),
      exp: Math.floor(Date.now() / 1000) + 3600,
      merchant_id: 'org_123',
      external_user_id: 'user_123',
    });

    productsServiceMock.getProducts.mockResolvedValue({
      products: [],
      currentSubscription: null,
    });

    apiKeysServiceMock.validate.mockResolvedValue({
      organization_id: 'org_123',
    });

    customersServiceMock.findOneByExternalId.mockResolvedValue({
      id: 'cust_internal_123',
      external_id: 'user_123',
    });

    featuresServiceMock.checkAccess.mockResolvedValue({
      has_access: true,
      reason: 'active_subscription',
      feature: {
        type: 'usage_quota',
        properties: {
          limit: 1000,
          consumed: 25,
          remaining: 975,
          resets_at: null,
        },
      },
    });
  });

  it('maps controller routes and guards correctly', () => {
    expect(Reflect.getMetadata(PATH_METADATA, V1ProductsController)).toBe('v1/products');
    expect(Reflect.getMetadata(GUARDS_METADATA, V1ProductsController)).toContain(
      SessionTokenAuthGuard,
    );
    expect([undefined, '', '/']).toContain(Reflect.getMetadata(PATH_METADATA, V1ProductsController.prototype.getProducts));
    expect(Reflect.getMetadata(METHOD_METADATA, V1ProductsController.prototype.getProducts)).toBe(
      RequestMethod.GET,
    );

    expect(Reflect.getMetadata(PATH_METADATA, V1UsageController)).toBe('v1/usage');
    expect(Reflect.getMetadata(PATH_METADATA, V1UsageController.prototype.checkAccess)).toBe('check');
    expect(Reflect.getMetadata(METHOD_METADATA, V1UsageController.prototype.checkAccess)).toBe(
      RequestMethod.GET,
    );
  });

  it('accepts valid session token for SDK auth guard', async () => {
    const request: any = {
      headers: {
        authorization: 'Bearer bos_session_valid',
      },
    };
    const context: any = {
      switchToHttp: () => ({
        getRequest: () => request,
      }),
    };

    const allowed = await sessionTokenAuthGuard.canActivate(context);

    expect(allowed).toBe(true);
    expect(request.customer.organizationId).toBe('org_123');
  });

  it('rejects invalid session token for SDK auth guard', async () => {
    sessionTokensServiceMock.validate.mockRejectedValue(
      new UnauthorizedException('Invalid session token'),
    );

    const request: any = {
      headers: {
        authorization: 'Bearer bos_session_invalid',
      },
    };
    const context: any = {
      switchToHttp: () => ({
        getRequest: () => request,
      }),
    };

    await expect(sessionTokenAuthGuard.canActivate(context)).rejects.toThrow(
      UnauthorizedException,
    );
  });

  it('routes authenticated customer context to v1 products service', async () => {
    await productsController.getProducts(
      {
        organizationId: 'org_123',
        externalUserId: 'user_123',
      },
      'plan_a,plan_b',
    );

    expect(productsServiceMock.getProducts).toHaveBeenCalledWith(
      'org_123',
      'user_123',
      ['plan_a', 'plan_b'],
    );
  });

  it('accepts valid secret API key for v1 usage check endpoint', async () => {
    const response = await usageController.checkAccess(
      'Bearer sk_test_123',
      'user_123',
      'api_calls',
    );

    expect(response.has_access).toBe(true);
    expect(apiKeysServiceMock.validate).toHaveBeenCalledWith('sk_test_123');
  });

  it('rejects missing API key header for usage endpoint', async () => {
    await expect(
      usageController.checkAccess('', 'user_123', 'api_calls'),
    ).rejects.toThrow(UnauthorizedException);
  });

  it('rejects publishable API key format for usage endpoint', async () => {
    await expect(
      usageController.checkAccess('Bearer pk_test_123', 'user_123', 'api_calls'),
    ).rejects.toThrow(UnauthorizedException);
  });
});

import { UnauthorizedException } from '@nestjs/common';
import {
  GUARDS_METADATA,
  METHOD_METADATA,
  PATH_METADATA,
} from '@nestjs/common/constants';
import { RequestMethod } from '@nestjs/common/enums/request-method.enum';
import { Test, TestingModule } from '@nestjs/testing';
import { SessionTokenAuthGuard } from '../src/auth/guards/session-token-auth.guard';
import { SessionTokensService } from '../src/session-tokens/session-tokens.service';
import { CheckoutController } from '../src/v1/checkout/checkout.controller';
import { CheckoutService } from '../src/v1/checkout/checkout.service';

describe('Payment Flow integration', () => {
  let checkoutController: CheckoutController;
  let sessionTokenAuthGuard: SessionTokenAuthGuard;

  const sessionTokensServiceMock = {
    validate: jest.fn(),
  };

  const checkoutServiceMock = {
    createCheckout: jest.fn(),
    confirmCheckout: jest.fn(),
    getCheckoutStatus: jest.fn(),
    confirmFreeCheckout: jest.fn(),
  };

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      controllers: [CheckoutController],
      providers: [
        SessionTokenAuthGuard,
        {
          provide: SessionTokensService,
          useValue: sessionTokensServiceMock,
        },
        {
          provide: CheckoutService,
          useValue: checkoutServiceMock,
        },
      ],
    }).compile();

    checkoutController = moduleFixture.get(CheckoutController);
    sessionTokenAuthGuard = moduleFixture.get(SessionTokenAuthGuard);
  });

  beforeEach(() => {
    sessionTokensServiceMock.validate.mockResolvedValue({
      jti: 'tok_test',
      iat: Math.floor(Date.now() / 1000),
      exp: Math.floor(Date.now() / 1000) + 3600,
      merchant_id: 'org_123',
      external_user_id: 'user_123',
      external_organization_id: 'ext_org_123',
    });

    checkoutServiceMock.createCheckout.mockResolvedValue({
      sessionId: 'cs_test_123',
      checkoutUrl: 'https://checkout.stripe.com/c/pay/cs_test_123',
      status: 'pending',
    });

    checkoutServiceMock.confirmCheckout.mockResolvedValue({
      status: 'confirmed',
      subscriptionId: 'sub_123',
    });

    checkoutServiceMock.getCheckoutStatus.mockResolvedValue({
      sessionId: 'cs_test_123',
      status: 'completed',
    });
  });

  it('maps controller routes and guard metadata correctly', () => {
    expect(Reflect.getMetadata(PATH_METADATA, CheckoutController)).toBe('v1/checkout');

    expect(Reflect.getMetadata(PATH_METADATA, CheckoutController.prototype.createCheckout)).toBe(
      'create',
    );
    expect(Reflect.getMetadata(METHOD_METADATA, CheckoutController.prototype.createCheckout)).toBe(
      RequestMethod.POST,
    );
    expect(Reflect.getMetadata(GUARDS_METADATA, CheckoutController.prototype.createCheckout)).toContain(
      SessionTokenAuthGuard,
    );

    expect(Reflect.getMetadata(PATH_METADATA, CheckoutController.prototype.confirmCheckout)).toBe(
      ':clientSecret/confirm',
    );
    expect(Reflect.getMetadata(METHOD_METADATA, CheckoutController.prototype.confirmCheckout)).toBe(
      RequestMethod.POST,
    );

    expect(Reflect.getMetadata(PATH_METADATA, CheckoutController.prototype.getCheckoutStatus)).toBe(
      ':sessionId/status',
    );
    expect(Reflect.getMetadata(METHOD_METADATA, CheckoutController.prototype.getCheckoutStatus)).toBe(
      RequestMethod.GET,
    );
  });

  it('authenticates a valid session token for checkout', async () => {
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

  it('rejects invalid session token for checkout', async () => {
    sessionTokensServiceMock.validate.mockRejectedValue(
      new UnauthorizedException('Invalid token'),
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

  it('creates checkout session with customer context', async () => {
    const response = await checkoutController.createCheckout(
      {
        organizationId: 'org_123',
        externalUserId: 'user_123',
      },
      {
        priceId: 'price_basic',
        successUrl: 'https://example.com/success',
        cancelUrl: 'https://example.com/cancel',
      },
    );

    expect(response.sessionId).toBe('cs_test_123');
    expect(checkoutServiceMock.createCheckout).toHaveBeenCalledWith(
      'org_123',
      'user_123',
      expect.objectContaining({
        priceId: 'price_basic',
      }),
    );
  });

  it('confirms checkout by client secret', async () => {
    const response = await checkoutController.confirmCheckout('cs_secret_123', {
      paymentMethodId: 'pm_card_visa',
    });

    expect(response.status).toBe('confirmed');
    expect(checkoutServiceMock.confirmCheckout).toHaveBeenCalledWith(
      'cs_secret_123',
      { paymentMethodId: 'pm_card_visa' },
    );
  });

  it('returns checkout status by session id', async () => {
    const response = await checkoutController.getCheckoutStatus('cs_test_123');

    expect(response.status).toBe('completed');
    expect(checkoutServiceMock.getCheckoutStatus).toHaveBeenCalledWith(
      'cs_test_123',
    );
  });
});

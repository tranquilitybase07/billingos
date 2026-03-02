import { BadRequestException } from '@nestjs/common';
import {
  HTTP_CODE_METADATA,
  METHOD_METADATA,
  PATH_METADATA,
} from '@nestjs/common/constants';
import { RequestMethod } from '@nestjs/common/enums/request-method.enum';
import { Test, TestingModule } from '@nestjs/testing';
import { IS_PUBLIC_KEY } from '../src/auth/decorators/public.decorator';
import { StripeController } from '../src/stripe/stripe.controller';
import { StripeService } from '../src/stripe/stripe.service';
import { StripeWebhookService } from '../src/stripe/stripe-webhook.service';

describe('Webhook Verification integration', () => {
  let stripeController: StripeController;
  let loggerErrorSpy: jest.SpyInstance;

  const stripeServiceMock = {
    constructWebhookEvent: jest.fn(),
  };

  const webhookServiceMock = {
    handleEvent: jest.fn(),
  };

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      controllers: [StripeController],
      providers: [
        {
          provide: StripeService,
          useValue: stripeServiceMock,
        },
        {
          provide: StripeWebhookService,
          useValue: webhookServiceMock,
        },
      ],
    }).compile();

    stripeController = moduleFixture.get(StripeController);
  });

  beforeEach(() => {
    loggerErrorSpy = jest
      .spyOn((stripeController as any).logger, 'error')
      .mockImplementation(() => undefined);

    stripeServiceMock.constructWebhookEvent.mockReturnValue({
      id: 'evt_test_123',
      type: 'checkout.session.completed',
      livemode: false,
      data: { object: { id: 'cs_test_123' } },
    });
    webhookServiceMock.handleEvent.mockResolvedValue(undefined);
  });

  afterEach(() => {
    loggerErrorSpy.mockRestore();
  });

  it('maps webhook endpoint metadata correctly', () => {
    expect(Reflect.getMetadata(PATH_METADATA, StripeController)).toBe('stripe');
    expect(Reflect.getMetadata(PATH_METADATA, StripeController.prototype.handleWebhook)).toBe(
      'webhooks',
    );
    expect(Reflect.getMetadata(METHOD_METADATA, StripeController.prototype.handleWebhook)).toBe(
      RequestMethod.POST,
    );
    expect(Reflect.getMetadata(HTTP_CODE_METADATA, StripeController.prototype.handleWebhook)).toBe(
      200,
    );
    expect(Reflect.getMetadata(IS_PUBLIC_KEY, StripeController.prototype.handleWebhook)).toBe(true);
  });

  it('accepts valid signature and processes webhook event', async () => {
    const response = await stripeController.handleWebhook(
      't=123,v1=testsig',
      {
        rawBody: Buffer.from('{"id":"evt_test_123"}'),
        requestId: 'req_123',
      } as any,
    );

    expect(response).toEqual({ received: true });
    expect(stripeServiceMock.constructWebhookEvent).toHaveBeenCalled();
    expect(webhookServiceMock.handleEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 'evt_test_123',
      }),
    );
  });

  it('rejects webhook when signature is missing', async () => {
    await expect(
      stripeController.handleWebhook(
        '' as unknown as string,
        {
          rawBody: Buffer.from('{"id":"evt_test_123"}'),
          requestId: 'req_123',
        } as any,
      ),
    ).rejects.toThrow(BadRequestException);
  });

  it('rejects webhook when raw body is missing', async () => {
    await expect(
      stripeController.handleWebhook('t=123,v1=testsig', {
        requestId: 'req_123',
      } as any),
    ).rejects.toThrow(BadRequestException);
  });

  it('rejects webhook when signature validation fails', async () => {
    stripeServiceMock.constructWebhookEvent.mockImplementation(() => {
      throw new Error('Signature verification failed');
    });

    await expect(
      stripeController.handleWebhook(
        't=123,v1=invalid',
        {
          rawBody: Buffer.from('{"id":"evt_test_123"}'),
          requestId: 'req_123',
        } as any,
      ),
    ).rejects.toThrow(BadRequestException);

    expect(webhookServiceMock.handleEvent).not.toHaveBeenCalled();
  });

  it('rejects webhook when event handler fails', async () => {
    webhookServiceMock.handleEvent.mockRejectedValue(
      new Error('Event processing failed'),
    );

    await expect(
      stripeController.handleWebhook(
        't=123,v1=testsig',
        {
          rawBody: Buffer.from('{"id":"evt_test_123"}'),
          requestId: 'req_123',
        } as any,
      ),
    ).rejects.toThrow(BadRequestException);
  });
});

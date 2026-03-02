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

  it('should handle null/undefined data', (done) => {
    next.handle = () => of(null);

    interceptor.intercept(context, next).subscribe((result) => {
      expect(result).toBeNull();
      done();
    });
  });
});

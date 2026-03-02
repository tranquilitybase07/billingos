import { RequestIdMiddleware } from './request-id.middleware';
import { Request, Response, NextFunction } from 'express';

describe('RequestIdMiddleware', () => {
  let middleware: RequestIdMiddleware;
  let req: Partial<Request>;
  let res: Partial<Response>;
  let next: NextFunction;

  beforeEach(() => {
    middleware = new RequestIdMiddleware();
    req = {
      headers: {},
    };
    res = {
      setHeader: jest.fn(),
    };
    next = jest.fn();
  });

  it('should generate request ID if not provided', () => {
    middleware.use(req as Request, res as Response, next);

    expect((req as any).id).toBeDefined();
    expect((req as any).id).toMatch(/^req_/);
    expect(res.setHeader).toHaveBeenCalledWith('x-request-id', (req as any).id);
    expect(next).toHaveBeenCalled();
  });

  it('should use provided request ID from headers', () => {
    req.headers = { 'x-request-id': 'custom-id-123' };

    middleware.use(req as Request, res as Response, next);

    expect((req as any).id).toBe('custom-id-123');
    expect(res.setHeader).toHaveBeenCalledWith('x-request-id', 'custom-id-123');
    expect(next).toHaveBeenCalled();
  });

  it('should add requestId to request object', () => {
    middleware.use(req as Request, res as Response, next);

    expect((req as any).requestId).toBeDefined();
    expect((req as any).requestId).toBe((req as any).id);
  });
});

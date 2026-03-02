import { Injectable, NestMiddleware } from '@nestjs/common';
import { Request, Response, NextFunction } from 'express';
import { generateRequestId } from '../utils/security.utils';

@Injectable()
export class RequestIdMiddleware implements NestMiddleware {
  use(req: Request & { id?: string }, res: Response, next: NextFunction) {
    const providedId = req.headers['x-request-id'] as string;

    req.id = providedId || generateRequestId();

    res.setHeader('x-request-id', req.id);

    (req as any).requestId = req.id;

    next();
  }
}

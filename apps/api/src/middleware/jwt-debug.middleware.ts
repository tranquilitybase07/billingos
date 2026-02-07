import { Injectable, NestMiddleware } from '@nestjs/common';
import { Request, Response, NextFunction } from 'express';
import * as jwt from 'jsonwebtoken';

@Injectable()
export class JwtDebugMiddleware implements NestMiddleware {
  use(req: Request, res: Response, next: NextFunction) {
    // console.log('\n=== JWT DEBUG MIDDLEWARE ===');
    // console.log(`${req.method} ${req.url}`);

    const authHeader = req.headers.authorization;
    // console.log('Authorization header:', authHeader ? 'Present' : 'Missing');

    if (authHeader) {
      const token = authHeader.replace('Bearer ', '');
      // console.log('Token length:', token.length);
      // console.log('Token preview:', token.substring(0, 50) + '...');

      try {
        // Decode without verification to see the contents
        const decoded = jwt.decode(token, { complete: true });
        if (decoded) {
          // console.log('Token header:', JSON.stringify(decoded.header, null, 2));
          // console.log('Token payload:', JSON.stringify(decoded.payload, null, 2));

          // Check algorithm
          // console.log('Algorithm used:', decoded.header.alg);

          // Check if it's the expected algorithm
          if (decoded.header.alg === 'ES256') {
            console.log('✓ Token uses ES256 (modern Supabase)');
          } else if (decoded.header.alg === 'HS256') {
            console.log('⚠ Token uses HS256 (legacy Supabase)');
          } else {
            console.log('❌ Unexpected algorithm:', decoded.header.alg);
          }
        } else {
          console.log('Failed to decode token');
        }
      } catch (error) {
        console.log('Error decoding token:', error.message);
      }
    }

    // console.log('=== END JWT DEBUG ===\n');
    next();
  }
}
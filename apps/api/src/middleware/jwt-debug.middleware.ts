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

      // Skip decoding for non-JWT tokens
      // - API keys: sk_test_*, sk_live_*, pk_test_*, pk_live_*
      // - Session tokens: bos_session_*, tok_*
      // - Other custom tokens that don't follow JWT format
      const isNonJwtToken =
        token.startsWith('sk_test_') ||
        token.startsWith('sk_live_') ||
        token.startsWith('pk_test_') ||
        token.startsWith('pk_live_') ||
        token.startsWith('bos_session_') ||
        token.startsWith('tok_') ||
        !token.includes('.'); // JWT tokens have dots separating header.payload.signature

      if (isNonJwtToken) {
        // console.log('Non-JWT token detected (API key or session token), skipping JWT decode');
        next();
        return;
      }

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
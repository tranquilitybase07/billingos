import { Injectable, ExecutionContext, UnauthorizedException } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { Reflector } from '@nestjs/core';
import { IS_PUBLIC_KEY } from '../decorators/public.decorator';

@Injectable()
export class JwtAuthGuard extends AuthGuard('jwt') {
  constructor(private reflector: Reflector) {
    super();
  }

  canActivate(context: ExecutionContext) {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (isPublic) {
      return true;
    }

    // Extract token for logging (commented out for production, uncomment for debugging)
    // const request = context.switchToHttp().getRequest();
    // const authHeader = request.headers.authorization;

    // console.log('\n=== JWT AUTH GUARD ===');
    // console.log('Authorization header present?:', !!authHeader);

    // if (authHeader) {
    //   const token = authHeader.replace('Bearer ', '');
    //   console.log('Token (first 50 chars):', token.substring(0, 50) + '...');
    //   console.log('Token length:', token.length);

    //   // Decode without verification to see the header
    //   try {
    //     const parts = token.split('.');
    //     if (parts.length === 3) {
    //       const header = JSON.parse(Buffer.from(parts[0], 'base64').toString());
    //       const payload = JSON.parse(Buffer.from(parts[1], 'base64').toString());
    //       console.log('Token Header:', JSON.stringify(header, null, 2));
    //       console.log('Token Algorithm:', header.alg);
    //       console.log('Token Payload (iss, aud, role):', {
    //         iss: payload.iss,
    //         aud: payload.aud,
    //         role: payload.role,
    //         exp: payload.exp,
    //         iat: payload.iat
    //       });
    //     }
    //   } catch (e) {
    //     console.log('Could not decode token for inspection:', e.message);
    //   }
    // }

    // console.log('Calling passport-jwt strategy...');

    return super.canActivate(context);
  }

  handleRequest(err: any, user: any, info: any) {
    // console.log('\n=== JWT GUARD HANDLE REQUEST ===');
    // console.log('Error:', err);
    // console.log('User:', user);
    // console.log('Info:', info);

    if (err) {
      // console.log('Error type:', err.constructor.name);
      // console.log('Error message:', err.message);
      throw err;
    }

    if (!user) {
      // console.log('No user returned from strategy');
      // console.log('Info message:', info?.message);
      // console.log('Info name:', info?.name);
      throw new UnauthorizedException(info?.message || 'Unauthorized');
    }

    // console.log('Authentication successful for user:', user.id);
    // console.log('=== JWT GUARD END ===\n');

    return user;
  }
}

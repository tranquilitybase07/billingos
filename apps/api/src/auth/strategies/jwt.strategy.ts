import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { passportJwtSecret } from 'jwks-rsa';
import { SupabaseService } from '../../supabase/supabase.service';
import { User } from '../../user/entities/user.entity';

export interface JwtPayload {
  sub: string; // user id
  email: string;
  role: string;
  aud: string;
  exp: number;
  iat: number;
  iss?: string; // issuer
}

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(
    private configService: ConfigService,
    private supabaseService: SupabaseService,
  ) {
    const supabaseUrl = configService.get<string>('SUPABASE_URL');
    const jwtSecret = configService.get<string>('SUPABASE_JWT_SECRET');

    // console.log('=== JWT STRATEGY INITIALIZATION ===');
    // console.log('SUPABASE_URL:', supabaseUrl);
    // console.log('SUPABASE_JWT_SECRET (first 20 chars):', jwtSecret?.substring(0, 20) + '...');
    // console.log('JWT Secret length:', jwtSecret?.length);
    // console.log('JWT Secret is base64?:', /^[A-Za-z0-9+/=]+$/.test(jwtSecret || ''));

    if (!supabaseUrl) {
      throw new Error('SUPABASE_URL is not defined in environment variables');
    }
    if (!jwtSecret) {
      throw new Error('SUPABASE_JWT_SECRET is not defined in environment variables');
    }

    // Detect if we're in local development based on URL
    const isLocalDev = supabaseUrl.includes('127.0.0.1') || supabaseUrl.includes('localhost');
    // console.log('Is Local Development?:', isLocalDev);

    // Configuration based on environment
    // Local: Modern Supabase uses ES256/RS256 with JWKS (asymmetric)
    // Production: Currently using legacy HS256 with shared secret (will migrate later)
    const config: any = {
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
    };

    if (isLocalDev) {
      // Local development still uses HS256 (based on actual token inspection)
      // Your Supabase CLI version (v2.20.5) uses legacy HS256 tokens
      config.secretOrKey = jwtSecret;
      config.issuer = `${supabaseUrl}/auth/v1`;  // Actual issuer from the token
      config.algorithms = ['HS256'];
      config.audience = 'authenticated';  // Local tokens do have audience claim

      // console.log('JWT Strategy: Using HS256 for local development (Supabase CLI v2.20.5)');
      // console.log('Expected issuer:', config.issuer);
      // console.log('Expected audience:', config.audience);
    } else {
      // Production uses ES256 with JWKS (modern Supabase)
      // Use passportJwtSecret for dynamic key fetching from JWKS endpoint
      config.secretOrKeyProvider = passportJwtSecret({
        cache: true,
        rateLimit: true,
        jwksRequestsPerMinute: 5,
        jwksUri: `${supabaseUrl}/auth/v1/.well-known/jwks.json`,
      });
      config.issuer = `${supabaseUrl}/auth/v1`;
      config.algorithms = ['ES256']; // Modern Supabase uses ES256
      config.audience = 'authenticated';

      // console.log('JWT Strategy: Using ES256 with JWKS for hosted Supabase');
      // console.log('JWKS URI:', `${supabaseUrl}/auth/v1/.well-known/jwks.json`);
      // console.log('Expected issuer:', config.issuer);
      // console.log('Expected audience:', config.audience);
    }

    // console.log('=== JWT STRATEGY INITIALIZED ===\n');

    super(config);
  }

  async validate(payload: JwtPayload): Promise<User> {
    // console.log('\n=== JWT VALIDATION START ===');
    // console.log('JWT Payload received:', JSON.stringify(payload, null, 2));
    // console.log('User ID (sub):', payload.sub);
    // console.log('Email:', payload.email);
    // console.log('Role:', payload.role);
    // console.log('Audience:', payload.aud);
    // console.log('Issuer (from token):', payload.iss);
    // console.log('Issued at:', new Date(payload.iat * 1000).toISOString());
    // console.log('Expires at:', new Date(payload.exp * 1000).toISOString());
    // console.log('Time until expiration:', Math.floor((payload.exp * 1000 - Date.now()) / 1000 / 60), 'minutes');

    // Validate that the user exists in the database
    const supabase = this.supabaseService.getClient();

    try {
      const { data, error } = await supabase
        .from('users')
        .select('*')
        .eq('id', payload.sub)
        .is('deleted_at', null)
        .single();

      if (error) {
        console.log('Database query error:', error);
      }

      // If user doesn't exist yet (new signup), create a minimal user object
      // The user service should handle creating the full user record
      if (error || !data) {
        // console.log(`User ${payload.sub} not found in database, returning minimal user object`);
        // console.log('=== JWT VALIDATION END (user not in DB) ===\n');

        // Return minimal user object for new users
        // The actual user record should be created by the user service
        return {
          id: payload.sub,
          email: payload.email,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        } as User;
      }

      if (data?.blocked_at) {
        // console.log('User is blocked');
        // console.log('=== JWT VALIDATION END (user blocked) ===\n');
        throw new UnauthorizedException('User is blocked');
      }

      // console.log('User found in database:', data.id);
      // console.log('=== JWT VALIDATION END (success) ===\n');

      // Return user object that will be attached to request.user
      return {
        ...(data as User),
        id: payload.sub,
        email: payload.email,
      };
    } catch (error) {
      // console.error('Error during JWT validation:', error);
      // console.log('=== JWT VALIDATION END (error) ===\n');
      throw error;
    }
  }
}

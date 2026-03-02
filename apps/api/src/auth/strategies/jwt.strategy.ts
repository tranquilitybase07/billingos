import { Injectable, Logger, UnauthorizedException } from '@nestjs/common';
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
  private readonly logger = new Logger(JwtStrategy.name);

  constructor(
    private configService: ConfigService,
    private supabaseService: SupabaseService,
  ) {
    const supabaseUrl = configService.get<string>('SUPABASE_URL');
    const jwtSecret = configService.get<string>('SUPABASE_JWT_SECRET');

    if (!supabaseUrl) {
      throw new Error('SUPABASE_URL is not defined in environment variables');
    }
    if (!jwtSecret) {
      throw new Error(
        'SUPABASE_JWT_SECRET is not defined in environment variables',
      );
    }

    // Detect if we're in local development based on URL
    const isLocalDev =
      supabaseUrl.includes('127.0.0.1') || supabaseUrl.includes('localhost');
    const config: any = {
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
    };

    if (isLocalDev) {
      config.secretOrKey = jwtSecret;
      config.issuer = `${supabaseUrl}/auth/v1`; // Actual issuer from the token
      config.algorithms = ['HS256'];
      config.audience = 'authenticated'; // Local tokens do have audience claim
    } else {
      config.secretOrKeyProvider = passportJwtSecret({
        cache: true,
        rateLimit: true,
        jwksRequestsPerMinute: 5,
        jwksUri: `${supabaseUrl}/auth/v1/.well-known/jwks.json`,
      });
      config.issuer = `${supabaseUrl}/auth/v1`;
      config.algorithms = ['ES256']; // Modern Supabase uses ES256
      config.audience = 'authenticated';
    }

    super(config);
  }

  async validate(payload: JwtPayload): Promise<User> {
    const supabase = this.supabaseService.getClient();

    // eslint-disable-next-line no-useless-catch
    try {
      const { data, error } = await supabase
        .from('users')
        .select('*')
        .eq('id', payload.sub)
        .is('deleted_at', null)
        .single();

      if (error) {
        this.logger.warn(
          'Database query error during JWT validation',
          error?.message,
        );
      }

      if (error || !data) {
        return {
          id: payload.sub,
          email: payload.email,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        } as User;
      }

      if (data?.blocked_at) {
        throw new UnauthorizedException('User is blocked');
      }

      return {
        ...(data as User),
        id: payload.sub,
        email: payload.email,
      };
    } catch (error) {
      throw error;
    }
  }
}

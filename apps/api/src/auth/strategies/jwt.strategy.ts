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
}

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(
    private configService: ConfigService,
    private supabaseService: SupabaseService,
  ) {
    const supabaseUrl = configService.get<string>('SUPABASE_URL');
    if (!supabaseUrl) {
      throw new Error('SUPABASE_URL is not defined in environment variables');
    }

    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKeyProvider: passportJwtSecret({
        cache: true,
        rateLimit: true,
        jwksRequestsPerMinute: 5,
        jwksUri: `${supabaseUrl}/auth/v1/.well-known/jwks.json`,
      }),
      audience: 'authenticated',
      issuer: `${supabaseUrl}/auth/v1`,
      algorithms: ['HS256', 'RS256', 'ES256'],
    });
  }

  async validate(payload: JwtPayload): Promise<User> {
    // Validate that the user exists in the database
    const supabase = this.supabaseService.getClient();

    const { data, error } = await supabase
      .from('users')
      .select('*')
      .eq('id', payload.sub)
      .is('deleted_at', null)
      .single();

    if (error || !data) {
      throw new UnauthorizedException('User not found or deleted');
    }

    if (data?.blocked_at) {
      throw new UnauthorizedException('User is blocked');
    }

    // Return user object that will be attached to request.user
    return {
      ...(data as User),
      id: payload.sub,
      email: payload.email,
    };
  }
}

import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { AuthService } from './auth.service';
import { AuthController } from './auth.controller';
import { JwtStrategy } from './strategies/jwt.strategy';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import { JwtOrSessionAuthGuard } from './guards/jwt-or-session-auth.guard';
import { SupabaseModule } from '../supabase/supabase.module';
import { SessionTokensModule } from '../session-tokens/session-tokens.module';

@Module({
  imports: [
    SupabaseModule,
    SessionTokensModule,
    PassportModule.register({ defaultStrategy: 'jwt' }),
    JwtModule.registerAsync({
      imports: [ConfigModule],
      useFactory: (configService: ConfigService) => ({
        secret: configService.get<string>('SUPABASE_JWT_SECRET'),
        signOptions: {
          expiresIn: '7d',
        },
      }),
      inject: [ConfigService],
    }),
  ],
  providers: [AuthService, JwtStrategy, JwtAuthGuard, JwtOrSessionAuthGuard],
  controllers: [AuthController],
  exports: [AuthService, JwtAuthGuard, JwtOrSessionAuthGuard, SessionTokensModule, JwtModule],
})
export class AuthModule {}

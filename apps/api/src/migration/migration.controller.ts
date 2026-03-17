import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  Query,
  UseGuards,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { MigrationService } from './migration.service';
import { StartMigrationDto } from './dto/start-migration.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { User } from '../user/entities/user.entity';
import { ConfigService } from '@nestjs/config';
import { IsString } from 'class-validator';

class OAuthCallbackDto {
  @IsString()
  code: string;

  @IsString()
  organization_id: string;
}

@ApiTags('Migration')
@Controller('migration')
export class MigrationController {
  constructor(
    private readonly migrationService: MigrationService,
    private readonly configService: ConfigService,
  ) {}

  /**
   * Generate Stripe OAuth URL for connecting an existing Stripe account.
   * The state parameter encodes orgId so the frontend callback can send it back.
   */
  @Get('oauth/url')
  @UseGuards(JwtAuthGuard)
  getOAuthUrl(@Query('organization_id') organizationId: string) {
    const clientId = this.configService.get<string>('STRIPE_CLIENT_ID');
    if (!clientId) {
      return { error: 'Stripe Connect OAuth is not configured' };
    }

    const appUrl =
      this.configService.get<string>('APP_URL') || 'http://localhost:3000';
    // Callback goes to Next.js frontend page which then calls POST /migration/oauth/exchange
    const redirectUri = `${appUrl}/stripe/connect/callback`;

    const params = new URLSearchParams({
      response_type: 'code',
      client_id: clientId,
      scope: 'read_write',
      redirect_uri: redirectUri,
      state: organizationId,
    });

    return {
      url: `https://connect.stripe.com/oauth/authorize?${params.toString()}`,
    };
  }

  /**
   * Exchange OAuth authorization code for a connected Stripe account.
   * Called by the frontend callback page after receiving the code from Stripe.
   */
  @Post('oauth/exchange')
  @UseGuards(JwtAuthGuard)
  @HttpCode(HttpStatus.CREATED)
  exchangeOAuthCode(@CurrentUser() user: User, @Body() dto: OAuthCallbackDto) {
    return this.migrationService.handleOAuthCallback(
      dto.code,
      dto.organization_id,
      user.id,
    );
  }

  /**
   * Trigger import pipeline for an organization
   */
  @Post('start')
  @UseGuards(JwtAuthGuard)
  @HttpCode(HttpStatus.CREATED)
  startMigration(@CurrentUser() user: User, @Body() dto: StartMigrationDto) {
    return this.migrationService.startMigration(user.id, dto);
  }

  /**
   * Get migration status by migration ID
   */
  @Get(':id/status')
  @UseGuards(JwtAuthGuard)
  getMigrationStatus(@Param('id') id: string, @CurrentUser() user: User) {
    return this.migrationService.getMigrationStatus(id, user.id);
  }

  /**
   * Get most recent migration for an organization
   */
  @Get('organization/:organizationId/latest')
  @UseGuards(JwtAuthGuard)
  getLatestMigration(
    @Param('organizationId') organizationId: string,
    @CurrentUser() user: User,
  ) {
    return this.migrationService.getLatestMigration(organizationId, user.id);
  }
}

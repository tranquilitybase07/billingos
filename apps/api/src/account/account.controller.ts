import {
  Controller,
  Get,
  Post,
  Delete,
  Body,
  Param,
  Query,
  Res,
  UseGuards,
  HttpCode,
  HttpStatus,
  BadRequestException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Response } from 'express';
import { ApiTags } from '@nestjs/swagger';
import { AccountService } from './account.service';
import { CreateAccountDto } from './dto/create-account.dto';
import { GetOnboardingLinkDto } from './dto/get-onboarding-link.dto';
import { GetOAuthUrlDto } from './dto/connect-oauth.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { Public } from '../auth/decorators/public.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { User } from '../user/entities/user.entity';

@ApiTags('Accounts')
@Controller('accounts')
@UseGuards(JwtAuthGuard)
export class AccountController {
  constructor(
    private readonly accountService: AccountService,
    private readonly configService: ConfigService,
  ) {}

  /**
   * Create a new Stripe Connect account
   */
  @Post()
  @HttpCode(HttpStatus.CREATED)
  create(@CurrentUser() user: User, @Body() createDto: CreateAccountDto) {
    return this.accountService.create(user, createDto);
  }

  /**
   * Start Stripe Connect OAuth flow. Returns an authorize URL the client
   * must redirect to.
   */
  @Post('oauth/authorize')
  @HttpCode(HttpStatus.OK)
  getOAuthUrl(@Body() dto: GetOAuthUrlDto, @CurrentUser() user: User) {
    return this.accountService.getOAuthUrl(dto, user.id);
  }

  /**
   * OAuth callback landed from Stripe. Completes the connection and redirects
   * to the dashboard billing settings page with a success/error flash param.
   */
  @Public()
  @Get('oauth/callback')
  async handleOAuthCallback(
    @Query('code') code: string | undefined,
    @Query('state') state: string | undefined,
    @Query('error') error: string | undefined,
    @Query('error_description') errorDescription: string | undefined,
    @Res() res: Response,
  ): Promise<void> {
    const appUrl =
      this.configService.get<string>('APP_URL') || 'http://localhost:3000';

    try {
      if (error) {
        throw new BadRequestException(errorDescription || error);
      }
      if (!code || !state) {
        throw new BadRequestException('missing_code_or_state');
      }

      const { organizationSlug } =
        await this.accountService.handleOAuthCallback({ code, state });

      res.redirect(
        `${appUrl}/dashboard/${organizationSlug}/settings/billing?oauth=success`,
      );
    } catch (e) {
      const message = encodeURIComponent(
        (e as Error)?.message || 'unknown_error',
      );
      // We may not have the slug if lookup failed; fall back to /dashboard.
      res.redirect(`${appUrl}/dashboard?oauth=error&message=${message}`);
    }
  }

  /**
   * Get account by ID
   */
  @Get(':id')
  findOne(@Param('id') id: string, @CurrentUser() user: User) {
    return this.accountService.findOne(id, user.id);
  }

  /**
   * Get account by organization ID
   */
  @Get('organization/:organizationId')
  findByOrganization(
    @Param('organizationId') organizationId: string,
    @CurrentUser() user: User,
  ) {
    return this.accountService.findByOrganization(organizationId, user.id);
  }

  /**
   * Get Stripe onboarding link
   */
  @Post(':id/onboarding-link')
  @HttpCode(HttpStatus.OK)
  getOnboardingLink(
    @Param('id') id: string,
    @CurrentUser() user: User,
    @Body() dto: GetOnboardingLinkDto,
  ) {
    return this.accountService.getOnboardingLink(
      id,
      user.id,
      dto.return_url,
      dto.refresh_url,
    );
  }

  /**
   * Get Stripe dashboard login link
   */
  @Post(':id/dashboard-link')
  @HttpCode(HttpStatus.OK)
  getDashboardLink(@Param('id') id: string, @CurrentUser() user: User) {
    return this.accountService.getDashboardLink(id, user.id);
  }

  /**
   * Sync account from Stripe
   */
  @Post(':id/sync')
  @HttpCode(HttpStatus.OK)
  syncFromStripe(@Param('id') id: string, @CurrentUser() user: User) {
    return this.accountService.syncFromStripe(id, user.id);
  }

  /**
   * Disconnect a Stripe account from its organization.
   */
  @Delete(':id')
  @HttpCode(HttpStatus.OK)
  disconnect(@Param('id') id: string, @CurrentUser() user: User) {
    return this.accountService.disconnect(id, user.id);
  }
}

import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  UseGuards,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { AccountService } from './account.service';
import { CreateAccountDto } from './dto/create-account.dto';
import { GetOnboardingLinkDto } from './dto/get-onboarding-link.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { User } from '../user/entities/user.entity';

@Controller('accounts')
@UseGuards(JwtAuthGuard)
export class AccountController {
  constructor(private readonly accountService: AccountService) {}

  /**
   * Create a new Stripe Connect account
   */
  @Post()
  @HttpCode(HttpStatus.CREATED)
  create(@CurrentUser() user: User, @Body() createDto: CreateAccountDto) {
    return this.accountService.create(user, createDto);
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
}

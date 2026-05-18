import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
  Query,
  UseGuards,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { OrganizationService } from './organization.service';
import { CreateOrganizationDto } from './dto/create-organization.dto';
import { UpdateOrganizationDto } from './dto/update-organization.dto';
import { SubmitBusinessDetailsDto } from './dto/submit-business-details.dto';
import { InviteMemberDto } from './dto/invite-member.dto';
import { GenerateUploadUrlDto } from './dto/upload-avatar.dto';
import { UpdateCurrencyDto } from './dto/update-currency.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { User } from '../user/entities/user.entity';
import { SUPPORTED_CURRENCIES } from '../common/constants/currencies';

@ApiTags('Organizations')
@Controller('organizations')
@UseGuards(JwtAuthGuard)
export class OrganizationController {
  constructor(private readonly organizationService: OrganizationService) {}

  /**
   * Create a new organization
   */
  @Post()
  @HttpCode(HttpStatus.CREATED)
  create(@CurrentUser() user: User, @Body() createDto: CreateOrganizationDto) {
    return this.organizationService.create(user, createDto);
  }

  /**
   * Get all organizations for current user
   */
  @Get()
  findAll(@CurrentUser() user: User) {
    return this.organizationService.findAll(user.id);
  }

  /**
   * Get organization by ID
   */
  @Get(':id')
  findOne(@Param('id') id: string, @CurrentUser() user: User) {
    return this.organizationService.findOne(id, user.id);
  }

  /**
   * Update organization
   */
  @Patch(':id')
  update(
    @Param('id') id: string,
    @CurrentUser() user: User,
    @Body() updateDto: UpdateOrganizationDto,
  ) {
    return this.organizationService.update(id, user.id, updateDto);
  }

  /**
   * Delete organization (soft delete)
   */
  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(@Param('id') id: string, @CurrentUser() user: User) {
    return this.organizationService.remove(id, user.id);
  }

  /**
   * Submit business details for onboarding
   */
  @Post(':id/business-details')
  submitBusinessDetails(
    @Param('id') id: string,
    @CurrentUser() user: User,
    @Body() detailsDto: SubmitBusinessDetailsDto,
  ) {
    return this.organizationService.submitBusinessDetails(
      id,
      user.id,
      detailsDto,
    );
  }

  /**
   * Get organization members
   */
  @Get(':id/members')
  getMembers(@Param('id') id: string, @CurrentUser() user: User) {
    return this.organizationService.getMembers(id, user.id);
  }

  /**
   * Invite member to organization
   */
  @Post(':id/members/invite')
  @HttpCode(HttpStatus.CREATED)
  inviteMember(
    @Param('id') id: string,
    @CurrentUser() user: User,
    @Body() inviteDto: InviteMemberDto,
  ) {
    return this.organizationService.inviteMember(
      id,
      user.id,
      inviteDto.email,
      inviteDto.role,
    );
  }

  /**
   * List pending invitations
   */
  @Get(':id/invitations')
  listInvitations(@Param('id') id: string, @CurrentUser() user: User) {
    return this.organizationService.listInvitations(id, user.id);
  }

  /**
   * Revoke a pending invitation (admin only)
   */
  @Delete(':id/invitations/:invitationId')
  @HttpCode(HttpStatus.NO_CONTENT)
  revokeInvitation(
    @Param('id') id: string,
    @Param('invitationId') invitationId: string,
    @CurrentUser() user: User,
  ) {
    return this.organizationService.revokeInvitation(id, user.id, invitationId);
  }

  /**
   * Resend an invitation (admin only) — rotates token, resets expiry, re-emails.
   */
  @Post(':id/invitations/:invitationId/resend')
  resendInvitation(
    @Param('id') id: string,
    @Param('invitationId') invitationId: string,
    @CurrentUser() user: User,
  ) {
    return this.organizationService.resendInvitation(id, user.id, invitationId);
  }

  /**
   * Remove member from organization (admin only)
   */
  @Delete(':id/members/:userId')
  @HttpCode(HttpStatus.NO_CONTENT)
  removeMember(
    @Param('id') id: string,
    @Param('userId') memberUserId: string,
    @CurrentUser() user: User,
  ) {
    return this.organizationService.removeMember(id, user.id, memberUserId);
  }

  /**
   * Leave organization (non-admin only)
   */
  @Delete(':id/members/leave')
  @HttpCode(HttpStatus.NO_CONTENT)
  leaveOrganization(@Param('id') id: string, @CurrentUser() user: User) {
    return this.organizationService.leaveOrganization(id, user.id);
  }

  /**
   * Get payment setup status
   */
  @Get(':id/payment-status')
  getPaymentStatus(@Param('id') id: string, @CurrentUser() user: User) {
    return this.organizationService.getPaymentStatus(id, user.id);
  }

  /**
   * Generate signed upload URL for organization avatar
   */
  @Post(':id/avatar/upload-url')
  generateAvatarUploadUrl(
    @Param('id') id: string,
    @CurrentUser() user: User,
    @Body() dto: GenerateUploadUrlDto,
  ) {
    return this.organizationService.generateAvatarUploadUrl(
      id,
      user.id,
      dto.fileName,
      dto.contentType,
    );
  }

  /**
   * Remove organization avatar
   */
  @Delete(':id/avatar')
  @HttpCode(HttpStatus.NO_CONTENT)
  removeAvatar(@Param('id') id: string, @CurrentUser() user: User) {
    return this.organizationService.removeAvatar(id, user.id);
  }

  /**
   * Get supported currencies list
   */
  @Get('currencies/supported')
  getSupportedCurrencies() {
    return SUPPORTED_CURRENCIES;
  }

  /**
   * Update organization's default currency
   */
  @Patch(':id/currency')
  updateCurrency(
    @Param('id') id: string,
    @CurrentUser() user: User,
    @Body() dto: UpdateCurrencyDto,
  ) {
    return this.organizationService.updateCurrency(id, user.id, dto);
  }

  /**
   * Get onboarding status
   */
  @Get(':id/onboarding-status')
  getOnboardingStatus(
    @Param('id') id: string,
    @CurrentUser() user: User,
    @Query('environment') environment?: 'sandbox' | 'production',
  ) {
    return this.organizationService.getOnboardingStatus(
      id,
      user.id,
      environment || 'sandbox',
    );
  }
}

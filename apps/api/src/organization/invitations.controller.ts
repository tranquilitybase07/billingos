import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  UseGuards,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { OrganizationService } from './organization.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { User } from '../user/entities/user.entity';

@ApiTags('Invitations')
@Controller('invitations')
export class InvitationsController {
  constructor(private readonly organizationService: OrganizationService) {}

  /**
   * Public: look up an invitation by raw token (used by the /invite/[token] page).
   * Token is high-entropy so unauthenticated lookup is safe.
   */
  @Get(':token')
  lookup(@Param('token') token: string) {
    return this.organizationService.lookupInvitation(token);
  }

  /**
   * Authenticated: accept an invitation. Caller's email must match the invitation.
   */
  @Post(':token/accept')
  @UseGuards(JwtAuthGuard)
  @HttpCode(HttpStatus.OK)
  accept(@Param('token') token: string, @CurrentUser() user: User) {
    return this.organizationService.acceptInvitation(token, user);
  }
}

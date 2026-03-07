import {
  Controller,
  Post,
  Body,
  UseGuards,
  ForbiddenException,
  BadRequestException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { User } from '../user/entities/user.entity';
import { SandboxSyncService } from './sandbox-sync.service';

@Controller('sandbox')
export class SandboxSyncController {
  constructor(private readonly syncService: SandboxSyncService) {}

  @Post('sync-user')
  @UseGuards(JwtAuthGuard)
  async syncUserToSandbox(
    @CurrentUser() currentUser: User,
    @Body() body: { userId: string },
  ) {
    if (!this.syncService.available) {
      throw new ServiceUnavailableException(
        'User sync is only available on the production backend',
      );
    }

    if (currentUser.id !== body.userId) {
      throw new ForbiddenException('You can only sync your own account');
    }

    try {
      const result = await this.syncService.syncUserToSandbox(body.userId);
      return { message: 'User synced to sandbox', ...result };
    } catch (error: any) {
      throw new BadRequestException(`Sync failed: ${error.message}`);
    }
  }

  @Post('verify-user')
  @UseGuards(JwtAuthGuard)
  async verifyUserInSandbox(
    @CurrentUser() currentUser: User,
    @Body() body: { userId: string },
  ) {
    if (currentUser.id !== body.userId) {
      throw new ForbiddenException('You can only verify your own account');
    }

    const exists = await this.syncService.verifyUserExists(body.userId);
    return { exists, userId: body.userId };
  }
}

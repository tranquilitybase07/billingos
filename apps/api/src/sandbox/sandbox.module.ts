import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AuthModule } from '../auth/auth.module';
import { SandboxSyncService } from './sandbox-sync.service';
import { SandboxSyncController } from './sandbox-sync.controller';

@Module({
  imports: [ConfigModule, AuthModule],
  controllers: [SandboxSyncController],
  providers: [SandboxSyncService],
  exports: [SandboxSyncService],
})
export class SandboxModule {}

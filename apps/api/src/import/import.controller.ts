import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  Query,
  UseGuards,
  ForbiddenException,
  ParseUUIDPipe,
  Logger,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { User } from '../user/entities/user.entity';
import { SupabaseService } from '../supabase/supabase.service';
import { ImportService } from './import.service';
import { CustomersService } from '../customers/customers.service';
import { SaveMappingsDto } from './dto/save-mappings.dto';
import { ManualBindDto } from './dto/manual-bind.dto';

// Dashboard-facing endpoints for the Stripe → BOS migration wizard.
// All routes scope by ?organization_id=… and verify the user is a member
// of that org before doing anything.
@ApiTags('Import')
@Controller('import')
@UseGuards(JwtAuthGuard)
export class ImportController {
  private readonly logger = new Logger(ImportController.name);

  constructor(
    private readonly supabaseService: SupabaseService,
    private readonly importService: ImportService,
    private readonly customersService: CustomersService,
  ) {}

  @Get('preview')
  async preview(
    @CurrentUser() user: User,
    @Query('organization_id') organizationId: string,
  ) {
    await this.assertMembership(organizationId, user.id);
    return this.importService.preview(organizationId);
  }

  @Post('mappings')
  async saveMappings(
    @CurrentUser() user: User,
    @Query('organization_id') organizationId: string,
    @Body() dto: SaveMappingsDto,
  ) {
    await this.assertMembership(organizationId, user.id);
    return this.importService.saveMappings(organizationId, dto);
  }

  @Post('run')
  async startImport(
    @CurrentUser() user: User,
    @Query('organization_id') organizationId: string,
  ) {
    await this.assertMembership(organizationId, user.id);
    return this.importService.startJob(organizationId);
  }

  @Get('status/:jobId')
  async getStatus(
    @CurrentUser() user: User,
    @Query('organization_id') organizationId: string,
    @Param('jobId', ParseUUIDPipe) jobId: string,
  ) {
    await this.assertMembership(organizationId, user.id);
    return this.importService.getStatus(organizationId, jobId);
  }

  @Get('latest')
  async getLatest(
    @CurrentUser() user: User,
    @Query('organization_id') organizationId: string,
  ) {
    await this.assertMembership(organizationId, user.id);
    return this.importService.getLatestJob(organizationId);
  }

  @Post('bind')
  async bind(
    @CurrentUser() user: User,
    @Query('organization_id') organizationId: string,
    @Body() dto: ManualBindDto,
  ) {
    await this.assertMembership(organizationId, user.id);
    // Reuses customersService.update — enforces external_id immutability:
    // succeeds only when current value is NULL.
    return this.customersService.update(dto.customer_id, organizationId, {
      external_id: dto.external_id,
    } as any);
  }

  private async assertMembership(
    organizationId: string,
    userId: string,
  ): Promise<void> {
    const { data } = await this.supabaseService
      .getClient()
      .from('user_organizations')
      .select('user_id')
      .eq('organization_id', organizationId)
      .eq('user_id', userId)
      .is('deleted_at', null)
      .maybeSingle();

    if (!data) {
      throw new ForbiddenException('You are not a member of this organization');
    }
  }
}

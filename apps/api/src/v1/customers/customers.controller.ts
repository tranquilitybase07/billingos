import {
  Controller,
  Get,
  Post,
  Param,
  Body,
  Headers,
  BadRequestException,
  UnauthorizedException,
  NotFoundException,
  Logger,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { IsString, IsNotEmpty } from 'class-validator';
import { SupabaseService } from '../../supabase/supabase.service';
import { CustomersService } from '../../customers/customers.service';
import { ApiKeysService } from '../../api-keys/api-keys.service';

class BindCustomerDto {
  @IsString()
  @IsNotEmpty()
  external_id: string;
}

export interface UnresolvedCustomer {
  id: string;
  stripe_customer_id: string | null;
  email: string | null;
  name: string | null;
  created_at: string;
}

// SDK-facing endpoints used by the merchant's backend to resolve customers
// that came in through the Stripe → BOS import flow and don't yet have an
// external_id bound. The dashboard's "Needs Attention" drawer drives one-off
// fixes; this surface drives bulk scripts.
@ApiTags('SDK - Customers (API Key Auth)')
@Controller('v1/customers')
export class V1CustomersController {
  private readonly logger = new Logger(V1CustomersController.name);

  constructor(
    private readonly supabaseService: SupabaseService,
    private readonly customersService: CustomersService,
    private readonly apiKeysService: ApiKeysService,
  ) {}

  @Get('unresolved')
  async listUnresolved(
    @Headers('authorization') authHeader: string,
  ): Promise<{ customers: UnresolvedCustomer[] }> {
    const organizationId = await this.validateApiKey(authHeader);
    const supabase = this.supabaseService.getClient();

    const { data, error } = await supabase
      .from('customers')
      .select('id, stripe_customer_id, email, name, created_at')
      .eq('organization_id', organizationId)
      .is('external_id', null)
      .is('deleted_at', null)
      .order('created_at', { ascending: false });

    if (error) {
      this.logger.error(
        `Failed to list unresolved customers for org ${organizationId}: ${error.message}`,
      );
      throw new Error('Failed to list unresolved customers');
    }

    return { customers: (data ?? []) as UnresolvedCustomer[] };
  }

  @Post(':id/bind')
  async bindCustomer(
    @Headers('authorization') authHeader: string,
    @Param('id') customerId: string,
    @Body() dto: BindCustomerDto,
  ) {
    const organizationId = await this.validateApiKey(authHeader);

    // Reuses customersService.update which enforces external_id immutability:
    // succeeds only when current value is NULL; otherwise throws BadRequest.
    try {
      const updated = await this.customersService.update(
        customerId,
        organizationId,
        { external_id: dto.external_id } as any,
      );
      this.logger.log(
        `Bound customer ${customerId} → external_id=${dto.external_id} (org ${organizationId})`,
      );
      return updated;
    } catch (e) {
      if (e instanceof NotFoundException || e instanceof BadRequestException) {
        throw e;
      }
      throw e;
    }
  }

  private async validateApiKey(authHeader?: string): Promise<string> {
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      throw new UnauthorizedException(
        'Missing or invalid Authorization header',
      );
    }
    const apiKey = authHeader.slice('Bearer '.length);
    if (!apiKey.startsWith('sk_')) {
      throw new UnauthorizedException(
        'Invalid API key format. Use a secret key (sk_live_* or sk_test_*)',
      );
    }
    const keyRecord = await this.apiKeysService.validate(apiKey);
    return keyRecord.organization_id;
  }
}

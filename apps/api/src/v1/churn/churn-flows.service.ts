import {
  Injectable,
  Logger,
  NotFoundException,
  ForbiddenException,
} from '@nestjs/common';
import { SupabaseService } from '../../supabase/supabase.service';
import { CreateChurnFlowDto, UpdateChurnFlowDto } from './dto/churn-flows.dto';

@Injectable()
export class ChurnFlowsService {
  private readonly logger = new Logger(ChurnFlowsService.name);

  constructor(private readonly supabaseService: SupabaseService) {}

  async list(organizationId: string, userId: string) {
    await this.verifyMembership(organizationId, userId);
    const supabase = this.supabaseService.getClient();

    const { data, error } = await supabase
      .from('churn_flows')
      .select('*')
      .eq('organization_id', organizationId)
      .order('updated_at', { ascending: false });

    if (error) {
      throw new NotFoundException('Failed to load churn flows');
    }
    return data ?? [];
  }

  async get(id: string, userId: string) {
    const supabase = this.supabaseService.getClient();
    const { data: flow, error } = await supabase
      .from('churn_flows')
      .select('*')
      .eq('id', id)
      .single();

    if (error || !flow) {
      throw new NotFoundException('Churn flow not found');
    }
    await this.verifyMembership(flow.organization_id, userId);
    return flow;
  }

  async create(userId: string, dto: CreateChurnFlowDto) {
    await this.verifyMembership(dto.organization_id, userId);
    const supabase = this.supabaseService.getClient();

    if (dto.enabled) {
      await this.disableOtherFlows(dto.organization_id);
    }

    const { data, error } = await supabase
      .from('churn_flows')
      .insert({
        organization_id: dto.organization_id,
        name: dto.name,
        enabled: dto.enabled ?? false,
        steps: (dto.steps as never) ?? [],
        targeting: (dto.targeting as never) ?? {},
        settings: (dto.settings as never) ?? {},
      })
      .select('*')
      .single();

    if (error || !data) {
      this.logger.error(`Failed to create churn flow: ${error?.message}`);
      throw new NotFoundException('Failed to create churn flow');
    }
    return data;
  }

  async update(id: string, userId: string, dto: UpdateChurnFlowDto) {
    const flow = await this.get(id, userId);

    const supabase = this.supabaseService.getClient();

    if (dto.enabled === true) {
      await this.disableOtherFlows(flow.organization_id, id);
    }

    const updateData: Record<string, unknown> = {};
    if (dto.name !== undefined) updateData.name = dto.name;
    if (dto.enabled !== undefined) updateData.enabled = dto.enabled;
    if (dto.steps !== undefined) updateData.steps = dto.steps;
    if (dto.targeting !== undefined) updateData.targeting = dto.targeting;
    if (dto.settings !== undefined) updateData.settings = dto.settings;

    const { data, error } = await supabase
      .from('churn_flows')
      .update(updateData)
      .eq('id', id)
      .eq('organization_id', flow.organization_id)
      .select('*')
      .single();

    if (error || !data) {
      this.logger.error(`Failed to update churn flow: ${error?.message}`);
      throw new NotFoundException('Failed to update churn flow');
    }
    return data;
  }

  async remove(id: string, userId: string) {
    const flow = await this.get(id, userId);
    const supabase = this.supabaseService.getClient();

    const { error } = await supabase
      .from('churn_flows')
      .delete()
      .eq('id', id)
      .eq('organization_id', flow.organization_id);

    if (error) {
      throw new NotFoundException('Failed to delete churn flow');
    }
    return { success: true };
  }

  /** v1 invariant: a single enabled flow per org (portal renders the enabled one). */
  private async disableOtherFlows(organizationId: string, exceptId?: string) {
    const supabase = this.supabaseService.getClient();
    let query = supabase
      .from('churn_flows')
      .update({ enabled: false })
      .eq('organization_id', organizationId)
      .eq('enabled', true);
    if (exceptId) {
      query = query.neq('id', exceptId);
    }
    await query;
  }

  private async verifyMembership(organizationId: string, userId: string) {
    const supabase = this.supabaseService.getClient();
    const { data: membership } = await supabase
      .from('user_organizations')
      .select('user_id')
      .eq('organization_id', organizationId)
      .eq('user_id', userId)
      .is('deleted_at', null)
      .single();

    if (!membership) {
      throw new ForbiddenException('You are not a member of this organization');
    }
  }
}

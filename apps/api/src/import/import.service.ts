import {
  Injectable,
  Logger,
  BadRequestException,
  NotFoundException,
  ConflictException,
} from '@nestjs/common';
import { SupabaseService } from '../supabase/supabase.service';
import { StripeService } from '../stripe/stripe.service';
import { QueueService } from '../queue/queue.service';
import { SaveMappingsDto } from './dto/save-mappings.dto';

export interface PreviewResult {
  customers: number;
  products: number;
  prices: number;
  subscriptions: number;
  productsList: Array<{
    stripe_product_id: string;
    name: string;
    active_subscriptions: number;
  }>;
}

export interface MigrationJob {
  id: string;
  organization_id: string;
  status: 'pending' | 'running' | 'completed' | 'failed' | 'cancelled';
  totals: Record<string, number>;
  progress: Record<string, number>;
  error_message: string | null;
  pending_binding_count: number;
  stuck_customers: Array<{
    customer_id: string;
    stripe_customer_id: string;
    name: string | null;
    email: string | null;
    reason: 'no_email' | 'email_collision' | 'manual_resolve_requested';
    plan_summary: string | null;
  }>;
  created_at: string;
  updated_at: string;
  completed_at: string | null;
}

@Injectable()
export class ImportService {
  private readonly logger = new Logger(ImportService.name);

  constructor(
    private readonly supabaseService: SupabaseService,
    private readonly stripeService: StripeService,
    private readonly queueService: QueueService,
  ) {}

  // Walks the connected Stripe account once to count customers / products /
  // prices / subscriptions and aggregate active subs per product. Used by the
  // import wizard's preview step.
  async preview(organizationId: string): Promise<PreviewResult> {
    const stripeAccountId = await this.getStripeAccountId(organizationId);

    let customers = 0;
    for await (const _ of this.stripeService.iterateAccountCustomers(
      stripeAccountId,
    )) {
      customers++;
    }

    const products: Array<{ id: string; name: string }> = [];
    for await (const product of this.stripeService.iterateAccountProducts(
      stripeAccountId,
    )) {
      products.push({ id: product.id, name: product.name });
    }

    let prices = 0;
    for await (const _ of this.stripeService.iterateAccountPrices(
      stripeAccountId,
    )) {
      prices++;
    }

    let subscriptions = 0;
    const productCounts = new Map<string, number>();
    for await (const sub of this.stripeService.iterateAccountSubscriptions(
      stripeAccountId,
    )) {
      subscriptions++;
      const productId =
        typeof sub.items.data[0]?.price.product === 'string'
          ? sub.items.data[0].price.product
          : sub.items.data[0]?.price.product?.id;
      if (productId) {
        productCounts.set(productId, (productCounts.get(productId) ?? 0) + 1);
      }
    }

    return {
      customers,
      products: products.length,
      prices,
      subscriptions,
      productsList: products.map((p) => ({
        stripe_product_id: p.id,
        name: p.name,
        active_subscriptions: productCounts.get(p.id) ?? 0,
      })),
    };
  }

  async saveMappings(
    organizationId: string,
    dto: SaveMappingsDto,
  ): Promise<{ saved: number }> {
    if (dto.mappings.length === 0) {
      return { saved: 0 };
    }

    const supabase = this.supabaseService.getClient();

    // Validate every bos_product_id belongs to this org before writing.
    const ids = dto.mappings.map((m) => m.bos_product_id);
    const { data: products } = await supabase
      .from('products')
      .select('id')
      .eq('organization_id', organizationId)
      .in('id', ids);

    const validIds = new Set((products ?? []).map((p) => p.id));
    const invalid = dto.mappings.filter((m) => !validIds.has(m.bos_product_id));
    if (invalid.length > 0) {
      throw new BadRequestException(
        `Some BOS products don't belong to this organization: ${invalid
          .map((m) => m.bos_product_id)
          .join(', ')}`,
      );
    }

    const rows = dto.mappings.map((m) => ({
      organization_id: organizationId,
      stripe_product_id: m.stripe_product_id,
      bos_product_id: m.bos_product_id,
    }));

    const { error } = await supabase
      .from('stripe_product_mappings' as any)
      .upsert(rows, {
        onConflict: 'organization_id,stripe_product_id',
      });

    if (error) {
      this.logger.error(
        `Failed to save product mappings for org ${organizationId}: ${error.message}`,
      );
      throw new Error('Failed to save product mappings');
    }

    return { saved: rows.length };
  }

  // Creates a migration_jobs row in 'pending' state and enqueues a PGMQ
  // message. The migration_jobs table has a partial unique index that prevents
  // a second active job for the same org — we surface that as a 409.
  async startJob(organizationId: string): Promise<{ job_id: string }> {
    await this.getStripeAccountId(organizationId); // throws if not connected

    const supabase = this.supabaseService.getClient();
    const { data: job, error } = await supabase
      .from('migration_jobs' as any)
      .insert({
        organization_id: organizationId,
        status: 'pending',
      })
      .select('id')
      .single();

    if (error) {
      if (error.code === '23505') {
        throw new ConflictException(
          'An import is already running for this organization.',
        );
      }
      this.logger.error(
        `Failed to create migration_jobs row for org ${organizationId}: ${error.message}`,
      );
      throw new Error('Failed to start import job');
    }

    const jobId = (job as unknown as { id: string }).id;

    await this.queueService.sendStripeImport({
      type: 'stripe_import',
      reference_id: jobId,
      priority: 5,
      organization_id: organizationId,
      details: { job_id: jobId },
    });

    this.logger.log(
      `Started Stripe import job ${jobId} for org ${organizationId}`,
    );
    return { job_id: jobId };
  }

  async getStatus(
    organizationId: string,
    jobId: string,
  ): Promise<MigrationJob> {
    const supabase = this.supabaseService.getClient();
    const { data, error } = await supabase
      .from('migration_jobs' as any)
      .select('*')
      .eq('id', jobId)
      .eq('organization_id', organizationId)
      .maybeSingle();

    if (error || !data) {
      throw new NotFoundException('Migration job not found');
    }
    return data as unknown as MigrationJob;
  }

  // Returns the most recent migration job for the org, if any. Drives the
  // dashboard's status-aware UI.
  async getLatestJob(organizationId: string): Promise<MigrationJob | null> {
    const supabase = this.supabaseService.getClient();
    const { data } = await supabase
      .from('migration_jobs' as any)
      .select('*')
      .eq('organization_id', organizationId)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    return (data as unknown as MigrationJob) ?? null;
  }

  private async getStripeAccountId(organizationId: string): Promise<string> {
    const supabase = this.supabaseService.getClient();
    const { data: org } = await supabase
      .from('organizations')
      .select('account_id')
      .eq('id', organizationId)
      .maybeSingle();
    if (!org?.account_id) {
      throw new BadRequestException(
        'No Stripe account connected to this organization.',
      );
    }

    const { data: account } = await supabase
      .from('accounts')
      .select('stripe_id')
      .eq('id', org.account_id)
      .maybeSingle();

    if (!account?.stripe_id) {
      throw new BadRequestException(
        'No Stripe account connected to this organization.',
      );
    }
    return account.stripe_id;
  }
}

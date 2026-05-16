import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { SupabaseService } from '../supabase/supabase.service';
import { StripeService } from '../stripe/stripe.service';
import { QueueService, PgmqMessage } from '../queue/queue.service';
import { StripeIngestService } from '../billing/import/stripe-ingest.service';

interface StuckCustomer {
  customer_id: string;
  stripe_customer_id: string;
  name: string | null;
  email: string | null;
  reason: 'no_email' | 'email_collision' | 'manual_resolve_requested';
  plan_summary: string | null;
}

// Polls the stripe_import PGMQ queue and runs each migration job to completion.
// Each message corresponds to a single migration_jobs row; the row is the
// source of truth for status / progress and what the dashboard polls.
@Injectable()
export class ImportWorkerService implements OnModuleInit {
  private readonly logger = new Logger(ImportWorkerService.name);
  private running = false;

  constructor(
    private readonly supabaseService: SupabaseService,
    private readonly stripeService: StripeService,
    private readonly queueService: QueueService,
    private readonly stripeIngestService: StripeIngestService,
  ) {}

  onModuleInit(): void {
    this.logger.log('ImportWorkerService initialized — polling every 5s');
  }

  // Cron tick — keep it short. Heavy work happens inside processJob().
  @Cron(CronExpression.EVERY_5_SECONDS)
  async tick(): Promise<void> {
    if (this.running) return; // single-flight per process
    this.running = true;
    try {
      const messages = await this.queueService.readStripeImport(1, 900);
      for (const msg of messages) {
        await this.handleMessage(msg);
      }
    } catch (e) {
      this.logger.error(`Worker tick failed: ${(e as Error).message}`);
    } finally {
      this.running = false;
    }
  }

  private async handleMessage(msg: PgmqMessage): Promise<void> {
    const jobId = msg.message.reference_id;
    try {
      await this.processJob(jobId);
      await this.queueService.archiveStripeImport(msg.msg_id);
    } catch (e) {
      this.logger.error(`Import job ${jobId} failed: ${(e as Error).message}`);
      await this.markFailed(jobId, (e as Error).message);
      await this.queueService.archiveStripeImport(msg.msg_id);
    }
  }

  private async processJob(jobId: string): Promise<void> {
    const supabase = this.supabaseService.getClient();

    const { data: jobRow, error: loadError } = await supabase
      .from('migration_jobs' as any)
      .select('*')
      .eq('id', jobId)
      .maybeSingle();

    if (loadError || !jobRow) {
      this.logger.warn(`Migration job ${jobId} not found — dropping message`);
      return;
    }

    const job = jobRow as unknown as {
      id: string;
      organization_id: string;
      status: string;
    };

    if (job.status !== 'pending') {
      this.logger.warn(`Migration job ${jobId} is ${job.status} — skipping`);
      return;
    }

    const stripeAccountId = await this.getStripeAccountId(job.organization_id);

    await this.update(jobId, { status: 'running' });

    // ── Customers ──
    let customersDone = 0;
    let customersImported = 0;
    for await (const customer of this.stripeService.iterateAccountCustomers(
      stripeAccountId,
    )) {
      const result = await this.stripeIngestService.ingestCustomer(
        job.organization_id,
        customer,
      );
      customersDone++;
      if (result.created) customersImported++;
      if (customersDone % 25 === 0) {
        await this.update(jobId, {
          progress: { customers_done: customersDone },
        });
      }
    }
    await this.update(jobId, {
      progress: { customers_done: customersDone },
      totals: { customers: customersDone },
    });

    // ── Subscriptions (only active-ish — skip canceled / incomplete_expired) ──
    let subsDone = 0;
    let subsImported = 0;
    let subsSkipped = 0;
    for await (const sub of this.stripeService.iterateAccountSubscriptions(
      stripeAccountId,
    )) {
      if (!['active', 'trialing', 'past_due', 'unpaid'].includes(sub.status)) {
        continue;
      }
      const result = await this.stripeIngestService.ingestSubscription(
        job.organization_id,
        sub,
      );
      subsDone++;
      if (!result) {
        subsSkipped++;
      } else if (result.created) {
        subsImported++;
      }
      if (subsDone % 25 === 0) {
        await this.update(jobId, {
          progress: { customers_done: customersDone, subs_done: subsDone },
        });
      }
    }

    // ── Classify unresolved customers ──
    const { pendingCount, stuck } = await this.classifyUnresolved(
      job.organization_id,
    );

    await this.update(jobId, {
      status: 'completed',
      completed_at: new Date().toISOString(),
      totals: {
        customers: customersDone,
        customers_imported: customersImported,
        subs: subsDone,
        subs_imported: subsImported,
        subs_skipped_no_mapping: subsSkipped,
      },
      progress: {
        customers_done: customersDone,
        subs_done: subsDone,
      },
      pending_binding_count: pendingCount,
      stuck_customers: stuck,
    });

    this.logger.log(
      `Import job ${jobId} completed: ${customersImported} customers, ${subsImported} subs, ${subsSkipped} subs skipped, ${pendingCount} pending bind, ${stuck.length} stuck`,
    );
  }

  // Splits NULL-external_id customers into the two buckets the dashboard surfaces.
  // Bucket 1 (pending): unique email — will lazy-bind on first session token.
  // Bucket 2 (stuck): no email OR email collides with another row in this org.
  private async classifyUnresolved(
    organizationId: string,
  ): Promise<{ pendingCount: number; stuck: StuckCustomer[] }> {
    const supabase = this.supabaseService.getClient();

    const { data: unresolved } = await supabase
      .from('customers')
      .select('id, stripe_customer_id, email, name')
      .eq('organization_id', organizationId)
      .is('external_id', null)
      .is('deleted_at', null);

    if (!unresolved || unresolved.length === 0) {
      return { pendingCount: 0, stuck: [] };
    }

    // Count email occurrences (case-insensitive) within this org's unresolved set.
    const emailCounts = new Map<string, number>();
    for (const row of unresolved) {
      if (row.email) {
        const key = row.email.toLowerCase();
        emailCounts.set(key, (emailCounts.get(key) ?? 0) + 1);
      }
    }

    let pendingCount = 0;
    const stuck: StuckCustomer[] = [];
    for (const row of unresolved) {
      if (!row.email) {
        stuck.push({
          customer_id: row.id,
          stripe_customer_id: row.stripe_customer_id ?? '',
          name: row.name,
          email: null,
          reason: 'no_email',
          plan_summary: null,
        });
        continue;
      }
      const count = emailCounts.get(row.email.toLowerCase()) ?? 0;
      if (count > 1) {
        stuck.push({
          customer_id: row.id,
          stripe_customer_id: row.stripe_customer_id ?? '',
          name: row.name,
          email: row.email,
          reason: 'email_collision',
          plan_summary: null,
        });
        continue;
      }
      pendingCount++;
    }

    return { pendingCount, stuck };
  }

  private async update(
    jobId: string,
    patch: Record<string, unknown>,
  ): Promise<void> {
    const supabase = this.supabaseService.getClient();
    const { error } = await supabase
      .from('migration_jobs' as any)
      .update({ ...patch, updated_at: new Date().toISOString() })
      .eq('id', jobId);
    if (error) {
      this.logger.error(
        `Failed to update migration job ${jobId}: ${error.message}`,
      );
    }
  }

  private async markFailed(jobId: string, message: string): Promise<void> {
    await this.update(jobId, {
      status: 'failed',
      error_message: message.slice(0, 1000),
    });
  }

  private async getStripeAccountId(organizationId: string): Promise<string> {
    const supabase = this.supabaseService.getClient();
    const { data: org } = await supabase
      .from('organizations')
      .select('account_id')
      .eq('id', organizationId)
      .maybeSingle();
    if (!org?.account_id) {
      throw new Error('No Stripe account connected for this organization');
    }
    const { data: account } = await supabase
      .from('accounts')
      .select('stripe_id')
      .eq('id', org.account_id)
      .maybeSingle();
    if (!account?.stripe_id) {
      throw new Error('No Stripe account connected for this organization');
    }
    return account.stripe_id;
  }
}

import { Injectable, Logger } from '@nestjs/common';
import { SupabaseService } from '../supabase/supabase.service';

export interface QueueMessage {
  type: string;
  reference_id: string;
  priority: number;
  details: Record<string, unknown>;
  error_message?: string;
  organization_id?: string;
  created_by?: string;
}

export interface PgmqMessage {
  msg_id: number;
  read_ct: number;
  enqueued_at: string;
  vt: string;
  message: QueueMessage;
}

export interface QueueMetrics {
  queue_name: string;
  queue_length: number;
  newest_msg_age_sec: number;
  oldest_msg_age_sec: number;
  total_messages: number;
  scrape_time: string;
}

@Injectable()
export class QueueService {
  private readonly logger = new Logger(QueueService.name);

  constructor(private readonly supabaseService: SupabaseService) {}

  /**
   * Send a message to the billing_reconciliation queue (auto-processable items)
   */
  async sendReconciliation(
    message: QueueMessage,
    delaySecs?: number,
  ): Promise<number | null> {
    return this.send('billing_reconciliation', message, delaySecs);
  }

  /**
   * Send a message to the billing_alerts queue (needs human review)
   */
  async sendAlert(message: QueueMessage): Promise<number | null> {
    return this.send('billing_alerts', message);
  }

  /**
   * Read a batch of messages from the reconciliation queue
   * @param qty Number of messages to read
   * @param vtSecs Visibility timeout in seconds (default 300 = 5 minutes)
   */
  async readReconciliation(qty: number, vtSecs = 300): Promise<PgmqMessage[]> {
    return this.read('billing_reconciliation', qty, vtSecs);
  }

  /**
   * Archive a processed reconciliation message (moves to archive table)
   */
  async archiveReconciliation(msgId: number): Promise<boolean> {
    return this.archive('billing_reconciliation', msgId);
  }

  /**
   * Escalate a message from reconciliation → alerts queue (needs human review)
   */
  async escalateToManualReview(
    msg: PgmqMessage,
    notes?: string,
  ): Promise<void> {
    const alertMessage: QueueMessage = {
      ...msg.message,
      details: {
        ...msg.message.details,
        escalation_reason: notes,
        escalated_at: new Date().toISOString(),
        original_read_ct: msg.read_ct,
      },
    };

    await this.sendAlert(alertMessage);
    await this.archiveReconciliation(msg.msg_id);

    this.logger.warn(
      `Escalated msg ${msg.msg_id} (type: ${msg.message.type}) to billing_alerts: ${notes}`,
    );
  }

  /**
   * Read messages from the alerts queue (for admin dashboard)
   */
  async readAlerts(qty: number, vtSecs = 600): Promise<PgmqMessage[]> {
    return this.read('billing_alerts', qty, vtSecs);
  }

  // Stripe → BOS import queue. Tied to the migration_jobs table; the worker
  // hops through the migration_jobs row as it processes each message.
  async sendStripeImport(message: QueueMessage): Promise<number | null> {
    return this.send('stripe_import', message);
  }

  async readStripeImport(qty: number, vtSecs = 600): Promise<PgmqMessage[]> {
    return this.read('stripe_import', qty, vtSecs);
  }

  async archiveStripeImport(msgId: number): Promise<boolean> {
    return this.archive('stripe_import', msgId);
  }

  async deleteStripeImport(msgId: number): Promise<boolean> {
    return this.delete('stripe_import', msgId);
  }

  /**
   * Archive an alert (admin resolved it)
   */
  async archiveAlert(msgId: number): Promise<boolean> {
    return this.archive('billing_alerts', msgId);
  }

  /**
   * Delete an alert permanently (admin discarded it)
   */
  async deleteAlert(msgId: number): Promise<boolean> {
    return this.delete('billing_alerts', msgId);
  }

  /**
   * Get queue metrics for monitoring
   */
  async getMetrics(queueName: string): Promise<QueueMetrics | null> {
    const supabase = this.supabaseService.getClient();

    // Cast to bypass TypeScript — pgmq RPC functions are not in generated types until migration runs
    const { data, error } = await (supabase.rpc as CallableFunction)(
      'pgmq_metrics',
      { p_queue_name: queueName },
    );

    if (error) {
      this.logger.error(`Failed to get metrics for queue ${queueName}:`, error);
      return null;
    }

    const row = Array.isArray(data) ? data[0] : data;
    return row as QueueMetrics | null;
  }

  /**
   * Get metrics for all queues
   */
  async getAllMetrics(): Promise<QueueMetrics[]> {
    const supabase = this.supabaseService.getClient();

    const { data, error } = await (supabase.rpc as CallableFunction)(
      'pgmq_metrics_all',
    );

    if (error) {
      this.logger.error('Failed to get all queue metrics:', error);
      return [];
    }

    return (data as QueueMetrics[]) || [];
  }

  // --- Internal helpers ---

  private async send(
    queueName: string,
    message: QueueMessage,
    delaySecs?: number,
  ): Promise<number | null> {
    const supabase = this.supabaseService.getClient();

    const { data, error } = await (supabase.rpc as CallableFunction)(
      'pgmq_send',
      {
        p_queue_name: queueName,
        p_message: message,
        p_delay: delaySecs ?? 0,
      },
    );

    if (error) {
      this.logger.error(`Failed to send message to ${queueName}:`, error);
      return null;
    }

    this.logger.log(
      `Sent message to ${queueName}: type=${message.type}, ref=${message.reference_id}, msg_id=${data}`,
    );

    return data as number;
  }

  private async read(
    queueName: string,
    qty: number,
    vtSecs: number,
  ): Promise<PgmqMessage[]> {
    const supabase = this.supabaseService.getClient();

    const { data, error } = await (supabase.rpc as CallableFunction)(
      'pgmq_read',
      {
        p_queue_name: queueName,
        p_vt: vtSecs,
        p_qty: qty,
      },
    );

    if (error) {
      this.logger.error(`Failed to read from ${queueName}:`, error);
      return [];
    }

    return (data as PgmqMessage[]) || [];
  }

  private async archive(queueName: string, msgId: number): Promise<boolean> {
    const supabase = this.supabaseService.getClient();

    const { data, error } = await (supabase.rpc as CallableFunction)(
      'pgmq_archive',
      {
        p_queue_name: queueName,
        p_msg_id: msgId,
      },
    );

    if (error) {
      this.logger.error(
        `Failed to archive msg ${msgId} from ${queueName}:`,
        error,
      );
      return false;
    }

    return data as boolean;
  }

  private async delete(queueName: string, msgId: number): Promise<boolean> {
    const supabase = this.supabaseService.getClient();

    const { data, error } = await (supabase.rpc as CallableFunction)(
      'pgmq_delete',
      {
        p_queue_name: queueName,
        p_msg_id: msgId,
      },
    );

    if (error) {
      this.logger.error(
        `Failed to delete msg ${msgId} from ${queueName}:`,
        error,
      );
      return false;
    }

    return data as boolean;
  }
}

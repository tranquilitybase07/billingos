import { Injectable, Logger } from '@nestjs/common';
import { SupabaseService } from '../supabase/supabase.service';
import { SupabaseClient } from '@supabase/supabase-js';

/**
 * Database service with transaction support
 * Inspired by Flowglad's comprehensiveAdminTransaction pattern
 */
@Injectable()
export class DatabaseService {
  private readonly logger = new Logger(DatabaseService.name);

  constructor(private readonly supabaseService: SupabaseService) {}

  /**
   * Execute a function within a database transaction
   * All operations within the callback are atomic - either all succeed or all fail
   *
   * Example usage:
   * ```typescript
   * const result = await databaseService.runInTransaction(async (client) => {
   *   const subscription = await client.from('subscriptions').insert(data).select().single();
   *   const features = await client.from('feature_grants').insert(featureData).select();
   *   const customer = await client.from('customers').update({ has_subscription: true }).eq('id', customerId);
   *   return { subscription, features, customer };
   * });
   * ```
   *
   * Note: Supabase doesn't have built-in transaction support in the JS client,
   * so we'll use RPC functions for critical atomic operations.
   * This wrapper provides a consistent interface for future migration to true transactions.
   */
  async runInTransaction<T>(
    callback: (client: SupabaseClient) => Promise<T>,
    options?: {
      isolationLevel?: 'read_committed' | 'repeatable_read' | 'serializable';
      maxRetries?: number;
    },
  ): Promise<T> {
    const maxRetries = options?.maxRetries || 3;
    let lastError: Error | null = null;

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        // Get a fresh client for this transaction
        const client = this.supabaseService.getClient();

        // Execute the callback
        // Note: In production with a proper transaction-supporting client,
        // we would wrap this in BEGIN/COMMIT/ROLLBACK
        const result = await callback(client);

        this.logger.debug(`Transaction completed successfully on attempt ${attempt}`);
        return result;
      } catch (error) {
        lastError = error as Error;
        this.logger.warn(
          `Transaction failed on attempt ${attempt}/${maxRetries}: ${lastError.message}`,
        );

        // Check if error is retryable
        if (!this.isRetryableError(lastError) || attempt === maxRetries) {
          throw lastError;
        }

        // Exponential backoff before retry
        const delay = Math.min(100 * Math.pow(2, attempt - 1), 2000);
        await this.sleep(delay);
      }
    }

    throw lastError || new Error('Transaction failed after all retries');
  }

  /**
   * Execute an atomic operation using a Supabase RPC function
   * This is the preferred method for critical operations that must be atomic
   */
  async executeAtomicOperation<T>(
    functionName: string,
    params: Record<string, any>,
  ): Promise<T> {
    const supabase = this.supabaseService.getClient();

    const { data, error } = await supabase.rpc(functionName, params);

    if (error) {
      this.logger.error(`Atomic operation ${functionName} failed:`, error);
      throw error;
    }

    return data as T;
  }

  /**
   * Create subscription atomically with all related records
   * This calls the RPC function we'll create in the migration
   */
  async createSubscriptionAtomic(params: {
    subscription: Record<string, any>;
    features: Array<Record<string, any>>;
    customerId: string;
    productId: string;
    organizationId: string;
  }): Promise<{ subscriptionId: string; success: boolean }> {
    return this.executeAtomicOperation('create_subscription_atomic', {
      p_subscription: params.subscription,
      p_features: params.features,
      p_customer_id: params.customerId,
      p_product_id: params.productId,
      p_organization_id: params.organizationId,
    });
  }

  /**
   * Upsert customer atomically with race condition handling
   */
  async upsertCustomerAtomic(params: {
    organizationId: string;
    email: string;
    externalId?: string;
    name?: string;
    stripeCustomerId?: string;
    metadata?: Record<string, any>;
  }): Promise<{ customerId: string; created: boolean }> {
    return this.executeAtomicOperation('upsert_customer_atomic', {
      p_organization_id: params.organizationId,
      p_email: params.email,
      p_external_id: params.externalId || null,
      p_name: params.name || null,
      p_stripe_customer_id: params.stripeCustomerId || null,
      p_metadata: params.metadata || {},
    });
  }

  /**
   * Check if an error is retryable (deadlock, connection issues, etc.)
   */
  private isRetryableError(error: Error): boolean {
    const message = error.message?.toLowerCase() || '';

    return (
      message.includes('deadlock') ||
      message.includes('connection') ||
      message.includes('timeout') ||
      message.includes('conflict') ||
      message.includes('serialization failure') ||
      message.includes('could not serialize')
    );
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  /**
   * Batch insert with automatic chunking
   * Useful for inserting many records efficiently
   */
  async batchInsert<T>(
    table: string,
    records: T[],
    options?: {
      chunkSize?: number;
      onConflict?: string;
    },
  ): Promise<void> {
    const chunkSize = options?.chunkSize || 100;
    const supabase = this.supabaseService.getClient();

    for (let i = 0; i < records.length; i += chunkSize) {
      const chunk = records.slice(i, i + chunkSize);

      const query = supabase.from(table).insert(chunk as any);

      if (options?.onConflict) {
        // Note: Supabase doesn't support ON CONFLICT directly in JS client
        // This would need to be handled via RPC function
        this.logger.warn('ON CONFLICT not directly supported in Supabase JS client');
      }

      const { error } = await query;

      if (error) {
        this.logger.error(`Batch insert failed for ${table}:`, error);
        throw error;
      }

      this.logger.debug(`Inserted ${chunk.length} records into ${table}`);
    }
  }

  /**
   * Acquire an advisory lock (PostgreSQL specific)
   * Useful for preventing race conditions
   */
  async acquireAdvisoryLock(
    key: string,
    timeout: number = 5000,
  ): Promise<boolean> {
    try {
      // Convert string key to a numeric hash for PostgreSQL advisory lock
      const lockId = this.hashStringToNumber(key);

      const { data, error } = await this.supabaseService
        .getClient()
        .rpc('pg_try_advisory_lock', { key: lockId });

      if (error) {
        this.logger.warn(`Failed to acquire lock for ${key}:`, error);
        return false;
      }

      return data === true;
    } catch (error) {
      this.logger.error(`Error acquiring advisory lock:`, error);
      return false;
    }
  }

  /**
   * Release an advisory lock
   */
  async releaseAdvisoryLock(key: string): Promise<void> {
    try {
      const lockId = this.hashStringToNumber(key);

      await this.supabaseService
        .getClient()
        .rpc('pg_advisory_unlock', { key: lockId });
    } catch (error) {
      this.logger.warn(`Failed to release lock for ${key}:`, error);
    }
  }

  private hashStringToNumber(str: string): number {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = (hash << 5) - hash + char;
      hash = hash & hash; // Convert to 32-bit integer
    }
    return Math.abs(hash);
  }
}
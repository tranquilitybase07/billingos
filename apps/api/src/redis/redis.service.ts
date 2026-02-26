import { Injectable, Logger, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createClient, RedisClientType } from 'redis';

@Injectable()
export class RedisService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(RedisService.name);
  private client: RedisClientType;
  private isConnected = false;

  constructor(private readonly configService: ConfigService) {}

  async onModuleInit() {
    const redisUrl = this.configService.get('REDIS_URL');
    const host = this.configService.get('REDIS_HOST');
    const port = this.configService.get('REDIS_PORT');

    // Skip Redis connection entirely if no Redis config is provided
    if (!redisUrl && !host) {
      this.logger.warn('No Redis configuration found (REDIS_URL or REDIS_HOST). Running in degraded mode without Redis.');
      this.isConnected = false;
      return;
    }

    try {
      if (redisUrl) {
        this.client = createClient({ url: redisUrl });
      } else {
        this.client = createClient({
          socket: {
            host,
            port: parseInt(port || '6379', 10),
          },
        });
      }

      this.client.on('error', (err) => {
        this.logger.error('Redis Client Error:', err);
        this.isConnected = false;
      });

      this.client.on('connect', () => {
        this.logger.log('Redis connected successfully');
        this.isConnected = true;
      });

      await this.client.connect();
    } catch (error) {
      this.logger.error('Failed to connect to Redis:', error);
      // Fail-open: Continue without Redis (degraded mode)
      this.isConnected = false;
    }
  }

  async onModuleDestroy() {
    if (this.client && this.isConnected) {
      await this.client.disconnect();
    }
  }

  /**
   * Set idempotency key with NX (only if not exists) and PX (expiry in ms)
   * Returns true if key was set (first request), false if already exists (duplicate)
   *
   * Inspired by Autum's pattern for webhook idempotency
   */
  async setIdempotencyKey(
    key: string,
    value: string | number = Date.now().toString(),
    ttlMs: number = 300000, // 5 minutes default
  ): Promise<boolean> {
    if (!this.isConnected) {
      // Fail-open: If Redis is down, process the request
      this.logger.warn(`Redis not connected, processing request without idempotency check for key: ${key}`);
      return true;
    }

    try {
      // SET key value PX ttlMs NX
      // NX = Only set if not exists
      // PX = Set expiry in milliseconds
      const result = await this.client.set(key, value, {
        PX: ttlMs,
        NX: true,
      });

      // Redis returns 'OK' if set was successful, null if key already exists
      return result === 'OK';
    } catch (error) {
      this.logger.error(`Error setting idempotency key ${key}:`, error);
      // Fail-open: On error, process the request
      return true;
    }
  }

  /**
   * Check if idempotency key exists
   */
  async checkIdempotencyKey(key: string): Promise<boolean> {
    if (!this.isConnected) {
      return false;
    }

    try {
      const exists = await this.client.exists(key);
      return exists === 1;
    } catch (error) {
      this.logger.error(`Error checking idempotency key ${key}:`, error);
      return false;
    }
  }

  /**
   * Get value for a key
   */
  async get(key: string): Promise<string | null> {
    if (!this.isConnected) {
      return null;
    }

    try {
      return await this.client.get(key);
    } catch (error) {
      this.logger.error(`Error getting key ${key}:`, error);
      return null;
    }
  }

  /**
   * Set a key-value pair with optional TTL
   */
  async set(key: string, value: string, ttlSeconds?: number): Promise<void> {
    if (!this.isConnected) {
      this.logger.warn(`Redis not connected, cannot set key: ${key}`);
      return;
    }

    try {
      if (ttlSeconds) {
        await this.client.setEx(key, ttlSeconds, value);
      } else {
        await this.client.set(key, value);
      }
    } catch (error) {
      this.logger.error(`Error setting key ${key}:`, error);
    }
  }

  /**
   * Delete a key
   */
  async delete(key: string): Promise<void> {
    if (!this.isConnected) {
      return;
    }

    try {
      await this.client.del(key);
    } catch (error) {
      this.logger.error(`Error deleting key ${key}:`, error);
    }
  }

  /**
   * Check if Redis is connected
   */
  isHealthy(): boolean {
    return this.isConnected;
  }
}
import {
  Injectable,
  Logger,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { SupabaseService } from '../supabase/supabase.service';
import { CreateApiKeyDto, ApiKeyType, ApiKeyEnvironment } from './dto/create-api-key.dto';
import { ApiKey } from './entities/api-key.entity';
import * as crypto from 'crypto';

@Injectable()
export class ApiKeysService {
  private readonly logger = new Logger(ApiKeysService.name);

  constructor(private readonly supabaseService: SupabaseService) {}

  /**
   * Generate a cryptographically secure API key
   * Format: {prefix}_{base58_encoded_random_bytes}
   */
  private generateApiKey(keyType: ApiKeyType, environment: ApiKeyEnvironment): string {
    // Determine prefix based on type and environment
    let prefix = '';
    if (keyType === ApiKeyType.SECRET && environment === ApiKeyEnvironment.LIVE) {
      prefix = 'sk_live';
    } else if (keyType === ApiKeyType.SECRET && environment === ApiKeyEnvironment.TEST) {
      prefix = 'sk_test';
    } else if (keyType === ApiKeyType.PUBLISHABLE && environment === ApiKeyEnvironment.LIVE) {
      prefix = 'pk_live';
    } else if (keyType === ApiKeyType.PUBLISHABLE && environment === ApiKeyEnvironment.TEST) {
      prefix = 'pk_test';
    }

    // Generate 32 random bytes (256 bits) for security
    const randomBytes = crypto.randomBytes(32);

    // Encode as base58 (avoids confusing characters like 0, O, I, l)
    const base58Key = this.base58Encode(randomBytes);

    return `${prefix}_${base58Key}`;
  }

  /**
   * Generate a signing secret for HMAC-SHA256 token signatures
   * Returns base64-encoded 512-bit secret
   */
  private generateSigningSecret(): string {
    const randomBytes = crypto.randomBytes(64); // 512 bits
    return randomBytes.toString('base64');
  }

  /**
   * Hash an API key using SHA-256
   */
  private hashApiKey(apiKey: string): string {
    return crypto.createHash('sha256').update(apiKey).digest('hex');
  }

  /**
   * Base58 encoding (Bitcoin-style, avoids confusing characters)
   */
  private base58Encode(buffer: Buffer): string {
    const ALPHABET = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';
    const base = BigInt(58);

    let num = BigInt('0x' + buffer.toString('hex'));
    let encoded = '';

    while (num > 0) {
      const remainder = Number(num % base);
      encoded = ALPHABET[remainder] + encoded;
      num = num / base;
    }

    // Add leading '1's for leading zero bytes
    for (let i = 0; i < buffer.length && buffer[i] === 0; i++) {
      encoded = '1' + encoded;
    }

    return encoded;
  }

  /**
   * Create a new API key pair for an organization (like Stripe)
   * Generates both secret and publishable keys together
   * Returns the full keys ONCE (never stored in plaintext)
   */
  async create(organizationId: string, createDto: CreateApiKeyDto): Promise<{
    secretKey: ApiKey;
    publishableKey: ApiKey;
    secretFullKey: string;
    publishableFullKey: string;
  }> {
    const supabase = this.supabaseService.getClient();

    // Default environment
    const environment = createDto.environment || ApiKeyEnvironment.TEST;

    // Generate unique pair ID to link the keys
    const keyPairId = crypto.randomUUID();

    // Generate secret key components
    const secretFullKey = this.generateApiKey(ApiKeyType.SECRET, environment);
    const secretKeyPrefix = secretFullKey.substring(0, 13);
    const secretKeyHash = this.hashApiKey(secretFullKey);
    const signingSecret = this.generateSigningSecret();

    // Generate publishable key components
    const publishableFullKey = this.generateApiKey(ApiKeyType.PUBLISHABLE, environment);
    const publishableKeyPrefix = publishableFullKey.substring(0, 13);
    const publishableKeyHash = this.hashApiKey(publishableFullKey);

    // Insert both keys into database (as a pair)
    const { data, error } = await supabase
      .from('api_keys')
      .insert([
        {
          organization_id: organizationId,
          key_type: ApiKeyType.SECRET,
          environment,
          key_prefix: secretKeyPrefix,
          key_hash: secretKeyHash,
          signing_secret: signingSecret,
          name: createDto.name || null,
          key_pair_id: keyPairId,
        },
        {
          organization_id: organizationId,
          key_type: ApiKeyType.PUBLISHABLE,
          environment,
          key_prefix: publishableKeyPrefix,
          key_hash: publishableKeyHash,
          signing_secret: signingSecret, // Share same signing secret for the pair
          name: createDto.name || null,
          key_pair_id: keyPairId,
        },
      ])
      .select();

    if (error || !data || data.length !== 2) {
      this.logger.error('Failed to create API key pair:', error);
      throw new Error('Failed to create API key pair');
    }

    const secretKey = data.find((k) => k.key_type === 'secret') as ApiKey;
    const publishableKey = data.find((k) => k.key_type === 'publishable') as ApiKey;

    this.logger.log(`Created API key pair for organization ${organizationId} (${environment})`);

    return {
      secretKey,
      publishableKey,
      secretFullKey, // Return full key ONCE
      publishableFullKey, // Return full key ONCE
    };
  }

  /**
   * List all API keys for an organization (excluding revoked keys by default)
   */
  async findAll(organizationId: string, includeRevoked = false): Promise<ApiKey[]> {
    const supabase = this.supabaseService.getClient();

    let query = supabase
      .from('api_keys')
      .select('*')
      .eq('organization_id', organizationId)
      .order('created_at', { ascending: false });

    if (!includeRevoked) {
      query = query.is('revoked_at', null);
    }

    const { data, error } = await query;

    if (error) {
      this.logger.error('Failed to fetch API keys:', error);
      throw new Error('Failed to fetch API keys');
    }

    return data as ApiKey[];
  }

  /**
   * Find a single API key by ID
   */
  async findOne(organizationId: string, keyId: string): Promise<ApiKey> {
    const supabase = this.supabaseService.getClient();

    const { data, error } = await supabase
      .from('api_keys')
      .select('*')
      .eq('id', keyId)
      .eq('organization_id', organizationId)
      .single();

    if (error || !data) {
      throw new NotFoundException('API key not found');
    }

    return data as ApiKey;
  }

  /**
   * Revoke an API key pair (soft delete both keys)
   * If the key is part of a pair, revokes both keys together
   */
  async revoke(organizationId: string, keyId: string): Promise<ApiKey[]> {
    const supabase = this.supabaseService.getClient();

    // First, find the key to get its pair ID
    const { data: keyData, error: keyError } = await supabase
      .from('api_keys')
      .select('*')
      .eq('id', keyId)
      .eq('organization_id', organizationId)
      .is('revoked_at', null)
      .single();

    if (keyError || !keyData) {
      throw new NotFoundException('API key not found or already revoked');
    }

    const keyPairId = keyData.key_pair_id;
    const revokedAt = new Date().toISOString();

    // If part of a pair, revoke both keys together
    if (keyPairId) {
      const { data, error } = await supabase
        .from('api_keys')
        .update({ revoked_at: revokedAt })
        .eq('key_pair_id', keyPairId)
        .eq('organization_id', organizationId)
        .is('revoked_at', null)
        .select();

      if (error || !data) {
        throw new Error('Failed to revoke API key pair');
      }

      this.logger.log(`Revoked API key pair ${keyPairId} for organization ${organizationId}`);

      return data as ApiKey[];
    } else {
      // Legacy individual key (no pair)
      const { data, error } = await supabase
        .from('api_keys')
        .update({ revoked_at: revokedAt })
        .eq('id', keyId)
        .eq('organization_id', organizationId)
        .select()
        .single();

      if (error || !data) {
        throw new Error('Failed to revoke API key');
      }

      this.logger.log(`Revoked individual API key ${keyId} for organization ${organizationId}`);

      return [data as ApiKey];
    }
  }

  /**
   * Validate an API key (used for authentication)
   * Returns the API key record if valid, throws UnauthorizedException if invalid
   */
  async validate(providedKey: string): Promise<ApiKey> {
    const supabase = this.supabaseService.getClient();

    // Hash the provided key
    const keyHash = this.hashApiKey(providedKey);

    // Look up by hash
    const { data, error } = await supabase
      .from('api_keys')
      .select('*')
      .eq('key_hash', keyHash)
      .is('revoked_at', null) // Must not be revoked
      .single();

    if (error || !data) {
      throw new UnauthorizedException('Invalid API key');
    }

    // Update last_used_at timestamp (fire-and-forget, don't await)
    supabase
      .from('api_keys')
      .update({ last_used_at: new Date().toISOString() })
      .eq('id', data.id)
      .then(() => {
        this.logger.debug(`Updated last_used_at for API key ${data.id}`);
      });

    return data as ApiKey;
  }

  /**
   * Get the signing secret for an API key (used for session token creation)
   */
  async getSigningSecret(apiKeyId: string): Promise<string> {
    const supabase = this.supabaseService.getClient();

    const { data, error } = await supabase
      .from('api_keys')
      .select('signing_secret')
      .eq('id', apiKeyId)
      .is('revoked_at', null)
      .single();

    if (error || !data) {
      throw new NotFoundException('API key not found');
    }

    return data.signing_secret;
  }
}

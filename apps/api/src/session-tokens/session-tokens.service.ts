import {
  Injectable,
  Logger,
  UnauthorizedException,
  NotFoundException,
} from '@nestjs/common';
import { SupabaseService } from '../supabase/supabase.service';
import { ApiKeysService } from '../api-keys/api-keys.service';
import { CreateSessionTokenDto } from './dto/create-session-token.dto';
import {
  SessionToken,
  SessionTokenPayload,
} from './entities/session-token.entity';
import * as crypto from 'crypto';

@Injectable()
export class SessionTokensService {
  private readonly logger = new Logger(SessionTokensService.name);

  constructor(
    private readonly supabaseService: SupabaseService,
    private readonly apiKeysService: ApiKeysService,
  ) {}

  /**
   * Create a new session token
   * Returns the signed token string (bos_session_{payload}.{signature})
   */
  async create(
    apiKeyId: string,
    organizationId: string,
    createDto: CreateSessionTokenDto,
    environment: 'test' | 'live' = 'live',
  ): Promise<{ sessionToken: SessionToken; token: string }> {
    const supabase = this.supabaseService.getClient();

    // Get signing secret from API key
    const signingSecret = await this.apiKeysService.getSigningSecret(apiKeyId);

    // Generate unique token ID (jti)
    const tokenId = `tok_${crypto.randomBytes(16).toString('hex')}`;

    // Calculate expiry
    const expiresIn = createDto.expiresIn || 3600; // Default 1 hour
    const now = Math.floor(Date.now() / 1000); // Unix timestamp
    const expiresAt = now + expiresIn;

    // Eagerly lazy-bind any imported customer matching this email so downstream
    // SDK endpoints (portal, checkout, feature checks) work on the very first
    // call — not just after a second round-trip. Best-effort; failures here
    // never block token issuance.
    if (createDto.email) {
      await this.tryLazyBind(
        organizationId,
        createDto.externalUserId,
        createDto.email,
      );
    }

    // Create payload
    const payload: SessionTokenPayload = {
      jti: tokenId,
      iat: now,
      exp: expiresAt,
      merchant_id: organizationId,
      external_user_id: createDto.externalUserId,
    };

    // Add optional fields
    if (createDto.email) {
      payload.external_email = createDto.email;
    }
    if (createDto.externalOrganizationId) {
      payload.external_organization_id = createDto.externalOrganizationId;
    }
    if (createDto.allowedOperations && createDto.allowedOperations.length > 0) {
      payload.allowed_operations = createDto.allowedOperations;
    }
    if (createDto.metadata) {
      payload.metadata = createDto.metadata;
    }

    // Generate token string with environment-aware prefix
    const token = this.generateToken(payload, signingSecret, environment);

    // Store in database
    const { data, error } = await supabase
      .from('session_tokens')
      .insert({
        organization_id: organizationId,
        api_key_id: apiKeyId,
        token_id: tokenId,
        external_user_id: createDto.externalUserId,
        external_email: createDto.email || null,
        external_organization_id: createDto.externalOrganizationId || null,
        allowed_operations: createDto.allowedOperations
          ? JSON.stringify(createDto.allowedOperations)
          : null,
        expires_at: new Date(expiresAt * 1000).toISOString(),
        metadata: createDto.metadata
          ? JSON.stringify(createDto.metadata)
          : null,
      } as any)
      .select()
      .single();

    if (error) {
      this.logger.error('Failed to create session token:', error);
      throw new Error('Failed to create session token');
    }

    this.logger.log(
      `Created session token for user ${createDto.externalUserId} in org ${organizationId}`,
    );

    return {
      sessionToken: data as SessionToken,
      token,
    };
  }

  // Best-effort lazy bind for imported customers. If a customer row exists in
  // this org with the given email and external_id IS NULL, set external_id to
  // the merchant's user ID. Safe under concurrency thanks to the partial unique
  // index on (organization_id, external_id) WHERE external_id IS NOT NULL.
  private async tryLazyBind(
    organizationId: string,
    externalUserId: string,
    email: string,
  ): Promise<void> {
    try {
      const supabase = this.supabaseService.getClient();
      const { error } = await supabase
        .from('customers')
        .update({ external_id: externalUserId } as any)
        .eq('organization_id', organizationId)
        .ilike('email', email)
        .is('external_id', null)
        .is('deleted_at', null);

      if (error) {
        this.logger.warn(
          `Lazy bind skipped for ${externalUserId} (${email}): ${error.message}`,
        );
      }
    } catch (e) {
      this.logger.warn(
        `Lazy bind threw for ${externalUserId} (${email}): ${(e as Error).message}`,
      );
    }
  }

  /**
   * Generate a session token string
   * Format: bos_session_{env}_{base64url_payload}.{hmac_signature}
   * e.g. bos_session_test_{payload}.{sig} or bos_session_live_{payload}.{sig}
   */
  private generateToken(
    payload: SessionTokenPayload,
    signingSecret: string,
    environment: 'test' | 'live' = 'live',
  ): string {
    // Encode payload as Base64URL
    const payloadJson = JSON.stringify(payload);
    const payloadBase64 = Buffer.from(payloadJson)
      .toString('base64')
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=/g, ''); // Remove padding

    // Create signing input with environment-aware prefix
    const prefix = `bos_session_${environment}_`;
    const signingInput = `${prefix}${payloadBase64}`;

    // Generate HMAC-SHA256 signature
    const hmac = crypto.createHmac(
      'sha256',
      Buffer.from(signingSecret, 'base64'),
    );
    hmac.update(signingInput);
    const signature = hmac.digest('hex');

    // Combine parts
    return `${signingInput}.${signature}`;
  }

  /**
   * Validate a session token
   * Returns the payload if valid, throws UnauthorizedException if invalid
   */
  async validate(token: string): Promise<SessionTokenPayload> {
    // Split token into parts
    const parts = token.split('.');
    if (parts.length !== 2) {
      throw new UnauthorizedException('Invalid token format');
    }

    const [prefixPayload, providedSignature] = parts;

    // Extract payload — support both new (bos_session_test_/bos_session_live_) and legacy (bos_session_) prefixes
    let payloadBase64: string;
    if (prefixPayload.startsWith('bos_session_test_')) {
      payloadBase64 = prefixPayload.substring('bos_session_test_'.length);
    } else if (prefixPayload.startsWith('bos_session_live_')) {
      payloadBase64 = prefixPayload.substring('bos_session_live_'.length);
    } else if (prefixPayload.startsWith('bos_session_')) {
      // Legacy tokens without environment prefix — treat as live
      payloadBase64 = prefixPayload.substring('bos_session_'.length);
    } else {
      throw new UnauthorizedException('Invalid token prefix');
    }

    // Decode payload
    let payload: SessionTokenPayload;
    try {
      const payloadJson = Buffer.from(
        payloadBase64.replace(/-/g, '+').replace(/_/g, '/'),
        'base64',
      ).toString('utf-8');
      payload = JSON.parse(payloadJson);
    } catch {
      throw new UnauthorizedException('Invalid token payload');
    }

    // Check expiry
    const now = Math.floor(Date.now() / 1000);
    if (payload.exp < now) {
      throw new UnauthorizedException('Token expired');
    }

    // Look up token in database (check revocation)
    const supabase = this.supabaseService.getClient();
    const { data: tokenRecord, error } = await supabase
      .from('session_tokens')
      .select('*, api_keys!inner(signing_secret)')
      .eq('token_id', payload.jti)
      .is('revoked_at', null)
      .single();

    if (error || !tokenRecord) {
      throw new UnauthorizedException('Token not found or revoked');
    }

    // Verify signature using signing secret from API key
    const signingSecret = tokenRecord.api_keys.signing_secret;
    const expectedSignature = this.generateSignature(
      prefixPayload,
      signingSecret,
    );

    if (providedSignature !== expectedSignature) {
      throw new UnauthorizedException('Invalid token signature');
    }

    // Update last_used_at (fire-and-forget)
    supabase
      .from('session_tokens')
      .update({ last_used_at: new Date().toISOString() })
      .eq('id', tokenRecord.id)
      .then(() => {
        this.logger.debug(`Updated last_used_at for token ${payload.jti}`);
      });

    return payload;
  }

  /**
   * Generate HMAC-SHA256 signature for a signing input
   */
  private generateSignature(
    signingInput: string,
    signingSecret: string,
  ): string {
    const hmac = crypto.createHmac(
      'sha256',
      Buffer.from(signingSecret, 'base64'),
    );
    hmac.update(signingInput);
    return hmac.digest('hex');
  }

  /**
   * Revoke a session token
   */
  async revoke(organizationId: string, tokenId: string): Promise<SessionToken> {
    const supabase = this.supabaseService.getClient();

    const { data, error } = await supabase
      .from('session_tokens')
      .update({ revoked_at: new Date().toISOString() })
      .eq('token_id', tokenId)
      .eq('organization_id', organizationId)
      .is('revoked_at', null) // Only revoke if not already revoked
      .select()
      .single();

    if (error || !data) {
      throw new NotFoundException('Session token not found or already revoked');
    }

    this.logger.log(
      `Revoked session token ${tokenId} for organization ${organizationId}`,
    );

    return data as SessionToken;
  }

  /**
   * List all session tokens for an organization (for audit)
   */
  async findAll(
    organizationId: string,
    includeRevoked = false,
  ): Promise<SessionToken[]> {
    const supabase = this.supabaseService.getClient();

    let query = supabase
      .from('session_tokens')
      .select('*')
      .eq('organization_id', organizationId)
      .order('created_at', { ascending: false });

    if (!includeRevoked) {
      query = query.is('revoked_at', null);
    }

    const { data, error } = await query;

    if (error) {
      this.logger.error('Failed to fetch session tokens:', error);
      throw new Error('Failed to fetch session tokens');
    }

    return data as SessionToken[];
  }
}

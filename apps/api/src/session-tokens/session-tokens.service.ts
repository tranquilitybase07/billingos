import {
  Injectable,
  Logger,
  UnauthorizedException,
  NotFoundException,
} from '@nestjs/common';
import { SupabaseService } from '../supabase/supabase.service';
import { ApiKeysService } from '../api-keys/api-keys.service';
import { CreateSessionTokenDto } from './dto/create-session-token.dto';
import { SessionToken, SessionTokenPayload } from './entities/session-token.entity';
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

    // Create payload
    const payload: SessionTokenPayload = {
      jti: tokenId,
      iat: now,
      exp: expiresAt,
      merchant_id: organizationId,
      external_user_id: createDto.externalUserId,
    };

    // Add optional fields
    if (createDto.externalOrganizationId) {
      payload.external_organization_id = createDto.externalOrganizationId;
    }
    if (createDto.allowedOperations && createDto.allowedOperations.length > 0) {
      payload.allowed_operations = createDto.allowedOperations;
    }
    if (createDto.metadata) {
      payload.metadata = createDto.metadata;
    }

    // Generate token string
    const token = this.generateToken(payload, signingSecret);

    // Store in database
    const { data, error } = await supabase
      .from('session_tokens')
      .insert({
        organization_id: organizationId,
        api_key_id: apiKeyId,
        token_id: tokenId,
        external_user_id: createDto.externalUserId,
        external_organization_id: createDto.externalOrganizationId || null,
        allowed_operations: createDto.allowedOperations
          ? JSON.stringify(createDto.allowedOperations)
          : null,
        expires_at: new Date(expiresAt * 1000).toISOString(),
        metadata: createDto.metadata ? JSON.stringify(createDto.metadata) : null,
      })
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

  /**
   * Generate a session token string
   * Format: bos_session_{base64url_payload}.{hmac_signature}
   */
  private generateToken(payload: SessionTokenPayload, signingSecret: string): string {
    // Encode payload as Base64URL
    const payloadJson = JSON.stringify(payload);
    const payloadBase64 = Buffer.from(payloadJson)
      .toString('base64')
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=/g, ''); // Remove padding

    // Create signing input
    const signingInput = `bos_session_${payloadBase64}`;

    // Generate HMAC-SHA256 signature
    const hmac = crypto.createHmac('sha256', Buffer.from(signingSecret, 'base64'));
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

    // Extract payload
    if (!prefixPayload.startsWith('bos_session_')) {
      throw new UnauthorizedException('Invalid token prefix');
    }

    const payloadBase64 = prefixPayload.substring('bos_session_'.length);

    // Decode payload
    let payload: SessionTokenPayload;
    try {
      const payloadJson = Buffer.from(
        payloadBase64.replace(/-/g, '+').replace(/_/g, '/'),
        'base64',
      ).toString('utf-8');
      payload = JSON.parse(payloadJson);
    } catch (error) {
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
    const expectedSignature = this.generateSignature(prefixPayload, signingSecret);

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
  private generateSignature(signingInput: string, signingSecret: string): string {
    const hmac = crypto.createHmac('sha256', Buffer.from(signingSecret, 'base64'));
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

    this.logger.log(`Revoked session token ${tokenId} for organization ${organizationId}`);

    return data as SessionToken;
  }

  /**
   * List all session tokens for an organization (for audit)
   */
  async findAll(organizationId: string, includeRevoked = false): Promise<SessionToken[]> {
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

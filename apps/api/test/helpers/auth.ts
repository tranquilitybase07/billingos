import { INestApplication } from '@nestjs/common';
import { ApiKeysService } from '../../src/api-keys/api-keys.service';
import { SessionTokensService } from '../../src/session-tokens/session-tokens.service';
import { randomUUID } from 'crypto';

export interface TestApiKey {
  apiKeyId: string;
  secretKey: string;
  publishableKey: string;
}

export async function createTestApiKey(
  app: INestApplication,
  organizationId: string,
): Promise<TestApiKey> {
  const apiKeys = app.get(ApiKeysService);
  const result = await apiKeys.create(organizationId, {
    name: `it-${randomUUID().slice(0, 6)}`,
  });
  return {
    apiKeyId: result.secretKey.id,
    secretKey: result.secretFullKey,
    publishableKey: result.publishableFullKey,
  };
}

export interface TestSessionToken {
  token: string;
  externalUserId: string;
}

export async function createTestSessionToken(
  app: INestApplication,
  apiKeyId: string,
  organizationId: string,
  opts: { externalUserId?: string; expiresIn?: number } = {},
): Promise<TestSessionToken> {
  const sessionTokens = app.get(SessionTokensService);
  const externalUserId = opts.externalUserId ?? `ext_${randomUUID().slice(0, 8)}`;

  const { token } = await sessionTokens.create(
    apiKeyId,
    organizationId,
    { externalUserId, expiresIn: opts.expiresIn ?? 3600 },
    'test',
  );

  return { token, externalUserId };
}

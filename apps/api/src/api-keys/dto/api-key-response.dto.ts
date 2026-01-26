export class ApiKeyResponseDto {
  id: string;
  organizationId: string;
  keyType: string;
  environment: string;
  keyPrefix: string; // First 13 chars (safe to display)
  name?: string;
  keyPairId?: string; // Links to paired key
  createdAt: Date;
  lastUsedAt?: Date;
  revokedAt?: Date;
}

export class ApiKeyPairResponseDto {
  pairId: string;
  name?: string;
  environment: string;
  secretKey: ApiKeyResponseDto;
  publishableKey: ApiKeyResponseDto;
  createdAt: Date;
}

export class ApiKeyPairCreatedResponseDto {
  pairId: string;
  name?: string;
  environment: string;
  secretKey: {
    id: string;
    keyPrefix: string;
    fullKey: string; // Only shown ONCE
  };
  publishableKey: {
    id: string;
    keyPrefix: string;
    fullKey: string; // Only shown ONCE
  };
  createdAt: Date;
  warning: string; // Warning message about saving keys
}

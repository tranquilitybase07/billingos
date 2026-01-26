export class SessionTokenResponseDto {
  sessionToken: string; // Full token (bos_session_{payload}.{signature})
  expiresAt: Date; // When token expires
  allowedOperations?: string[]; // Optional: scoped permissions
}

export class SessionTokenDetailsDto {
  id: string;
  tokenId: string; // jti (for revocation)
  organizationId: string;
  externalUserId: string;
  externalOrganizationId?: string;
  allowedOperations?: string[];
  createdAt: Date;
  expiresAt: Date;
  revokedAt?: Date;
  lastUsedAt?: Date;
}

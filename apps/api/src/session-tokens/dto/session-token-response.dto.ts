export class SessionTokenResponseDto {
  sessionToken: string; // Full token (bos_session_{payload}.{signature})
  expiresAt: Date; // When token expires
  allowedOperations?: string[]; // Optional: scoped permissions
  // Count of imported customers in this org with NULL external_id. The Node
  // SDK uses this to warn the merchant when they're issuing session tokens
  // without `email` — those imported customers will never lazy-bind.
  unresolvedCustomers?: number;
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

export interface SessionToken {
  id: string;
  organization_id: string;
  api_key_id: string;
  token_id: string; // jti (JWT Token ID) for revocation
  external_user_id: string; // Merchant's user ID
  external_organization_id: string | null; // Optional: for B2B
  allowed_operations: string[] | null; // NULL = all operations allowed
  created_at: string;
  expires_at: string;
  revoked_at: string | null;
  last_used_at: string | null;
  metadata: Record<string, any> | null;
}

export interface SessionTokenPayload {
  jti: string; // Unique token ID (for revocation)
  iat: number; // Issued at (Unix timestamp)
  exp: number; // Expires at (Unix timestamp)
  merchant_id: string; // Organization ID
  external_user_id: string; // Merchant's user ID
  external_organization_id?: string; // Optional: for B2B
  allowed_operations?: string[]; // Optional: scoped permissions
  metadata?: Record<string, any>; // Optional: IP, user agent, etc.
}

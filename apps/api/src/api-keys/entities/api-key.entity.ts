export interface ApiKey {
  id: string;
  organization_id: string;
  key_type: 'secret' | 'publishable';
  environment: 'live' | 'test';
  key_prefix: string; // First 13 chars (e.g., "sk_live_4fK8n")
  key_hash: string; // SHA-256 hash of full key
  signing_secret: string; // Base64-encoded 512-bit secret for HMAC
  name: string | null;
  key_pair_id: string | null; // Links secret and publishable keys together
  created_at: string;
  last_used_at: string | null;
  revoked_at: string | null;
}

// Detects the merchant's internal user ID from common Stripe metadata keys.
// Checked in priority order — the first non-empty hit wins.
const CANDIDATE_KEYS = [
  'external_id',
  'external_user_id',
  'externalUserId',
  'user_id',
  'userId',
  'customer_id',
  'customerId',
];

export class ExternalIdDetector {
  static detect(
    metadata: Record<string, unknown> | undefined | null,
  ): string | null {
    if (!metadata) return null;
    for (const key of CANDIDATE_KEYS) {
      const value = metadata[key];
      if (typeof value === 'string' && value.trim().length > 0) {
        return value.trim();
      }
    }
    return null;
  }
}

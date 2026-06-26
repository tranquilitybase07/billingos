/**
 * Discount save-offer eligibility — pure function over BOS-derived signals (never
 * Stripe). Rules:
 *  - Block while ANY discount is active (re-granting would reset its duration).
 *  - One-time by default: a customer who already redeemed a churn offer can't again.
 *  - Re-eligible after the discount expires only if the flow allows repeat redemption.
 */
export function isDiscountEligible(
  hasActiveDiscount: boolean,
  redeemedBefore: boolean,
  allowRepeat: boolean,
): boolean {
  if (hasActiveDiscount) return false;
  if (redeemedBefore && !allowRepeat) return false;
  return true;
}

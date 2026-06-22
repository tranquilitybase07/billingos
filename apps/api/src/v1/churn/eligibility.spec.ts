import { isDiscountEligible } from './eligibility';

describe('isDiscountEligible', () => {
  it('blocks while a discount is active (overrides allowRepeat)', () => {
    expect(isDiscountEligible(true, false, false)).toBe(false);
    expect(isDiscountEligible(true, true, true)).toBe(false);
  });

  it('is one-time by default: already redeemed + repeat not allowed → blocked', () => {
    expect(isDiscountEligible(false, true, false)).toBe(false);
  });

  it('re-eligible after expiry when the flow allows repeat redemption', () => {
    expect(isDiscountEligible(false, true, true)).toBe(true);
  });

  it('allows a first-time redemption', () => {
    expect(isDiscountEligible(false, false, false)).toBe(true);
    expect(isDiscountEligible(false, false, true)).toBe(true);
  });
});

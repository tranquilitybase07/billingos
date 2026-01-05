import { Injectable, Logger } from '@nestjs/common';

/**
 * Service for calculating Stripe and platform fees
 */
@Injectable()
export class StripFeesService {
  private readonly logger = new Logger(StripFeesService.name);

  /**
   * Calculate application fee (platform fee) based on account configuration
   *
   * @param amount - Payment amount in cents (e.g., 10000 = $100.00)
   * @param platformFeePercent - Platform fee percentage in basis points (e.g., 60 = 0.6%)
   * @param platformFeeFixed - Platform fixed fee in cents (e.g., 10 = $0.10)
   * @returns Application fee amount in cents
   *
   * @example
   * // For $100 payment with 0.6% + $0.10 platform fee
   * calculateApplicationFee(10000, 60, 10)
   * // Returns: 70 cents ($0.70)
   * // Calculation: (10000 * 60 / 10000) + 10 = 60 + 10 = 70
   */
  calculateApplicationFee(
    amount: number,
    platformFeePercent?: number | null,
    platformFeeFixed?: number | null,
  ): number {
    let applicationFee = 0;

    // Add percentage fee
    if (platformFeePercent) {
      const percentFee = Math.round((amount * platformFeePercent) / 10000);
      applicationFee += percentFee;
    }

    // Add fixed fee
    if (platformFeeFixed) {
      applicationFee += platformFeeFixed;
    }

    this.logger.debug(
      `Calculated application fee for $${(amount / 100).toFixed(2)}: $${(applicationFee / 100).toFixed(2)}`,
    );

    return applicationFee;
  }

  /**
   * Calculate total fees (Stripe + Platform) for display purposes
   *
   * @param amount - Payment amount in cents
   * @param platformFeePercent - Platform fee percentage in basis points
   * @param platformFeeFixed - Platform fixed fee in cents
   * @returns Breakdown of all fees
   *
   * @example
   * // For $100 payment
   * calculateTotalFees(10000, 60, 10)
   * // Returns: {
   * //   stripeFee: 320,      // $3.20 (2.9% + $0.30)
   * //   platformFee: 70,     // $0.70 (0.6% + $0.10)
   * //   totalFees: 390,      // $3.90
   * //   merchantReceives: 9610  // $96.10
   * // }
   */
  calculateTotalFees(
    amount: number,
    platformFeePercent?: number | null,
    platformFeeFixed?: number | null,
  ): {
    stripeFee: number;
    platformFee: number;
    totalFees: number;
    merchantReceives: number;
    breakdown: {
      stripePercent: number; // 2.9%
      stripeFixed: number; // $0.30
      platformPercent: number;
      platformFixed: number;
    };
  } {
    // Stripe's standard fees: 2.9% + $0.30
    const STRIPE_PERCENT = 290; // 2.9% in basis points
    const STRIPE_FIXED = 30; // $0.30 in cents

    const stripePercentFee = Math.round((amount * STRIPE_PERCENT) / 10000);
    const stripeFee = stripePercentFee + STRIPE_FIXED;

    const platformPercentFee = platformFeePercent
      ? Math.round((amount * platformFeePercent) / 10000)
      : 0;
    const platformFee = platformPercentFee + (platformFeeFixed || 0);

    const totalFees = stripeFee + platformFee;
    const merchantReceives = amount - totalFees;

    return {
      stripeFee,
      platformFee,
      totalFees,
      merchantReceives,
      breakdown: {
        stripePercent: stripePercentFee,
        stripeFixed: STRIPE_FIXED,
        platformPercent: platformPercentFee,
        platformFixed: platformFeeFixed || 0,
      },
    };
  }

  /**
   * Format fee breakdown for merchant display
   *
   * @param amount - Payment amount in cents
   * @param platformFeePercent - Platform fee percentage in basis points
   * @param platformFeeFixed - Platform fixed fee in cents
   * @returns Human-readable fee breakdown
   */
  formatFeeBreakdown(
    amount: number,
    platformFeePercent?: number | null,
    platformFeeFixed?: number | null,
  ): string {
    const fees = this.calculateTotalFees(
      amount,
      platformFeePercent,
      platformFeeFixed,
    );

    return [
      `Sale Amount: $${(amount / 100).toFixed(2)}`,
      `Stripe Fee: -$${(fees.stripeFee / 100).toFixed(2)} (2.9% + $0.30)`,
      `Platform Fee: -$${(fees.platformFee / 100).toFixed(2)} (${platformFeePercent ? (platformFeePercent / 100).toFixed(2) + '%' : '0%'} + $${platformFeeFixed ? (platformFeeFixed / 100).toFixed(2) : '0.00'})`,
      `─────────────────────────`,
      `You Receive: $${(fees.merchantReceives / 100).toFixed(2)}`,
    ].join('\n');
  }
}

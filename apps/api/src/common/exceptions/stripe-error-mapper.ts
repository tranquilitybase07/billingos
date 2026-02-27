import Stripe from 'stripe';
import { PaymentException } from './payment.exception';
import { BillingOSException } from './billing-os.exception';
import { ErrorCode } from './error-codes';
import { HttpStatus } from '@nestjs/common';

export class StripeErrorMapper {
  /**
   * Map Stripe errors to BillingOS exceptions
   * Based on comprehensive Stripe error handling
   */
  static mapStripeError(
    error: Stripe.errors.StripeError,
  ): BillingOSException {
    switch (error.type) {
      case 'StripeCardError':
        return this.handleCardError(
          error as Stripe.errors.StripeCardError,
        );
      case 'StripeRateLimitError':
        return this.handleRateLimitError(error);
      case 'StripeInvalidRequestError':
        return this.handleInvalidRequestError(error);
      case 'StripeAPIError':
        return this.handleAPIError(error);
      case 'StripeConnectionError':
        return this.handleConnectionError(error);
      case 'StripeAuthenticationError':
        return this.handleAuthenticationError(error);
      default:
        return this.handleUnknownError(error);
    }
  }

  private static handleCardError(
    error: Stripe.errors.StripeCardError,
  ): PaymentException {
    const declineCode = error.decline_code || error.code || 'generic_decline';
    const last4 = (error.raw as any)?.payment_method?.card?.last4;

    return PaymentException.cardDeclined(declineCode, last4);
  }

  private static handleRateLimitError(
    _error: Stripe.errors.StripeError,
  ): BillingOSException {
    return new BillingOSException(
      ErrorCode.RATE_LIMIT_EXCEEDED,
      'Too many requests to payment processor',
      HttpStatus.TOO_MANY_REQUESTS,
      {
        retryAfter: 60,
        suggestion: 'Please wait a moment before retrying',
      },
    );
  }

  private static handleInvalidRequestError(
    error: Stripe.errors.StripeError,
  ): BillingOSException {
    const message = error.message.toLowerCase();

    if (message.includes('customer')) {
      return new BillingOSException(
        ErrorCode.PAY_INVALID_PAYMENT_METHOD,
        'Invalid customer information',
        HttpStatus.BAD_REQUEST,
        { originalError: message },
      );
    }

    if (message.includes('amount')) {
      return new BillingOSException(
        ErrorCode.VAL_INVALID_INPUT,
        'Invalid payment amount',
        HttpStatus.BAD_REQUEST,
        { originalError: message },
      );
    }

    return new BillingOSException(
      ErrorCode.VAL_INVALID_INPUT,
      'Invalid payment request',
      HttpStatus.BAD_REQUEST,
      { originalError: message },
    );
  }

  private static handleAPIError(
    _error: Stripe.errors.StripeError,
  ): BillingOSException {
    return new BillingOSException(
      ErrorCode.SYS_EXTERNAL_SERVICE_ERROR,
      'Payment service temporarily unavailable',
      HttpStatus.SERVICE_UNAVAILABLE,
      {
        suggestion: 'Please try again in a few moments',
        retryAfter: 30,
      },
    );
  }

  private static handleConnectionError(
    _error: Stripe.errors.StripeError,
  ): BillingOSException {
    return new BillingOSException(
      ErrorCode.SYS_EXTERNAL_SERVICE_ERROR,
      'Unable to connect to payment service',
      HttpStatus.SERVICE_UNAVAILABLE,
      {
        suggestion: 'Please check your internet connection and try again',
      },
    );
  }

  private static handleAuthenticationError(
    _error: Stripe.errors.StripeError,
  ): BillingOSException {
    return new BillingOSException(
      ErrorCode.SYS_INTERNAL_ERROR,
      'Payment configuration error',
      HttpStatus.INTERNAL_SERVER_ERROR,
      {
        suggestion: 'This is a configuration issue. Please contact support.',
      },
    );
  }

  private static handleUnknownError(
    error: Stripe.errors.StripeError,
  ): BillingOSException {
    return new BillingOSException(
      ErrorCode.PAY_PROCESSING_ERROR,
      'Payment processing failed',
      HttpStatus.BAD_REQUEST,
      {
        originalError: error.message,
        suggestion: 'Please try again or use a different payment method',
      },
    );
  }

  /**
   * Comprehensive list of Stripe decline codes
   */
  static readonly DECLINE_CODES: Record<string, string> = {
    approve_with_id: 'The payment cannot be authorized',
    call_issuer: 'The card issuer needs to be contacted',
    card_not_supported: 'The card does not support this type of purchase',
    card_velocity_exceeded: 'Too many transactions in a short time',
    currency_not_supported:
      'The card does not support the specified currency',
    do_not_honor: 'The card issuer declined for an unknown reason',
    do_not_try_again:
      'The card issuer has declined and requested not to retry',
    duplicate_transaction: 'A similar transaction was recently submitted',
    expired_card: 'The card has expired',
    fraudulent: 'The payment was declined as fraudulent',
    generic_decline: 'The card was declined for an unknown reason',
    incorrect_number: 'The card number is incorrect',
    incorrect_cvc: 'The CVC number is incorrect',
    incorrect_pin: 'The PIN entered is incorrect',
    incorrect_zip: 'The ZIP/postal code is incorrect',
    insufficient_funds: 'The card has insufficient funds',
    invalid_account: 'The card or account is invalid',
    invalid_amount: 'The payment amount is invalid',
    invalid_cvc: 'The CVC number is invalid',
    invalid_expiry_month: 'The expiration month is invalid',
    invalid_expiry_year: 'The expiration year is invalid',
    invalid_number: 'The card number is invalid',
    invalid_pin: 'The PIN entered is invalid',
    issuer_not_available: 'The card issuer could not be reached',
    lost_card: 'The card has been reported lost',
    merchant_blacklist: 'The merchant is blacklisted',
    new_account_information_available: 'New account information is available',
    no_action_taken: 'No action was taken',
    not_permitted: 'The payment is not permitted',
    offline_pin_required: 'An offline PIN is required',
    online_or_offline_pin_required: 'A PIN is required',
    pickup_card: 'The card cannot be used for this transaction',
    pin_try_exceeded: 'Too many PIN attempts',
    processing_error: 'An error occurred while processing the card',
    reenter_transaction: 'The transaction should be re-entered',
    restricted_card: 'The card has restrictions preventing this transaction',
    revocation_of_all_authorizations: 'All authorizations have been revoked',
    revocation_of_authorization: 'The authorization has been revoked',
    security_violation: 'A security violation occurred',
    service_not_allowed: 'The service is not allowed',
    stolen_card: 'The card has been reported stolen',
    stop_payment_order: 'A stop payment order has been issued',
    testmode_decline: 'Test mode decline',
    transaction_not_allowed: 'The transaction is not allowed',
    try_again_later: 'The card issuer requests trying again later',
    withdrawal_count_limit_exceeded: 'The withdrawal limit has been exceeded',
  };
}

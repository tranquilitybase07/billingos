import { HttpStatus } from '@nestjs/common';
import { BillingOSException } from './billing-os.exception';
import { ErrorCode } from './error-codes';

export class PaymentException extends BillingOSException {
  constructor(
    code: ErrorCode = ErrorCode.PAY_PROCESSING_ERROR,
    message?: string,
    details?: {
      declineCode?: string;
      last4?: string;
      cardBrand?: string;
      suggestion?: string;
    },
  ) {
    super(code, message, HttpStatus.BAD_REQUEST, details);
  }

  static cardDeclined(declineCode: string, last4?: string): PaymentException {
    const suggestions: Record<string, string> = {
      insufficient_funds: 'Please ensure sufficient funds or try another card',
      expired_card: 'Please update your card expiration date',
      incorrect_cvc: 'Please check your card security code',
      processing_error: 'Please try again in a few moments',
      generic_decline: 'Please contact your card issuer or try another card',
    };

    return new PaymentException(
      ErrorCode.PAY_CARD_DECLINED,
      'Your card was declined',
      {
        declineCode,
        last4,
        suggestion: suggestions[declineCode] || suggestions.generic_decline,
      },
    );
  }
}

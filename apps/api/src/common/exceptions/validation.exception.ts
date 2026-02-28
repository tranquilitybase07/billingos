import { HttpStatus } from '@nestjs/common';
import { BillingOSException } from './billing-os.exception';
import { ErrorCode } from './error-codes';

export class ValidationException extends BillingOSException {
  constructor(message?: string, fieldErrors?: Record<string, string[]>) {
    super(
      ErrorCode.VAL_INVALID_INPUT,
      message || 'Validation failed',
      HttpStatus.BAD_REQUEST,
      { fieldErrors },
    );
  }

  static fromClassValidator(errors: any[]): ValidationException {
    const fieldErrors: Record<string, string[]> = {};

    errors.forEach((error) => {
      const property = error.property;
      const constraints = Object.values(error.constraints || {});
      fieldErrors[property] = constraints as string[];
    });

    return new ValidationException(
      'Validation failed for one or more fields',
      fieldErrors,
    );
  }
}

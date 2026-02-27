import { HttpStatus } from '@nestjs/common';
import { BillingOSException } from './billing-os.exception';
import { ErrorCode } from './error-codes';

export class BusinessException extends BillingOSException {
  constructor(
    code: ErrorCode = ErrorCode.BIZ_OPERATION_NOT_ALLOWED,
    message?: string,
    details?: Record<string, any>,
  ) {
    super(code, message, HttpStatus.BAD_REQUEST, details);
  }

  static quotaExceeded(
    resource: string,
    current: number,
    limit: number,
  ): BusinessException {
    return new BusinessException(
      ErrorCode.BIZ_QUOTA_EXCEEDED,
      `You have exceeded your ${resource} quota`,
      {
        resource,
        current,
        limit,
        suggestion: 'Please upgrade your plan for higher limits',
      },
    );
  }

  static planLimitExceeded(feature: string): BusinessException {
    return new BusinessException(
      ErrorCode.AUTHZ_PLAN_LIMIT_EXCEEDED,
      `The feature "${feature}" is not available on your current plan`,
      {
        feature,
        suggestion: 'Please upgrade to a higher plan',
        upgradeUrl: 'https://billingos.com/pricing',
      },
    );
  }
}

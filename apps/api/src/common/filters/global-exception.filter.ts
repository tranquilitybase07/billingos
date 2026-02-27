import {
  ExceptionFilter,
  Catch,
  ArgumentsHost,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Request, Response } from 'express';
import * as Sentry from '@sentry/node';
import { BillingOSException } from '../exceptions/billing-os.exception';
import { StripeErrorMapper } from '../exceptions/stripe-error-mapper';
import { ErrorCode, ErrorSeverity } from '../exceptions/error-codes';
import { sanitizeError } from '../utils/security.utils';
import Stripe from 'stripe';

@Catch()
export class GlobalExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(GlobalExceptionFilter.name);

  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();

    const requestId = (request as any).requestId || 'no-request-id';
    const timestamp = new Date().toISOString();

    let status = HttpStatus.INTERNAL_SERVER_ERROR;
    let errorResponse: any = {
      error: {
        code: ErrorCode.SYS_INTERNAL_ERROR,
        message: 'An unexpected error occurred',
        requestId,
        timestamp,
      },
      statusCode: status,
    };

    // Handle different exception types
    if (exception instanceof BillingOSException) {
      errorResponse = this.handleBillingOSException(
        exception,
        requestId,
        timestamp,
      );
      status = exception.getStatus();
    } else if (exception instanceof HttpException) {
      errorResponse = this.handleHttpException(
        exception,
        requestId,
        timestamp,
      );
      status = exception.getStatus();
    } else if (this.isStripeError(exception)) {
      const billingException = StripeErrorMapper.mapStripeError(
        exception as Stripe.errors.StripeError,
      );
      errorResponse = this.handleBillingOSException(
        billingException,
        requestId,
        timestamp,
      );
      status = billingException.getStatus();
    } else if (exception instanceof Error) {
      errorResponse = this.handleGenericError(exception, requestId, timestamp);
    } else {
      errorResponse = this.handleUnknownError(exception, requestId, timestamp);
    }

    // Enrich context for logging
    const context = this.buildErrorContext(request, exception);

    // Log the error
    this.logError(exception, context, errorResponse);

    // Send to Sentry if appropriate
    this.sendToSentry(exception, context, errorResponse);

    // Send response
    response.status(status).json(errorResponse);
  }

  private handleBillingOSException(
    exception: BillingOSException,
    requestId: string,
    timestamp: string,
  ): any {
    const resp = exception.getResponse() as any;
    return {
      error: {
        ...resp.error,
        requestId,
        timestamp,
      },
      statusCode: exception.getStatus(),
    };
  }

  private handleHttpException(
    exception: HttpException,
    requestId: string,
    timestamp: string,
  ): any {
    const resp = exception.getResponse();
    const status = exception.getStatus();

    // Handle class-validator errors
    if (typeof resp === 'object' && 'message' in (resp as object)) {
      const res = resp as any;
      if (Array.isArray(res.message) && res.message.length > 0) {
        return {
          error: {
            code: ErrorCode.VAL_INVALID_INPUT,
            message: 'Validation failed',
            details: { errors: res.message },
            requestId,
            timestamp,
          },
          statusCode: status,
        };
      }
    }

    return {
      error: {
        code: this.getErrorCodeFromStatus(status),
        message: exception.message || 'An error occurred',
        requestId,
        timestamp,
      },
      statusCode: status,
    };
  }

  private handleGenericError(
    exception: Error,
    requestId: string,
    timestamp: string,
  ): any {
    const sanitizedMessage = sanitizeError(exception);
    const errorCode = this.detectErrorCode(exception.message);

    return {
      error: {
        code: errorCode,
        message: this.getUserFriendlyMessage(exception.message),
        details:
          process.env.NODE_ENV === 'development'
            ? { originalError: sanitizedMessage }
            : undefined,
        requestId,
        timestamp,
      },
      statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
    };
  }

  private handleUnknownError(
    _exception: unknown,
    requestId: string,
    timestamp: string,
  ): any {
    return {
      error: {
        code: ErrorCode.SYS_INTERNAL_ERROR,
        message: 'An unexpected error occurred',
        requestId,
        timestamp,
      },
      statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
    };
  }

  private isStripeError(exception: unknown): boolean {
    return (
      exception instanceof Error &&
      exception.constructor.name.includes('Stripe') &&
      'type' in exception
    );
  }

  private buildErrorContext(request: Request, exception: unknown): any {
    return {
      requestId: (request as any).requestId,
      method: request.method,
      url: request.url,
      ip: request.ip,
      userAgent: request.headers['user-agent'],
      userId: (request as any).user?.id,
      organizationId: (request as any).user?.organizationId,
      apiKeyId: (request as any).user?.keyId,
      timestamp: new Date(),
      environment: process.env.NODE_ENV,
      exceptionName: (exception as any)?.constructor?.name,
    };
  }

  private logError(
    exception: unknown,
    context: any,
    errorResponse: any,
  ): void {
    const level = this.getLogLevel(errorResponse.error.code);

    const logMessage = {
      message: `Error: ${errorResponse.error.message}`,
      code: errorResponse.error.code,
      statusCode: errorResponse.statusCode,
      ...context,
    };

    switch (level) {
      case 'error':
        this.logger.error(JSON.stringify(logMessage), (exception as any)?.stack);
        break;
      case 'warn':
        this.logger.warn(JSON.stringify(logMessage));
        break;
      default:
        this.logger.debug(JSON.stringify(logMessage));
    }
  }

  private sendToSentry(
    exception: unknown,
    context: any,
    errorResponse: any,
  ): void {
    const severity = ErrorSeverity[errorResponse.error.code as ErrorCode];

    // Don't send if no severity defined (normal business logic)
    if (!severity) {
      return;
    }

    // Don't send in development unless it's an error or higher
    if (
      process.env.NODE_ENV === 'development' &&
      severity !== 'error' &&
      severity !== 'fatal'
    ) {
      return;
    }

    Sentry.withScope((scope) => {
      scope.setLevel(severity);
      scope.setContext('request', {
        method: context.method,
        url: context.url,
        ip: context.ip,
        userAgent: context.userAgent,
      });
      scope.setContext('user', {
        id: context.userId,
        organizationId: context.organizationId,
      });
      scope.setContext('error', {
        code: errorResponse.error.code,
        statusCode: errorResponse.statusCode,
        details: errorResponse.error.details,
      });
      scope.setTag('requestId', context.requestId);
      scope.setTag('environment', context.environment);
      scope.setTag('errorCode', errorResponse.error.code);

      if (exception instanceof Error) {
        Sentry.captureException(exception);
      } else {
        Sentry.captureMessage(errorResponse.error.message, severity);
      }
    });
  }

  private getErrorCodeFromStatus(status: HttpStatus): ErrorCode {
    const statusMap: Record<number, ErrorCode> = {
      400: ErrorCode.VAL_INVALID_INPUT,
      401: ErrorCode.AUTH_INVALID_TOKEN,
      403: ErrorCode.AUTHZ_INSUFFICIENT_PERMISSIONS,
      404: ErrorCode.RES_NOT_FOUND,
      409: ErrorCode.RES_CONFLICT,
      429: ErrorCode.RATE_LIMIT_EXCEEDED,
      500: ErrorCode.SYS_INTERNAL_ERROR,
      503: ErrorCode.SYS_SERVICE_UNAVAILABLE,
    };
    return statusMap[status] || ErrorCode.SYS_INTERNAL_ERROR;
  }

  private detectErrorCode(message: string): ErrorCode {
    const lowercaseMessage = message.toLowerCase();

    if (lowercaseMessage.includes('database') || lowercaseMessage.includes('db')) {
      return ErrorCode.SYS_DATABASE_ERROR;
    }
    if (lowercaseMessage.includes('timeout')) {
      return ErrorCode.SYS_TIMEOUT;
    }
    if (lowercaseMessage.includes('duplicate')) {
      return ErrorCode.RES_ALREADY_EXISTS;
    }
    if (lowercaseMessage.includes('not found')) {
      return ErrorCode.RES_NOT_FOUND;
    }
    if (lowercaseMessage.includes('unauthorized')) {
      return ErrorCode.AUTH_INVALID_TOKEN;
    }

    return ErrorCode.SYS_INTERNAL_ERROR;
  }

  private getUserFriendlyMessage(technicalMessage: string): string {
    const messageMap: Record<string, string> = {
      'connect ECONNREFUSED':
        'Service temporarily unavailable. Please try again later.',
      'duplicate key value': 'This resource already exists.',
      'violates foreign key': 'Related resource not found.',
      'invalid input syntax': 'Invalid data format provided.',
      'connection timeout': 'The operation took too long. Please try again.',
      ECONNRESET: 'Connection lost. Please try again.',
    };

    for (const [pattern, friendlyMessage] of Object.entries(messageMap)) {
      if (technicalMessage.includes(pattern)) {
        return friendlyMessage;
      }
    }

    return 'An error occurred while processing your request.';
  }

  private getLogLevel(errorCode: ErrorCode): 'debug' | 'warn' | 'error' {
    const severity = ErrorSeverity[errorCode];
    switch (severity) {
      case 'fatal':
      case 'error':
        return 'error';
      case 'warning':
        return 'warn';
      default:
        return 'debug';
    }
  }
}

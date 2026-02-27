import { HttpException, HttpStatus } from '@nestjs/common';
import { ErrorCode, ErrorMetadata } from './error-codes';

export interface ErrorDetails {
  code: ErrorCode;
  message: string;
  details?: Record<string, any>;
  requestId?: string;
  timestamp?: string;
  help?: string;
}

export class BillingOSException extends HttpException {
  public readonly code: ErrorCode;
  public readonly details?: Record<string, any>;
  public readonly help?: string;
  public readonly requestId?: string;

  constructor(
    code: ErrorCode,
    message?: string,
    statusCode?: HttpStatus,
    details?: Record<string, any>,
  ) {
    const metadata = ErrorMetadata[code];
    const finalMessage =
      message ||
      metadata?.userMessage ||
      metadata?.message ||
      'An error occurred';
    const finalStatusCode =
      statusCode || metadata?.statusCode || HttpStatus.INTERNAL_SERVER_ERROR;

    super(
      {
        error: {
          code,
          message: finalMessage,
          details,
          timestamp: new Date().toISOString(),
          help: metadata?.helpUrl,
        },
        statusCode: finalStatusCode,
      },
      finalStatusCode,
    );

    this.code = code;
    this.details = details;
    this.help = metadata?.helpUrl;
  }

  withRequestId(requestId: string): this {
    (this as any).requestId = requestId;
    const response = this.getResponse() as any;
    response.error.requestId = requestId;
    return this;
  }

  withDetails(details: Record<string, any>): this {
    (this as any).details = { ...this.details, ...details };
    const response = this.getResponse() as any;
    response.error.details = { ...response.error.details, ...details };
    return this;
  }

  withHelp(helpUrl: string): this {
    (this as any).help = helpUrl;
    const response = this.getResponse() as any;
    response.error.help = helpUrl;
    return this;
  }
}

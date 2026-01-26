import { createParamDecorator, ExecutionContext } from '@nestjs/common';

export interface CustomerContext {
  externalUserId: string;
  externalOrganizationId?: string;
  organizationId: string;
}

export const CurrentCustomer = createParamDecorator(
  (data: unknown, ctx: ExecutionContext): CustomerContext => {
    const request = ctx.switchToHttp().getRequest<{ customer: CustomerContext }>();
    return request.customer;
  },
);

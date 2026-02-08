import { BillingAddressDto } from './create-customer.dto';
import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';

export class CustomerResponseDto {
  id: string;
  organization_id: string;
  external_id: string | null;
  email: string;
  email_verified: boolean;
  name: string | null;
  billing_address: BillingAddressDto | null;
  stripe_customer_id: string | null;
  metadata: Record<string, any>;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}

export class PaginatedCustomersResponseDto {
  data: CustomerResponseDto[];
  total: number;
  page: number;
  limit: number;
  total_pages: number;
}

// Separate DTO for active subscription info to avoid circular dependency
export class CustomerSubscriptionDto {
  @ApiProperty()
  id: string;

  @ApiProperty()
  status: string;

  @ApiProperty()
  product_id: string;

  @ApiProperty()
  price_id: string;

  @ApiProperty()
  current_period_start: string;

  @ApiProperty()
  current_period_end: string;

  @ApiProperty()
  cancel_at_period_end: boolean;
}

// Separate DTO for granted feature info to avoid circular dependency
export class CustomerGrantedFeatureDto {
  @ApiProperty()
  id: string;

  @ApiProperty()
  feature_id: string;

  @ApiProperty()
  feature_key: string;

  @ApiProperty()
  feature_name: string;

  @ApiProperty()
  granted_at: string;
}

// Response for customer state endpoint (includes subscriptions and features)
export class CustomerStateResponseDto {
  @ApiProperty({ type: CustomerResponseDto })
  @Type(() => CustomerResponseDto)
  customer: CustomerResponseDto;

  @ApiProperty({ type: [CustomerSubscriptionDto] })
  @Type(() => CustomerSubscriptionDto)
  active_subscriptions: CustomerSubscriptionDto[];

  @ApiProperty({ type: [CustomerGrantedFeatureDto] })
  @Type(() => CustomerGrantedFeatureDto)
  granted_features: CustomerGrantedFeatureDto[];
}

import { BillingAddressDto } from './create-customer.dto';

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

// Response for customer state endpoint (includes subscriptions and features)
export class CustomerStateResponseDto {
  customer: CustomerResponseDto;
  active_subscriptions: Array<{
    id: string;
    status: string;
    product_id: string;
    price_id: string;
    current_period_start: string;
    current_period_end: string;
    cancel_at_period_end: boolean;
  }>;
  granted_features: Array<{
    id: string;
    feature_id: string;
    feature_key: string;
    feature_name: string;
    granted_at: string;
  }>;
}

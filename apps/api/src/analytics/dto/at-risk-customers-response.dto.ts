export class AtRiskCustomerDto {
  customer_id: string;
  external_id: string;
  email: string;
  feature_key: string;
  consumed: number;
  limit: number;
  percentage_used: number;
  resets_at: string;
}

export class AtRiskCustomersResponseDto {
  data: AtRiskCustomerDto[];
  threshold: number;
  total_at_risk: number;
  as_of: string;
}

export class UsageByFeatureDataDto {
  feature_key: string;
  feature_title: string;
  total_consumed: number;
  avg_per_customer: number;
  customer_count: number;
  at_limit_count: number;
}

export class UsageByFeatureResponseDto {
  data: UsageByFeatureDataDto[];
  organization_id: string;
  as_of: string;
}

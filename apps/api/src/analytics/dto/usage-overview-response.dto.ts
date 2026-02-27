export class UsageOverviewResponseDto {
  total_consumption: number;
  active_metered_customers: number;
  at_limit_count: number;
  features_tracked: number;
  as_of: string;
}

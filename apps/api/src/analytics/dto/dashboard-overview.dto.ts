export class DashboardMetricDto {
  current: number;
  previous: number;
  change_percent: number;
  sparkline: number[];
}

export class DashboardOverviewResponseDto {
  mrr: DashboardMetricDto;
  active_subscriptions: DashboardMetricDto;
  new_customers: DashboardMetricDto;
  churn_rate: DashboardMetricDto;
  currency: string;
}

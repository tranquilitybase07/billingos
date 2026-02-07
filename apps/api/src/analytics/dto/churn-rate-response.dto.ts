import { Granularity } from './analytics-query.dto';

export class ChurnRateDataPoint {
  date: string;
  active_at_start: number;
  new_subscriptions: number;
  canceled_subscriptions: number;
  churn_rate: number;
  retention_rate: number;
}

export class ChurnRateSummary {
  avg_churn_rate: number;
  avg_retention_rate: number;
  total_periods: number;
}

export class ChurnRateResponseDto {
  data: ChurnRateDataPoint[];
  summary: ChurnRateSummary;
  period: {
    start: string;
    end: string;
  };
  granularity: Granularity;
}

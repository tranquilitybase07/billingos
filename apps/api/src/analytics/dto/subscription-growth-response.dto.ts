export class SubscriptionGrowthDataPoint {
  date: string;
  new_subscriptions: number;
  canceled_subscriptions: number;
  net_growth: number;
}

export class SubscriptionGrowthResponseDto {
  data: SubscriptionGrowthDataPoint[];
  summary: {
    total_new: number;
    total_canceled: number;
    net_growth: number;
  };
  period: {
    start: string;
    end: string;
  };
}

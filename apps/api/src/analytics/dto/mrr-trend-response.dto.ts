export class MRRTrendDataPoint {
  date: string;
  mrr: number;
  active_subscriptions: number;
}

export class MRRTrendResponseDto {
  data: MRRTrendDataPoint[];
  current_mrr: number;
  currency: string;
  period: {
    start: string;
    end: string;
  };
  granularity: string;
}

export class RevenueTrendDataPoint {
  date: string;
  revenue: number;
  transaction_count: number;
}

export class RevenueTrendResponseDto {
  data: RevenueTrendDataPoint[];
  total_revenue: number;
  period: {
    start: string;
    end: string;
  };
  granularity: string;
}

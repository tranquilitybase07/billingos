export class UsageTrendDataPointDto {
  date: string;
  consumed: number;
  customer_count: number;
}

export class UsageTrendsResponseDto {
  feature_key: string;
  data: UsageTrendDataPointDto[];
  period: number;
}

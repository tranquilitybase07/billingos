export class TopCustomerDto {
  customer_id: string;
  email: string;
  name: string | null;
  total_revenue: number;
  transaction_count: number;
  rank: number;
}

export class TopCustomersSummary {
  total_customers: number;
  top_n_revenue: number;
  top_n_percentage: number;
}

export class TopCustomersResponseDto {
  data: TopCustomerDto[];
  summary: TopCustomersSummary;
  period: {
    start: string;
    end: string;
  };
}

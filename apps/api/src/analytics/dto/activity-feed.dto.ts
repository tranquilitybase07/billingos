export class ActivityFeedItemDto {
  id: string;
  type:
    | 'new_subscription'
    | 'payment_succeeded'
    | 'subscription_canceled'
    | 'refund'
    | 'trial_started'
    | 'trial_converted'
    | 'subscription_upgraded'
    | 'subscription_downgraded';
  customer_name: string | null;
  customer_email: string;
  product_name: string;
  amount: number | null;
  currency: string;
  occurred_at: string;
}

export class ActivityFeedResponseDto {
  data: ActivityFeedItemDto[];
  total: number;
}

export class ProductSubscriberDataPoint {
  product_id: string;
  product_name: string;
  subscriber_count: number;
}

export class ProductSubscribersResponseDto {
  data: ProductSubscriberDataPoint[];
  total_subscribers: number;
}

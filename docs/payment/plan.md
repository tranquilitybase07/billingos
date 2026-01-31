# Payment Intent Creation Process - Implementation Plan

## Overview
Implement a complete payment intent creation and processing flow that handles customer payments through Stripe, creates subscriptions, and provides real-time updates to the SDK components without requiring merchants to handle webhooks.

## Current State Analysis

### What Exists
1. **SDK Side**:
   - `PaymentBottomSheet` component expects `/v1/checkout/create` and `/v1/checkout/:clientSecret/confirm` endpoints
   - Session token authentication working
   - Pricing table displays products correctly

2. **Backend Side**:
   - `/v1/products` endpoint returns products with pricing
   - Direct subscription creation via `/v1/customer/subscription/create` (bypasses payment)
   - Stripe webhook handler at `/stripe/webhooks`
   - Session token validation via `SessionTokenAuthGuard`

### What's Missing
1. **Payment Intent Flow**:
   - No `/v1/checkout/*` endpoints
   - No payment intent creation logic
   - No checkout session management

2. **Database Tables**:
   - No `payment_intents` table
   - No `checkout_sessions` table
   - No payment history tracking

3. **Real-time Updates**:
   - No SSE/WebSocket/polling mechanism
   - No payment status updates to client

## Architecture Requirements (from docs)

1. **Zero-redirect Flow**: All payments must happen in-app via modal/iframe
2. **Hybrid Component Strategy**:
   - Native React components for non-sensitive UI
   - Iframe for payment collection (PCI compliance)
3. **Merchant Simplicity**: Merchants shouldn't handle webhooks or payment events
4. **Real-time Updates**: SDK must receive payment status updates automatically

## Implementation Plan

### Phase 1: Database Schema

#### 1.1 Create payment_intents table
```sql
CREATE TABLE payment_intents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id),
  customer_id UUID REFERENCES customers(id),
  stripe_payment_intent_id VARCHAR(255) UNIQUE NOT NULL,
  client_secret VARCHAR(255) NOT NULL,
  amount INTEGER NOT NULL,
  currency VARCHAR(10) NOT NULL DEFAULT 'usd',
  status VARCHAR(50) NOT NULL,
  product_id UUID REFERENCES products(id),
  price_id UUID REFERENCES product_prices(id),
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
```

#### 1.2 Create checkout_sessions table
```sql
CREATE TABLE checkout_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id),
  session_token VARCHAR(255) NOT NULL,
  payment_intent_id UUID REFERENCES payment_intents(id),
  customer_email VARCHAR(255),
  customer_name VARCHAR(255),
  expires_at TIMESTAMPTZ NOT NULL,
  completed_at TIMESTAMPTZ,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW()
);
```

#### 1.3 Add payment tracking to subscriptions
```sql
ALTER TABLE subscriptions
ADD COLUMN payment_intent_id UUID REFERENCES payment_intents(id),
ADD COLUMN trial_end TIMESTAMPTZ;
```

### Phase 2: Backend Implementation

#### 2.1 CheckoutController (`/apps/api/src/v1/checkout/checkout.controller.ts`)

```typescript
@Controller('v1/checkout')
@UseGuards(SessionTokenAuthGuard)
export class CheckoutController {

  @Post('create')
  async createCheckout(@CurrentCustomer() customer: CustomerContext, @Body() dto: CreateCheckoutDto) {
    // 1. Validate product and price exist
    // 2. Create or retrieve Stripe customer
    // 3. Create payment intent with metadata
    // 4. Store in payment_intents table
    // 5. Create checkout_session record
    // 6. Return client_secret and checkout details
  }

  @Post(':clientSecret/confirm')
  async confirmCheckout(@Param('clientSecret') clientSecret: string, @Body() dto: ConfirmCheckoutDto) {
    // 1. Validate client secret
    // 2. Update payment intent with customer details
    // 3. Confirm payment with Stripe
    // 4. Return confirmation status
  }

  @Get(':sessionId/status')
  async getCheckoutStatus(@Param('sessionId') sessionId: string) {
    // Real-time status endpoint for polling
    // Return payment intent status and subscription details if complete
  }
}
```

#### 2.2 Enhanced StripeService Methods

```typescript
class StripeService {
  async createPaymentIntent(params: {
    amount: number;
    currency: string;
    customerId?: string;
    metadata: Record<string, any>;
  }): Promise<Stripe.PaymentIntent>

  async confirmPaymentIntent(
    paymentIntentId: string,
    paymentMethodId: string
  ): Promise<Stripe.PaymentIntent>

  async createOrRetrieveCustomer(params: {
    email: string;
    name?: string;
    organizationId: string;
  }): Promise<Stripe.Customer>
}
```

#### 2.3 Webhook Handler Enhancements

```typescript
// Add to existing stripe.controller.ts webhook handler
switch (event.type) {
  case 'payment_intent.succeeded':
    // 1. Update payment_intents table
    // 2. Create subscription if this was a subscription payment
    // 3. Create customer record if new
    // 4. Apply entitlements
    // 5. Notify real-time update system
    break;

  case 'payment_intent.payment_failed':
    // 1. Update payment_intents table
    // 2. Send failure notification
    break;

  case 'checkout.session.completed':
    // 1. Mark checkout session as complete
    // 2. Process subscription creation
    break;
}
```

### Phase 3: Real-time Updates

#### 3.1 Server-Sent Events (Recommended for simplicity)

```typescript
@Controller('v1/checkout')
export class CheckoutController {

  @Sse(':sessionId/stream')
  streamCheckoutStatus(@Param('sessionId') sessionId: string): Observable<MessageEvent> {
    // Return SSE stream that emits payment status updates
    // Client can listen for: pending, processing, succeeded, failed
  }
}
```

#### 3.2 Alternative: Polling with React Query

```typescript
// SDK side - already partially implemented
const useCheckoutStatus = (sessionId: string) => {
  return useQuery({
    queryKey: ['checkout-status', sessionId],
    queryFn: () => client.get(`/v1/checkout/${sessionId}/status`),
    refetchInterval: 2000, // Poll every 2 seconds
    enabled: !!sessionId && !isComplete,
  });
};
```

### Phase 4: SDK Integration Updates

#### 4.1 Update PaymentBottomSheet

```typescript
// Minimal changes needed - endpoints already expected
// Just ensure proper error handling and status updates
const PaymentBottomSheet = () => {
  // Existing implementation should work once endpoints exist
  // Add real-time status monitoring
  const { data: status } = useCheckoutStatus(sessionId);

  useEffect(() => {
    if (status?.status === 'succeeded') {
      onSuccess?.(status.subscription);
    }
  }, [status]);
};
```

#### 4.2 Add Customer Portal Access

```typescript
// New endpoint needed
@Get('portal-session')
async createPortalSession(@CurrentCustomer() customer: CustomerContext) {
  // Create Stripe billing portal session
  // Return URL for iframe embedding
}
```

### Phase 5: Testing & Error Handling

1. **Test Scenarios**:
   - Successful payment → subscription creation
   - Failed payment → proper error state
   - Webhook retry logic
   - Session expiration handling
   - Multiple price selection (monthly/yearly)

2. **Error Cases**:
   - Invalid product/price IDs
   - Expired sessions
   - Duplicate payment attempts
   - Network failures during confirmation
   - Webhook signature validation failures

## Implementation Order

1. **Day 1**: Database migrations
2. **Day 2**: CheckoutController and basic payment intent creation
3. **Day 3**: Webhook handlers for payment events
4. **Day 4**: Real-time updates (SSE or polling)
5. **Day 5**: Testing and error handling

## Key Decisions to Make

1. **Real-time Updates**: SSE vs WebSocket vs Polling?
   - Recommendation: Start with polling (simpler), migrate to SSE if needed

2. **Customer Creation**: When to create customer record?
   - Recommendation: Create on first successful payment

3. **Trial Handling**: How to handle trial periods?
   - Recommendation: Use Stripe's trial_period_days on subscription creation

4. **Idempotency**: How to prevent duplicate charges?
   - Recommendation: Use idempotency keys based on session token + price ID

## Security Considerations

1. **Client Secret Exposure**: Only return to authenticated sessions
2. **Webhook Validation**: Always verify Stripe signatures
3. **Session Expiration**: Expire checkout sessions after 1 hour
4. **Rate Limiting**: Limit checkout creation per session
5. **PCI Compliance**: Use Stripe Elements in iframe for card collection

## Success Metrics

1. Payment success rate > 95%
2. Webhook processing time < 2 seconds
3. Real-time update latency < 3 seconds
4. Zero merchant webhook implementation required
5. Complete PCI compliance maintained

## References

- Stripe Payment Intents API: https://stripe.com/docs/payments/payment-intents
- Stripe Webhooks: https://stripe.com/docs/webhooks
- React Query SSE: https://tanstack.com/query/latest/docs/react/guides/sse
- BillingOS Architecture: /Users/ankushkumar/Code/billingos-sdk/docs/architecture
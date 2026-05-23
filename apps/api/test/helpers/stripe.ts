import { INestApplication } from '@nestjs/common';
import { StripeService } from '../../src/stripe/stripe.service';
import Stripe from 'stripe';

const TEST_PAYMENT_METHOD = 'pm_card_visa';

export async function confirmPaymentWithTestCard(
  app: INestApplication,
  paymentIntentId: string,
  stripeAccountId: string,
): Promise<Stripe.PaymentIntent> {
  const stripe = app.get(StripeService).getClient();
  return stripe.paymentIntents.confirm(
    paymentIntentId,
    { payment_method: TEST_PAYMENT_METHOD },
    { stripeAccount: stripeAccountId },
  );
}

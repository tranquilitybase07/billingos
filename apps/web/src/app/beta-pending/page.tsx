import { BetaPendingClient } from './BetaPendingClient';

export const metadata = {
  title: 'You’re on the waitlist | BillingOS',
  description: 'BillingOS is in private beta. Your access is under review.',
};

export default function BetaPendingPage() {
  return <BetaPendingClient />;
}

# Stripe Dashboard Webhook Setup Guide

## Quick Setup Steps

### 1. Access Stripe Dashboard
- **Test Mode:** https://dashboard.stripe.com/test/webhooks
- **Live Mode:** https://dashboard.stripe.com/webhooks

### 2. Add Webhook Endpoint

Click **"Add endpoint"** button

**Endpoint URL:**
- **Local (testing):** Use Stripe CLI (see below)
- **Development:** `https://dev.yourdomain.com/stripe/webhooks`
- **Production:** `https://api.yourdomain.com/stripe/webhooks`

### 3. Select Events to Listen For

**Required for Account Onboarding:**
```
✅ account.updated
✅ account.external_account.created
✅ account.external_account.updated
✅ account.external_account.deleted
✅ account.application.deauthorized
```

**Required for Identity Verification:**
```
✅ identity.verification_session.verified
✅ identity.verification_session.requires_input
✅ identity.verification_session.canceled
✅ identity.verification_session.processing
```

**Optional (Enable when you start processing payments):**
```
⚪ payout.failed
⚪ payout.paid
⚪ payout.updated
⚪ payment_intent.succeeded
⚪ payment_intent.payment_failed
```

### 4. Copy Webhook Signing Secret

After creating the endpoint, you'll see:
```
Signing secret: whsec_xxxxxxxxxxxxxxxxxxxxx
```

**Add to your `.env` file:**
```bash
STRIPE_WEBHOOK_SECRET=whsec_xxxxxxxxxxxxxxxxxxxxx
```

---

## Local Development with Stripe CLI

### Install Stripe CLI

**macOS:**
```bash
brew install stripe/stripe-brew/stripe
```

**Linux:**
```bash
# Download from https://github.com/stripe/stripe-cli/releases
wget https://github.com/stripe/stripe-cli/releases/download/v1.19.4/stripe_1.19.4_linux_x86_64.tar.gz
tar -xvf stripe_1.19.4_linux_x86_64.tar.gz
sudo mv stripe /usr/local/bin/
```

**Windows:**
```bash
# Download from https://github.com/stripe/stripe-cli/releases
# Or use Scoop:
scoop bucket add stripe https://github.com/stripe/scoop-stripe-cli.git
scoop install stripe
```

### Login to Stripe
```bash
stripe login
```
This will open your browser to authenticate.

### Forward Webhooks to Local Server
```bash
stripe listen --forward-to localhost:3001/stripe/webhooks
```

**Output:**
```
> Ready! Your webhook signing secret is whsec_1234... (^C to quit)
```

**Add this secret to `.env`:**
```bash
STRIPE_WEBHOOK_SECRET=whsec_1234...
```

### Test Specific Events
```bash
# Test account update
stripe trigger account.updated

# Test external account creation
stripe trigger account.external_account.created

# Test payout failure
stripe trigger payout.failed

# Test identity verification
stripe trigger identity.verification_session.verified
```

---

## Verifying Webhook Setup

### 1. Check Backend Logs
After completing Stripe onboarding, you should see:
```
[StripeWebhookService] Processing webhook event: account.updated (livemode: false, id: evt_xxx)
[StripeWebhookService] Syncing account status for acct_xxx
[StripeWebhookService] Account acct_xxx synced successfully
[StripeWebhookService] Organization status updated to active for account xxx (onboarded)
```

### 2. Check Database
```sql
-- Check webhook events were received
SELECT event_id, event_type, status, created_at
FROM webhook_events
ORDER BY created_at DESC
LIMIT 10;

-- Check account status updated
SELECT stripe_id, is_details_submitted, is_charges_enabled, is_payouts_enabled
FROM accounts
WHERE stripe_id = 'acct_xxx';

-- Check organization onboarded
SELECT name, status, onboarded_at
FROM organizations
WHERE account_id = (SELECT id FROM accounts WHERE stripe_id = 'acct_xxx');
```

### 3. Check Stripe Dashboard
- Go to **Developers > Webhooks**
- Click on your endpoint
- View **Recent events** tab
- Should show events with **Succeeded** status

---

## Troubleshooting

### Webhook Failing with 401 Unauthorized
**Problem:** JWT auth guard blocking webhook endpoint

**Solution:** Make sure webhook endpoint is public (should already be configured):
```typescript
// In stripe.controller.ts
@Post('webhooks')
@UseGuards() // No JwtAuthGuard - webhooks are public
async handleWebhook(@Req() req: RawBodyRequest<Request>) {
  // ...
}
```

### Webhook Failing with 400 Bad Signature
**Problem:** Incorrect webhook secret or raw body not available

**Check:**
1. `.env` has correct `STRIPE_WEBHOOK_SECRET`
2. `main.ts` has raw body enabled:
   ```typescript
   const app = await NestFactory.create(AppModule, {
     rawBody: true, // ← Must be true
   });
   ```
3. JSON parser skips webhook route:
   ```typescript
   app.use((req, res, next) => {
     if (req.originalUrl === '/stripe/webhooks') {
       next(); // Skip JSON parsing
     } else {
       json()(req, res, next);
     }
   });
   ```

### Events Not Being Processed
**Check:**
1. Event type is in the switch statement (`stripe-webhook.service.ts`)
2. Backend server is running
3. Webhook endpoint is accessible (test with curl)
4. Check `webhook_events` table for failed events:
   ```sql
   SELECT * FROM webhook_events WHERE status = 'failed';
   ```

### Duplicate Events
**Expected Behavior:** Idempotency protection will skip duplicates:
```
[StripeWebhookService] Duplicate webhook event evt_xxx - already processed. Skipping.
```

If you see this, it means:
- Stripe retried the webhook (normal)
- Idempotency is working correctly ✅
- Event was NOT processed twice ✅

---

## Production Checklist

Before going live:

- [ ] Webhook endpoint added in Stripe Live Mode dashboard
- [ ] HTTPS enabled on production server
- [ ] `STRIPE_WEBHOOK_SECRET` env variable set (Live mode secret)
- [ ] All required events selected in Stripe dashboard
- [ ] Test webhooks sent from Stripe dashboard
- [ ] Webhook signing secret matches `.env`
- [ ] `webhook_events` table migration applied
- [ ] Backend logs show successful webhook processing
- [ ] Test complete onboarding flow end-to-end
- [ ] Monitor webhook failures in Stripe dashboard
- [ ] Set up alerts for failed webhooks (optional)

---

## Event Delivery & Retry Policy

### Stripe's Retry Behavior
- Stripe attempts to deliver webhooks for up to **3 days**
- If your endpoint returns 2xx, Stripe considers it successful
- If your endpoint returns 5xx, Stripe will retry with exponential backoff
- If your endpoint returns 4xx, Stripe will NOT retry (considered permanent failure)

### BillingOS Retry Strategy
1. **Idempotency:** Duplicate events are automatically skipped
2. **Error Handling:** Errors are logged and event marked as 'failed'
3. **Re-throwing:** Errors are re-thrown to return 500 to Stripe for retry
4. **Audit Trail:** All events stored in `webhook_events` table

### Manual Retry
If a webhook fails and needs manual reprocessing:
```sql
-- Find failed event
SELECT id, event_id, payload FROM webhook_events WHERE status = 'failed';

-- Reset status to trigger reprocessing (future enhancement)
-- For now, manually replay from Stripe Dashboard:
-- Webhooks > Click endpoint > Recent events > Click event > Send test webhook
```

---

## Security Best Practices

✅ **Implemented:**
- Webhook signature verification (Stripe SDK)
- Raw body preservation for signature check
- HTTPS in production (required by Stripe)
- Idempotency protection (prevent replay attacks)

✅ **Recommended:**
- Use different webhook secrets for test vs live mode
- Rotate webhook secrets periodically (every 6-12 months)
- Monitor failed webhook attempts (could indicate attack)
- Use separate endpoint for Connect webhooks (future)
- Implement rate limiting on webhook endpoint (future)

---

## Quick Reference: Event Types

### Account Lifecycle
| Event | When Fired | Action |
|-------|-----------|--------|
| `account.updated` | Any account field changes | Sync account status to DB |
| `account.external_account.created` | Bank account added | Fetch and sync account |
| `account.external_account.updated` | Bank details changed | Fetch and sync account |
| `account.external_account.deleted` | Bank account removed | Fetch and sync account |
| `account.application.deauthorized` | Account disconnected | Mark as blocked |

### Identity Verification
| Event | When Fired | Action |
|-------|-----------|--------|
| `identity.verification_session.verified` | Identity confirmed | Update user status to verified |
| `identity.verification_session.requires_input` | Verification failed | Update user status to failed |
| `identity.verification_session.canceled` | User canceled | Update user status to failed |
| `identity.verification_session.processing` | Being reviewed | Update user status to pending |

### Payouts (Logged Only - Table Pending)
| Event | When Fired | Action |
|-------|-----------|--------|
| `payout.failed` | Payout failed | Log failure for investigation |
| `payout.paid` | Payout successful | Log for reconciliation |
| `payout.updated` | Status changed | Log status change |

---

## Support & Resources

**Stripe Documentation:**
- Webhooks: https://docs.stripe.com/webhooks
- Connect Webhooks: https://docs.stripe.com/connect/webhooks
- Event Types: https://docs.stripe.com/api/events/types

**Stripe Dashboard:**
- Test Mode: https://dashboard.stripe.com/test
- Live Mode: https://dashboard.stripe.com

**Debugging:**
- Webhook Logs: Dashboard > Developers > Webhooks > Click endpoint
- Event Details: Dashboard > Developers > Events
- API Logs: Dashboard > Developers > Logs

**BillingOS Internal:**
- Webhook Events: Query `webhook_events` table
- Backend Logs: Check NestJS console output
- Database Status: Check `accounts` and `organizations` tables

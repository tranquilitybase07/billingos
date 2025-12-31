# BillingOS Backend - Quick Setup Guide

## ✅ What's Been Done

The backend for business onboarding has been fully implemented with:

- ✅ 5 database migrations (organizations, accounts, user_organizations, RLS policies)
- ✅ Stripe module (Connect accounts, webhooks)
- ✅ Organization module (CRUD, team management, payment status)
- ✅ Account module (Stripe account creation, onboarding links)
- ✅ 15 API endpoints ready to use

## 🚀 Setup Steps

### 1. Database Setup

```bash
# Start Supabase (if not running)
npx supabase start

# Apply all migrations
npx supabase db reset

# Generate TypeScript types (CRITICAL!)
npx supabase gen types typescript --local > packages/shared/types/database.types.ts
```

### 2. Environment Variables

Make sure `.env` in `apps/api/` has:

```env
# Stripe (get from https://dashboard.stripe.com/test/apikeys)
STRIPE_SECRET_KEY=sk_test_...
STRIPE_WEBHOOK_SECRET=whsec_...
STRIPE_PUBLISHABLE_KEY=pk_test_...

# Already configured
SUPABASE_URL=http://127.0.0.1:54321
SUPABASE_SERVICE_ROLE_KEY=...
APP_URL=http://localhost:3000
API_URL=http://localhost:3001
```

### 3. Stripe Setup (Local Development)

```bash
# Install Stripe CLI
brew install stripe/stripe-cli/stripe

# Login to Stripe
stripe login

# Forward webhooks to your local API
stripe listen --forward-to http://localhost:3001/stripe/webhooks

# Copy the webhook signing secret from the output and add to .env
# Output will show: whsec_xxxxx...
```

### 4. Build & Run

```bash
# Install dependencies
pnpm install

# Build backend
cd apps/api && pnpm run build

# Run in development mode
cd ../.. && pnpm run dev

# Backend will be at: http://localhost:3001
# Frontend will be at: http://localhost:3000
```

## 🧪 Test the API

### Quick Health Check

```bash
curl http://localhost:3001
# Should return: "Hello World!"
```

### Test Authentication

```bash
# Sign up (magic link)
curl -X POST http://localhost:3001/auth/magic-link \
  -H "Content-Type: application/json" \
  -d '{"email": "test@example.com"}'

# Check Inbucket (local email): http://localhost:54324
# Click the magic link to get authenticated

# Get your JWT token from the session cookie
```

### Create Organization

```bash
# Replace YOUR_JWT_TOKEN with your actual token
curl -X POST http://localhost:3001/organizations \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "My Test Company",
    "slug": "my-test-company",
    "email": "billing@test.com"
  }'
```

## 📚 API Endpoints

### Organizations
- `POST /organizations` - Create organization
- `GET /organizations` - List user's organizations
- `GET /organizations/:id` - Get organization details
- `PATCH /organizations/:id` - Update organization
- `DELETE /organizations/:id` - Delete organization
- `POST /organizations/:id/business-details` - Submit onboarding form
- `GET /organizations/:id/payment-status` - Get payment setup status

### Team Management
- `GET /organizations/:id/members` - List members
- `POST /organizations/:id/members/invite` - Invite member
- `DELETE /organizations/:id/members/:userId` - Remove member
- `DELETE /organizations/:id/members/leave` - Leave organization

### Stripe Connect Accounts
- `POST /accounts` - Create Stripe Connect account
- `GET /accounts/:id` - Get account details
- `POST /accounts/:id/onboarding-link` - Get Stripe onboarding URL
- `POST /accounts/:id/dashboard-link` - Get Stripe dashboard URL
- `POST /accounts/:id/sync` - Sync account from Stripe

### Webhooks
- `POST /stripe/webhooks` - Stripe webhook receiver

## 📖 Full Documentation

See [BACKEND_IMPLEMENTATION.md](./BACKEND_IMPLEMENTATION.md) for:
- Complete API examples with curl
- User flow walkthrough
- Database schema details
- Troubleshooting guide

## 🔍 Database Schema

```
users
├─ account_id → accounts.id
├─ identity_verification_status
└─ identity_verification_id

organizations
├─ account_id → accounts.id (nullable)
├─ status: created | onboarding_started | active
├─ details (JSONB): business info
└─ settings (JSONB): various settings

accounts (Stripe Connect)
├─ admin_id → users.id
├─ stripe_id (acct_xxx)
├─ is_details_submitted
├─ is_charges_enabled
└─ is_payouts_enabled

user_organizations
├─ user_id → users.id
└─ organization_id → organizations.id
```

## ⚠️ Important Notes

1. **Type Generation**: Always regenerate types after running migrations:
   ```bash
   npx supabase gen types typescript --local > packages/shared/types/database.types.ts
   ```

2. **Stripe Webhooks**: For local development, use Stripe CLI to forward webhooks:
   ```bash
   stripe listen --forward-to http://localhost:3001/stripe/webhooks
   ```

3. **Team Invitations**: Users must sign up first before they can be invited to organizations.

4. **Admin Role**: The user who creates the Stripe Connect account becomes the admin automatically.

5. **Just-in-Time Stripe**: Stripe accounts are created on-demand, not during organization creation.

## 🐛 Troubleshooting

### TypeScript errors about missing tables
```bash
# Regenerate types after migrations
npx supabase gen types typescript --local > packages/shared/types/database.types.ts
```

### Webhook signature verification failed
```bash
# Make sure you're using Stripe CLI for local testing
stripe listen --forward-to http://localhost:3001/stripe/webhooks

# Copy the webhook secret (whsec_...) to .env
```

### Can't access organization
- Check if user is in `user_organizations` table
- Verify JWT token is valid
- Check RLS policies are enabled

### Build fails
```bash
# Clean and rebuild
rm -rf dist
pnpm run build
```

## 🎯 Next Steps

1. **Frontend**: Build the UI pages (organization creation, onboarding wizard, finance page)
2. **Products**: Add product/checkout creation features
3. **Subscriptions**: Implement subscription management
4. **Analytics**: Build revenue dashboard
5. **Notifications**: Add email notifications for invitations

## 📞 Need Help?

Check the full implementation guide: [BACKEND_IMPLEMENTATION.md](./BACKEND_IMPLEMENTATION.md)

# BillingOS Backend Implementation - Business Onboarding

This document describes the backend implementation for business onboarding following Polar's exact flow.

## What Was Implemented

### 1. Database Migrations

Created 5 new Supabase migrations in `supabase/migrations/`:

1. **20251230210000_add_identity_verification_to_users.sql**
   - Adds `account_id`, `identity_verification_status`, `identity_verification_id` to users table
   - For Stripe Identity verification integration

2. **20251230210100_create_organizations_table.sql**
   - Organizations (businesses) table with:
     - Basic info: name, slug, email, website, avatar
     - Business details (JSONB): onboarding form data
     - Account reference: `account_id` (nullable, created on-demand)
     - Status tracking: created → onboarding_started → active
     - Settings (JSONB): profile, subscription, notifications, etc.
     - Invoice settings: prefix, next number

3. **20251230210200_create_accounts_table.sql**
   - Stripe Connect accounts table with:
     - Admin/owner: `admin_id` (determines who is organization admin)
     - Stripe details: `stripe_id`, country, currency, business_type
     - Capabilities: is_details_submitted, is_charges_enabled, is_payouts_enabled
     - Platform fees: processor_fees_applicable, platform_fee_percent, platform_fee_fixed
     - Raw Stripe data (JSONB)

4. **20251230210300_create_user_organizations_table.sql**
   - Many-to-many join table for organization membership
   - Simple structure: user_id, organization_id (no role field)
   - Admin determined by `accounts.admin_id`

5. **20251230210400_add_rls_policies_for_organizations.sql**
   - Row Level Security policies for organizations, accounts, user_organizations
   - Helper functions: `is_organization_admin()`, `is_organization_member()`
   - Ensures users can only access their own organizations

### 2. Backend Modules

#### Stripe Module (`src/stripe/`)
- **StripeService**: Wrapper around Stripe SDK
  - `createConnectAccount()`: Create Express Connect account
  - `getConnectAccount()`: Get account details
  - `createAccountLink()`: Generate onboarding URL
  - `createDashboardLoginLink()`: Generate dashboard URL
  - `createIdentityVerificationSession()`: Create identity verification
  - `constructWebhookEvent()`: Verify webhook signatures
  - `createCustomer()`: Create Stripe customer (for purchases)

- **StripeWebhookService**: Handle Stripe events
  - `account.updated`: Sync account capabilities to database
  - `identity.verification_session.*`: Update user verification status
  - Auto-updates organization status when account is fully enabled

- **StripeController**: Webhook endpoint
  - `POST /stripe/webhooks`: Receive Stripe events

#### Organization Module (`src/organization/`)
- **OrganizationService**: Business logic for organizations
  - `create()`: Create organization + add creator as member
  - `findAll()`: Get user's organizations
  - `findOne()`: Get organization by ID
  - `update()`: Update organization (admin only if account exists)
  - `remove()`: Soft delete organization (admin only)
  - `submitBusinessDetails()`: Save onboarding form data
  - `getMembers()`: List organization members
  - `inviteMember()`: Invite by email (creates user if needed)
  - `removeMember()`: Remove member (admin only, can't remove admin)
  - `leaveOrganization()`: Member leaves (non-admins only)
  - `getPaymentStatus()`: Get onboarding step completion status

- **DTOs**:
  - `CreateOrganizationDto`: name, slug, email, website
  - `UpdateOrganizationDto`: Update settings
  - `SubmitBusinessDetailsDto`: Onboarding form (about, product, revenue, etc.)
  - `InviteMemberDto`: email

- **Endpoints**:
  ```
  POST   /organizations                          # Create organization
  GET    /organizations                          # List user's orgs
  GET    /organizations/:id                      # Get organization
  PATCH  /organizations/:id                      # Update settings
  DELETE /organizations/:id                      # Delete org (soft)
  POST   /organizations/:id/business-details     # Submit onboarding form
  GET    /organizations/:id/members              # List members
  POST   /organizations/:id/members/invite       # Invite member
  DELETE /organizations/:id/members/:userId      # Remove member
  DELETE /organizations/:id/members/leave        # Leave org
  GET    /organizations/:id/payment-status       # Get setup status
  ```

#### Account Module (`src/account/`)
- **AccountService**: Stripe Connect account management
  - `create()`: Create Stripe Connect account for organization
    - Creates account in Stripe
    - Saves to database
    - Links to organization
    - User becomes admin
  - `findOne()`: Get account (with access check)
  - `getOnboardingLink()`: Generate Stripe onboarding URL
  - `getDashboardLink()`: Generate Stripe dashboard URL
  - `syncFromStripe()`: Manually sync account status

- **DTOs**:
  - `CreateAccountDto`: organization_id, email, country, business_type
  - `GetOnboardingLinkDto`: return_url, refresh_url

- **Endpoints**:
  ```
  POST   /accounts                               # Create Stripe account
  GET    /accounts/:id                           # Get account
  POST   /accounts/:id/onboarding-link           # Get Stripe onboarding URL
  POST   /accounts/:id/dashboard-link            # Get Stripe dashboard URL
  POST   /accounts/:id/sync                      # Sync from Stripe
  ```

### 3. Configuration

- **Environment Variables** (already in `.env.example`):
  ```
  STRIPE_SECRET_KEY=sk_test_...
  STRIPE_WEBHOOK_SECRET=whsec_...
  APP_URL=http://localhost:3000
  ```

- **main.ts Updates**:
  - Added raw body support for Stripe webhooks
  - Added CORS for frontend
  - Added global validation pipe
  - Custom middleware to skip JSON parsing for webhook route

## Setup Instructions

### 1. Run Database Migrations

```bash
# Start Supabase (if not running)
npx supabase start

# Apply migrations
npx supabase db reset

# Or push migrations to remote
npx supabase db push
```

### 2. Generate Supabase Types

After running migrations, regenerate types so TypeScript knows about new tables:

```bash
# Generate types from local database
npx supabase gen types typescript --local > packages/shared/types/database.types.ts

# Or from remote
npx supabase gen types typescript --project-id YOUR_PROJECT_ID > packages/shared/types/database.types.ts
```

### 3. Setup Stripe

1. Go to [Stripe Dashboard](https://dashboard.stripe.com/test/connect/accounts/overview)
2. Enable Connect (if not already enabled)
3. Get your keys:
   - Secret key: `sk_test_...`
   - Publishable key: `pk_test_...`
4. Set up webhook endpoint:
   - URL: `https://your-domain.com/stripe/webhooks` (or use Stripe CLI for local testing)
   - Events: `account.updated`, `identity.verification_session.*`
   - Get webhook secret: `whsec_...`

5. Update `.env`:
   ```bash
   STRIPE_SECRET_KEY=sk_test_51...
   STRIPE_WEBHOOK_SECRET=whsec_...
   STRIPE_PUBLISHABLE_KEY=pk_test_...
   ```

### 4. Test with Stripe CLI (Local Development)

```bash
# Install Stripe CLI
brew install stripe/stripe-cli/stripe

# Login
stripe login

# Forward webhooks to local server
stripe listen --forward-to http://localhost:3001/stripe/webhooks

# Copy the webhook signing secret and update .env
STRIPE_WEBHOOK_SECRET=whsec_...
```

### 5. Build and Run

```bash
# Install dependencies (if not already)
pnpm install

# Build backend
cd apps/api && pnpm run build

# Run in development
pnpm run dev

# Backend will start on http://localhost:3001
```

## API Flow Examples

### Example 1: Create Organization

```bash
# Get access token from login
curl -X POST http://localhost:3001/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email": "user@example.com"}'

# Create organization
curl -X POST http://localhost:3001/organizations \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "My Startup Inc",
    "slug": "my-startup",
    "email": "billing@mystartup.com"
  }'

# Response:
{
  "id": "uuid",
  "name": "My Startup Inc",
  "slug": "my-startup",
  "email": "billing@mystartup.com",
  "status": "created",
  "account_id": null,
  ...
}
```

### Example 2: Submit Business Details

```bash
curl -X POST http://localhost:3001/organizations/{org_id}/business-details \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "about": "We provide SaaS tools for developers",
    "product_description": "Developer productivity tools",
    "intended_use": "Monthly subscriptions",
    "customer_acquisition": "Content marketing, SEO",
    "future_annual_revenue": 100000
  }'

# Response: Updated organization with details_submitted_at timestamp
```

### Example 3: Create Stripe Connect Account

```bash
curl -X POST http://localhost:3001/accounts \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "organization_id": "org_uuid",
    "email": "billing@mystartup.com",
    "country": "US",
    "business_type": "company"
  }'

# Response:
{
  "id": "account_uuid",
  "stripe_id": "acct_1234567890",
  "admin_id": "user_uuid",
  "status": "onboarding_started",
  "is_details_submitted": false,
  "is_charges_enabled": false,
  "is_payouts_enabled": false,
  ...
}
```

### Example 4: Get Stripe Onboarding Link

```bash
curl -X POST http://localhost:3001/accounts/{account_id}/onboarding-link \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "return_url": "http://localhost:3000/dashboard/my-startup/finance/account",
    "refresh_url": "http://localhost:3000/dashboard/my-startup/finance/account"
  }'

# Response:
{
  "url": "https://connect.stripe.com/setup/c/..."
}

# Frontend should redirect user to this URL
# User completes Stripe onboarding (bank account, identity verification)
# Stripe redirects back to return_url
# Webhook updates account status automatically
```

### Example 5: Check Payment Status

```bash
curl -X GET http://localhost:3001/organizations/{org_id}/payment-status \
  -H "Authorization: Bearer YOUR_JWT_TOKEN"

# Response:
{
  "payment_ready": false,
  "account_status": "onboarding",
  "steps": [
    {
      "id": "business_details",
      "title": "Business Details",
      "description": "Tell us about your business",
      "completed": true,
      "href": "/dashboard/my-startup/onboarding"
    },
    {
      "id": "setup_account",
      "title": "Setup Payouts",
      "description": "Connect your bank account with Stripe",
      "completed": false,
      "href": "/dashboard/my-startup/finance/account"
    },
    {
      "id": "identity_verification",
      "title": "Identity Verification",
      "description": "Verify your identity",
      "completed": false,
      "href": "/dashboard/my-startup/finance/account"
    }
  ],
  "is_details_submitted": false,
  "is_charges_enabled": false,
  "is_payouts_enabled": false
}
```

### Example 6: Invite Team Member

**Note**: Users must sign up first before they can be invited to an organization.

```bash
curl -X POST http://localhost:3001/organizations/{org_id}/members/invite \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "email": "teammate@example.com"
  }'

# Response (if user exists):
{
  "user_id": "user_uuid",
  "organization_id": "org_uuid",
  "email": "teammate@example.com",
  "is_admin": false,
  ...
}

# Error response (if user doesn't exist):
{
  "statusCode": 404,
  "message": "User not found. They need to sign up first before being invited."
}
```

## User Flow (Matching Polar)

### Step 1: Sign Up & Create Organization
1. User signs up (magic link - already working)
2. Redirected to create organization page
3. User enters business name, slug
4. Backend creates organization with status="created"
5. User added to user_organizations table
6. **No Stripe account created yet**

### Step 2: Explore Platform (Optional)
- User can browse dashboard
- Create products, explore features
- **Payment setup is completely optional**

### Step 3: Submit Business Details (Optional)
- User fills out onboarding form
- Data saved to organization.details (JSONB)
- `details_submitted_at` timestamp set

### Step 4: Setup Payouts (When Ready)
- User navigates to `/dashboard/{org}/finance/account`
- Clicks "Setup Payouts" button
- Frontend calls `POST /accounts` → Creates Stripe Connect account
- Frontend calls `POST /accounts/{id}/onboarding-link` → Gets Stripe URL
- **User redirected to Stripe** (external)
- User completes:
  - Business information form
  - Bank account connection
  - Identity verification
- **Stripe redirects back** to billingOS
- Webhook syncs account status
- Organization status updated to "active"

### Step 5: Ready to Accept Payments
- All onboarding steps complete
- `payment_ready: true`
- User can create products, checkouts, subscriptions

## Database Schema Summary

```
users (existing + new fields)
├─ account_id → accounts.id
├─ identity_verification_status
└─ identity_verification_id

organizations
├─ account_id → accounts.id (nullable, created on-demand)
├─ status: created | onboarding_started | active | blocked
├─ details (JSONB): business onboarding form
└─ settings (JSONB): various settings

accounts
├─ admin_id → users.id (determines organization admin)
├─ stripe_id (acct_xxx)
├─ is_details_submitted, is_charges_enabled, is_payouts_enabled
└─ status: created | onboarding_started | active | blocked

user_organizations (many-to-many)
├─ user_id → users.id
└─ organization_id → organizations.id
```

## Role System (Simple, like Polar)

**Admin**:
- Determined by `accounts.admin_id`
- User who creates the Stripe Connect account becomes admin
- Can modify organization settings
- Can invite/remove members
- Can delete organization
- Cannot be removed from organization
- Cannot leave organization

**Member**:
- All other users in `user_organizations`
- Can view organization
- Can create products, checkouts, etc. (based on feature permissions)
- Cannot modify organization settings
- Cannot delete organization
- Can leave organization

**Note**: NO separate roles table, NO permissions table. Keep it simple.

## Next Steps

### Immediate (to make backend work):
1. ✅ Run migrations: `npx supabase db reset`
2. ✅ Generate types: `npx supabase gen types typescript --local > packages/shared/types/database.types.ts`
3. ✅ Update `.env` with Stripe keys
4. ✅ Build backend: `cd apps/api && pnpm run build`
5. ✅ Test with Postman/curl

### Frontend (Next.js):
1. Create organization creation page
2. Create onboarding wizard
3. Create finance/account page with "Setup Payouts" flow
4. Create team management page
5. Add payment status banner to dashboard
6. Handle Stripe redirect flow

### Later (Future Features):
1. AI validation/review system (skipped for now)
2. B2B customer members feature (skipped for now)
3. Email notifications (invitation emails, etc.)
4. Product creation wizard
5. Checkout/subscription management
6. Analytics dashboard

## Troubleshooting

### TypeScript errors about missing tables
- Run migrations first: `npx supabase db reset`
- Regenerate types: `npx supabase gen types typescript --local > packages/shared/types/database.types.ts`

### Webhook signature verification failed
- Make sure `STRIPE_WEBHOOK_SECRET` is set correctly
- Use Stripe CLI for local testing: `stripe listen --forward-to http://localhost:3001/stripe/webhooks`

### Account not syncing from Stripe
- Check webhook is configured correctly in Stripe Dashboard
- Verify webhook secret matches `.env`
- Check API logs for webhook errors

### User can't access organization
- Verify user is in `user_organizations` table
- Check RLS policies are enabled
- Verify JWT token is valid

## Architecture Decisions

### Why JSONB for details and settings?
- Flexibility: Can add new fields without migrations
- Matches Polar's approach
- Easy to store dynamic form data

### Why nullable account_id in organizations?
- Organizations can exist before Stripe account is created
- Matches Polar's "just-in-time" account creation
- Users can explore platform before connecting payments

### Why admin_id in accounts instead of user_organizations?
- Simpler than separate roles table
- One source of truth for admin status
- Matches Polar's simplified RBAC

### Why soft deletes (deleted_at)?
- Maintain history when users leave organizations
- Can restore if needed
- Easier audit trail

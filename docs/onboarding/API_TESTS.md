# API Testing Guide

Quick reference for testing the BillingOS API endpoints.

## Setup

1. Start the backend: `pnpm run dev`
2. Get authenticated (magic link or existing session)
3. Extract JWT token from your session

## Environment Variables

```bash
export API_URL="http://localhost:3001"
export JWT_TOKEN="your_jwt_token_here"
```

---

## 1. Organizations

### Create Organization

```bash
curl -X POST $API_URL/organizations \
  -H "Authorization: Bearer $JWT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "My Startup",
    "slug": "my-startup",
    "email": "billing@mystartup.com",
    "website": "https://mystartup.com"
  }'
```

**Expected Response:**
```json
{
  "id": "uuid",
  "name": "My Startup",
  "slug": "my-startup",
  "email": "billing@mystartup.com",
  "website": "https://mystartup.com",
  "status": "created",
  "account_id": null,
  "created_at": "2025-12-30T...",
  ...
}
```

### List Organizations

```bash
curl -X GET $API_URL/organizations \
  -H "Authorization: Bearer $JWT_TOKEN"
```

### Get Organization

```bash
export ORG_ID="your_org_id_here"

curl -X GET $API_URL/organizations/$ORG_ID \
  -H "Authorization: Bearer $JWT_TOKEN"
```

### Update Organization

```bash
curl -X PATCH $API_URL/organizations/$ORG_ID \
  -H "Authorization: Bearer $JWT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "My Updated Startup",
    "website": "https://newdomain.com"
  }'
```

### Submit Business Details

```bash
curl -X POST $API_URL/organizations/$ORG_ID/business-details \
  -H "Authorization: Bearer $JWT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "about": "We build developer tools",
    "product_description": "SaaS platform for developers",
    "intended_use": "Monthly subscriptions",
    "customer_acquisition": "Content marketing",
    "future_annual_revenue": 100000
  }'
```

### Get Payment Status

```bash
curl -X GET $API_URL/organizations/$ORG_ID/payment-status \
  -H "Authorization: Bearer $JWT_TOKEN"
```

**Expected Response:**
```json
{
  "payment_ready": false,
  "account_status": "not_created",
  "steps": [
    {
      "id": "business_details",
      "title": "Business Details",
      "description": "Tell us about your business",
      "completed": false,
      "href": "/dashboard/my-startup/onboarding"
    },
    {
      "id": "setup_account",
      "title": "Setup Payouts",
      "description": "Connect your bank account with Stripe",
      "completed": false,
      "href": "/dashboard/my-startup/finance/account"
    }
  ]
}
```

---

## 2. Team Management

### List Members

```bash
curl -X GET $API_URL/organizations/$ORG_ID/members \
  -H "Authorization: Bearer $JWT_TOKEN"
```

**Expected Response:**
```json
[
  {
    "user_id": "uuid",
    "organization_id": "org_uuid",
    "email": "user@example.com",
    "avatar_url": null,
    "is_admin": true,
    "created_at": "2025-12-30T..."
  }
]
```

### Invite Member

**Note**: User must already be signed up!

```bash
curl -X POST $API_URL/organizations/$ORG_ID/members/invite \
  -H "Authorization: Bearer $JWT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "email": "teammate@example.com"
  }'
```

**Success Response:**
```json
{
  "user_id": "uuid",
  "organization_id": "org_uuid",
  "email": "teammate@example.com",
  "is_admin": false,
  "created_at": "2025-12-30T..."
}
```

**Error Response (user not found):**
```json
{
  "statusCode": 404,
  "message": "User not found. They need to sign up first before being invited."
}
```

### Remove Member

```bash
export MEMBER_USER_ID="member_uuid"

curl -X DELETE $API_URL/organizations/$ORG_ID/members/$MEMBER_USER_ID \
  -H "Authorization: Bearer $JWT_TOKEN"
```

### Leave Organization

```bash
curl -X DELETE $API_URL/organizations/$ORG_ID/members/leave \
  -H "Authorization: Bearer $JWT_TOKEN"
```

---

## 3. Stripe Connect Accounts

### Create Account

```bash
curl -X POST $API_URL/accounts \
  -H "Authorization: Bearer $JWT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "organization_id": "'$ORG_ID'",
    "email": "billing@mystartup.com",
    "country": "US",
    "business_type": "company"
  }'
```

**Expected Response:**
```json
{
  "id": "account_uuid",
  "account_type": "stripe",
  "admin_id": "user_uuid",
  "stripe_id": "acct_1234567890",
  "email": "billing@mystartup.com",
  "country": "US",
  "currency": "usd",
  "is_details_submitted": false,
  "is_charges_enabled": false,
  "is_payouts_enabled": false,
  "business_type": "company",
  "status": "onboarding_started",
  "created_at": "2025-12-30T...",
  ...
}
```

### Get Account

```bash
export ACCOUNT_ID="your_account_id_here"

curl -X GET $API_URL/accounts/$ACCOUNT_ID \
  -H "Authorization: Bearer $JWT_TOKEN"
```

### Get Onboarding Link

```bash
curl -X POST $API_URL/accounts/$ACCOUNT_ID/onboarding-link \
  -H "Authorization: Bearer $JWT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "return_url": "http://localhost:3000/dashboard/my-startup/finance/account",
    "refresh_url": "http://localhost:3000/dashboard/my-startup/finance/account"
  }'
```

**Expected Response:**
```json
{
  "url": "https://connect.stripe.com/setup/c/acct_xxx/xxxxxx"
}
```

**Usage**: Redirect user to this URL in the frontend to complete Stripe onboarding.

### Get Dashboard Link

```bash
curl -X POST $API_URL/accounts/$ACCOUNT_ID/dashboard-link \
  -H "Authorization: Bearer $JWT_TOKEN"
```

**Expected Response:**
```json
{
  "url": "https://connect.stripe.com/express/acct_xxx/xxxxxx"
}
```

### Sync Account from Stripe

```bash
curl -X POST $API_URL/accounts/$ACCOUNT_ID/sync \
  -H "Authorization: Bearer $JWT_TOKEN"
```

---

## 4. Complete Onboarding Flow

### Step 1: Create Organization

```bash
curl -X POST $API_URL/organizations \
  -H "Authorization: Bearer $JWT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Test Company",
    "slug": "test-company",
    "email": "test@example.com"
  }' | jq -r '.id'

# Save the org ID
export ORG_ID="<org_id_from_response>"
```

### Step 2: Submit Business Details

```bash
curl -X POST $API_URL/organizations/$ORG_ID/business-details \
  -H "Authorization: Bearer $JWT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "about": "We provide SaaS tools",
    "product_description": "Developer tools",
    "intended_use": "Subscriptions",
    "future_annual_revenue": 50000
  }'
```

### Step 3: Create Stripe Account

```bash
curl -X POST $API_URL/accounts \
  -H "Authorization: Bearer $JWT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "organization_id": "'$ORG_ID'",
    "email": "test@example.com",
    "country": "US",
    "business_type": "company"
  }' | jq -r '.id'

# Save the account ID
export ACCOUNT_ID="<account_id_from_response>"
```

### Step 4: Get Onboarding Link

```bash
curl -X POST $API_URL/accounts/$ACCOUNT_ID/onboarding-link \
  -H "Authorization: Bearer $JWT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "return_url": "http://localhost:3000/dashboard/test-company/finance/account"
  }' | jq -r '.url'

# Open this URL in browser to complete Stripe onboarding
```

### Step 5: Check Payment Status

```bash
curl -X GET $API_URL/organizations/$ORG_ID/payment-status \
  -H "Authorization: Bearer $JWT_TOKEN" | jq
```

---

## 5. Webhook Testing

### Using Stripe CLI

```bash
# Terminal 1: Start your API
pnpm run dev

# Terminal 2: Forward Stripe webhooks
stripe listen --forward-to http://localhost:3001/stripe/webhooks
```

### Trigger Test Events

```bash
# Trigger account.updated event
stripe trigger account.updated

# Check your API logs to see the webhook being processed
```

---

## Common Response Codes

- `200 OK` - Success
- `201 Created` - Resource created
- `204 No Content` - Success (delete operations)
- `400 Bad Request` - Validation error
- `401 Unauthorized` - Missing or invalid JWT token
- `403 Forbidden` - Not allowed (not admin, not member, etc.)
- `404 Not Found` - Resource not found
- `409 Conflict` - Duplicate (e.g., user already member)

---

## Error Response Format

```json
{
  "statusCode": 400,
  "message": "Validation failed",
  "error": "Bad Request"
}
```

---

## Tips

1. **Save IDs**: Export org and account IDs to environment variables for easy testing
2. **Use jq**: Install `jq` to prettify JSON responses: `brew install jq`
3. **Check logs**: Watch API logs in real-time to debug issues
4. **Stripe CLI**: Use `stripe logs tail` to see Stripe API calls
5. **Database**: Use Supabase Studio (http://localhost:54323) to inspect database directly

---

## Quick Debug Commands

### Check if user is organization member

```bash
# In psql or Supabase Studio
SELECT * FROM user_organizations
WHERE user_id = 'your_user_id'
  AND organization_id = 'your_org_id'
  AND deleted_at IS NULL;
```

### Check organization account

```bash
SELECT o.id, o.name, o.status, o.account_id, a.stripe_id, a.is_payouts_enabled
FROM organizations o
LEFT JOIN accounts a ON a.id = o.account_id
WHERE o.id = 'your_org_id';
```

### Check who is admin

```bash
SELECT o.name, a.admin_id, u.email as admin_email
FROM organizations o
JOIN accounts a ON a.id = o.account_id
JOIN users u ON u.id = a.admin_id
WHERE o.id = 'your_org_id';
```

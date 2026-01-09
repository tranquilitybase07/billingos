# BillingOS API Collection

This directory contains HTTP request files for testing the BillingOS API using the **REST Client** VS Code extension.

## Setup

### 1. Install REST Client Extension

1. Open VS Code
2. Go to Extensions (Cmd+Shift+X / Ctrl+Shift+X)
3. Search for **"REST Client"** by Huachao Mao
4. Click **Install**

### 2. Configure Environment Variables

Edit `environments.http` and update:

- `@authToken` - Your JWT token (get from browser after login)
- `@organizationId` - Your organization ID (get from create organization response)
- `@accountId` - Your Stripe account ID (get from create account response)

### 3. Get Your Auth Token

**Option 1: Via Browser DevTools**
1. Login to the frontend at http://localhost:3000
2. Open DevTools (F12 or Cmd+Option+I)
3. Go to **Application** > **Local Storage** > `http://localhost:3000`
4. Find the Supabase auth token (look for `sb-*-auth-token`)
5. Copy the `access_token` value
6. Paste into `environments.http` as `@authToken`

**Option 2: Via Cookie**
1. Login to the frontend
2. Open DevTools > **Application** > **Cookies**
3. Copy the `sb-access-token` cookie value
4. Paste into `environments.http` as `@authToken`

## Usage

### How to Send Requests

1. Open any `.http` file (e.g., `users.http`)
2. You'll see clickable **"Send Request"** links above each request
3. Click **"Send Request"** to execute
4. Response appears in a new panel to the right

### Request Structure

```http
### Get Current User
# @name getCurrentUser
GET {{baseUrl}}/users/me
Authorization: Bearer {{authToken}}
```

- `###` - Separates requests
- `# @name` - Names the request (optional)
- `{{variable}}` - References variables from `environments.http`

### Available Request Files

| File | Description | Endpoints |
|------|-------------|-----------|
| `environments.http` | Environment variables | Variables only (no requests) |
| `users.http` | User profile management | Get profile, update profile, accept terms |
| `organizations.http` | Organization CRUD & members | Create, update, delete orgs, manage members |
| `accounts.http` | Stripe Connect integration | Create account, onboarding, dashboard links |

## Testing Workflow

### 1. Test User Endpoints

```bash
# File: users.http
1. Get Current User (GET /users/me)
2. Update Profile (PUT /users/me)
3. Accept Terms (PUT /users/me/accept-terms)
```

### 2. Test Organization Endpoints

```bash
# File: organizations.http
1. Create Organization (POST /organizations)
   → Copy the returned 'id' to environments.http as @organizationId
2. Get All Organizations (GET /organizations)
3. Get Organization by ID (GET /organizations/:id)
4. Submit Business Details (POST /organizations/:id/business-details)
5. Get Payment Status (GET /organizations/:id/payment-status)
```

### 3. Test Stripe Account Endpoints

```bash
# File: accounts.http
1. Create Stripe Account (POST /accounts)
   → Copy the returned 'id' to environments.http as @accountId
2. Get Account (GET /accounts/:id)
3. Get Onboarding Link (POST /accounts/:id/onboarding-link)
4. Get Dashboard Link (POST /accounts/:id/dashboard-link)
```

### 4. Test Team Management

```bash
# File: organizations.http
1. Get Members (GET /organizations/:id/members)
2. Invite Member (POST /organizations/:id/members/invite)
3. Remove Member (DELETE /organizations/:id/members/:userId)
```

## Tips & Tricks

### Quick Variable Updates

After creating resources, quickly update variables:

```http
# After creating organization, copy ID from response
@organizationId = abc-123-def-456

# After creating Stripe account, copy ID
@accountId = acc_xyz789
```

### Multiple Environments

You can create multiple environment files:

```
environments.http          # Local dev
environments.staging.http  # Staging
environments.prod.http     # Production
```

Then import the one you need:
```http
< ./environments.staging.http
```

### Keyboard Shortcuts

- **Cmd/Ctrl + Alt + R** - Send request
- **Cmd/Ctrl + Alt + E** - Send all requests in file
- **Cmd/Ctrl + Alt + C** - Cancel request

### Save Response to File

Add this above a request:
```http
# @name myRequest
# @prompt myVariable Enter a value

GET {{baseUrl}}/users/me
Authorization: Bearer {{authToken}}
```

### Chain Requests

Use response from one request in another:
```http
### Create Organization
# @name createOrg
POST {{baseUrl}}/organizations
...

### Use Created Org ID
@createdOrgId = {{createOrg.response.body.id}}

GET {{baseUrl}}/organizations/{{createdOrgId}}
```

## Troubleshooting

### 401 Unauthorized

- Your `@authToken` is invalid or expired
- Login again and get a fresh token from browser DevTools

### 404 Not Found

- Check that `@baseUrl` is correct (http://localhost:3001)
- Ensure the API server is running (`pnpm dev:api`)

### 403 Forbidden

- You don't have permission to access this resource
- Check that you're using the correct organization ID
- Verify you're an admin for admin-only endpoints

### Variables Not Working

- Make sure you have `< ./environments.http` at the top of your file
- Check variable names match exactly (case-sensitive)
- Try restarting VS Code

## Sharing with Team

### Via Git (Recommended)

This directory is already in your repo:

```bash
git add apps/api/requests/
git commit -m "Add API request collection"
git push
```

Team members just need to:
1. Pull the repo
2. Install REST Client extension
3. Update their own `@authToken` in `environments.http`
4. Start sending requests!

### Via Export

Right-click any `.http` file → **Copy as cURL** → Share with team

## Advanced Features

### Request History

- All requests are automatically saved in history
- View: Click the **"History"** icon in the REST Client panel

### Code Generation

- Right-click a request → **Generate Code Snippet**
- Supports: JavaScript, Python, Go, PHP, etc.

### Environment Switching

Create a `rest-client.settings.json` in `.vscode/`:

```json
{
  "rest-client.environmentVariables": {
    "local": {
      "baseUrl": "http://localhost:3001"
    },
    "staging": {
      "baseUrl": "https://api-staging.billingos.com"
    },
    "production": {
      "baseUrl": "https://api.billingos.com"
    }
  }
}
```

Switch environments: **Cmd/Ctrl + Shift + P** → **"Rest Client: Switch Environment"**

## Support

For issues or questions:
- REST Client docs: https://marketplace.visualstudio.com/items?itemName=humao.rest-client
- BillingOS API docs: (coming soon)

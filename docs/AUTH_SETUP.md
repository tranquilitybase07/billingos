# BillingOS Authentication Setup Guide

## Overview

BillingOS now has a complete authentication system using **Supabase Auth** with support for:
- ✅ Google OAuth
- ✅ Magic Link (Email OTP)
- ✅ Protected routes with middleware
- ✅ JWT-based API authentication

## What Was Built

### 1. Database Schema
- **Location**: `supabase/migrations/`
- **Tables**:
  - `public.users` - Extended user profiles with app-specific fields
  - Triggers to auto-sync from `auth.users` to `public.users`
  - Row Level Security (RLS) policies

### 2. Backend (NestJS)
- **Auth Module** (`apps/api/src/auth/`)
  - JWT strategy for validating Supabase tokens
  - Auth guards and decorators
  - Middleware for protected routes
- **User Module** (`apps/api/src/user/`)
  - User CRUD operations
  - `GET /users/me` - Get current user
  - `PUT /users/me` - Update user profile
- **Supabase Module** (`apps/api/src/supabase/`)
  - Global Supabase client service

### 3. Frontend (Next.js)
- **Auth Components** (`apps/web/src/components/auth/`)
  - `Login.tsx` - Main login component
  - `GoogleLoginButton.tsx` - Google OAuth button
  - `MagicLinkForm.tsx` - Email magic link form
- **Auth Pages**
  - `/login` - Login page
  - `/signup` - Signup page
  - `/auth/callback` - OAuth callback handler
  - `/dashboard` - Protected dashboard page
- **Auth Context** (`apps/web/src/providers/AuthProvider.tsx`)
  - `useAuth()` hook for accessing user state
  - Automatic session management
- **Middleware** (`apps/web/src/middleware.ts`)
  - Protects `/dashboard` routes
  - Redirects logic for authenticated/unauthenticated users

## Setup Instructions

### Step 1: Start Supabase Local Development

```bash
cd /Users/ankushkumar/Code/billingos
supabase start
```

This will start local Supabase services:
- PostgreSQL: `postgresql://postgres:postgres@127.0.0.1:54322/postgres`
- Supabase API: `http://127.0.0.1:54321`
- Studio UI: `http://127.0.0.1:54323`

### Step 2: Apply Database Migrations

```bash
supabase db reset
```

This will:
- Reset the database
- Apply all migrations (create `users` table, RLS policies, triggers)

### Step 3: Configure Google OAuth (Required for Google Sign-In)

#### 3.1 Create Google OAuth App

1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Create a new project or select existing
3. Enable **Google+ API**
4. Go to **Credentials** → **Create Credentials** → **OAuth 2.0 Client ID**
5. Application type: **Web application**
6. Authorized redirect URIs:
   - Local dev: `http://127.0.0.1:54321/auth/v1/callback`
   - Production: `https://your-supabase-url.supabase.co/auth/v1/callback`
7. Copy **Client ID** and **Client Secret**

#### 3.2 Enable in Supabase

```bash
# Option 1: Via Supabase Studio
# Go to http://127.0.0.1:54323
# Authentication → Providers → Google
# Enable and add Client ID and Client Secret

# Option 2: Via config.toml
# Edit supabase/config.toml
```

Add to `supabase/config.toml`:

```toml
[auth.external.google]
enabled = true
client_id = "your-google-client-id.apps.googleusercontent.com"
secret = "your-google-client-secret"
redirect_uri = "http://127.0.0.1:54321/auth/v1/callback"
```

Then restart Supabase:

```bash
supabase stop
supabase start
```

### Step 4: Start Backend (NestJS)

```bash
cd apps/api
pnpm run dev
```

Backend will run on `http://localhost:3001`

### Step 5: Start Frontend (Next.js)

```bash
cd apps/web
pnpm run dev
```

Frontend will run on `http://localhost:3000`

## Testing the Auth Flow

### Test 1: Magic Link Login

1. Go to `http://localhost:3000/login`
2. Enter your email address
3. Click "Login"
4. Check your email (or Supabase Inbucket at `http://127.0.0.1:54324`)
5. Click the magic link
6. You should be redirected to `/dashboard`

### Test 2: Google OAuth Login

1. Go to `http://localhost:3000/login`
2. Click "Continue with Google"
3. You'll be redirected to Google login
4. After authentication, you'll be redirected back to `/dashboard`

### Test 3: Protected Routes

1. **While logged out**: Try to access `http://localhost:3000/dashboard`
   - Should redirect to `/login`
2. **While logged in**: Try to access `http://localhost:3000/login`
   - Should redirect to `/dashboard`

### Test 4: API Authentication

```bash
# 1. Login and get access token from browser
# Open browser console on /dashboard
# Run: await supabase.auth.getSession()
# Copy the access_token

# 2. Test protected API endpoint
curl http://localhost:3001/users/me \
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN"

# Should return your user profile
```

### Test 5: Sign Out

1. On `/dashboard`, click "Sign Out"
2. Should redirect to `/login`
3. Try accessing `/dashboard` again
4. Should redirect to `/login` (not authenticated)

## Environment Variables

### Frontend (`.env`)

```bash
NEXT_PUBLIC_API_URL=http://localhost:3001
NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:54321
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0
```

### Backend (`.env`)

```bash
PORT=3001
NODE_ENV=development
DATABASE_URL=postgresql://postgres:postgres@127.0.0.1:54322/postgres
SUPABASE_URL=http://127.0.0.1:54321
SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0
SUPABASE_SERVICE_ROLE_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU
SUPABASE_JWT_SECRET=super-secret-jwt-token-with-at-least-32-characters-long
APP_URL=http://localhost:3000
API_URL=http://localhost:3001
```

## File Structure

```
billingos/
├── supabase/
│   ├── migrations/
│   │   ├── 20251230200855_create_users_table.sql
│   │   └── 20251230201011_enable_rls_policies.sql
│   └── config.toml
├── apps/
│   ├── api/                          # NestJS Backend
│   │   └── src/
│   │       ├── auth/                 # Auth module
│   │       │   ├── auth.module.ts
│   │       │   ├── auth.service.ts
│   │       │   ├── strategies/
│   │       │   │   └── jwt.strategy.ts
│   │       │   ├── guards/
│   │       │   │   └── jwt-auth.guard.ts
│   │       │   └── decorators/
│   │       │       ├── public.decorator.ts
│   │       │       └── current-user.decorator.ts
│   │       ├── user/                 # User module
│   │       │   ├── user.module.ts
│   │       │   ├── user.service.ts
│   │       │   ├── user.controller.ts
│   │       │   └── dto/
│   │       │       └── user.dto.ts
│   │       └── supabase/             # Supabase module
│   │           ├── supabase.module.ts
│   │           └── supabase.service.ts
│   └── web/                          # Next.js Frontend
│       └── src/
│           ├── app/
│           │   ├── (auth)/
│           │   │   ├── login/
│           │   │   │   └── page.tsx
│           │   │   └── signup/
│           │   │       └── page.tsx
│           │   ├── auth/
│           │   │   └── callback/
│           │   │       └── route.ts
│           │   ├── dashboard/
│           │   │   └── page.tsx
│           │   ├── layout.tsx
│           │   └── middleware.ts
│           ├── components/
│           │   └── auth/
│           │       ├── Login.tsx
│           │       ├── GoogleLoginButton.tsx
│           │       └── MagicLinkForm.tsx
│           ├── lib/
│           │   └── supabase/
│           │       ├── client.ts
│           │       ├── server.ts
│           │       └── middleware.ts
│           └── providers/
│               └── AuthProvider.tsx
```

## Common Issues & Solutions

### Issue: Google OAuth not working

**Solution**:
1. Ensure Google OAuth is enabled in Supabase config
2. Check that Client ID and Secret are correct
3. Verify redirect URI matches exactly (including http vs https)
4. Restart Supabase after config changes

### Issue: Magic link not sending

**Solution**:
1. Check Supabase Inbucket: `http://127.0.0.1:54324`
2. Emails in local dev go to Inbucket, not real email
3. For production, configure SMTP in Supabase

### Issue: "User not found" error on API

**Solution**:
1. Ensure migrations are applied: `supabase db reset`
2. Check that user exists in `public.users` table
3. Verify JWT token is valid
4. Check that SUPABASE_JWT_SECRET matches across frontend/backend

### Issue: Redirect loop on login

**Solution**:
1. Clear browser cookies
2. Check middleware.ts logic
3. Ensure returnTo parameter is being passed correctly

## Next Steps

### 1. Add GitHub OAuth (Optional)
- Follow same process as Google OAuth
- Create GitHub OAuth App
- Enable in Supabase config
- Create GitHubLoginButton component (similar to Google)

### 2. Add Onboarding Flow
- Create organization creation flow
- Collect user information
- Set up Stripe Connect accounts

### 3. Email Templates
- Customize magic link email template
- Add welcome email
- Password reset (if adding email/password auth)

### 4. Production Deployment
- Set up Supabase project at supabase.com
- Update environment variables
- Configure production OAuth redirect URLs
- Set up custom domain

## Architecture Decisions

### Why Supabase Auth vs Custom?

**Chosen**: Supabase Auth

**Reasons**:
- Built-in OAuth providers (Google, GitHub, etc.)
- Built-in magic link functionality
- Secure session management
- JWT tokens for API authentication
- Less code to maintain
- Security best practices out of the box

**Trade-offs**:
- Less control over auth flow
- Vendor lock-in (can migrate if needed)

### Database Schema

**Approach**: `auth.users` + `public.users`

- `auth.users` - Supabase managed, handles authentication
- `public.users` - App-specific data (stripe_customer_id, meta, etc.)
- Triggers auto-sync between the two

This gives us the best of both worlds: Supabase manages auth security, we manage app data.

## API Endpoints

### Public Endpoints
(No authentication required)

None currently - all auth is handled by Supabase

### Protected Endpoints
(Require `Authorization: Bearer <token>` header)

- `GET /users/me` - Get current user profile
- `PUT /users/me` - Update current user profile
- `PUT /users/me/accept-terms` - Accept terms of service

## Security Features

✅ **Row Level Security (RLS)** - Users can only access their own data
✅ **JWT Validation** - All API requests validated with Supabase JWT
✅ **Secure Cookies** - HttpOnly, Secure, SameSite cookies
✅ **CSRF Protection** - Built into Supabase Auth
✅ **Session Refresh** - Automatic token refresh
✅ **Password Hashing** - Handled by Supabase (bcrypt)

## Performance Considerations

- **Client-side auth state** - Cached in React context
- **Middleware** - Validates sessions on protected routes
- **Database indexes** - On email, stripe_customer_id
- **Connection pooling** - Supabase handles automatically

## Monitoring & Debugging

### View Logs

```bash
# Supabase logs
supabase logs

# Backend logs
cd apps/api && pnpm run dev

# Frontend logs
# Open browser console
```

### Database Access

```bash
# Via Supabase Studio
open http://127.0.0.1:54323

# Via psql
psql postgresql://postgres:postgres@127.0.0.1:54322/postgres
```

### Inspect Auth State

```javascript
// In browser console on any page
const supabase = createClient()
const { data } = await supabase.auth.getSession()
console.log(data)
```

## Support

For issues:
1. Check this guide
2. Check Supabase docs: https://supabase.com/docs/guides/auth
3. Check NestJS Passport docs: https://docs.nestjs.com/security/authentication
4. Open GitHub issue

---

**Authentication System Status**: ✅ Complete and Ready for Testing

**Next Priority**: Onboarding Flow + Stripe Integration

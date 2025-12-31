# Quick Start: Testing BillingOS Authentication

## Prerequisites
- Node.js 18+ installed
- pnpm installed
- Supabase CLI installed (`brew install supabase/tap/supabase` on Mac)

## Start All Services (5 Minutes)

### Terminal 1: Start Supabase
```bash
cd /Users/ankushkumar/Code/billingos
supabase start
# Wait for services to start...
supabase db reset  # Apply migrations
```

### Terminal 2: Start Backend
```bash
cd /Users/ankushkumar/Code/billingos/apps/api
pnpm install  # If not done yet
pnpm run dev
# Backend running on http://localhost:3001
```

### Terminal 3: Start Frontend
```bash
cd /Users/ankushkumar/Code/billingos/apps/web
pnpm install  # If not done yet
pnpm run dev
# Frontend running on http://localhost:3000
```

## Test Magic Link Login (No OAuth Setup Needed)

1. Open `http://localhost:3000/login`
2. Enter any email (e.g., `test@example.com`)
3. Click "Login"
4. Open Supabase Inbucket: `http://127.0.0.1:54324`
5. Find your email and click the login link
6. You should be redirected to `/dashboard` and see your user info!

## Configure Google OAuth (Optional, ~10 Minutes)

### Step 1: Create Google OAuth App
1. Go to https://console.cloud.google.com/
2. Create new project (or select existing)
3. Navigate to: **APIs & Services** → **Credentials**
4. Click **Create Credentials** → **OAuth 2.0 Client ID**
5. Application type: **Web application**
6. Name: `BillingOS Local Dev`
7. Authorized redirect URIs:
   - Add: `http://127.0.0.1:54321/auth/v1/callback`
8. Click **Create**
9. Copy **Client ID** and **Client Secret**

### Step 2: Configure Supabase
```bash
# Edit config file
code /Users/ankushkumar/Code/billingos/supabase/config.toml
```

Find the `[auth.external.google]` section and update:

```toml
[auth.external.google]
enabled = true
client_id = "YOUR_CLIENT_ID.apps.googleusercontent.com"
secret = "YOUR_CLIENT_SECRET"
redirect_uri = "http://127.0.0.1:54321/auth/v1/callback"
```

### Step 3: Restart Supabase
```bash
cd /Users/ankushkumar/Code/billingos
supabase stop
supabase start
```

### Step 4: Test Google Login
1. Go to `http://localhost:3000/login`
2. Click "Continue with Google"
3. Authenticate with your Google account
4. You'll be redirected to `/dashboard`!

## Verify Everything Works

### ✅ Checklist

- [ ] Magic link login works
- [ ] Google OAuth login works (if configured)
- [ ] Dashboard shows user information
- [ ] Sign out button works
- [ ] Accessing `/dashboard` while logged out redirects to `/login`
- [ ] Accessing `/login` while logged in redirects to `/dashboard`
- [ ] API endpoint `GET /users/me` returns user data (test in browser console)

### Test API Endpoint

Open browser console on `/dashboard` and run:

```javascript
const response = await fetch('http://localhost:3001/users/me', {
  headers: {
    'Authorization': `Bearer ${(await supabase.auth.getSession()).data.session.access_token}`
  }
});
const user = await response.json();
console.log(user);
```

## Troubleshooting

### "Connection refused" on frontend
- Make sure frontend is running on port 3000
- Check if another app is using port 3000
- Try: `PORT=3000 pnpm dev`

### "Connection refused" on backend
- Make sure backend is running on port 3001
- Check if NestJS started without errors
- Check `.env` file exists in `apps/api/`

### "Database connection failed"
- Make sure Supabase is running: `supabase status`
- If not: `supabase start`
- Check DATABASE_URL in `apps/api/.env`

### "User not found" after login
- Run migrations: `supabase db reset`
- Check if `public.users` table exists in Studio
- Verify triggers are working

### Magic link not working
- Check Inbucket: `http://127.0.0.1:54324`
- In production, you need to configure SMTP

### Google OAuth not working
- Double-check Client ID and Secret in `config.toml`
- Verify redirect URI is exactly `http://127.0.0.1:54321/auth/v1/callback`
- Restart Supabase after config changes
- Check browser console for errors

## Useful Commands

```bash
# View Supabase status
supabase status

# View Supabase logs
supabase logs

# Reset database
supabase db reset

# Create new migration
supabase migration new <name>

# Stop Supabase
supabase stop

# Restart everything
supabase stop && supabase start
```

## Access Points

| Service | URL |
|---------|-----|
| Frontend | http://localhost:3000 |
| Backend API | http://localhost:3001 |
| Supabase API | http://127.0.0.1:54321 |
| Supabase Studio | http://127.0.0.1:54323 |
| Inbucket (Emails) | http://127.0.0.1:54324 |

## What's Next?

Once auth is working:

1. **Add more auth methods**: GitHub OAuth, Apple Sign In
2. **Build onboarding flow**: Organization creation, user profile
3. **Integrate Stripe**: Customer creation, payment methods
4. **Add user settings**: Profile editing, preferences
5. **Build actual dashboard**: Billing data, analytics, etc.

## Need Help?

See full documentation: `/Users/ankushkumar/Code/billingos/docs/AUTH_SETUP.md`

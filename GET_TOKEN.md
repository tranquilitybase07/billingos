# Get Supabase Session Token for API Testing

## Quick Method (Browser Console)

### Option 1: One-liner (Easiest)

1. Login to your app at http://localhost:3000
2. Open browser console (F12 or Cmd+Option+I / Ctrl+Shift+I)
3. Paste this one-liner and press Enter:

```javascript
copy(JSON.parse(localStorage.getItem(Object.keys(localStorage).find(k => k.startsWith('sb-') && k.endsWith('-auth-token')))).access_token); console.log('✅ Token copied to clipboard!');
```

The token will be automatically copied to your clipboard!

### Option 2: Detailed Token Info

Paste this for more information about your session:

```javascript
(function() {
  const authKey = Object.keys(localStorage).find(k => k.startsWith('sb-') && k.endsWith('-auth-token'));
  const authData = JSON.parse(localStorage.getItem(authKey));
  console.log('📋 Access Token:', authData.access_token);
  console.log('👤 User ID:', authData.user?.id);
  console.log('📧 Email:', authData.user?.email);
  console.log('⏰ Expires at:', new Date(authData.expires_at * 1000).toLocaleString());
  console.log('⏱️  Time remaining:', Math.round((authData.expires_at * 1000 - Date.now()) / 1000 / 60), 'minutes');
  return authData.access_token;
})();
```

### Option 3: Using Helper Script

Load the helper script:

```javascript
// Fetch and run the helper script
fetch('/get-token.js').then(r => r.text()).then(eval);
```

Or directly visit: http://localhost:3000/get-token.js and copy the code into console.

## Manual Method (DevTools)

1. Login to http://localhost:3000
2. Open DevTools (F12)
3. Go to **Application** tab
4. Click **Local Storage** > `http://localhost:3000`
5. Find the key starting with `sb-` and ending with `-auth-token`
6. Click on the value to expand it
7. Look for `access_token` and copy its value

## Using the Token

### Update your .http files

Once you have the token, update these files:

- `apps/api/requests/users.http`
- `apps/api/requests/organizations.http`
- `apps/api/requests/accounts.http`

Replace the `@authToken` value at the top of each file:

```http
@authToken = YOUR_COPIED_TOKEN_HERE
```

### Test the token

Run this in console to verify it works:

```javascript
fetch('http://localhost:3001/users/me', {
  headers: {
    'Authorization': 'Bearer ' + JSON.parse(localStorage.getItem(Object.keys(localStorage).find(k => k.startsWith('sb-') && k.endsWith('-auth-token')))).access_token
  }
}).then(r => r.json()).then(console.log);
```

You should see your user profile data!

## Token Expiration

- Access tokens expire after **1 hour** by default
- When expired, you'll get a `401 Unauthorized` error
- Just run the script again to get a fresh token
- Supabase automatically refreshes tokens in the background

## Troubleshooting

### "Cannot read property 'access_token' of null"

You're not logged in. Go to http://localhost:3000 and login first.

### "401 Unauthorized" when testing API

Your token has expired. Get a fresh one using the script above.

### Token looks incomplete

Make sure you copied the entire token. It should be a very long string (JWT format).

## Security Note

⚠️ **Never commit tokens to Git or share them publicly!**

The `.http` files are in `.gitignore` by default to prevent accidental commits.

## References

- [Supabase User Sessions Docs](https://supabase.com/docs/guides/auth/sessions)
- [JavaScript getSession API](https://supabase.com/docs/reference/javascript/auth-getsession)

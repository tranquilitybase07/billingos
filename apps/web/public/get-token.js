/**
 * Helper script to get Supabase session token from browser console
 *
 * Usage:
 * 1. Open your app at http://localhost:3000
 * 2. Login to your account
 * 3. Open browser console (F12 or Cmd+Option+I)
 * 4. Copy and paste this entire file into the console
 * 5. OR just run: copy(await getSupabaseToken())
 */

async function getSupabaseToken() {
  try {
    // Try to get session from localStorage (Supabase v2 format)
    const keys = Object.keys(localStorage);
    const authKey = keys.find(key => key.startsWith('sb-') && key.endsWith('-auth-token'));

    if (authKey) {
      const authData = JSON.parse(localStorage.getItem(authKey));

      if (authData && authData.access_token) {
        console.log('✅ Token found in localStorage');
        console.log('\n📋 Access Token:');
        console.log(authData.access_token);
        console.log('\n👤 User ID:', authData.user?.id);
        console.log('\n📧 Email:', authData.user?.email);
        console.log('\n⏰ Expires at:', new Date(authData.expires_at * 1000).toLocaleString());
        console.log('\n💾 Full session data:');
        console.log(authData);

        return authData.access_token;
      }
    }

    // Fallback: Try to get from window.supabase if available
    if (window.supabase) {
      console.log('⚠️  Trying to get session from window.supabase...');
      const { data: { session }, error } = await window.supabase.auth.getSession();

      if (error) {
        console.error('❌ Error getting session:', error);
        return null;
      }

      if (session) {
        console.log('✅ Token found via getSession()');
        console.log('\n📋 Access Token:');
        console.log(session.access_token);
        console.log('\n👤 User ID:', session.user?.id);
        console.log('\n📧 Email:', session.user?.email);
        console.log('\n⏰ Expires at:', new Date(session.expires_at * 1000).toLocaleString());

        return session.access_token;
      }
    }

    console.error('❌ No token found. Make sure you are logged in.');
    return null;

  } catch (error) {
    console.error('❌ Error:', error);
    return null;
  }
}

// Auto-run and copy to clipboard
(async () => {
  console.log('🔍 Searching for Supabase session token...\n');
  const token = await getSupabaseToken();

  if (token) {
    // Try to copy to clipboard
    if (navigator.clipboard) {
      try {
        await navigator.clipboard.writeText(token);
        console.log('\n✅ Token copied to clipboard!');
        console.log('📝 Paste it into your .http files');
      } catch {
        console.log('\n⚠️  Could not copy to clipboard automatically');
        console.log('📝 Please copy the token manually from above');
      }
    }
  } else {
    console.log('\n💡 Tips:');
    console.log('1. Make sure you are logged in');
    console.log('2. Check if you are on http://localhost:3000');
    console.log('3. Try refreshing the page and run this script again');
  }
})();

import { createClient } from '@/lib/supabase/server';
import { NextRequest, NextResponse } from 'next/server';

const ENVIRONMENT_COOKIE = 'billingos-environment'
const PROD_API_URL = process.env.NEXT_PUBLIC_API_URL

export async function GET(request: NextRequest) {
  const requestUrl = new URL(request.url);
  const code = requestUrl.searchParams.get('code');
  const returnTo = requestUrl.searchParams.get('returnTo') || '/dashboard';
  const targetEnv = requestUrl.searchParams.get('env') || 'production';
  const origin = requestUrl.origin;

  if (code) {
    const supabase = await createClient();
    const { data: { user }, error } = await supabase.auth.exchangeCodeForSession(code);

    if (error) {
      console.error('Error exchanging code for session:', error);
      return NextResponse.redirect(`${origin}/login?error=auth_failed`);
    }

    // If user authenticated via OAuth and wants sandbox, sync them
    if (targetEnv === 'sandbox' && user) {
      try {
        const { data: { session } } = await supabase.auth.getSession();

        if (session) {
          const prodApiUrl = PROD_API_URL;
          const syncResponse = await fetch(`${prodApiUrl}/sandbox/sync-user`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${session.access_token}`,
            },
            body: JSON.stringify({ userId: user.id }),
          });

          if (syncResponse.ok) {
            const redirectUrl = new URL(returnTo, origin);
            const response = NextResponse.redirect(redirectUrl);
            response.cookies.delete('billingos_onboarding_step');
            // Set environment preference via cookie so SSR can read it
            response.cookies.set(ENVIRONMENT_COOKIE, 'sandbox', {
              httpOnly: false,
              secure: process.env.NODE_ENV === 'production',
              sameSite: 'lax',
              maxAge: 60 * 60 * 24 * 30, // 30 days
              path: '/',
            });
            return response;
          }
        }
      } catch (syncError) {
        console.error('Failed to sync OAuth user to sandbox:', syncError);
        // Fall through to default production redirect
      }
    }
  }

  const response = NextResponse.redirect(`${origin}${returnTo}`);
  response.cookies.delete('billingos_onboarding_step');
  return response;
}

import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

const LAST_VISITED_ORG_COOKIE = "billingos_last_org";
const ENVIRONMENT_COOKIE = "billingos-environment";
const ONBOARDING_STEP_COOKIE = "billingos_onboarding_step";

const BETA_PENDING_PATH = "/beta-pending";

function isPrivateBetaEnabled(): boolean {
  return process.env.PRIVATE_BETA_ENABLED?.trim().toLowerCase() === "true";
}

export async function updateSession(request: NextRequest) {
  let supabaseResponse = NextResponse.next({
    request,
  });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value),
          );
          supabaseResponse = NextResponse.next({
            request,
          });
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options),
          );
        },
      },
    },
  );

  // IMPORTANT: Avoid writing any logic between createServerClient and
  // supabase.auth.getUser(). A simple mistake could make it very hard to debug
  // issues with users being randomly logged out.

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const isAuthPage =
    request.nextUrl.pathname.startsWith("/login") ||
    request.nextUrl.pathname.startsWith("/signup") ||
    request.nextUrl.pathname.startsWith("/forgot-password") ||
    request.nextUrl.pathname.startsWith("/auth");
  const isDashboard = request.nextUrl.pathname.startsWith("/dashboard");
  const isOnboarding = request.nextUrl.pathname.startsWith("/onboarding");
  const isBetaPending = request.nextUrl.pathname.startsWith(BETA_PENDING_PATH);
  const onboardingStep = request.cookies.get(ONBOARDING_STEP_COOKIE)?.value;
  const hasOnboarded = onboardingStep === "complete";

  if (!user && isDashboard) {
    // Redirect to login if accessing dashboard without auth
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    return NextResponse.redirect(url);
  }

  // Private beta gate: pull access_status for the signed-in user and route
  // pending/denied accounts to /beta-pending. Cost is one row read per
  // authenticated request while the flag is on; the gate disappears entirely
  // when PRIVATE_BETA_ENABLED is unset/false.
  if (user && isPrivateBetaEnabled()) {
    const { data: profile } = await supabase
      .from("users")
      .select("access_status, is_admin")
      .eq("id", user.id)
      .maybeSingle();

    // Fail closed: if we can't determine the user's status, treat them as
    // pending. Otherwise a transient DB error would silently bypass the gate.
    const isApproved =
      !!profile && (profile.is_admin || profile.access_status === "approved");

    if (!isApproved && !isBetaPending && !isAuthPage) {
      const url = request.nextUrl.clone();
      url.pathname = BETA_PENDING_PATH;
      return NextResponse.redirect(url);
    }

    if (isApproved && isBetaPending) {
      const url = request.nextUrl.clone();
      url.pathname = hasOnboarded ? "/dashboard" : "/onboarding";
      return NextResponse.redirect(url);
    }
  } else if (user && isBetaPending) {
    // Gate is off — nobody should hang out on the pending page.
    const url = request.nextUrl.clone();
    url.pathname = hasOnboarded ? "/dashboard" : "/onboarding";
    return NextResponse.redirect(url);
  }

  if (user && isAuthPage) {
    // User is authenticated but on auth page
    // If not onboarded yet, send to onboarding; otherwise dashboard
    const url = request.nextUrl.clone();
    url.pathname = hasOnboarded ? "/dashboard" : "/onboarding";
    return NextResponse.redirect(url);
  }

  // If logged-in user hits /dashboard directly without completing onboarding,
  // intercept and send to onboarding first
  if (user && isDashboard && !hasOnboarded) {
    const url = request.nextUrl.clone();
    url.pathname = "/onboarding";
    return NextResponse.redirect(url);
  }

  // Redirect unauthenticated users away from onboarding
  if (!user && isOnboarding) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    return NextResponse.redirect(url);
  }

  // Redirect unauthenticated users away from beta-pending
  if (!user && isBetaPending) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    return NextResponse.redirect(url);
  }

  // Track last visited organization per environment for smart redirects
  // Match pattern: /dashboard/[org-slug] or /dashboard/[org-slug]/...
  const orgMatch = request.nextUrl.pathname.match(/^\/dashboard\/([^\/]+)/);
  if (user && orgMatch && orgMatch[1] !== "create") {
    const orgSlug = orgMatch[1];
    const env = request.cookies.get(ENVIRONMENT_COOKIE)?.value || "production";
    const envCookieName = `${LAST_VISITED_ORG_COOKIE}_${env}`;

    // Set env-specific cookie to remember last visited org per environment
    supabaseResponse.cookies.set(envCookieName, orgSlug, {
      path: "/",
      maxAge: 60 * 60 * 24 * 365, // 1 year
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
    });
  }

  // IMPORTANT: You *must* return the supabaseResponse object as it is. If you're
  // creating a new response object with NextResponse.next() make sure to:
  // 1. Pass the request in it, like so:
  //    const myNewResponse = NextResponse.next({ request })
  // 2. Copy over the cookies, like so:
  //    myNewResponse.cookies.setAll(supabaseResponse.cookies.getAll())
  // 3. Change the myNewResponse object to fit your needs, but avoid changing
  //    the cookies!
  // 4. Finally:
  //    return myNewResponse
  // If this is not done, you may be causing the browser and server to go out
  // of sync and terminate the user's session prematurely!

  return supabaseResponse;
}

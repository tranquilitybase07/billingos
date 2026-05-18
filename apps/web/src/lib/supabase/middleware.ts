import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

const LAST_VISITED_ORG_COOKIE = "billingos_last_org";
const ENVIRONMENT_COOKIE = "billingos-environment";
const ONBOARDING_STEP_COOKIE = "billingos_onboarding_step";

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
    request.nextUrl.pathname.startsWith("/auth");
  const isDashboard = request.nextUrl.pathname.startsWith("/dashboard");
  const isOnboarding = request.nextUrl.pathname.startsWith("/onboarding");
  const onboardingStep = request.cookies.get(ONBOARDING_STEP_COOKIE)?.value;
  const hasOnboarded = onboardingStep === "complete";

  if (!user && isDashboard) {
    // Redirect to login if accessing dashboard without auth
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    return NextResponse.redirect(url);
  }

  if (user && isAuthPage) {
    // Honor returnTo when present (e.g. invite accept flow), else
    // route by onboarding state.
    const returnTo = request.nextUrl.searchParams.get("returnTo");
    const url = request.nextUrl.clone();
    url.search = "";
    if (returnTo && returnTo.startsWith("/")) {
      url.pathname = returnTo;
    } else {
      url.pathname = hasOnboarded ? "/dashboard" : "/onboarding";
    }
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

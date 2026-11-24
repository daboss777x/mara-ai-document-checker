import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import type { Database } from "@/lib/db/types";
import { getSupabaseEnv, isDemoMode } from "@/lib/env";
import { isStaffPath } from "@/lib/auth/routes";

function redirectToLogin(request: NextRequest, extra?: Record<string, string>) {
  const url = request.nextUrl.clone();
  url.pathname = "/login";
  url.search = "";
  url.searchParams.set("next", request.nextUrl.pathname + request.nextUrl.search);
  for (const [k, v] of Object.entries(extra ?? {})) url.searchParams.set(k, v);
  return NextResponse.redirect(url);
}

/** Header the middleware sets on demo requests (handy in screenshots / dev tools). */
export const DEMO_HEADER = "x-mara-demo";
/** The demo user the staff area runs as (fixtures in lib/demo). */
export const DEMO_STAFF_USER = "Rachel Kim";

/**
 * Demo mode (MARA_DEMO=1): no Supabase session needed. The staff area is let through as the
 * demo user, and /c/demo (Enoch Omunu's link) works. The data layer serves fixtures.
 * isDemoMode() throws when demo mode is refused in production, so this fails closed.
 */
function demoPassThrough(request: NextRequest) {
  const response = NextResponse.next({ request });
  response.headers.set(DEMO_HEADER, "1");
  return response;
}

/**
 * Refreshes the Supabase session cookie on every request and keeps signed-out
 * users out of the staff area.
 */
export async function updateSession(request: NextRequest) {
  if (isDemoMode()) return demoPassThrough(request);

  const env = getSupabaseEnv();
  const staff = isStaffPath(request.nextUrl.pathname);

  if (!env) {
    // Fail closed: without Supabase we can't know who the user is.
    return staff ? redirectToLogin(request, { error: "config" }) : NextResponse.next({ request });
  }

  let response = NextResponse.next({ request });

  const supabase = createServerClient<Database>(env.url, env.anonKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
        response = NextResponse.next({ request });
        cookiesToSet.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
      },
    },
  });

  // Do not put code between createServerClient and getUser(): it refreshes the session.
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (staff && !user) return redirectToLogin(request);

  return response;
}

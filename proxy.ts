// Next.js 16 "proxy" (formerly middleware): refresh the Supabase session cookie on
// every request and gate routes by sign-in state.
import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

const PUBLIC_PATHS = new Set(["/", "/join", "/login", "/auth/callback"]);

function isPublicPath(path: string) {
  return PUBLIC_PATHS.has(path) || path.startsWith("/auth/callback");
}

export async function proxy(request: NextRequest) {
  try {
    return await handleProxy(request);
  } catch {
    return NextResponse.next({ request });
  }
}

function hasSupabaseSessionCookie(request: NextRequest) {
  return request.cookies.getAll().some((c) => /^sb-.*-auth-token$/.test(c.name) || c.name.includes("auth-token"));
}

async function handleProxy(request: NextRequest) {
  const path = request.nextUrl.pathname;

  // Anonymous visitors on public pages: skip Supabase on the edge (avoids 500s when env/network misbehaves on Vercel previews).
  if (isPublicPath(path) && !hasSupabaseSessionCookie(request)) {
    return NextResponse.next({ request });
  }

  let response = NextResponse.next({ request });
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) return response; // pages show a configuration error instead

  const supabase = createServerClient(url, key, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        for (const { name, value } of cookiesToSet) request.cookies.set(name, value);
        response = NextResponse.next({ request });
        for (const { name, value, options } of cookiesToSet) response.cookies.set(name, value, options);
      },
    },
  });

  let signedIn = false;
  try {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    signedIn = Boolean(user);
  } catch {
    signedIn = false;
  }

  if (!signedIn && !isPublicPath(path)) {
    const to = request.nextUrl.clone();
    to.pathname = "/login";
    to.search = "";
    return NextResponse.redirect(to);
  }
  if (signedIn && (path === "/login" || path === "/join")) {
    const to = request.nextUrl.clone();
    to.pathname = "/dashboard";
    to.search = "";
    return NextResponse.redirect(to);
  }
  return response;
}

export const config = {
  // API routes do their own auth (session OR cron secret); skip static assets.
  matcher: ["/((?!api/|_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|ico)$).*)"],
};

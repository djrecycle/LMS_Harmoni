import { NextResponse, type NextRequest } from "next/server";
import { getSessionCookie } from "better-auth/cookies";

/**
 * First layer only (fast, no DB):
 *  - /teacher and /student without a session cookie -> redirect to /login.
 *    The real role check lives in the layouts and in every server action (requireTeacher / requireStudent).
 *  - Every page gets an `x-pathname` request header so the visitor tracker (src/lib/traffic.ts) knows the page.
 */
export function proxy(req: NextRequest) {
  const { pathname } = req.nextUrl;
  if ((pathname.startsWith("/teacher") || pathname.startsWith("/student")) && !getSessionCookie(req)) {
    const url = req.nextUrl.clone();
    url.pathname = "/login";
    url.search = "";
    return NextResponse.redirect(url);
  }
  const headers = new Headers(req.headers);
  headers.set("x-pathname", pathname);
  return NextResponse.next({ request: { headers } });
}

// Pages and API routes; not Next's build files or static files from /public.
export const config = {
  matcher: ["/((?!_next/|favicon\\.ico|audio/|.*\\.(?:png|jpe?g|gif|svg|ico|webp|mp3|wav|ogg|js|css|txt|xml|webmanifest|woff2?)$).*)"],
};

import { NextResponse, type NextRequest } from "next/server";
import { getSessionCookie } from "better-auth/cookies";

/**
 * First layer only (fast, no DB): no session cookie -> redirect to /login.
 *  The real role check lives in the layouts and in every server action (requireTeacher / requireStudent).
 */
export function proxy(req: NextRequest) {
  if (!getSessionCookie(req)) {
    const url = req.nextUrl.clone();
    url.pathname = "/login";
    url.search = "";
    return NextResponse.redirect(url);
  }
  return NextResponse.next();
}

export const config = { matcher: ["/teacher/:path*", "/student/:path*"] };

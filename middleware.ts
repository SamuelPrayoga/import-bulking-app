import { NextRequest, NextResponse } from "next/server";
import { SESSION_COOKIE_NAME, isValidSessionToken } from "./lib/session";

// /dashboard-publik and everything under /api/public-status/* are the deliberate exception to
// "everything is gated behind login" below: a PIC self-service status lookup with no admin
// session, gated instead by a captcha + their own email (see lib/db.ts's findSubmissionsByEmail)
// and returning only aggregate counts/categories or (for /download, after re-checking ownership)
// that one submission's own clean file — never another PIC's row-level agent name or NIK.
// /api/cron/auto-pull is protected by its own CRON_SECRET bearer-token check (not a session
// cookie — the caller is GitHub Actions, not a logged-in browser), so it must bypass this gate too.
const PUBLIC_EXACT_PATHS = ["/login", "/api/login", "/dashboard-publik", "/api/cron/auto-pull"];
const PUBLIC_PATH_PREFIXES = ["/api/public-status"];

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  if (PUBLIC_EXACT_PATHS.some((p) => pathname === p)) return NextResponse.next();
  if (PUBLIC_PATH_PREFIXES.some((p) => pathname === p || pathname.startsWith(`${p}/`))) return NextResponse.next();

  const token = request.cookies.get(SESSION_COOKIE_NAME)?.value;
  if (await isValidSessionToken(token)) return NextResponse.next();

  if (pathname.startsWith("/api/")) {
    return NextResponse.json({ error: "Belum login." }, { status: 401 });
  }

  const loginUrl = new URL("/login", request.url);
  loginUrl.searchParams.set("next", pathname);
  return NextResponse.redirect(loginUrl);
}

// Excludes Next internals and static assets — everything else (all pages, all /api/* routes) is
// gated, since every page here can surface real NIK/phone-number data and every /api/* route can
// export it as a file. icon.svg (app/icon.svg, Next's file-based favicon convention) must stay
// excluded too — otherwise a signed-out visitor's favicon request gets redirected to /login and
// the browser tab shows a broken icon instead of the actual one.
export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|icon.svg).*)"],
};

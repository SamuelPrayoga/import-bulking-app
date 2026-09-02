import { NextRequest, NextResponse } from "next/server";
import { SESSION_COOKIE_NAME } from "../../../lib/session";
import { recordAuditEvent } from "../../../lib/auditLog";

export async function POST(request: NextRequest) {
  const ip = request.headers.get("x-forwarded-for") ?? "local";
  // Single shared admin account, no identity embedded in the session token — the configured
  // ADMIN_EMAIL is the only account that could have been logged in to begin with.
  await recordAuditEvent("logout", process.env.ADMIN_EMAIL ?? "-", ip, "Logout");

  const response = NextResponse.json({ ok: true });
  response.cookies.set(SESSION_COOKIE_NAME, "", { path: "/", maxAge: 0 });
  return response;
}

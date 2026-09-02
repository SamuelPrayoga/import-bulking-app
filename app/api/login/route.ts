import { NextRequest, NextResponse } from "next/server";
import { clearFailedAttempts, isLockedOut, recordFailedAttempt, verifyCredentials } from "../../../lib/auth";
import { SESSION_COOKIE_NAME, SESSION_TTL_MS, createSessionToken } from "../../../lib/session";
import { recordAuditEvent } from "../../../lib/auditLog";

export async function POST(request: NextRequest) {
  const ip = request.headers.get("x-forwarded-for") ?? "local";

  if (isLockedOut(ip)) {
    await recordAuditEvent("login_locked_out", "-", ip, "Percobaan login diblokir karena terlalu banyak gagal berturut-turut");
    return NextResponse.json(
      { error: "Terlalu banyak percobaan gagal. Coba lagi dalam 15 menit." },
      { status: 429 }
    );
  }

  const body = await request.json().catch(() => null);
  const email = typeof body?.email === "string" ? body.email : "";
  const password = typeof body?.password === "string" ? body.password : "";

  if (!email || !password || !verifyCredentials(email, password)) {
    recordFailedAttempt(ip);
    await recordAuditEvent("login_failed", email || "-", ip, "Email atau password salah");
    // Deliberately generic — never reveal whether the email or the password was the wrong part.
    return NextResponse.json({ error: "Email atau password salah." }, { status: 401 });
  }

  clearFailedAttempts(ip);
  await recordAuditEvent("login_success", email, ip, "Login berhasil");

  const response = NextResponse.json({ ok: true });
  response.cookies.set(SESSION_COOKIE_NAME, await createSessionToken(), {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: SESSION_TTL_MS / 1000,
  });
  return response;
}

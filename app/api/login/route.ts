import { NextRequest, NextResponse } from "next/server";
import { clearFailedAttempts, isLockedOut, recordFailedAttempt, verifyCredentials } from "../../../lib/auth";
import { SESSION_COOKIE_NAME, SESSION_TTL_MS, createSessionToken } from "../../../lib/session";

export async function POST(request: NextRequest) {
  const ip = request.headers.get("x-forwarded-for") ?? "local";

  if (isLockedOut(ip)) {
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
    // Deliberately generic — never reveal whether the email or the password was the wrong part.
    return NextResponse.json({ error: "Email atau password salah." }, { status: 401 });
  }

  clearFailedAttempts(ip);

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

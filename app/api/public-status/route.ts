import { NextRequest, NextResponse } from "next/server";
import { findSubmissionsByEmail } from "../../../lib/db";
import { isLockedOut, recordFailedAttempt, clearFailedAttempts } from "../../../lib/auth";
import { verifyCaptchaAnswer } from "../../../lib/captcha";
import { toPublicSubmissionStatus, type PublicSubmissionStatus } from "../../../lib/publicStatus";

/**
 * Public (no-login) status lookup for a PIC to check their own submission(s) by email — gated by
 * a captcha (lib/captcha.ts) rather than a second identity field like a WA number, per explicit
 * product decision. No row-level agent name/NIK is ever returned here — only per-submission counts
 * and an error-category breakdown, the same one the WA recap uses. A matched submission's id IS
 * included so the client can request that one file via /api/public-status/download, which
 * independently re-checks the email owns that submission before releasing it.
 *
 * Rate-limited per IP via the same in-memory lockout lib/auth.ts already uses for login attempts:
 * a wrong captcha OR an email that matches nothing both count as a "failed attempt", capping
 * guessing at MAX_ATTEMPTS (5) tries before a LOCKOUT_MS (15min) cooldown. A real match always
 * clears that counter, so a legitimate PIC checking their own status repeatedly is never blocked.
 *
 * See also /api/public-status/by-token: the friction-free alternative for a PIC who followed the
 * magic link sent in their WA message, which needs neither email nor captcha.
 */
export async function POST(request: NextRequest) {
  const ip = request.headers.get("x-forwarded-for") ?? "local";
  const rateLimitKey = `public-status:${ip}`;

  if (isLockedOut(rateLimitKey)) {
    return NextResponse.json(
      { error: "Terlalu banyak percobaan. Silakan coba lagi dalam beberapa menit." },
      { status: 429 }
    );
  }

  const body = await request.json().catch(() => null);
  const email = typeof body?.email === "string" ? body.email : "";
  const captchaToken = typeof body?.captchaToken === "string" ? body.captchaToken : "";
  const captchaAnswer = typeof body?.captchaAnswer === "string" ? body.captchaAnswer : "";

  if (!email.trim()) {
    return NextResponse.json({ error: "Email wajib diisi." }, { status: 400 });
  }

  if (!(await verifyCaptchaAnswer(captchaToken, captchaAnswer))) {
    recordFailedAttempt(rateLimitKey);
    return NextResponse.json({ error: "Jawaban captcha salah atau kadaluarsa." }, { status: 400 });
  }

  const submissions = findSubmissionsByEmail(email);

  if (submissions.length === 0) {
    recordFailedAttempt(rateLimitKey);
    return NextResponse.json({ results: [] as PublicSubmissionStatus[] });
  }
  clearFailedAttempts(rateLimitKey);

  return NextResponse.json({ results: submissions.map(toPublicSubmissionStatus) });
}

import { NextRequest, NextResponse } from "next/server";
import { getReportRows, getSubmission } from "../../../../lib/db";
import { buildCleanSubmissionFile } from "../../../../lib/cleanExport";
import { reportToBuffer } from "../../../../lib/report";
import { isLockedOut, recordFailedAttempt, clearFailedAttempts } from "../../../../lib/auth";

/**
 * Public (no-login) download of one submission's clean, template-shaped file — only ever released
 * after independently re-checking that the given email actually owns that submission, so knowing
 * (or guessing) a submissionId alone never gets you someone else's file. Shares the same per-IP
 * lockout as /api/public-status: an ownership mismatch counts as a failed attempt too.
 */
export async function GET(request: NextRequest) {
  const ip = request.headers.get("x-forwarded-for") ?? "local";
  const rateLimitKey = `public-status:${ip}`;

  if (isLockedOut(rateLimitKey)) {
    return NextResponse.json(
      { error: "Terlalu banyak percobaan. Silakan coba lagi dalam beberapa menit." },
      { status: 429 }
    );
  }

  const submissionId = request.nextUrl.searchParams.get("submissionId") ?? "";
  const email = request.nextUrl.searchParams.get("email") ?? "";

  const submission = submissionId ? getSubmission(submissionId) : null;
  const ownsIt = submission && submission.email.trim().toLowerCase() === email.trim().toLowerCase();

  if (!ownsIt) {
    recordFailedAttempt(rateLimitKey);
    return NextResponse.json({ error: "Submission tidak ditemukan untuk email tersebut." }, { status: 404 });
  }
  clearFailedAttempts(rateLimitKey);

  const rows = getReportRows(submission.id);
  const workbook = buildCleanSubmissionFile(submission.fileProvinsi ?? "", rows);
  const buffer = await reportToBuffer(workbook);

  return new NextResponse(new Uint8Array(buffer), {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="data-bersih-${submission.id}.xlsx"`,
    },
  });
}

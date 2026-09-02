import { NextRequest, NextResponse } from "next/server";
import { getSubmission, setFollowUpStatus } from "../../../../../lib/db";
import { recordAuditEvent } from "../../../../../lib/auditLog";
import { markSheetRowDone } from "../../../../../lib/google";

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const submission = await getSubmission(id);
  if (!submission) {
    return NextResponse.json({ error: "Submission tidak ditemukan" }, { status: 404 });
  }

  const body = await request.json().catch(() => null);
  const followedUp = body?.followedUp === true;

  await setFollowUpStatus(id, followedUp);

  const ip = request.headers.get("x-forwarded-for") ?? "local";
  await recordAuditEvent(
    followedUp ? "follow_up_marked" : "follow_up_unmarked",
    process.env.ADMIN_EMAIL ?? "-",
    ip,
    `${submission.picName} (${submission.timestamp}), submission ${id}`
  );

  // Only ever written on the way TO followed-up, and only "Done" — never reverted on unmark, and
  // never any other value, to keep the chance of colliding with whatever else writes column K as
  // low as possible (see the note on markSheetRowDone). This is best-effort: a Sheets failure
  // (e.g. the service account not yet given Editor access) must not block the local follow-up
  // mark or the WA send the operator is already mid-flow on.
  let sheetStatusUpdated = false;
  let sheetUpdateError: string | null = null;
  if (followedUp && submission.sheetRowNumber !== null) {
    try {
      await markSheetRowDone(submission.sheetRowNumber);
      sheetStatusUpdated = true;
    } catch (err) {
      sheetUpdateError = err instanceof Error ? err.message : String(err);
      console.error(`Gagal update kolom K (Status) di Google Sheet untuk submission ${id}:`, sheetUpdateError);
    }
  }

  return NextResponse.json({ ok: true, followedUp, sheetStatusUpdated, sheetUpdateError });
}

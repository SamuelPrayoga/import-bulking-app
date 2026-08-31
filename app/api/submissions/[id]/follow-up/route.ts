import { NextRequest, NextResponse } from "next/server";
import { getSubmission, setFollowUpStatus } from "../../../../../lib/db";
import { recordAuditEvent } from "../../../../../lib/auditLog";

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const submission = getSubmission(id);
  if (!submission) {
    return NextResponse.json({ error: "Submission tidak ditemukan" }, { status: 404 });
  }

  const body = await request.json().catch(() => null);
  const followedUp = body?.followedUp === true;

  setFollowUpStatus(id, followedUp);

  const ip = request.headers.get("x-forwarded-for") ?? "local";
  recordAuditEvent(
    followedUp ? "follow_up_marked" : "follow_up_unmarked",
    process.env.ADMIN_EMAIL ?? "-",
    ip,
    `${submission.picName} (${submission.timestamp}), submission ${id}`
  );

  return NextResponse.json({ ok: true, followedUp });
}

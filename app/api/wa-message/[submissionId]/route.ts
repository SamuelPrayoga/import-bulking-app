import { NextResponse } from "next/server";
import { getSubmission, getSubmissionRows } from "../../../../lib/db";
import { buildWaLink, buildWaMessage } from "../../../../lib/waMessage";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ submissionId: string }> }
) {
  const { submissionId } = await params;
  const submission = getSubmission(submissionId);
  if (!submission) {
    return NextResponse.json({ error: "Submission tidak ditemukan" }, { status: 404 });
  }

  const rows = getSubmissionRows(submissionId);
  const text = buildWaMessage(submission, rows);
  const waLink = buildWaLink(submission.picWhatsapp, text);

  return NextResponse.json({ text, waLink });
}

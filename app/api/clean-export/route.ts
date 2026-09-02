import { NextRequest, NextResponse } from "next/server";
import { getReportRows, getSubmission } from "../../../lib/db";
import { buildCleanConsolidatedFile, buildCleanSubmissionFile, dedupeByNik } from "../../../lib/cleanExport";
import { reportToBuffer } from "../../../lib/report";
import { recordAuditEvent } from "../../../lib/auditLog";

export async function GET(request: NextRequest) {
  const submissionId = request.nextUrl.searchParams.get("submissionId") ?? undefined;
  const pendingOnly = request.nextUrl.searchParams.get("pending") === "1";
  // A pending submission is often a resubmission/correction of an earlier one still pending too —
  // only the "sheet pending" file feeds the destination CMS directly, so NIK must be unique there.
  const rows = pendingOnly
    ? dedupeByNik(await getReportRows(submissionId, { pendingOnly }))
    : await getReportRows(submissionId);

  const workbook = submissionId
    ? buildCleanSubmissionFile((await getSubmission(submissionId))?.fileProvinsi ?? "", rows)
    : buildCleanConsolidatedFile(rows);

  const buffer = await reportToBuffer(workbook);

  const ip = request.headers.get("x-forwarded-for") ?? "local";
  await recordAuditEvent(
    "clean_export_download",
    process.env.ADMIN_EMAIL ?? "-",
    ip,
    submissionId
      ? `Data bersih per submission (${submissionId})`
      : `Data bersih gabungan (${pendingOnly ? "sheet status Pending" : "semua submission"})`
  );

  const filename = submissionId
    ? `data-bersih-${submissionId}.xlsx`
    : `data-bersih-gabungan${pendingOnly ? "-pending" : ""}-${new Date().toISOString().slice(0, 10)}.xlsx`;

  return new NextResponse(new Uint8Array(buffer), {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${filename}"`,
    },
  });
}

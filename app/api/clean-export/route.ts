import { NextRequest, NextResponse } from "next/server";
import { getReportRows, getSubmission } from "../../../lib/db";
import { buildCleanConsolidatedFile, buildCleanSubmissionFile } from "../../../lib/cleanExport";
import { reportToBuffer } from "../../../lib/report";

export async function GET(request: NextRequest) {
  const submissionId = request.nextUrl.searchParams.get("submissionId") ?? undefined;
  const rows = getReportRows(submissionId);

  const workbook = submissionId
    ? buildCleanSubmissionFile(getSubmission(submissionId)?.fileProvinsi ?? "", rows)
    : buildCleanConsolidatedFile(rows);

  const buffer = await reportToBuffer(workbook);

  const filename = submissionId
    ? `data-bersih-${submissionId}.xlsx`
    : `data-bersih-gabungan-${new Date().toISOString().slice(0, 10)}.xlsx`;

  return new NextResponse(new Uint8Array(buffer), {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${filename}"`,
    },
  });
}

import { NextRequest, NextResponse } from "next/server";
import { getReportRows } from "../../../lib/db";
import { buildConsolidatedReport, reportToBuffer } from "../../../lib/report";

export async function GET(request: NextRequest) {
  const submissionId = request.nextUrl.searchParams.get("submissionId") ?? undefined;
  const rows = getReportRows(submissionId);
  const workbook = buildConsolidatedReport(rows);
  const buffer = await reportToBuffer(workbook);

  const filename = submissionId
    ? `laporan-${submissionId}.xlsx`
    : `laporan-konsolidasi-${new Date().toISOString().slice(0, 10)}.xlsx`;

  return new NextResponse(new Uint8Array(buffer), {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${filename}"`,
    },
  });
}

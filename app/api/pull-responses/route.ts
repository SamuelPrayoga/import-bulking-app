import { NextRequest, NextResponse } from "next/server";
import { pullNewResponses } from "../../../lib/pullResponses";
import { recordAuditEvent } from "../../../lib/auditLog";
import { createBackup } from "../../../lib/backup";

export async function POST(request: NextRequest) {
  const ip = request.headers.get("x-forwarded-for") ?? "local";
  try {
    const result = await pullNewResponses();
    recordAuditEvent(
      "pull_responses",
      process.env.ADMIN_EMAIL ?? "-",
      ip,
      `Total respons: ${result.totalResponses}, baru diproses: ${result.newlyProcessed} (${result.smartMapped} deteksi otomatis), sudah diproses sebelumnya: ${result.alreadyProcessed}, gagal: ${result.failed}`
    );
    // Only worth snapshotting when something actually changed.
    if (result.newlyProcessed > 0) {
      const backupPath = await createBackup();
      recordAuditEvent("backup_created", process.env.ADMIN_EMAIL ?? "-", ip, backupPath.split("/").pop() ?? backupPath);
    }
    return NextResponse.json(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    recordAuditEvent("pull_responses", process.env.ADMIN_EMAIL ?? "-", ip, `Gagal: ${message}`);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

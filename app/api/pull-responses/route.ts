import { NextRequest, NextResponse } from "next/server";
import { pullNewResponses } from "../../../lib/pullResponses";
import { recordAuditEvent } from "../../../lib/auditLog";
import { createBackup } from "../../../lib/backup";

// Downloads + validates every new Drive file, which routinely exceeds Vercel's default 10s
// function timeout on the Hobby plan — 60s is the max Hobby allows (Pro allows more).
export const maxDuration = 60;

export async function POST(request: NextRequest) {
  const ip = request.headers.get("x-forwarded-for") ?? "local";
  try {
    const result = await pullNewResponses();
    await recordAuditEvent(
      "pull_responses",
      process.env.ADMIN_EMAIL ?? "-",
      ip,
      `Total respons: ${result.totalResponses}, baru diproses: ${result.newlyProcessed} (${result.smartMapped} deteksi otomatis), sudah diproses sebelumnya: ${result.alreadyProcessed}, gagal: ${result.failed}`
    );
    // Only worth snapshotting when something actually changed.
    if (result.newlyProcessed > 0) {
      const backupName = await createBackup();
      await recordAuditEvent("backup_created", process.env.ADMIN_EMAIL ?? "-", ip, backupName);
    }
    return NextResponse.json(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await recordAuditEvent("pull_responses", process.env.ADMIN_EMAIL ?? "-", ip, `Gagal: ${message}`);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

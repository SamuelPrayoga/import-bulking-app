import { NextRequest, NextResponse } from "next/server";
import { pullNewResponses } from "../../../../lib/pullResponses";
import { recordAuditEvent } from "../../../../lib/auditLog";
import { createBackup } from "../../../../lib/backup";

/**
 * Replaces the old setInterval-based scheduler (lib/scheduler.ts, removed): that assumed a single
 * long-lived Node process, which doesn't exist on Vercel's serverless functions. This route does
 * the same work (pull -> audit log -> conditional backup) but is triggered externally on a
 * schedule instead — see .github/workflows/auto-pull.yml, which calls this hourly with the
 * CRON_SECRET below in the Authorization header so no one else can trigger it.
 */
// Same reasoning as app/api/pull-responses/route.ts's maxDuration — this does the same work.
export const maxDuration = 60;

export async function GET(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  const auth = request.headers.get("authorization");
  if (!secret || auth !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (!process.env.GOOGLE_SHEET_ID) {
    // Fresh deploy before Google credentials are set up — nothing to pull yet.
    return NextResponse.json({ skipped: true, reason: "GOOGLE_SHEET_ID belum diisi" });
  }

  try {
    const result = await pullNewResponses();
    await recordAuditEvent(
      "pull_responses",
      "system",
      "-",
      `[Otomatis] Total respons: ${result.totalResponses}, baru diproses: ${result.newlyProcessed} (${result.smartMapped} deteksi otomatis), sudah diproses sebelumnya: ${result.alreadyProcessed}, gagal: ${result.failed}`
    );

    // Only worth snapshotting when something actually changed — an empty pull (no new Form
    // responses since last time, the common case) would just duplicate the previous backup.
    if (result.newlyProcessed > 0) {
      const name = await createBackup();
      await recordAuditEvent("backup_created", "system", "-", `[Otomatis] ${name}`);
    }

    return NextResponse.json(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await recordAuditEvent("pull_responses", "system", "-", `[Otomatis] Gagal: ${message}`);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

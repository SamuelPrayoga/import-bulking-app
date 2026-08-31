import { pullNewResponses } from "./pullResponses";
import { createBackup } from "./backup";
import { recordAuditEvent } from "./auditLog";

const AUTO_PULL_INTERVAL_MS = Number(process.env.AUTO_PULL_INTERVAL_MINUTES ?? "60") * 60 * 1000;

let started = false;

/**
 * Starts the auto-pull interval once per server process (guarded so a Next.js dev-mode module
 * reload can't stack up duplicate intervals). Called from instrumentation.ts at server boot.
 */
export function startScheduler(): void {
  if (started) return;
  started = true;

  if (!process.env.GOOGLE_SHEET_ID) {
    // Fresh checkout before Google credentials are set up — nothing to pull yet, and
    // pullNewResponses() would just throw on every tick. Stay quiet until it's configured.
    return;
  }

  console.log(`[scheduler] Auto-pull aktif, tiap ${AUTO_PULL_INTERVAL_MS / 60000} menit.`);
  setInterval(() => {
    runAutoPull().catch((err) => console.error("[scheduler] auto-pull gagal:", err));
  }, AUTO_PULL_INTERVAL_MS);
}

async function runAutoPull(): Promise<void> {
  try {
    const result = await pullNewResponses();
    recordAuditEvent(
      "pull_responses",
      "system",
      "-",
      `[Otomatis] Total respons: ${result.totalResponses}, baru diproses: ${result.newlyProcessed} (${result.smartMapped} deteksi otomatis), sudah diproses sebelumnya: ${result.alreadyProcessed}, gagal: ${result.failed}`
    );
    // Only worth snapshotting when something actually changed — an empty pull (no new Form
    // responses since last time, the common case) would just duplicate the previous backup.
    if (result.newlyProcessed > 0) {
      const backupPath = await createBackup();
      recordAuditEvent("backup_created", "system", "-", `[Otomatis] ${backupPath.split("/").pop()}`);
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    recordAuditEvent("pull_responses", "system", "-", `[Otomatis] Gagal: ${message}`);
  }
}

import { getDb } from "./db";
import { listBackups } from "./backup";

export interface SystemHealth {
  lastPullAt: string | null;
  lastPullFailed: boolean;
  lastBackupAt: string | null;
  failedSubmissionCount: number;
  pendingFollowUpCount: number;
}

/** A single at-a-glance snapshot for the home page: is anything actually broken right now, without having to dig through the audit log or the filtered list manually. */
export async function getSystemHealth(): Promise<SystemHealth> {
  // Each query below gets its own getDb() call (a fresh client) rather than sharing one — see the
  // comment on getDb() in lib/db.ts for why reusing one client across multiple queries is unsafe here.
  const lastPullRs = await (await getDb()).execute(
    "SELECT timestamp, details FROM audit_log WHERE event_type = 'pull_responses' ORDER BY id DESC LIMIT 1"
  );
  const lastPull = lastPullRs.rows[0] as unknown as { timestamp: string; details: string } | undefined;

  const backups = await listBackups();

  const failedSubmissionCount = (
    (await (await getDb()).execute("SELECT COUNT(*) as n FROM submissions WHERE status = 'failed'")).rows[0] as unknown as {
      n: number;
    }
  ).n;

  const pendingFollowUpCount = (
    (await (await getDb()).execute("SELECT COUNT(*) as n FROM submissions WHERE status = 'processed' AND followed_up_at IS NULL"))
      .rows[0] as unknown as { n: number }
  ).n;

  return {
    lastPullAt: lastPull?.timestamp ?? null,
    lastPullFailed: lastPull ? /Gagal/.test(lastPull.details) : false,
    lastBackupAt: backups[0]?.createdAt ?? null,
    failedSubmissionCount,
    pendingFollowUpCount,
  };
}

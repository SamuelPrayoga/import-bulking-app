import { withDb } from "./db";
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
  // Each query below goes through its own withDb() call rather than sharing one client/request —
  // see withDb()'s comment in lib/db.ts for why reusing one client across multiple queries is unsafe here.
  const lastPullRs = await withDb((db) =>
    db.execute("SELECT timestamp, details FROM audit_log WHERE event_type = 'pull_responses' ORDER BY id DESC LIMIT 1")
  );
  const lastPull = lastPullRs.rows[0] as unknown as { timestamp: string; details: string } | undefined;

  const backups = await listBackups();

  const failedSubmissionCount = (
    (await withDb((db) => db.execute("SELECT COUNT(*) as n FROM submissions WHERE status = 'failed'"))).rows[0] as unknown as {
      n: number;
    }
  ).n;

  const pendingFollowUpCount = (
    (await withDb((db) => db.execute("SELECT COUNT(*) as n FROM submissions WHERE status = 'processed' AND followed_up_at IS NULL")))
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

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
export function getSystemHealth(): SystemHealth {
  const lastPull = getDb()
    .prepare("SELECT timestamp, details FROM audit_log WHERE event_type = 'pull_responses' ORDER BY id DESC LIMIT 1")
    .get() as { timestamp: string; details: string } | undefined;

  const backups = listBackups();

  const failedSubmissionCount = (
    getDb().prepare("SELECT COUNT(*) as n FROM submissions WHERE status = 'failed'").get() as { n: number }
  ).n;

  const pendingFollowUpCount = (
    getDb()
      .prepare("SELECT COUNT(*) as n FROM submissions WHERE status = 'processed' AND followed_up_at IS NULL")
      .get() as { n: number }
  ).n;

  return {
    lastPullAt: lastPull?.timestamp ?? null,
    lastPullFailed: lastPull ? /Gagal/.test(lastPull.details) : false,
    lastBackupAt: backups[0]?.createdAt ?? null,
    failedSubmissionCount,
    pendingFollowUpCount,
  };
}

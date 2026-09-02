import Link from "next/link";
import { AlertTriangle, CheckCircle2, Clock, DatabaseBackup, MessageCircle, RefreshCw } from "lucide-react";
import { listSubmissions, getDb } from "../../lib/db";
import { getSystemHealth } from "../../lib/systemHealth";
import { formatRelativeTime } from "../../lib/relativeTime";
import { PullResponsesButton } from "../../components/PullResponsesButton";
import { SubmissionsExplorer } from "../../components/SubmissionsExplorer";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  const rawDb = await getDb();
  const rawRs = await rawDb.execute("SELECT COUNT(*) as n FROM submissions");
  const rawCount = (rawRs.rows[0] as unknown as { n: number }).n;
  const protocol = rawDb.protocol;

  const submissions = await listSubmissions();
  const health = await getSystemHealth();
  const debugInfo = `TURSO_HOST=${process.env.TURSO_DATABASE_URL?.split("/")[2] ?? "MISSING"} hasToken=${Boolean(process.env.TURSO_AUTH_TOKEN)} protocol=${protocol} rawCount=${rawCount} listSubmissionsCount=${submissions.length}`;

  return (
    <>
      <p style={{ background: "yellow", padding: 8, fontFamily: "monospace" }}>DEBUG: {debugInfo}</p>
      <div className="panel">
        <h3 style={{ marginTop: 0 }}>Status Sistem</h3>
        <div className="summary-grid">
          <div className={`summary-item compact-value ${health.lastPullFailed ? "accent-invalid" : "accent-valid"}`}>
            <div className="value" style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <RefreshCw size={15} />
              {health.lastPullAt ? formatRelativeTime(health.lastPullAt) : "Belum pernah"}
            </div>
            <div className="label">
              Terakhir Tarik Data {health.lastPullFailed && "(gagal — cek Log Aktivitas)"}
            </div>
          </div>

          <Link href="/backups" className="summary-item compact-value">
            <div className="value" style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <DatabaseBackup size={15} />
              {health.lastBackupAt ? formatRelativeTime(health.lastBackupAt) : "Belum ada"}
            </div>
            <div className="label">Terakhir Backup</div>
          </Link>

          <Link
            href="/?status=failed"
            className={`summary-item ${health.failedSubmissionCount > 0 ? "accent-invalid" : "accent-valid"}`}
          >
            <div className="value" style={{ display: "flex", alignItems: "center", gap: 6 }}>
              {health.failedSubmissionCount > 0 ? <AlertTriangle size={15} /> : <CheckCircle2 size={15} />}
              {health.failedSubmissionCount}
            </div>
            <div className="label">Submission Gagal</div>
          </Link>

          <Link
            href="/tindak-lanjut"
            className={`summary-item ${health.pendingFollowUpCount > 0 ? "accent-warning" : "accent-valid"}`}
          >
            <div className="value" style={{ display: "flex", alignItems: "center", gap: 6 }}>
              {health.pendingFollowUpCount > 0 ? <Clock size={15} /> : <CheckCircle2 size={15} />}
              {health.pendingFollowUpCount}
            </div>
            <div className="label">
              <MessageCircle size={11} className="muted-icon" style={{ verticalAlign: -1 }} /> Perlu
              Ditindaklanjuti
            </div>
          </Link>
        </div>
      </div>

      <div className="panel">
        <PullResponsesButton />
      </div>

      <SubmissionsExplorer submissions={submissions} />
    </>
  );
}

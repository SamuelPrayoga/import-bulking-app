import Link from "next/link";
import { AlertTriangle, CheckCircle2, Clock, DatabaseBackup, MessageCircle, RefreshCw } from "lucide-react";
import { listSubmissions, getDb } from "../../lib/db";
import { getSystemHealth } from "../../lib/systemHealth";
import { formatRelativeTime } from "../../lib/relativeTime";
import { PullResponsesButton } from "../../components/PullResponsesButton";
import { SubmissionsExplorer } from "../../components/SubmissionsExplorer";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  // TEMP DEBUG: first-ever query this request, exact same SQL shape as listSubmissions(), via a
  // brand-new client, to isolate whether it's query complexity or ordering/reuse causing emptiness.
  const debugClient = await getDb();
  const debugRs = await debugClient.execute(
    `SELECT id, timestamp, email, pic_name as picName, pic_whatsapp as picWhatsapp,
      pic_whatsapp_valid as picWhatsappValid, declared_provinsi as declaredProvinsi,
      declared_kabkota as declaredKabKota, instansi, drive_file_id as driveFileId,
      file_provinsi as fileProvinsi, sheet_status as sheetStatus, location_mismatch as locationMismatch,
      valid_count as validCount, invalid_count as invalidCount, status, processed_at as processedAt,
      error_message as errorMessage, import_method as importMethod, mapping_score as mappingScore,
      followed_up_at as followedUpAt, has_name_mismatch as hasNameMismatch, has_kabkota_autofix as hasKabKotaAutoFix,
      sheet_row_number as sheetRowNumber, has_job_fallback as hasJobFallback
    FROM submissions`
  );
  const debugFirstQueryCount = debugRs.rows.length;

  const submissions = await listSubmissions();
  const health = await getSystemHealth();
  const debugInfo = `firstQueryCount=${debugFirstQueryCount} listSubmissionsCount=${submissions.length}`;

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

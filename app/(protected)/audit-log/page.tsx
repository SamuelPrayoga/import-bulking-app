import Link from "next/link";
import {
  ArrowLeft,
  CheckCircle2,
  DatabaseBackup,
  Download,
  History,
  Lock,
  LogOut,
  MessageCircle,
  RefreshCw,
  XCircle,
} from "lucide-react";
import { listAuditLog, type AuditEventType } from "../../../lib/auditLog";

export const dynamic = "force-dynamic";

const EVENT_META: Record<AuditEventType, { label: string; icon: React.ReactNode; badge: "valid" | "invalid" | "warning" | "neutral" }> = {
  login_success: { label: "Login Berhasil", icon: <CheckCircle2 size={12} />, badge: "valid" },
  login_failed: { label: "Login Gagal", icon: <XCircle size={12} />, badge: "invalid" },
  login_locked_out: { label: "Login Diblokir (Lockout)", icon: <Lock size={12} />, badge: "invalid" },
  logout: { label: "Logout", icon: <LogOut size={12} />, badge: "neutral" },
  pull_responses: { label: "Tarik Data Baru", icon: <RefreshCw size={12} />, badge: "neutral" },
  report_download: { label: "Download Laporan", icon: <Download size={12} />, badge: "neutral" },
  clean_export_download: { label: "Download Data Bersih", icon: <Download size={12} />, badge: "neutral" },
  backup_created: { label: "Backup Dibuat", icon: <DatabaseBackup size={12} />, badge: "neutral" },
  follow_up_marked: { label: "Ditandai Sudah Ditindaklanjuti", icon: <MessageCircle size={12} />, badge: "valid" },
  follow_up_unmarked: { label: "Tanda Ditindaklanjuti Dibatalkan", icon: <MessageCircle size={12} />, badge: "neutral" },
};

function formatTimestamp(iso: string): string {
  try {
    return new Date(iso).toLocaleString("id-ID", {
      dateStyle: "medium",
      timeStyle: "medium",
    });
  } catch {
    return iso;
  }
}

export default function AuditLogPage() {
  const entries = listAuditLog();

  return (
    <>
      <p>
        <Link className="link" href="/">
          <ArrowLeft size={14} /> Kembali ke daftar submission
        </Link>
      </p>

      <div className="panel">
        <h2 style={{ marginTop: 0, display: "flex", alignItems: "center", gap: 8 }}>
          <History size={18} /> Log Aktivitas
        </h2>
        <p className="muted" style={{ marginTop: 0 }}>
          Riwayat login, tarik data, dan download laporan/data — {entries.length} aktivitas terakhir.
        </p>

        {entries.length === 0 ? (
          <p className="muted">Belum ada aktivitas yang tercatat.</p>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Waktu</th>
                  <th>Aktivitas</th>
                  <th>Detail</th>
                  <th>Aktor</th>
                  <th>IP</th>
                </tr>
              </thead>
              <tbody>
                {entries.map((e) => {
                  const meta = EVENT_META[e.eventType];
                  return (
                    <tr key={e.id}>
                      <td style={{ whiteSpace: "nowrap" }}>{formatTimestamp(e.timestamp)}</td>
                      <td>
                        {meta.badge === "neutral" ? (
                          <span className="cell-icon-label">
                            <span className="muted-icon">{meta.icon}</span>
                            {meta.label}
                          </span>
                        ) : (
                          <span className={`badge ${meta.badge}`}>
                            {meta.icon}
                            {meta.label}
                          </span>
                        )}
                      </td>
                      <td>{e.details}</td>
                      <td>{e.actor}</td>
                      <td className="muted">{e.ip}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </>
  );
}

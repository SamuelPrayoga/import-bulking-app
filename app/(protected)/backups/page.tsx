import Link from "next/link";
import { ArrowLeft, DatabaseBackup, HardDrive } from "lucide-react";
import { listBackups } from "../../../lib/backup";
import { BackupNowButton } from "../../../components/BackupNowButton";

export const dynamic = "force-dynamic";

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function formatTimestamp(iso: string): string {
  try {
    return new Date(iso).toLocaleString("id-ID", { dateStyle: "medium", timeStyle: "medium" });
  } catch {
    return iso;
  }
}

export default function BackupsPage() {
  const backups = listBackups();

  return (
    <>
      <p>
        <Link className="link" href="/">
          <ArrowLeft size={14} /> Kembali ke daftar submission
        </Link>
      </p>

      <div className="panel">
        <h2 style={{ marginTop: 0, display: "flex", alignItems: "center", gap: 8 }}>
          <DatabaseBackup size={18} /> Backup Database
        </h2>
        <p className="muted" style={{ marginTop: 0 }}>
          Backup dibuat otomatis setiap kali ada data baru masuk (lewat Tarik Data Baru manual
          atau auto-pull terjadwal), plus bisa dipicu manual kapan saja di sini. Maksimal 20 backup
          terbaru disimpan — yang lebih lama otomatis dihapus.
        </p>

        <BackupNowButton />

        {backups.length === 0 ? (
          <p className="muted" style={{ marginTop: 16 }}>
            Belum ada backup.
          </p>
        ) : (
          <div className="table-wrap" style={{ marginTop: 16 }}>
            <table>
              <thead>
                <tr>
                  <th>Nama File</th>
                  <th>Dibuat</th>
                  <th>Ukuran</th>
                </tr>
              </thead>
              <tbody>
                {backups.map((b) => (
                  <tr key={b.name}>
                    <td>
                      <span className="cell-icon-label">
                        <HardDrive size={13} className="muted-icon" />
                        {b.name}
                      </span>
                    </td>
                    <td>{formatTimestamp(b.createdAt)}</td>
                    <td>{formatSize(b.sizeBytes)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </>
  );
}

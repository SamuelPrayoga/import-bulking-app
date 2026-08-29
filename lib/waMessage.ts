import { normalizePicWhatsapp } from "./validate";
import type { SubmissionRecord, ValidatedRow } from "../types/index";

const MAX_DETAIL_ROWS = 20;

export function buildWaMessage(submission: SubmissionRecord, rows: ValidatedRow[]): string {
  const invalidRows = rows.filter((r) => r.status === "invalid");

  const lines: string[] = [
    `Halo Bapak/Ibu ${submission.picName},`,
    "",
    `Rekap validasi data agen dari submission Anda (${submission.timestamp}):`,
    `Valid: ${submission.validCount} baris (data sudah aktif)`,
    `Tidak valid: ${submission.invalidCount} baris`,
  ];

  if (submission.locationMismatch) {
    lines.push(
      "",
      `Provinsi di dalam file ("${submission.fileProvinsi ?? "-"}") tidak sesuai dengan yang didaftarkan di Form ("${submission.declaredProvinsi}").`
    );
  }

  if (invalidRows.length > 0) {
    lines.push("", "Detail baris bermasalah:");
    for (const row of invalidRows.slice(0, MAX_DETAIL_ROWS)) {
      lines.push(`- Baris ${row.rowNumber} (${row.nama || "-"}): ${row.errors.join("; ")}`);
    }
    if (invalidRows.length > MAX_DETAIL_ROWS) {
      lines.push(`+${invalidRows.length - MAX_DETAIL_ROWS} baris lainnya, lihat laporan terlampir untuk detail lengkap.`);
    }
  }

  lines.push(
    "",
    "Silakan cek kembali data yang sudah dikirim, dan apabila ada yang tidak sesuai, silakan upload kembali. Terima kasih."
  );

  return lines.join("\n");
}

export function buildWaLink(picWhatsappRaw: string, message: string): string | null {
  const normalized = normalizePicWhatsapp(picWhatsappRaw);
  if (!normalized) return null;
  return `https://wa.me/${normalized}?text=${encodeURIComponent(message)}`;
}

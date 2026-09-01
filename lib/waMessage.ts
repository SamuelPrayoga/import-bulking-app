import { normalizePicWhatsapp } from "./validate";
import type { SubmissionRecord, ValidatedRow } from "../types/index";

/**
 * Buckets a raw validation error into a general, name-free category. The raw error strings
 * themselves can carry personal data (an agent's name in context, or — for a NIK already seen
 * elsewhere — a *different* PIC's name entirely), which has no business going into the public
 * status dashboard's category breakdown.
 */
export function categorizeError(error: string): string {
  if (error.startsWith("NIK sudah terdaftar")) return "NIK sudah terdaftar pada submission lain";
  if (error.includes("NIK duplikat")) return "NIK duplikat dalam file";
  if (error === "NIK harus 16 digit angka") return "Format NIK tidak valid (harus 16 digit)";
  if (error === "NIK kosong") return "NIK kosong";
  if (error === "Nama kosong") return "Nama kosong";
  if (error === "JOB kosong") return "JOB kosong";
  if (error.startsWith("JOB tidak dikenali")) return "JOB tidak dikenali";
  if (error === "Kota Kabupaten kosong") return "Kota/Kabupaten kosong";
  if (error.includes("tidak sesuai dengan Provinsi")) return "Kota/Kabupaten tidak sesuai dengan Provinsi";
  return "Lainnya";
}

export interface InvalidCategoryCount {
  category: string;
  count: number;
}

/** Counts invalid rows per error category (a row with 2 errors in the same category counts once), most common first — used by the public status dashboard's error breakdown, without exposing any row-level name/NIK. */
export function categorizeInvalidRows(rows: ValidatedRow[]): InvalidCategoryCount[] {
  const invalidRows = rows.filter((r) => r.status === "invalid");
  const categoryCounts = new Map<string, number>();
  for (const row of invalidRows) {
    for (const category of new Set(row.errors.map(categorizeError))) {
      categoryCounts.set(category, (categoryCounts.get(category) ?? 0) + 1);
    }
  }
  return [...categoryCounts.entries()]
    .map(([category, count]) => ({ category, count }))
    .sort((a, b) => b.count - a.count);
}

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
    const MAX_NAMES_SHOWN = 5;
    lines.push("", "Nama agen yang datanya belum valid:");
    for (const row of invalidRows.slice(0, MAX_NAMES_SHOWN)) {
      lines.push(`- ${row.nama || `Baris ${row.rowNumber} (nama kosong)`}`);
    }
    if (invalidRows.length > MAX_NAMES_SHOWN) {
      lines.push(`dan ${invalidRows.length - MAX_NAMES_SHOWN} data lainnya`);
    }
    lines.push(
      "",
      "Detail lengkap per baris ada di laporan terlampir.",
      "",
      "Silakan cek kembali data yang sudah dikirim, dan apabila ada yang tidak sesuai, silakan upload kembali. Terima kasih."
    );
  } else {
    lines.push(
      "",
      "Sudah Berhasil Aktif sebagai Agen Perlinsos, silakan akses akun anda pada portal agen perlinsos."
    );
  }

  return lines.join("\n");
}

export function buildWaLink(picWhatsappRaw: string, message: string): string | null {
  const normalized = normalizePicWhatsapp(picWhatsappRaw);
  if (!normalized) return null;
  return `https://wa.me/${normalized}?text=${encodeURIComponent(message)}`;
}

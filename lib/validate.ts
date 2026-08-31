import { findCityByNameAndProvince, findJobByName, findProvinceByName, normalizeName } from "./referenceData";
import type { RawAgentRow, ValidatedRow } from "../types/index";

const NIK_RE = /^\d{16}$/;
const PIC_WA_RE = /^62\d{9,13}$/;

/** Normalizes an Indonesian phone number to the "62..." form used by wa.me links. Returns null if it can't be normalized. */
export function normalizePicWhatsapp(raw: string): string | null {
  if (!raw) return null;
  let digits = raw.trim().replace(/[\s-]/g, "").replace(/^\+/, "");
  if (digits.startsWith("62")) {
    // already in international form
  } else if (digits.startsWith("0")) {
    digits = "62" + digits.slice(1);
  } else {
    return null;
  }
  return /^\d+$/.test(digits) ? digits : null;
}

export function isValidPicWhatsapp(raw: string): boolean {
  const normalized = normalizePicWhatsapp(raw);
  return normalized !== null && PIC_WA_RE.test(normalized);
}

/** True when the submitted file's Provinsi (Form!C2) doesn't match what the PIC declared in the Google Form. */
export function checkProvinceMismatch(fileProvinsi: string, declaredProvinsi: string): boolean {
  if (!fileProvinsi.trim() || !declaredProvinsi.trim()) return false;
  return normalizeName(fileProvinsi) !== normalizeName(declaredProvinsi);
}

export interface NikRegistryHit {
  picName: string;
  timestamp: string;
}

export interface SubmissionValidationContext {
  fileProvinsi: string;
  /** Look up whether this NIK was already recorded from a different, earlier submission. */
  nikExistsInRegistry: (nik: string) => NikRegistryHit | null;
}

/**
 * Validates every agent row of one submission.
 * NIK duplicate detection runs as a first pass over the whole file so that ALL rows sharing a
 * duplicated NIK are flagged (matching the template's own instruction that duplicated NIK rows
 * are not accepted at all) rather than just the second-and-later occurrences.
 */
export function validateSubmissionRows(
  rows: RawAgentRow[],
  ctx: SubmissionValidationContext
): ValidatedRow[] {
  const nikCounts = new Map<string, number>();
  for (const row of rows) {
    const nik = row.nik.trim();
    if (NIK_RE.test(nik)) {
      nikCounts.set(nik, (nikCounts.get(nik) ?? 0) + 1);
    }
  }

  return rows.map((row) => validateRow(row, ctx, nikCounts));
}

function validateRow(
  row: RawAgentRow,
  ctx: SubmissionValidationContext,
  nikCounts: Map<string, number>
): ValidatedRow {
  const errors: string[] = [];
  const warnings: string[] = [];

  // Nama is standardized to uppercase — source files mix casing PIC by PIC ("Budi Santoso" vs
  // "BUDI SANTOSO"), so this keeps the cleaned/exported output consistent.
  const nama = row.nama.trim().toUpperCase();
  const nik = row.nik.trim();
  const noWa = row.noWa.trim();
  const job = row.job.trim();
  const kotaKabupaten = row.kotaKabupaten.trim();

  // No WA (agen) is optional — some files genuinely don't have it, and that alone shouldn't
  // invalidate an otherwise-good row.
  if (!nama) errors.push("Nama kosong");
  if (!nik) errors.push("NIK kosong");
  if (!job) errors.push("JOB kosong");
  if (!kotaKabupaten) errors.push("Kota Kabupaten kosong");

  if (nik) {
    if (!NIK_RE.test(nik)) {
      errors.push("NIK harus 16 digit angka");
    } else {
      const countInFile = nikCounts.get(nik) ?? 1;
      if (countInFile > 1) {
        errors.push(`NIK duplikat dalam file ini (muncul ${countInFile}x)`);
      }
      const existing = ctx.nikExistsInRegistry(nik);
      if (existing) {
        errors.push(
          `NIK sudah terdaftar pada submission sebelumnya (PIC: ${existing.picName}, ${existing.timestamp})`
        );
      }
      // Not an error — we can't know the true original digits from here, only that this specific
      // one is at risk. A warning tells the operator to go check the source file by hand instead
      // of either silently trusting a possibly-corrupted NIK or blocking a possibly-fine one.
      if (row.nikNumericRisk) {
        warnings.push(
          "NIK dibaca dari sel bertipe Angka dan berpotensi kehilangan presisi (kode provinsi 90+) — mohon verifikasi manual dari file asli"
        );
      }
    }
  }

  const jobRef = job ? findJobByName(job) ?? null : null;
  if (job && !jobRef) {
    errors.push(`JOB tidak dikenali: "${job}"`);
  }

  const cityRef = kotaKabupaten ? findCityByNameAndProvince(kotaKabupaten, ctx.fileProvinsi) ?? null : null;
  if (kotaKabupaten && !cityRef) {
    errors.push(`Kota/Kabupaten "${kotaKabupaten}" tidak sesuai dengan Provinsi "${ctx.fileProvinsi}"`);
  }

  const provinceRef = findProvinceByName(ctx.fileProvinsi) ?? null;

  return {
    ...row,
    nama,
    nik,
    noWa,
    job,
    kotaKabupaten,
    status: errors.length === 0 ? "valid" : "invalid",
    errors,
    warnings,
    kodeProv: provinceRef?.provinceCode ?? null,
    kodeKota: cityRef?.cityCode ?? null,
    jobId: jobRef?.jobId ?? null,
  };
}

import { findCityByNameAndProvince, findJobByName, findProvinceByName, normalizeName } from "./referenceData";
import type { RawAgentRow, ValidatedRow } from "../types/index";

const NIK_RE = /^\d{16}$/;
const PIC_WA_RE = /^62\d{9,13}$/;

/** Strips anything that isn't a digit (stray spaces, dashes, dots, parentheses, a leading apostrophe from a "force text" cell, ...) so a NIK/phone number is only rejected for actually having the wrong digit count, not incidental formatting. */
function keepDigitsOnly(raw: string): string {
  return raw.replace(/\D/g, "");
}

/** Normalizes an Indonesian phone number to the "62..." form used by wa.me links. Returns null if it can't be normalized. */
export function normalizePicWhatsapp(raw: string): string | null {
  if (!raw) return null;
  let digits = keepDigitsOnly(raw);
  if (!digits) return null;
  if (digits.startsWith("62")) {
    // already in international form
  } else if (digits.startsWith("0")) {
    digits = "62" + digits.slice(1);
  } else {
    return null;
  }
  return digits;
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

// Both the exact-match and name-mismatch warnings below start with this, so a row can be flagged
// "this NIK was seen in an earlier submission" (e.g. a red row highlight) without caring which
// specific case it was — see isNikRepeatWarning.
const NIK_REPEAT_WARNING_PREFIX = "NIK sama pernah disubmit";
/** Prefix shared between the warning message generated below and the code that later filters submissions by it. */
const NAME_MISMATCH_WARNING_PREFIX = "NIK sama pernah disubmit dengan nama berbeda";

export function isNameMismatchWarning(warning: string): boolean {
  return warning.startsWith(NAME_MISMATCH_WARNING_PREFIX);
}

/** True for either NIK-repeat warning (same name or different name) — a broader check than isNameMismatchWarning, for "just make sure I notice this NIK isn't new" UI treatment (e.g. a red row highlight) regardless of which case it is. */
export function isNikRepeatWarning(warning: string): boolean {
  return warning.startsWith(NIK_REPEAT_WARNING_PREFIX);
}

// Marker shared between the warning message generated below and the code that later filters
// submissions by it. Scoped to the "Kota/Kabupaten ..." prefix specifically — a bare check for
// "otomatis diganti ke" alone (the phrase this and the JOB fallback below both use) would also
// match JOB_FALLBACK_WARNING_PREFIX's message and mislabel a JOB-only fix as a Kota/Kabupaten one.
const KABKOTA_AUTOFIX_WARNING_PREFIX = "Kota/Kabupaten";
const KABKOTA_AUTOFIX_WARNING_MARKER = "otomatis diganti ke";

export function isKabKotaAutoFixWarning(warning: string): boolean {
  return warning.startsWith(KABKOTA_AUTOFIX_WARNING_PREFIX) && warning.includes(KABKOTA_AUTOFIX_WARNING_MARKER);
}

/** Prefix shared between the warning message generated below and the code that later filters submissions by it. */
const JOB_FALLBACK_WARNING_PREFIX = "JOB tidak dikenali";

export function isJobFallbackWarning(warning: string): boolean {
  return warning.startsWith(JOB_FALLBACK_WARNING_PREFIX);
}

export interface NikRegistryHit {
  picName: string;
  timestamp: string;
}

export interface NikHistoryHit extends NikRegistryHit {
  /** The agent name (already uppercased) recorded against this NIK in that earlier submission. */
  nama: string;
}

export interface SubmissionValidationContext {
  fileProvinsi: string;
  /** What the PIC themselves declared in the Google Form — the fallback when a row's own Kota/Kabupaten doesn't belong to fileProvinsi at all. */
  declaredProvinsi: string;
  declaredKabKota: string;
  /** Look up the most recent earlier submission (if any) that used this NIK, including the name recorded there. */
  findNikHistory: (nik: string) => NikHistoryHit | null;
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
    const nik = keepDigitsOnly(row.nik);
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
  const nik = keepDigitsOnly(row.nik);
  const noWa = keepDigitsOnly(row.noWa);
  const job = row.job.trim();
  const kotaKabupaten = row.kotaKabupaten.trim();

  // No WA (agen) is optional — some files genuinely don't have it, and that alone shouldn't
  // invalidate an otherwise-good row.
  if (!nama) errors.push("Nama kosong");
  if (!nik) errors.push("NIK kosong");
  if (!kotaKabupaten) errors.push("Kota Kabupaten kosong");

  if (nik) {
    if (!NIK_RE.test(nik)) {
      errors.push("NIK harus 16 digit angka");
    } else {
      const countInFile = nikCounts.get(nik) ?? 1;
      if (countInFile > 1) {
        errors.push(`NIK duplikat dalam file ini (muncul ${countInFile}x)`);
      }
      // A NIK repeated from an earlier submission is never blocked here: the destination CMS this
      // data gets uploaded to already flags "NIK telah terdaftar" itself on its own upload step,
      // so this app doesn't need to duplicate that gate. Still surfaced as a warning either way —
      // same name or not — purely so the operator notices at a glance (e.g. a red row highlight),
      // since a repeat is always worth a second look even when it's an entirely legitimate resubmission.
      const history = ctx.findNikHistory(nik);
      if (history) {
        if (history.nama.trim().toUpperCase() === nama) {
          warnings.push(
            `${NIK_REPEAT_WARNING_PREFIX} pada submission sebelumnya (PIC: ${history.picName}, ${history.timestamp}) — mohon diperhatikan, kemungkinan data duplikat`
          );
        } else {
          warnings.push(
            `${NAME_MISMATCH_WARNING_PREFIX}: "${history.nama}" (submission ${history.timestamp}, PIC: ${history.picName}) — kemungkinan koreksi nama, mohon verifikasi manual`
          );
        }
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

  let jobRef = job ? findJobByName(job) ?? null : null;
  if (!jobRef) {
    // Doesn't match any of the 12 reference categories at all — blank, a village/area name typed
    // into the JOB column by mistake, or a genuinely one-off title — "Lainnya" ("Other") is
    // already one of those 12 categories for exactly this case, so fall back to it instead of
    // blocking the row. Flagged as a warning (not silent) so the original text stays visible for
    // manual review, same pattern as the Kota/Kabupaten auto-fix above.
    const jobLabel = job ? `"${job}"` : "(kosong)";
    const fallbackJobRef = findJobByName("Lainnya") ?? null;
    if (fallbackJobRef) {
      warnings.push(`${JOB_FALLBACK_WARNING_PREFIX}: ${jobLabel} — otomatis diganti ke "Lainnya", mohon verifikasi manual`);
      jobRef = fallbackJobRef;
    } else {
      errors.push(`${JOB_FALLBACK_WARNING_PREFIX}: ${jobLabel}`);
    }
  }

  let resolvedKotaKabupaten = kotaKabupaten;
  let cityRef = kotaKabupaten ? findCityByNameAndProvince(kotaKabupaten, ctx.fileProvinsi) ?? null : null;
  if (kotaKabupaten && !cityRef) {
    // Doesn't belong to the file's stated province at all — a row that's simply a different (but
    // real) Kota/Kabupaten within the same province already resolved above, so reaching here means
    // this is essentially always a stray value (often copy-pasted from a template originally filled
    // out for a different region) rather than a deliberate, if unusual, agent location. Falling back
    // to what the PIC themselves declared in the Form is a safer default than blocking the row.
    const declaredCityRef = findCityByNameAndProvince(ctx.declaredKabKota, ctx.declaredProvinsi) ?? null;
    if (declaredCityRef) {
      warnings.push(
        `Kota/Kabupaten "${kotaKabupaten}" tidak sesuai dengan Provinsi "${ctx.fileProvinsi}" — ${KABKOTA_AUTOFIX_WARNING_MARKER} "${ctx.declaredKabKota}" (kab/kota yang didaftarkan PIC di Form), mohon verifikasi manual`
      );
      resolvedKotaKabupaten = ctx.declaredKabKota.trim();
      cityRef = declaredCityRef;
    } else {
      errors.push(`Kota/Kabupaten "${kotaKabupaten}" tidak sesuai dengan Provinsi "${ctx.fileProvinsi}"`);
    }
  }

  const provinceRef = findProvinceByName(ctx.fileProvinsi) ?? null;

  return {
    ...row,
    nama,
    nik,
    noWa,
    // Normalized to the Master Data's own canonical spelling once resolved (e.g. "POLRI" -> its
    // actual position "Bhabinkamtibmas" via JOB_ALIASES, or just fixing casing) — otherwise the
    // stored/exported JOB text stays whatever the PIC typed even though jobId already reflects the
    // real, resolved job, which is exactly the mismatch that made "POLRI" show up unchanged.
    job: jobRef?.jobName ?? job,
    kotaKabupaten: resolvedKotaKabupaten,
    status: errors.length === 0 ? "valid" : "invalid",
    errors,
    warnings,
    // Prefer the resolved city's own province code so it always agrees with kodeKota — relevant
    // when the auto-fix above kicked in, or (rarer) when fileProvinsi itself doesn't resolve to a
    // known province at all but the city still did (e.g. via the declared-location fallback).
    kodeProv: cityRef?.provinceCode ?? provinceRef?.provinceCode ?? null,
    kodeKota: cityRef?.cityCode ?? null,
    jobId: jobRef?.jobId ?? null,
  };
}

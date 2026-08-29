import * as XLSX from "xlsx";
import { findJobByName } from "./referenceData";
import type { RawAgentRow } from "../types/index";

/**
 * Best-effort fallback for files that don't match the official template at all (wrong file
 * entirely, an old/ad-hoc export, or a legacy .xls) but still plainly contain real agent data —
 * e.g. a police personnel roster with columns like "NAMA", "JABATAN", "NIK", "HP" instead of our
 * exact Nama/NIK/JOB headers. Uses the `xlsx` (SheetJS) library rather than exceljs specifically
 * because it reads both legacy .xls (binary/OLE) and modern .xlsx files uniformly — exceljs only
 * understands .xlsx and silently returns zero sheets for a .xls buffer.
 * Detects a plausible header row per sheet, maps columns by header-text pattern, and scores
 * confidence so the caller can decide whether to trust it automatically (score >= 80) or surface
 * it for manual review instead.
 */

type MappedField = "nama" | "nik" | "noWa" | "job" | "kotaKabupaten";

// Word-boundary (not start-anchored) patterns, since real-world headers put the field name
// anywhere in a longer label — e.g. "NAMA PERSONIL", "NOMOR ( NIK )", "PANGKAT / JABATAN".
const FIELD_HEADER_PATTERNS: Record<MappedField, RegExp[]> = {
  nama: [/\bnama\b/i],
  nik: [/\bnik\b/i, /no\.?\s*ktp/i, /nomor induk kependudukan/i],
  noWa: [/whats\s*app/i, /\bwa\b/i, /no\.?\s*(hp|telp|telepon|kontak)/i, /\bhp\b/i],
  job: [/jabatan/i, /\bjob\b/i, /pekerjaan/i, /posisi/i, /peran/i],
  kotaKabupaten: [/kab\s*\/?\s*kota/i, /kabupaten/i, /\bkota\b/i, /wilayah/i],
};

// Keyword hints for guessing a JOB category from free text that doesn't exactly match one of the
// 12 reference names (e.g. "Binmas Polsek X" should still resolve to "Bhabinkamtibmas").
const JOB_KEYWORD_HINTS: Array<{ jobName: string; keywords: RegExp[] }> = [
  { jobName: "Pendamping PKH", keywords: [/\bpkh\b/i] },
  { jobName: "TKSK", keywords: [/\btksk\b/i] },
  { jobName: "Pegawai Pemda (ASN/P3K/Camat)", keywords: [/\basn\b/i, /\bp3k\b/i, /\bcamat\b/i, /\bpemda\b/i] },
  { jobName: "Operator Desa/SIKS-NG", keywords: [/siks/i, /operator desa/i] },
  { jobName: "PSM (Pendamping Sosial Masyarakat)", keywords: [/\bpsm\b/i] },
  { jobName: "Kader Dasawisma", keywords: [/dasawisma/i] },
  { jobName: "Kepala Desa/Lurah", keywords: [/kepala desa/i, /\blurah\b/i] },
  { jobName: "Kepala Lingkungan/RT/RW", keywords: [/\brt\b/i, /\brw\b/i, /lingkungan/i] },
  { jobName: "Perangkat Desa/Kelurahan", keywords: [/perangkat desa/i, /kelurahan/i] },
  { jobName: "Babinsa", keywords: [/babinsa/i, /koramil/i, /\btni\b/i] },
  { jobName: "Bhabinkamtibmas", keywords: [/bhabin/i, /\bpolri\b/i, /polsek/i, /binmas/i, /polres/i] },
];

// Filters obvious non-NIK noise (a stray "5" from a leftover column-numbering row) without being
// strict about the real 16-digit format — a genuinely malformed NIK (typo, wrong length) should
// still count as a real row so validation can flag it properly downstream.
function looksLikeNik(value: string): boolean {
  return value.replace(/\D/g, "").length >= 4;
}

function guessJobFromFreeText(raw: string): string | null {
  if (!raw) return null;
  const exact = findJobByName(raw);
  if (exact) return exact.jobName;
  for (const hint of JOB_KEYWORD_HINTS) {
    if (hint.keywords.some((re) => re.test(raw))) return hint.jobName;
  }
  return null;
}

// A strong, unambiguous signal that a JOB value belongs to the Polri structure (as opposed to
// "Kasubbag"-style titles that plenty of non-police government offices also use).
const POLRI_CONTEXT_RE = /\b(binmas|polri|polsek|polres|polda|bhabin)\b/i;

/**
 * Resolves a JOB cell to one of the 12 reference categories, with one extra fallback: if this
 * sheet has at least one row whose title unambiguously identifies it as a Polri personnel roster
 * (matched POLRI_CONTEXT_RE), every other non-empty JOB value in that same sheet — internal ranks
 * like "KASUBBAGRENMIN" or "PAMIN 6" that don't match any category on their own — is treated as
 * Bhabinkamtibmas too. Scoped to sheets that already proved themselves Polri rosters so a generic
 * "Kasubbag" in an unrelated file (most government offices have one) doesn't get mislabeled.
 */
function resolveJob(raw: string, hasPolriContext: boolean): string | null {
  const guessed = guessJobFromFreeText(raw);
  if (guessed) return guessed;
  if (hasPolriContext && raw) return "Bhabinkamtibmas";
  return null;
}

// Some genuine rosters (e.g. a plain Nama/NIK/No WA/Kabupaten personnel list) have no JOB column
// at all — there's nothing to guess from, but that's not a reason to reject otherwise-clean data.
// "Lainnya" ("Other") is already one of the 12 reference categories for exactly this case, so a
// missing JOB column defaults there instead of being penalized as if the data were unrecognized.
const FALLBACK_JOB_NAME = findJobByName("Lainnya")?.jobName ?? "Lainnya";

function detectHeaderRow(
  sheetRows: string[][]
): { rowIndex: number; mapping: Partial<Record<MappedField, number>> } | null {
  let best: { rowIndex: number; mapping: Partial<Record<MappedField, number>>; matchedCount: number } | null = null;

  for (let rowIndex = 0; rowIndex < Math.min(15, sheetRows.length); rowIndex++) {
    const mapping: Partial<Record<MappedField, number>> = {};
    sheetRows[rowIndex].forEach((cellValue, colIndex) => {
      const text = cellValue.trim();
      if (!text) return;
      for (const field of Object.keys(FIELD_HEADER_PATTERNS) as MappedField[]) {
        if (mapping[field] !== undefined) continue; // first matching column wins for that field
        if (FIELD_HEADER_PATTERNS[field].some((re) => re.test(text))) {
          mapping[field] = colIndex;
        }
      }
    });
    const matchedCount = Object.keys(mapping).length;
    if (matchedCount >= 2 && (!best || matchedCount > best.matchedCount)) {
      best = { rowIndex, mapping, matchedCount };
    }
  }

  return best ? { rowIndex: best.rowIndex, mapping: best.mapping } : null;
}

export interface SmartMapResult {
  sheetName: string;
  /** 0-100 confidence that this mapping is correct. >=80 is treated as auto-acceptable. */
  score: number;
  rows: RawAgentRow[];
  fieldsDetected: MappedField[];
}

export const SMART_MAP_AUTO_ACCEPT_SCORE = 80;

/** Scans every sheet of a file (.xls or .xlsx) for a plausible header row + agent data table. */
export function trySmartMap(buffer: Buffer): SmartMapResult | null {
  let workbook: XLSX.WorkBook;
  try {
    workbook = XLSX.read(buffer, { type: "buffer" });
  } catch {
    return null;
  }

  let best: SmartMapResult | null = null;

  for (const sheetName of workbook.SheetNames) {
    const sheet = workbook.Sheets[sheetName];
    if (!sheet) continue;

    const rawSheetRows = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: "" }) as unknown[][];
    const sheetRows = rawSheetRows.map((row) => row.map((cell) => (cell === null || cell === undefined ? "" : String(cell).trim())));

    const header = detectHeaderRow(sheetRows);
    if (!header) continue;

    const { rowIndex: headerRowIndex, mapping } = header;
    const cellAt = (row: string[], col: number | undefined) => (col !== undefined ? (row[col] ?? "") : "");

    const rawRows: RawAgentRow[] = [];
    let blankStreak = 0;
    for (let i = headerRowIndex + 1; i < sheetRows.length && blankStreak < 5; i++) {
      const row = sheetRows[i];
      const nama = cellAt(row, mapping.nama);
      const nik = cellAt(row, mapping.nik);
      const noWa = cellAt(row, mapping.noWa);
      const job = cellAt(row, mapping.job);
      const kotaKabupaten = cellAt(row, mapping.kotaKabupaten);

      if (!nama && !nik && !noWa && !job && !kotaKabupaten) {
        blankStreak++;
        continue;
      }

      // Real-world rosters often mix in structural noise between real records — a leftover
      // column-numbering row ("1  2  3  4  5"), or a section/sub-department heading with only a
      // label in the Nama column and nothing else. Neither is a real agent, and counting them as
      // "data" would unfairly drag the NIK/JOB match scores down. Skip without touching
      // blankStreak, since real data may well continue past a single noise row.
      if (mapping.nik !== undefined && nik && !looksLikeNik(nik)) continue;
      if (mapping.nik !== undefined && !nik && !job && !noWa) continue;

      blankStreak = 0;
      rawRows.push({ rowNumber: i + 1, no: String(rawRows.length + 1), nama, nik, noWa, job, kotaKabupaten });
    }

    if (rawRows.length === 0) continue;

    const hasPolriContext = rawRows.some((r) => POLRI_CONTEXT_RE.test(r.job));

    const fieldsDetected = Object.keys(mapping) as MappedField[];
    // Only Nama/NIK/JOB count toward structural confidence: No WA is optional at validation time,
    // and a missing Kota/Kabupaten column always backfills from the PIC's own declared location
    // (see fillMissingKotaKabupaten) — neither is a real gap worth penalizing a clean file for.
    const HEADER_SCORE_FIELDS: MappedField[] = ["nama", "nik", "job"];
    const headerScore =
      (HEADER_SCORE_FIELDS.filter((f) => mapping[f] !== undefined).length / HEADER_SCORE_FIELDS.length) * 100;

    // A sanity check that the detected column really holds ID-like values (guards against
    // mis-mapping some unrelated numeric column as NIK) — not a format check. Individual rows with
    // the wrong digit count still get imported and correctly flagged invalid by lib/validate.ts;
    // this only asks "is this plausibly a NIK column at all".
    const nikScore = mapping.nik
      ? (rawRows.filter((r) => looksLikeNik(r.nik)).length / rawRows.length) * 100
      : 0;

    const jobScore = mapping.job
      ? (rawRows.filter((r) => resolveJob(r.job, hasPolriContext) !== null).length / rawRows.length) * 100
      : 100; // no JOB column at all -> every row deliberately defaults to "Lainnya" below

    const score = Math.round(0.5 * headerScore + 0.25 * nikScore + 0.25 * jobScore);

    // Normalize JOB values we could confidently map to one of the 12 reference categories, so
    // downstream validation (lib/validate.ts) recognizes them the same way it would from a real
    // template dropdown selection.
    const rows = mapping.job
      ? rawRows.map((r) => {
          const guessed = resolveJob(r.job, hasPolriContext);
          return guessed ? { ...r, job: guessed } : r;
        })
      : rawRows.map((r) => ({ ...r, job: FALLBACK_JOB_NAME }));

    if (!best || score > best.score) {
      best = { sheetName, score, rows, fieldsDetected };
    }
  }

  return best;
}

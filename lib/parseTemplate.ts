import ExcelJS from "exceljs";
import type { ParsedSubmissionFile, RawAgentRow } from "../types/index";

const COL = { no: 1, nama: 2, nik: 3, noWa: 4, job: 5, kotaKabupaten: 6 } as const;
const DATA_START_ROW = 7;
// The template pre-provisions formulas down to row 4797; stop well before that as a safety cap
// against a corrupted/malicious file that never has a blank row.
const MAX_ROW = 5000;

// Cell values aren't always plain strings: formulas carry a `.result`, hyperlinks carry `.text`,
// and rich text runs carry `.richText` — any of which can itself be nested one level deep (e.g. a
// hyperlinked name where Excel auto-linked part of the text, like "...M.Si" becoming a link).
// Naively `String()`-ing an unhandled object shape silently produces "[object Object]".
function extractText(value: unknown): string {
  if (value === null || value === undefined) return "";
  if (typeof value !== "object") return String(value).trim();

  const v = value as Record<string, unknown>;
  if (Array.isArray(v.richText)) {
    return v.richText.map((r) => (r as { text?: string }).text ?? "").join("").trim();
  }
  if ("result" in v) return extractText(v.result);
  if ("text" in v) return extractText(v.text);
  return String(value).trim();
}

export function cellText(cell: ExcelJS.Cell): string {
  return extractText(cell.value);
}

// A 64-bit float (what every numeric spreadsheet cell is stored as, per the XLSX format itself —
// this isn't specific to exceljs) can only represent an integer exactly up to 2^53. A 16-digit
// NIK typed into a Number-formatted cell exceeds that once its province code (the first 2 digits)
// reaches ~90 — Excel silently rounds the trailing digit(s) at save time, before the file ever
// reaches us. Text-formatted cells never have this problem (checked via cell.type, not the value).
export function isNikNumericRisk(cell: ExcelJS.Cell, nik: string): boolean {
  return cell.type === ExcelJS.ValueType.Number && /^\d{16}$/.test(nik) && Number(nik) >= Number.MAX_SAFE_INTEGER;
}

export async function loadWorkbook(buffer: Buffer): Promise<ExcelJS.Workbook> {
  const workbook = new ExcelJS.Workbook();
  // exceljs bundles its own @types/node-derived Buffer type, which TS treats as structurally
  // distinct from this project's Buffer despite being identical at runtime.
  await workbook.xlsx.load(buffer as any);
  return workbook;
}

// Some PICs leave a stray blank row in the middle of their data (e.g. row 7 empty, real rows
// starting at row 8) — stopping at the very first blank row would silently drop everyone after
// it. Only treat the table as finished once this many *consecutive* rows are all blank.
const BLANK_ROW_TOLERANCE = 10;

/**
 * Reads the "Form" sheet of one uploaded submission file: the declared Provinsi (C2) plus every
 * agent row from row 7 down to the start of a run of BLANK_ROW_TOLERANCE consecutive blank rows.
 * Throws if there's no sheet literally named "Form" — callers that want to fall back to
 * lib/smartMapping.ts for non-template files should catch that and pass the raw buffer to
 * `trySmartMap`.
 */
export function parseFormSheet(workbook: ExcelJS.Workbook): ParsedSubmissionFile {
  const sheet = workbook.getWorksheet("Form");
  if (!sheet) {
    throw new Error('Sheet "Form" tidak ditemukan di file yang di-upload');
  }

  const fileProvinsi = cellText(sheet.getCell("C2"));

  const rows: RawAgentRow[] = [];
  let blankStreak = 0;
  for (let rowNumber = DATA_START_ROW; rowNumber <= MAX_ROW && blankStreak < BLANK_ROW_TOLERANCE; rowNumber++) {
    const row = sheet.getRow(rowNumber);
    const nikCell = row.getCell(COL.nik);
    const no = cellText(row.getCell(COL.no));
    const nama = cellText(row.getCell(COL.nama));
    const nik = cellText(nikCell);
    const noWa = cellText(row.getCell(COL.noWa));
    const job = cellText(row.getCell(COL.job));
    const kotaKabupaten = cellText(row.getCell(COL.kotaKabupaten));

    // "No" (column A) is deliberately excluded from this check: PICs commonly drag-autofill it
    // far past their real data, leaving a long tail of rows where only the sequence number is
    // non-empty and every substantive field is blank — that tail must count as blank, not as 60+
    // more phantom "Nama kosong / NIK kosong" invalid rows (seen for real in a submitted file
    // whose real data ended at row 77 but whose "No" column kept counting up to row 139).
    if (!nama && !nik && !noWa && !job && !kotaKabupaten) {
      blankStreak++;
      continue;
    }
    blankStreak = 0;

    rows.push({ rowNumber, no, nama, nik, noWa, job, kotaKabupaten, nikNumericRisk: isNikNumericRisk(nikCell, nik) });
  }

  return { fileProvinsi, rows };
}

export async function parseSubmissionFile(buffer: Buffer): Promise<ParsedSubmissionFile> {
  const workbook = await loadWorkbook(buffer);
  return parseFormSheet(workbook);
}

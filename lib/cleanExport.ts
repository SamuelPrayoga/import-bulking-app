import ExcelJS from "exceljs";
import type { ReportRow } from "../types/index";

// Mirrors the original template's "Form" sheet layout exactly: Provinsi label near the top,
// header row 6, data from row 7, including the computed Kode Prov / Kode Kota / Job ID columns —
// so a downstream system that already knows how to read the template can read this unchanged.
const HEADER_ROW = 6;
const DATA_START_ROW = 7;
const HEADERS = ["No", "Nama", "NIK", "No WA", "JOB", "Kota Kabupaten", "", "Kode Prov", "Kode Kota", "Job ID"];

function buildFormSheet(workbook: ExcelJS.Workbook, provinsiLabel: string, rows: ReportRow[]): void {
  const sheet = workbook.addWorksheet("Form");

  sheet.getCell("B2").value = "Provinsi";
  sheet.getCell("C2").value = provinsiLabel;
  sheet.getCell("B2").font = { bold: true };

  HEADERS.forEach((header, i) => {
    sheet.getCell(HEADER_ROW, i + 1).value = header;
  });
  sheet.getRow(HEADER_ROW).font = { bold: true };

  const codeFill: ExcelJS.Fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFDCE6F1" } };

  const validRows = rows.filter((r) => r.status === "valid");
  validRows.forEach((row, i) => {
    const r = sheet.getRow(DATA_START_ROW + i);
    r.getCell(1).value = i + 1;
    r.getCell(2).value = row.nama;
    r.getCell(3).value = row.nik;
    r.getCell(4).value = row.noWa;
    r.getCell(5).value = row.job;
    r.getCell(6).value = row.kotaKabupaten;
    r.getCell(8).value = row.kodeProv;
    r.getCell(9).value = row.kodeKota;
    r.getCell(10).value = row.jobId;
    // Match the original template's convention: Kode Prov/Kode Kota/Job ID are shaded blue to
    // signal "computed, don't edit" — same as the source file.
    [8, 9, 10].forEach((col) => {
      r.getCell(col).fill = codeFill;
    });
  });

  sheet.columns.forEach((col) => {
    col.width = 18;
  });
}

/** Clean, template-shaped export of one submission's VALID rows only. */
export function buildCleanSubmissionFile(fileProvinsi: string, rows: ReportRow[]): ExcelJS.Workbook {
  const workbook = new ExcelJS.Workbook();
  buildFormSheet(workbook, fileProvinsi, rows);
  return workbook;
}

/** Clean, template-shaped export of the VALID rows across every submission, combined. */
export function buildCleanConsolidatedFile(rows: ReportRow[]): ExcelJS.Workbook {
  const workbook = new ExcelJS.Workbook();
  buildFormSheet(workbook, "Gabungan Seluruh Provinsi", rows);
  return workbook;
}

import { describe, expect, it } from "vitest";
import { buildConsolidatedReport, reportToBuffer } from "./report";
import ExcelJS from "exceljs";
import type { ReportRow } from "../types/index";

function reportRow(overrides: Partial<ReportRow>): ReportRow {
  return {
    rowNumber: 7,
    no: "1",
    nama: "Budi Santoso",
    nik: "1811010101900001",
    noWa: "081234567890",
    job: "Pendamping PKH",
    kotaKabupaten: "MESUJI",
    status: "valid",
    errors: [],
    warnings: [],
    kodeProv: "18",
    kodeKota: "1811",
    jobId: "1",
    submissionId: "sub-1",
    fileProvinsi: "LAMPUNG",
    picName: "Ani",
    instansi: "Dinas Sosial",
    picWhatsapp: "6281234567890",
    timestamp: "2026-08-29T10:00:00.000Z",
    locationMismatch: false,
    declaredProvinsi: "LAMPUNG",
    declaredKabKota: "MESUJI",
    ...overrides,
  };
}

describe("buildConsolidatedReport", () => {
  it("writes one row per input row with the expected headers", async () => {
    const rows = [reportRow({}), reportRow({ rowNumber: 8, status: "invalid", errors: ["NIK harus 16 digit angka"] })];
    const workbook = buildConsolidatedReport(rows);
    const sheet = workbook.getWorksheet("Laporan")!;

    const headerRow = sheet.getRow(1).values as unknown[];
    expect(headerRow).toContain("NIK");
    expect(headerRow).toContain("Status");
    expect(headerRow).toContain("Catatan Lokasi");

    expect(sheet.rowCount).toBe(3); // header + 2 data rows
    expect(sheet.getRow(2).getCell("Status").value).toBe("Valid");
    expect(sheet.getRow(3).getCell("Status").value).toBe("Tidak Valid");
    expect(sheet.getRow(3).getCell("Keterangan").value).toBe("NIK harus 16 digit angka");
  });

  it("includes a Catatan Lokasi note when the file's overall Provinsi doesn't match the Form", async () => {
    const rows = [reportRow({ locationMismatch: true, fileProvinsi: "ACEH", declaredProvinsi: "LAMPUNG" })];
    const workbook = buildConsolidatedReport(rows);
    const sheet = workbook.getWorksheet("Laporan")!;
    const note = sheet.getRow(2).getCell("Catatan Lokasi").value as string;
    expect(note).toContain("tidak sesuai dengan yang didaftarkan di Form");
  });

  it("leaves Catatan Lokasi blank for a row whose Kota/Kabupaten simply differs from the Form's declared kab/kota", async () => {
    const rows = [reportRow({ kotaKabupaten: "MESUJI", declaredKabKota: "LAMPUNG TIMUR" })];
    const workbook = buildConsolidatedReport(rows);
    const sheet = workbook.getWorksheet("Laporan")!;
    const note = sheet.getRow(2).getCell("Catatan Lokasi").value;
    expect(note).toBeFalsy();
  });

  it("produces a readable xlsx buffer", async () => {
    const workbook = buildConsolidatedReport([reportRow({})]);
    const buffer = await reportToBuffer(workbook);
    expect(buffer.length).toBeGreaterThan(0);

    const reloaded = new ExcelJS.Workbook();
    await reloaded.xlsx.load(buffer as any);
    expect(reloaded.getWorksheet("Laporan")).toBeDefined();
  });
});

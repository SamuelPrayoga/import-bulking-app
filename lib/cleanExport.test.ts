import { describe, expect, it } from "vitest";
import ExcelJS from "exceljs";
import { buildCleanConsolidatedFile, buildCleanSubmissionFile } from "./cleanExport";
import { reportToBuffer } from "./report";
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
    kodeProv: "18",
    kodeKota: "1811",
    jobId: "1",
    submissionId: "sub-1",
    fileProvinsi: "LAMPUNG",
    picName: "Ani",
    instansi: "Dinas Sosial",
    picWhatsapp: "6281234567890",
    timestamp: "29/08/2026 10:00:00",
    locationMismatch: false,
    declaredProvinsi: "LAMPUNG",
    declaredKabKota: "MESUJI",
    ...overrides,
  };
}

describe("buildCleanSubmissionFile", () => {
  it("mirrors the template layout: Provinsi at C2, headers at row 6, data from row 7", async () => {
    const rows = [reportRow({}), reportRow({ rowNumber: 8, nik: "1811010101900002" })];
    const workbook = buildCleanSubmissionFile("LAMPUNG", rows);
    const sheet = workbook.getWorksheet("Form")!;

    expect(sheet.getCell("C2").value).toBe("LAMPUNG");
    expect(sheet.getRow(6).getCell(1).value).toBe("No");
    expect(sheet.getRow(6).getCell(8).value).toBe("Kode Prov");
    expect(sheet.getRow(6).getCell(9).value).toBe("Kode Kota");
    expect(sheet.getRow(6).getCell(10).value).toBe("Job ID");

    expect(sheet.getRow(7).getCell(2).value).toBe("Budi Santoso");
    expect(sheet.getRow(7).getCell(8).value).toBe("18");
    expect(sheet.getRow(7).getCell(9).value).toBe("1811");
    expect(sheet.getRow(7).getCell(10).value).toBe("1");
    expect(sheet.getRow(8).getCell(3).value).toBe("1811010101900002");
  });

  it("excludes invalid rows and renumbers 'No' sequentially", async () => {
    const rows = [
      reportRow({ rowNumber: 7, status: "invalid", errors: ["NIK harus 16 digit angka"] }),
      reportRow({ rowNumber: 8, nik: "1811010101900002" }),
      reportRow({ rowNumber: 9, nik: "1811010101900003" }),
    ];
    const workbook = buildCleanSubmissionFile("LAMPUNG", rows);
    const sheet = workbook.getWorksheet("Form")!;

    expect(sheet.getRow(7).getCell(3).value).toBe("1811010101900002");
    expect(sheet.getRow(7).getCell(1).value).toBe(1);
    expect(sheet.getRow(8).getCell(3).value).toBe("1811010101900003");
    expect(sheet.getRow(8).getCell(1).value).toBe(2);
    expect(sheet.getRow(9).getCell(1).value).toBeNull();
  });

  it("produces a readable xlsx buffer", async () => {
    const workbook = buildCleanSubmissionFile("LAMPUNG", [reportRow({})]);
    const buffer = await reportToBuffer(workbook);
    const reloaded = new ExcelJS.Workbook();
    await reloaded.xlsx.load(buffer as any);
    expect(reloaded.getWorksheet("Form")).toBeDefined();
  });
});

describe("buildCleanConsolidatedFile", () => {
  it("labels Provinsi as combined and includes rows from multiple submissions", () => {
    const rows = [
      reportRow({ submissionId: "sub-1", fileProvinsi: "LAMPUNG" }),
      reportRow({ submissionId: "sub-2", fileProvinsi: "ACEH", rowNumber: 7, nik: "1101010101900001", kodeProv: "11" }),
    ];
    const workbook = buildCleanConsolidatedFile(rows);
    const sheet = workbook.getWorksheet("Form")!;
    expect(sheet.getCell("C2").value).toBe("Gabungan Seluruh Provinsi");
    expect(sheet.getRow(7).getCell(8).value).toBe("18");
    expect(sheet.getRow(8).getCell(8).value).toBe("11");
  });
});

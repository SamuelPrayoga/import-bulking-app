import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import type { SubmissionRecord, ValidatedRow } from "../types/index";

let dbModule: typeof import("./db");
let analyticsModule: typeof import("./analytics");
let tmpDir: string;

beforeAll(async () => {
  tmpDir = mkdtempSync(path.join(tmpdir(), "import-bulking-analytics-test-"));
  process.env.APP_DB_PATH = path.join(tmpDir, "test.db");
  dbModule = await import("./db");
  analyticsModule = await import("./analytics");

  function submission(overrides: Partial<SubmissionRecord>): SubmissionRecord {
    return {
      id: overrides.id!,
      timestamp: "01/08/2026 10:00:00",
      email: "pic@example.com",
      picName: "Ani",
      picWhatsapp: "6281234567890",
      picWhatsappValid: true,
      declaredProvinsi: "LAMPUNG",
      declaredKabKota: "MESUJI",
      instansi: "Dinas Sosial",
      driveFileId: "file1",
      fileProvinsi: "LAMPUNG",
      locationMismatch: false,
      validCount: 0,
      invalidCount: 0,
      status: "processed",
      processedAt: "2026-08-01T10:00:00.000Z",
      errorMessage: null,
      sheetStatus: "",
      importMethod: "template",
      mappingScore: null,
      followedUpAt: null,
      hasNameMismatch: false,
      hasKabKotaAutoFix: false,
      hasJobFallback: false,
      sheetRowNumber: 5,
      ...overrides,
    };
  }

  function row(overrides: Partial<ValidatedRow>): ValidatedRow {
    return {
      rowNumber: 7,
      no: "1",
      nama: "Budi",
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
      ...overrides,
    };
  }

  // Two submissions from LAMPUNG (2 valid, 1 invalid with 2 error types), one from ACEH (1 valid).
  await dbModule.saveProcessedSubmission(submission({ id: "s1", declaredProvinsi: "LAMPUNG", timestamp: "01/08/2026 10:00:00", validCount: 1, invalidCount: 1 }), [
    row({ rowNumber: 7, status: "valid" }),
    row({ rowNumber: 8, status: "invalid", nama: "", nik: "", errors: ["Nama kosong", "NIK kosong"] }),
  ]);
  await dbModule.saveProcessedSubmission(submission({ id: "s2", declaredProvinsi: "LAMPUNG", timestamp: "02/08/2026 09:00:00", validCount: 1, invalidCount: 1 }), [
    row({ rowNumber: 7, status: "valid", nik: "1811010101900002" }),
    row({ rowNumber: 8, status: "invalid", nik: "12345", errors: ["NIK harus 16 digit angka"] }),
  ]);
  await dbModule.saveProcessedSubmission(submission({ id: "s3", declaredProvinsi: "ACEH", timestamp: "02/08/2026 11:00:00", validCount: 1, invalidCount: 0 }), [
    row({ rowNumber: 7, status: "valid", nik: "1104171510700099" }),
  ]);
});

afterAll(() => {
  dbModule.closeDb();
  rmSync(tmpDir, { recursive: true, force: true });
  delete process.env.APP_DB_PATH;
});

describe("getErrorFrequency", () => {
  it("categorizes and counts error occurrences across all submissions, most common first", async () => {
    const freq = await analyticsModule.getErrorFrequency();
    const byLabel = Object.fromEntries(freq.map((f) => [f.label, f.count]));
    expect(byLabel["Nama kosong"]).toBe(1);
    expect(byLabel["NIK kosong"]).toBe(1);
    expect(byLabel["NIK harus 16 digit angka"]).toBe(1);
  });
});

describe("getProvinceBreakdown", () => {
  it("groups submission and row counts by declared Provinsi", async () => {
    const breakdown = await analyticsModule.getProvinceBreakdown();
    const lampung = breakdown.find((b) => b.provinsi === "LAMPUNG")!;
    const aceh = breakdown.find((b) => b.provinsi === "ACEH")!;
    expect(lampung.submissionCount).toBe(2);
    expect(lampung.validRows).toBe(2);
    expect(lampung.invalidRows).toBe(2);
    expect(aceh.submissionCount).toBe(1);
    expect(aceh.validRows).toBe(1);
  });
});

describe("getValidityTrend", () => {
  it("buckets valid/invalid counts by calendar day, newest first", async () => {
    const trend = await analyticsModule.getValidityTrend();
    expect(trend[0].date).toBe("02/08/2026"); // newest first
    expect(trend[0].submissionCount).toBe(2); // s2 + s3 both on this date
    expect(trend[1].date).toBe("01/08/2026");
    expect(trend[1].submissionCount).toBe(1);
  });
});

describe("searchByNik", () => {
  it("finds rows by partial NIK match across all submissions", async () => {
    const hits = await dbModule.searchByNik("18110101019");
    expect(hits.length).toBeGreaterThanOrEqual(2); // s1's valid row + s2's valid row
    expect(hits.every((h) => h.nik.includes("18110101019"))).toBe(true);
  });

  it("returns an empty array for a query with no digits", async () => {
    expect(await dbModule.searchByNik("abc")).toEqual([]);
  });

  it("returns an empty array when nothing matches", async () => {
    expect(await dbModule.searchByNik("9999999999999999")).toEqual([]);
  });
});

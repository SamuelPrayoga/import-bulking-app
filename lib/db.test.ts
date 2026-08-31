import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import type { SubmissionRecord, ValidatedRow } from "../types/index";

let dbModule: typeof import("./db");
let tmpDir: string;

beforeAll(async () => {
  tmpDir = mkdtempSync(path.join(tmpdir(), "import-bulking-db-test-"));
  process.env.APP_DB_PATH = path.join(tmpDir, "test.db");
  dbModule = await import("./db");
});

afterAll(() => {
  dbModule.closeDb();
  rmSync(tmpDir, { recursive: true, force: true });
  delete process.env.APP_DB_PATH;
});

function submission(overrides: Partial<SubmissionRecord> = {}): SubmissionRecord {
  return {
    id: "sub-1",
    timestamp: "2026-08-29T10:00:00.000Z",
    email: "pic@example.com",
    picName: "Ani Wijaya",
    picWhatsapp: "6281234567890",
    picWhatsappValid: true,
    declaredProvinsi: "LAMPUNG",
    declaredKabKota: "MESUJI",
    instansi: "Dinas Sosial",
    driveFileId: "file123",
    fileProvinsi: "LAMPUNG",
    locationMismatch: false,
    validCount: 1,
    invalidCount: 1,
    status: "processed",
    processedAt: "2026-08-29T10:05:00.000Z",
    errorMessage: null,
    sheetStatus: "",
    importMethod: "template",
    mappingScore: null,
    followedUpAt: null,
    ...overrides,
  };
}

function validRow(overrides: Partial<ValidatedRow> = {}): ValidatedRow {
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

function invalidRow(overrides: Partial<ValidatedRow> = {}): ValidatedRow {
  return validRow({
    rowNumber: 8,
    nik: "bad-nik",
    status: "invalid",
    errors: ["NIK harus 16 digit angka"],
    kodeKota: null,
    ...overrides,
  });
}

describe("saveProcessedSubmission / submissionExists", () => {
  it("persists a submission and its rows", () => {
    dbModule.saveProcessedSubmission(submission({}), [validRow({}), invalidRow({})]);

    expect(dbModule.submissionExists("sub-1")).toBe(true);
    expect(dbModule.submissionExists("does-not-exist")).toBe(false);
  });

  it("re-processing the same submission id (without an existence check) throws", () => {
    expect(() => dbModule.saveProcessedSubmission(submission({}), [validRow({})])).toThrow();
  });
});

describe("listSubmissions / getSubmission", () => {
  it("returns the saved submission with booleans preserved", () => {
    const found = dbModule.getSubmission("sub-1");
    expect(found).not.toBeNull();
    expect(found?.picWhatsappValid).toBe(true);
    expect(found?.locationMismatch).toBe(false);

    const all = dbModule.listSubmissions();
    expect(all.some((s) => s.id === "sub-1")).toBe(true);
  });

  it("starts with followedUpAt null, and setFollowUpStatus toggles it on/off", () => {
    expect(dbModule.getSubmission("sub-1")?.followedUpAt).toBeNull();

    dbModule.setFollowUpStatus("sub-1", true);
    const marked = dbModule.getSubmission("sub-1");
    expect(marked?.followedUpAt).not.toBeNull();
    expect(new Date(marked!.followedUpAt!).toString()).not.toBe("Invalid Date");

    dbModule.setFollowUpStatus("sub-1", false);
    expect(dbModule.getSubmission("sub-1")?.followedUpAt).toBeNull();
  });
});

describe("getPendingFollowUps", () => {
  it("includes only processed submissions with no followedUpAt yet", () => {
    dbModule.saveProcessedSubmission(submission({ id: "sub-followed-up", timestamp: "29/08/2026 09:00:00" }), [validRow({})]);
    dbModule.setFollowUpStatus("sub-followed-up", true);

    dbModule.saveProcessedSubmission(submission({ id: "sub-failed", timestamp: "29/08/2026 09:00:00", status: "failed" }), []);

    const pending = dbModule.getPendingFollowUps();
    const ids = pending.map((s) => s.id);
    expect(ids).toContain("sub-1"); // processed, never followed up
    expect(ids).not.toContain("sub-followed-up");
    expect(ids).not.toContain("sub-failed");
  });

  it("orders oldest submission first", () => {
    dbModule.saveProcessedSubmission(submission({ id: "sub-oldest", timestamp: "01/01/2026 08:00:00" }), []);
    dbModule.saveProcessedSubmission(submission({ id: "sub-newest", timestamp: "31/12/2026 08:00:00" }), []);

    const pending = dbModule.getPendingFollowUps();
    const oldestIndex = pending.findIndex((s) => s.id === "sub-oldest");
    const newestIndex = pending.findIndex((s) => s.id === "sub-newest");
    expect(oldestIndex).toBeGreaterThanOrEqual(0);
    expect(newestIndex).toBeGreaterThan(oldestIndex);
  });
});

describe("getSubmissionRows", () => {
  it("returns rows with errors parsed back into an array", () => {
    const rows = dbModule.getSubmissionRows("sub-1");
    expect(rows).toHaveLength(2);
    const invalid = rows.find((r) => r.status === "invalid")!;
    expect(invalid.errors).toEqual(["NIK harus 16 digit angka"]);
  });

  it("round-trips warnings and nikNumericRisk through save -> getSubmissionRows/getRawSubmissionRows/getReportRows", () => {
    dbModule.saveProcessedSubmission(
      submission({ id: "sub-nik-risk", validCount: 1, invalidCount: 0 }),
      [
        validRow({
          rowNumber: 7,
          nik: "9407199254740991",
          nikNumericRisk: true,
          warnings: ["NIK dibaca dari sel bertipe Angka dan berpotensi kehilangan presisi (kode provinsi 90+) — mohon verifikasi manual dari file asli"],
        }),
      ]
    );

    const rows = dbModule.getSubmissionRows("sub-nik-risk");
    expect(rows[0].warnings).toHaveLength(1);
    expect(rows[0].warnings[0]).toContain("presisi");
    expect(rows[0].status).toBe("valid"); // a warning must never flip status

    const raw = dbModule.getRawSubmissionRows("sub-nik-risk");
    expect(raw[0].nikNumericRisk).toBe(true);

    const reportRows = dbModule.getReportRows("sub-nik-risk");
    expect(reportRows[0].warnings).toHaveLength(1);
  });
});

describe("findNikInRegistry", () => {
  it("finds a NIK that was registered from a valid-format row", () => {
    const hit = dbModule.findNikInRegistry("1811010101900001");
    expect(hit).toEqual({ picName: "Ani Wijaya", timestamp: "2026-08-29T10:00:00.000Z" });
  });

  it("returns null for a NIK that was never registered", () => {
    expect(dbModule.findNikInRegistry("0000000000000000")).toBeNull();
  });

  it("does not register a malformed NIK", () => {
    expect(dbModule.findNikInRegistry("bad-nik")).toBeNull();
  });
});

describe("getReportRows", () => {
  it("joins rows with their submission's PIC metadata", () => {
    const rows = dbModule.getReportRows();
    expect(rows.length).toBeGreaterThan(0);
    expect(rows[0].picName).toBe("Ani Wijaya");
    expect(rows[0].instansi).toBe("Dinas Sosial");
  });

  it("filters to a single submission when submissionId is given", () => {
    dbModule.saveProcessedSubmission(submission({ id: "sub-2", picName: "Beni" }), [
      validRow({ nik: "1811010101900099" }),
    ]);

    const rows = dbModule.getReportRows("sub-2");
    expect(rows).toHaveLength(1);
    expect(rows[0].picName).toBe("Beni");
  });
});

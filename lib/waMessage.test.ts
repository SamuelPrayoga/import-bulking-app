import { describe, expect, it } from "vitest";
import { buildWaLink, buildWaMessage } from "./waMessage";
import type { SubmissionRecord, ValidatedRow } from "../types/index";

function submission(overrides: Partial<SubmissionRecord> = {}): SubmissionRecord {
  return {
    id: "sub-1",
    timestamp: "2026-08-29T10:00:00.000Z",
    email: "pic@example.com",
    picName: "Ani Wijaya",
    picWhatsapp: "081234567890",
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
    ...overrides,
  };
}

function row(overrides: Partial<ValidatedRow> = {}): ValidatedRow {
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
    kodeProv: "18",
    kodeKota: "1811",
    jobId: "1",
    ...overrides,
  };
}

describe("buildWaMessage", () => {
  it("includes a recap of valid/invalid counts and greets the PIC by name", () => {
    const message = buildWaMessage(submission({}), [row({})]);
    expect(message).toContain("Halo Bapak/Ibu Ani Wijaya,");
    expect(message).toContain("Valid: 1 baris");
    expect(message).toContain("Tidak valid: 1 baris");
  });

  it("lists invalid rows with their reasons", () => {
    const rows = [row({ status: "invalid", errors: ["NIK harus 16 digit angka"], rowNumber: 9, nama: "Citra" })];
    const message = buildWaMessage(submission({}), rows);
    expect(message).toContain("Baris 9 (Citra): NIK harus 16 digit angka");
  });

  it("caps the detail list and points to the full report beyond 20 invalid rows", () => {
    const rows = Array.from({ length: 25 }, (_, i) =>
      row({ status: "invalid", errors: ["NIK harus 16 digit angka"], rowNumber: 7 + i })
    );
    const message = buildWaMessage(submission({ invalidCount: 25, validCount: 0 }), rows);
    expect(message).toContain("+5 baris lainnya");
  });

  it("adds a location-mismatch warning when the submission is flagged", () => {
    const message = buildWaMessage(submission({ locationMismatch: true, fileProvinsi: "ACEH" }), [row({})]);
    expect(message).toContain("tidak sesuai dengan yang didaftarkan di Form");
  });

  it("notes that valid rows are already active", () => {
    const message = buildWaMessage(submission({}), [row({})]);
    expect(message).toContain("Valid: 1 baris (data sudah aktif)");
  });

  it("closes by asking the PIC to re-check and re-upload if anything is off", () => {
    const message = buildWaMessage(submission({}), [row({})]);
    expect(message).toContain(
      "Silakan cek kembali data yang sudah dikirim, dan apabila ada yang tidak sesuai, silakan upload kembali."
    );
  });
});

describe("buildWaLink", () => {
  it("builds a wa.me link with the normalized number and encoded text", () => {
    const link = buildWaLink("081234567890", "Halo dunia");
    expect(link).toBe("https://wa.me/6281234567890?text=Halo%20dunia");
  });

  it("returns null when the PIC number can't be normalized", () => {
    expect(buildWaLink("not-a-number", "Halo")).toBeNull();
  });
});

import { describe, expect, it } from "vitest";
import {
  checkProvinceMismatch,
  isValidPicWhatsapp,
  normalizePicWhatsapp,
  validateSubmissionRows,
} from "./validate";
import type { RawAgentRow } from "../types/index";

function row(overrides: Partial<RawAgentRow>): RawAgentRow {
  return {
    rowNumber: 7,
    no: "1",
    nama: "Budi Santoso",
    nik: "1811010101900001",
    noWa: "081234567890",
    job: "Pendamping PKH",
    kotaKabupaten: "MESUJI",
    ...overrides,
  };
}

const noRegistryHit = () => null;

describe("normalizePicWhatsapp / isValidPicWhatsapp", () => {
  it("normalizes 08xx to 62xx", () => {
    expect(normalizePicWhatsapp("081234567890")).toBe("6281234567890");
  });
  it("normalizes +62xx to 62xx", () => {
    expect(normalizePicWhatsapp("+6281234567890")).toBe("6281234567890");
  });
  it("keeps 62xx as-is", () => {
    expect(normalizePicWhatsapp("6281234567890")).toBe("6281234567890");
  });
  it("strips spaces and dashes", () => {
    expect(normalizePicWhatsapp("0812-3456-7890")).toBe("6281234567890");
  });
  it("rejects numbers with no recognizable prefix", () => {
    expect(normalizePicWhatsapp("1234567890")).toBeNull();
  });
  it("flags a too-short number as invalid", () => {
    expect(isValidPicWhatsapp("0812345")).toBe(false);
  });
  it("flags a well-formed number as valid", () => {
    expect(isValidPicWhatsapp("081234567890")).toBe(true);
  });
});

describe("checkProvinceMismatch", () => {
  it("is false when province names match case-insensitively", () => {
    expect(checkProvinceMismatch("lampung", "LAMPUNG")).toBe(false);
  });
  it("is true when province names differ", () => {
    expect(checkProvinceMismatch("Lampung", "Aceh")).toBe(true);
  });
});

describe("validateSubmissionRows", () => {
  const baseCtx = {
    fileProvinsi: "LAMPUNG",
    nikExistsInRegistry: noRegistryHit,
  };

  it("marks a fully correct row as valid with recomputed codes", () => {
    const [result] = validateSubmissionRows([row({})], baseCtx);
    expect(result.status).toBe("valid");
    expect(result.errors).toEqual([]);
    expect(result.kodeProv).toBe("18");
    expect(result.kodeKota).toBe("1811");
    expect(result.jobId).toBe("1");
  });

  it("flags a NIK that isn't 16 digits", () => {
    const [result] = validateSubmissionRows([row({ nik: "12345" })], baseCtx);
    expect(result.status).toBe("invalid");
    expect(result.errors).toContain("NIK harus 16 digit angka");
  });

  it("does NOT cross-check NIK digits against the province/city code", () => {
    // NIK prefix "99" doesn't correspond to LAMPUNG's "18" code, but per user instruction
    // agents may be registered somewhere different from where their KTP was issued.
    const [result] = validateSubmissionRows([row({ nik: "9999010101900001" })], baseCtx);
    expect(result.status).toBe("valid");
  });

  it("flags ALL rows sharing a duplicated NIK within the same file", () => {
    const rows = [row({ rowNumber: 7, nik: "1811010101900001" }), row({ rowNumber: 8, nik: "1811010101900001" })];
    const [first, second] = validateSubmissionRows(rows, baseCtx);
    expect(first.status).toBe("invalid");
    expect(second.status).toBe("invalid");
    expect(first.errors.some((e) => e.includes("duplikat"))).toBe(true);
    expect(second.errors.some((e) => e.includes("duplikat"))).toBe(true);
  });

  it("flags a NIK that already exists in the cross-submission registry", () => {
    const ctx = {
      ...baseCtx,
      nikExistsInRegistry: () => ({ picName: "Ani", timestamp: "2026-08-01" }),
    };
    const [result] = validateSubmissionRows([row({})], ctx);
    expect(result.status).toBe("invalid");
    expect(result.errors.some((e) => e.includes("sudah terdaftar"))).toBe(true);
  });

  it("does not validate the agent's own No WA format", () => {
    const [result] = validateSubmissionRows([row({ noWa: "not-a-phone-number" })], baseCtx);
    expect(result.status).toBe("valid");
  });

  it("treats a blank No WA as optional, not a validation error", () => {
    const [result] = validateSubmissionRows([row({ noWa: "" })], baseCtx);
    expect(result.status).toBe("valid");
    expect(result.errors).toEqual([]);
  });

  it("flags an unrecognized JOB", () => {
    const [result] = validateSubmissionRows([row({ job: "Tukang Sayur" })], baseCtx);
    expect(result.status).toBe("invalid");
    expect(result.errors.some((e) => e.includes("JOB tidak dikenali"))).toBe(true);
  });

  it("flags a Kota Kabupaten that doesn't belong to the file's Provinsi", () => {
    const [result] = validateSubmissionRows([row({ kotaKabupaten: "BOGOR" })], baseCtx);
    expect(result.status).toBe("invalid");
    expect(result.errors.some((e) => e.includes("tidak sesuai dengan Provinsi"))).toBe(true);
  });

  it("flags required fields that are empty", () => {
    const [result] = validateSubmissionRows([row({ nama: "" })], baseCtx);
    expect(result.status).toBe("invalid");
    expect(result.errors).toContain("Nama kosong");
  });

  it("standardizes Nama to uppercase", () => {
    const [result] = validateSubmissionRows([row({ nama: "Budi Santoso" })], baseCtx);
    expect(result.nama).toBe("BUDI SANTOSO");
  });

  it("does not flag a row whose Kota/Kabupaten differs from what the PIC declared in the Form — one PIC can manage agents across several kab/kota", () => {
    const [result] = validateSubmissionRows([row({ kotaKabupaten: "MESUJI" })], baseCtx);
    expect(result.status).toBe("valid");
    expect(result.errors).toEqual([]);
  });
});

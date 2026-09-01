import { describe, expect, it } from "vitest";
import {
  checkProvinceMismatch,
  isJobFallbackWarning,
  isKabKotaAutoFixWarning,
  isNameMismatchWarning,
  isNikRepeatWarning,
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

const noHistory = () => null;

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
  it("strips other stray formatting characters too (parentheses, dots)", () => {
    expect(normalizePicWhatsapp("(0812) 3456.7890")).toBe("6281234567890");
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

describe("isNikRepeatWarning", () => {
  it("matches both the same-name and different-name NIK-repeat warnings", () => {
    expect(
      isNikRepeatWarning('NIK sama pernah disubmit pada submission sebelumnya (PIC: Ani, 2026-08-01) — mohon diperhatikan, kemungkinan data duplikat')
    ).toBe(true);
    expect(
      isNikRepeatWarning('NIK sama pernah disubmit dengan nama berbeda: "Budi" (submission 2026-08-01, PIC: Ani) — kemungkinan koreksi nama, mohon verifikasi manual')
    ).toBe(true);
  });

  it("does not match an unrelated warning", () => {
    expect(isNikRepeatWarning("NIK dibaca dari sel bertipe Angka dan berpotensi kehilangan presisi")).toBe(false);
  });

  it("isNameMismatchWarning is the narrower of the two — only the different-name case", () => {
    const sameNameWarning = "NIK sama pernah disubmit pada submission sebelumnya (PIC: Ani, 2026-08-01) — mohon diperhatikan, kemungkinan data duplikat";
    expect(isNikRepeatWarning(sameNameWarning)).toBe(true);
    expect(isNameMismatchWarning(sameNameWarning)).toBe(false);
  });
});

describe("isKabKotaAutoFixWarning / isJobFallbackWarning", () => {
  it("each matches only its own warning, not the other's", () => {
    const kabKotaWarning = 'Kota/Kabupaten "X" tidak sesuai dengan Provinsi "Y" — otomatis diganti ke "Z" (kab/kota yang didaftarkan PIC di Form), mohon verifikasi manual';
    const jobWarning = 'JOB tidak dikenali: "X" — otomatis diganti ke "Lainnya", mohon verifikasi manual';

    expect(isKabKotaAutoFixWarning(kabKotaWarning)).toBe(true);
    expect(isJobFallbackWarning(kabKotaWarning)).toBe(false);

    expect(isJobFallbackWarning(jobWarning)).toBe(true);
    expect(isKabKotaAutoFixWarning(jobWarning)).toBe(false);
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
    declaredProvinsi: "LAMPUNG",
    declaredKabKota: "MESUJI",
    findNikHistory: noHistory,
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

  it("cleans stray non-digit characters out of the NIK before validating it (spaces, dashes, a force-text apostrophe, ...)", () => {
    const [result] = validateSubmissionRows([row({ nik: "1811-0101 0190'0001" })], baseCtx);
    expect(result.status).toBe("valid");
    expect(result.nik).toBe("1811010101900001");
  });

  it("still rejects a NIK that's the wrong length even after cleaning non-digits out", () => {
    const [result] = validateSubmissionRows([row({ nik: "1811-0101-9000-1" })], baseCtx);
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

  it("warns (but does not invalidate) a NIK flagged as read from a numeric cell at risk of precision loss", () => {
    const [result] = validateSubmissionRows(
      [row({ nik: "9407199254740991", nikNumericRisk: true })],
      baseCtx
    );
    expect(result.status).toBe("valid"); // uncertain, not wrong — must not block the row
    expect(result.errors).toEqual([]);
    expect(result.warnings.some((w) => w.includes("presisi"))).toBe(true);
  });

  it("does not warn when the NIK is fine (nikNumericRisk false or unset)", () => {
    const [result] = validateSubmissionRows([row({})], baseCtx);
    expect(result.warnings).toEqual([]);
  });

  it("does not block a NIK that already exists in an earlier submission under the same name, but still warns so the operator notices the repeat — a legitimate resubmission, not gated here since the destination CMS already handles it", () => {
    const ctx = {
      ...baseCtx,
      findNikHistory: () => ({ nama: "BUDI SANTOSO", picName: "Ani", timestamp: "2026-08-01" }),
    };
    const [result] = validateSubmissionRows([row({})], ctx);
    expect(result.status).toBe("valid");
    expect(result.errors).toEqual([]);
    expect(result.warnings.some((w) => w.includes("NIK sama pernah disubmit pada submission sebelumnya"))).toBe(true);
  });

  it("warns (but does not invalidate) a NIK that exists in an earlier submission under a different name", () => {
    const ctx = {
      ...baseCtx,
      findNikHistory: () => ({ nama: "BUDI SANTOSA", picName: "Ani", timestamp: "2026-08-01" }),
    };
    const [result] = validateSubmissionRows([row({})], ctx);
    expect(result.status).toBe("valid");
    expect(result.errors).toEqual([]);
    expect(result.warnings.some((w) => w.includes("nama berbeda"))).toBe(true);
  });

  it("does not validate the agent's own No WA format", () => {
    const [result] = validateSubmissionRows([row({ noWa: "not-a-phone-number" })], baseCtx);
    expect(result.status).toBe("valid");
  });

  it("cleans stray non-digit characters out of the agent's No WA", () => {
    const [result] = validateSubmissionRows([row({ noWa: "(0812) 3456-7890" })], baseCtx);
    expect(result.status).toBe("valid");
    expect(result.noWa).toBe("081234567890");
  });

  it("treats a blank No WA as optional, not a validation error", () => {
    const [result] = validateSubmissionRows([row({ noWa: "" })], baseCtx);
    expect(result.status).toBe("valid");
    expect(result.errors).toEqual([]);
  });

  it("auto-corrects an unrecognized JOB to 'Lainnya' with a warning, instead of blocking the row", () => {
    // Real case: a village/area name ("GP. GEUCEU KOMPLEK") typed into the JOB column by mistake.
    const [result] = validateSubmissionRows([row({ job: "GP. GEUCEU KOMPLEK" })], baseCtx);
    expect(result.status).toBe("valid");
    expect(result.errors).toEqual([]);
    expect(result.job).toBe("Lainnya");
    expect(result.jobId).toBe("10");
    expect(result.warnings.some((w) => w.includes('JOB tidak dikenali: "GP. GEUCEU KOMPLEK"'))).toBe(true);
  });

  it("auto-corrects a blank JOB to 'Lainnya' with a warning too, instead of blocking the row", () => {
    const [result] = validateSubmissionRows([row({ job: "" })], baseCtx);
    expect(result.status).toBe("valid");
    expect(result.errors).toEqual([]);
    expect(result.job).toBe("Lainnya");
    expect(result.jobId).toBe("10");
    expect(result.warnings.some((w) => w.includes("JOB tidak dikenali: (kosong)"))).toBe(true);
  });

  it("normalizes JOB to Master Data's canonical spelling once resolved, including via an alias (e.g. 'POLRI' -> the actual position 'Bhabinkamtibmas')", () => {
    const [result] = validateSubmissionRows([row({ job: "POLRI" })], baseCtx);
    expect(result.status).toBe("valid");
    expect(result.job).toBe("Bhabinkamtibmas");
    expect(result.jobId).toBe("12");
  });

  it("auto-corrects a Kota Kabupaten that doesn't belong to the file's Provinsi to the PIC's own declared kab/kota, with a warning instead of blocking the row", () => {
    // "BOGOR" (Jawa Barat) can't belong to a LAMPUNG file — almost always a stray/copy-pasted
    // value rather than a deliberate agent location, since a real different-but-valid Lampung
    // kab/kota already passes without this fallback (see the MESUJI-vs-declared test above).
    const [result] = validateSubmissionRows([row({ kotaKabupaten: "BOGOR" })], baseCtx);
    expect(result.status).toBe("valid");
    expect(result.errors).toEqual([]);
    expect(result.kotaKabupaten).toBe("MESUJI"); // baseCtx.declaredKabKota
    expect(result.kodeKota).toBe("1811");
    expect(result.warnings.some((w) => w.includes('otomatis diganti ke "MESUJI"'))).toBe(true);
  });

  it("still blocks the row as invalid when even the PIC's own declared kab/kota can't be resolved", () => {
    const ctx = { ...baseCtx, declaredKabKota: "TEMPAT TIDAK ADA" };
    const [result] = validateSubmissionRows([row({ kotaKabupaten: "BOGOR" })], ctx);
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

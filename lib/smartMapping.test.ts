import { describe, expect, it } from "vitest";
import * as XLSX from "xlsx";
import { SMART_MAP_AUTO_ACCEPT_SCORE, trySmartMap } from "./smartMapping";

function buildBuffer(sheets: Array<{ name: string; rows: (string | number)[][] }>): Buffer {
  const workbook = XLSX.utils.book_new();
  for (const s of sheets) {
    const sheet = XLSX.utils.aoa_to_sheet(s.rows);
    XLSX.utils.book_append_sheet(workbook, sheet, s.name);
  }
  const arrayBuffer = XLSX.write(workbook, { type: "array", bookType: "xlsx" }) as ArrayBuffer;
  return Buffer.from(arrayBuffer);
}

describe("trySmartMap", () => {
  it("maps a non-template file with different header wording and scores it highly", () => {
    const buffer = buildBuffer([
      {
        name: "SHEETS",
        rows: [
          ["No", "Nama Agen", "No. KTP", "No HP/WA", "Jabatan", "Kabupaten/Kota"],
          ["1", "Budi Santoso", "1811010101900001", "081234567890", "Bhabinkamtibmas Polsek A", "MESUJI"],
          ["2", "Ani Wijaya", "1811010101900002", "081234567891", "Babinsa Koramil B", "MESUJI"],
          ["3", "Citra Dewi", "1811010101900003", "081234567892", "TKSK", "MESUJI"],
        ],
      },
    ]);

    const result = trySmartMap(buffer);
    expect(result).not.toBeNull();
    expect(result!.sheetName).toBe("SHEETS");
    expect(result!.rows).toHaveLength(3);
    expect(result!.rows[0].nama).toBe("Budi Santoso");
    expect(result!.rows[0].nik).toBe("1811010101900001");
    expect(result!.rows[0].job).toBe("Bhabinkamtibmas"); // fuzzy-matched from free text
    expect(result!.rows[1].job).toBe("Babinsa");
    expect(result!.rows[2].job).toBe("TKSK"); // exact match
    expect(result!.score).toBeGreaterThanOrEqual(SMART_MAP_AUTO_ACCEPT_SCORE);
  });

  it("scores a file with almost no recognizable structure low or returns null", () => {
    const buffer = buildBuffer([
      {
        name: "Random",
        rows: [
          ["Kolom A", "Kolom B"],
          ["foo", "bar"],
          ["baz", "qux"],
        ],
      },
    ]);

    const result = trySmartMap(buffer);
    // Only 0 recognizable headers (< 2 match threshold) means no header row is even detected.
    expect(result).toBeNull();
  });

  it("returns null when only one field is identifiable (below the 2-field minimum)", () => {
    const buffer = buildBuffer([
      {
        name: "Partial",
        rows: [
          ["No. KTP", "Keterangan"],
          ["1811010101900001", "info a"],
          ["not-a-nik", "info b"],
        ],
      },
    ]);

    const result = trySmartMap(buffer);
    expect(result).toBeNull();
  });

  it("picks the sheet with the best-scoring mapping when there are several", () => {
    const buffer = buildBuffer([
      { name: "Weak", rows: [["Nama", "Catatan"], ["Budi", "x"]] },
      {
        name: "Strong",
        rows: [
          ["Nama", "NIK", "No WA", "Jabatan", "Kota"],
          ["Budi Santoso", "1811010101900001", "081234567890", "TKSK", "MESUJI"],
        ],
      },
    ]);

    const result = trySmartMap(buffer);
    expect(result!.sheetName).toBe("Strong");
  });

  it("defaults every row's JOB to 'Lainnya' when the file has no JOB/Jabatan column at all, instead of penalizing the score for a field that was never there", () => {
    const buffer = buildBuffer([
      {
        name: "Sheet1",
        rows: [
          ["NAMA PERSONEL", "NOMOR (NIK)", "NOMOR WA", "KABUPATEN"],
          ["JUNAIDI SULAIMAN", "1107090602760001", "6285277369299", "PIDIE"],
          ["MUHAMMAD AYYUB", "1107090704740003", "6285260020555", "PIDIE"],
        ],
      },
    ]);

    const result = trySmartMap(buffer);
    expect(result).not.toBeNull();
    expect(result!.fieldsDetected).not.toContain("job");
    expect(result!.rows.every((r) => r.job === "Lainnya")).toBe(true);
    expect(result!.score).toBeGreaterThanOrEqual(SMART_MAP_AUTO_ACCEPT_SCORE);
  });

  it("auto-accepts a bare Nama+NIK-only roster (no No WA, no JOB, no Kota/Kabupaten column at all) when the NIKs look clean", () => {
    // Mirrors real submitted files (e.g. a Bhabinkamtibmas roster with just "NO / POLRES / NAMA
    // PERSONIL / NOMOR ( NIK )"): No WA is optional at validation time and Kota/Kabupaten always
    // backfills from the PIC's declared location, so neither missing column should hold back an
    // otherwise clean two-column roster.
    const buffer = buildBuffer([
      {
        name: "Sheet1",
        rows: [
          ["NO", "POLRES", "NAMA PERSONIL", "NOMOR ( NIK )"],
          [1, "SAT BINMAS", "HASMAN HIDAYAH, S.H", "1104172112750000"],
          [2, "", "ZULKIFLI IRAWANSYAH", "1104032810790000"],
          [3, "", "WAHYUDDIN", "1117040101830000"],
        ],
      },
    ]);

    const result = trySmartMap(buffer);
    expect(result).not.toBeNull();
    expect(result!.fieldsDetected).toEqual(expect.arrayContaining(["nama", "nik"]));
    expect(result!.fieldsDetected).not.toContain("noWa");
    expect(result!.fieldsDetected).not.toContain("kotaKabupaten");
    expect(result!.rows).toHaveLength(3);
    expect(result!.score).toBeGreaterThanOrEqual(SMART_MAP_AUTO_ACCEPT_SCORE);
  });

  it("maps a NIK header even when embedded in a longer label, e.g. 'NOMOR ( NIK )'", () => {
    const buffer = buildBuffer([
      {
        name: "Sheet1",
        rows: [
          ["", "NO", "DITBINMAS", "NAMA PERSONIL", "NOMOR ( NIK )"],
          ["", 1, "", "AGUNG PRABOWO", "3674031004750000"],
        ],
      },
    ]);

    const result = trySmartMap(buffer);
    expect(result).not.toBeNull();
    expect(result!.fieldsDetected).toEqual(expect.arrayContaining(["nama", "nik"]));
    expect(result!.rows[0].nik).toBe("3674031004750000");
  });

  it("filters out structural noise rows (column-numbering row, bare section-header row) mixed into real roster data", () => {
    const buffer = buildBuffer([
      {
        name: "2026",
        rows: [
          ["NO", "", "NAMA", "PANGKAT / NRP", "JABATAN", "NIK", "HP", "KET"],
          [1, "", 2, 3, 4, 5, 6, 7], // leftover column-numbering row — not a real record
          [1, 1, "DONNY SISWOYO", "KOMBES POL", "DIREKTUR BINMAS", "3471010803760001", "081168821998", ""],
          [2, "", "SUBBAGRENMIN", "", "", "", "", ""], // bare section heading — not a real record
          [2, 2, "AGUS SANTOSO", "AKBP", "KASUBBAG RENMIN", "3471010803760002", "081168821999", ""],
        ],
      },
    ]);

    const result = trySmartMap(buffer);
    expect(result).not.toBeNull();
    expect(result!.rows).toHaveLength(2);
    expect(result!.rows.map((r) => r.nama)).toEqual(["DONNY SISWOYO", "AGUS SANTOSO"]);
    // Both real rows have valid 16-digit NIKs, so the NIK-match component of the score should be
    // perfect — it wouldn't be if the noise rows (nik values "5" and "") were still counted.
    expect(result!.rows.every((r) => /^\d{16}$/.test(r.nik))).toBe(true);
  });

  it("defaults unrecognized JOB titles to Bhabinkamtibmas once the sheet is confirmed a Polri roster", () => {
    const buffer = buildBuffer([
      {
        name: "2026",
        rows: [
          ["NAMA", "NIK", "HP", "JABATAN"],
          ["DONNY SISWOYO", "3471010803760001", "081168821998", "DIREKTUR BINMAS"], // unambiguous Polri signal
          ["HAMIDAH", "1106085706800001", "08126973316", "KASUBBAGRENMIN"], // generic title, only resolved via sheet context
        ],
      },
    ]);

    const result = trySmartMap(buffer);
    expect(result!.rows[0].job).toBe("Bhabinkamtibmas");
    expect(result!.rows[1].job).toBe("Bhabinkamtibmas");
    expect(result!.score).toBeGreaterThanOrEqual(SMART_MAP_AUTO_ACCEPT_SCORE);
  });

  it("does NOT default a generic 'Kasubbag' title to Bhabinkamtibmas without a Polri signal elsewhere in the sheet", () => {
    const buffer = buildBuffer([
      {
        name: "Dinsos",
        rows: [
          ["NAMA", "NIK", "HP", "JABATAN"],
          ["SITI AMINAH", "3471010803760001", "081168821998", "KASUBBAG UMUM DINAS SOSIAL"],
        ],
      },
    ]);

    const result = trySmartMap(buffer);
    expect(result!.rows[0].job).toBe("KASUBBAG UMUM DINAS SOSIAL"); // left as-is, not guessed
  });

  it("maps a header where the field name is embedded in a longer label (e.g. 'NOMOR ( NIK )', 'NAMA PERSONIL')", () => {
    const buffer = buildBuffer([
      {
        name: "2026",
        rows: [
          ["NO", "", "NAMA", "PANGKAT / NRP", "JABATAN", "NIK", "HP", "KET"],
          [1, 1, "DONNY SISWOYO", "KOMBES POL", "DIREKTUR BINMAS", "3471010803760001", "081168821998", ""],
        ],
      },
    ]);

    const result = trySmartMap(buffer);
    expect(result).not.toBeNull();
    expect(result!.fieldsDetected).toEqual(expect.arrayContaining(["nama", "job", "nik", "noWa"]));
    expect(result!.rows[0].nik).toBe("3471010803760001");
    expect(result!.rows[0].job).toBe("Bhabinkamtibmas"); // guessed from "BINMAS" keyword
  });
});

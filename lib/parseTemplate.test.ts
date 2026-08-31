import { describe, expect, it } from "vitest";
import ExcelJS from "exceljs";
import path from "node:path";
import { readFileSync } from "node:fs";
import { isNikNumericRisk, parseSubmissionFile } from "./parseTemplate";

async function buildFixtureWorkbook(dataRows: string[][]): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet("Form");
  sheet.getCell("C2").value = "LAMPUNG";
  sheet.getRow(6).values = ["No", "Nama", "NIK", "No WA", "JOB", "Kota Kabupaten"];
  dataRows.forEach((values, i) => {
    sheet.getRow(7 + i).values = values;
  });
  const arrayBuffer = await workbook.xlsx.writeBuffer();
  return Buffer.from(arrayBuffer);
}

describe("parseSubmissionFile (synthetic fixture)", () => {
  it("reads the declared Provinsi from C2", async () => {
    const buffer = await buildFixtureWorkbook([]);
    const result = await parseSubmissionFile(buffer);
    expect(result.fileProvinsi).toBe("LAMPUNG");
  });

  it("reads agent rows starting at row 7 and stops after a long enough run of blank rows", async () => {
    const buffer = await buildFixtureWorkbook([
      ["1", "Budi Santoso", "1811010101900001", "081234567890", "Pendamping PKH", "MESUJI"],
      ["2", "Ani Wijaya", "1811010101900002", "081234567891", "TKSK", "MESUJI"],
      ...Array.from({ length: 10 }, () => [] as string[]), // 10 consecutive blank rows == the tolerance
      ["3", "Should Not Appear", "1811010101900003", "081234567892", "TKSK", "MESUJI"],
    ]);
    const result = await parseSubmissionFile(buffer);
    expect(result.rows).toHaveLength(2);
    expect(result.rows[0]).toMatchObject({ rowNumber: 7, nama: "Budi Santoso", nik: "1811010101900001" });
    expect(result.rows[1]).toMatchObject({ rowNumber: 8, nama: "Ani Wijaya" });
  });

  it("tolerates a single stray blank row in the middle of real data (e.g. row 7 accidentally left empty, data resuming at row 8)", async () => {
    const buffer = await buildFixtureWorkbook([
      [],
      ["2", "Suminar Adiningtyas", "3175085005890006", "082298016931", "Lainnya", "MESUJI"],
      ["3", "Yosafat Setyo Raharjo", "3175031711901003", "085741278778", "Lainnya", "MESUJI"],
    ]);
    const result = await parseSubmissionFile(buffer);
    expect(result.rows).toHaveLength(2);
    expect(result.rows[0]).toMatchObject({ rowNumber: 8, nama: "Suminar Adiningtyas" });
    expect(result.rows[1]).toMatchObject({ rowNumber: 9, nama: "Yosafat Setyo Raharjo" });
  });

  it("treats a row as blank when only the 'No' column has a leftover value (drag-autofill past the real data)", async () => {
    // Mirrors a real submitted file: real data ended at row 77, but the PIC's "No" column had
    // been autofilled all the way to row 139 — every other field on those trailing rows was
    // genuinely empty, yet the stray sequence number alone made them look "non-blank" and the
    // reader kept going, producing 62 phantom "Nama kosong / NIK kosong" invalid rows.
    const buffer = await buildFixtureWorkbook([
      ["1", "Budi Santoso", "1811010101900001", "081234567890", "Pendamping PKH", "MESUJI"],
      ["2", "Ani Wijaya", "1811010101900002", "081234567891", "TKSK", "MESUJI"],
      ...Array.from({ length: 15 }, (_, i) => [String(i + 3)] as string[]), // "No" only, rest blank
    ]);
    const result = await parseSubmissionFile(buffer);
    expect(result.rows).toHaveLength(2);
    expect(result.rows.map((r) => r.nama)).toEqual(["Budi Santoso", "Ani Wijaya"]);
  });

  it("flags a NIK read from a Number-formatted cell as at-risk once it exceeds what a 64-bit float can represent exactly (province code 90+)", async () => {
    const buffer = await buildFixtureWorkbook([]);
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(buffer as any);
    const sheet = workbook.getWorksheet("Form")!;
    // Row 7: a Papua-region NIK (province 94) typed as a Number — at risk.
    sheet.getRow(7).getCell(2).value = "Budi Papua";
    sheet.getRow(7).getCell(3).value = 9407199254740991; // numeric, not a string
    // Row 8: the same magnitude of NIK but stored as Text — always safe regardless of value.
    sheet.getRow(8).getCell(2).value = "Ani Papua";
    sheet.getRow(8).getCell(3).value = "9407199254740991";
    // Row 9: a normal-range NIK (province 18) typed as a Number — safe, well under the float limit.
    sheet.getRow(9).getCell(2).value = "Citra Lampung";
    sheet.getRow(9).getCell(3).value = 1811010101900001;
    const rewritten = Buffer.from(await workbook.xlsx.writeBuffer());

    const result = await parseSubmissionFile(rewritten);
    expect(result.rows).toHaveLength(3);
    expect(result.rows[0]).toMatchObject({ nama: "Budi Papua", nikNumericRisk: true });
    expect(result.rows[1]).toMatchObject({ nama: "Ani Papua", nikNumericRisk: false });
    expect(result.rows[2]).toMatchObject({ nama: "Citra Lampung", nikNumericRisk: false });
  });

  it("isNikNumericRisk: only true for a Number-type cell whose value is >= Number.MAX_SAFE_INTEGER", () => {
    const numberCell = { type: ExcelJS.ValueType.Number } as ExcelJS.Cell;
    const stringCell = { type: ExcelJS.ValueType.String } as ExcelJS.Cell;
    expect(isNikNumericRisk(numberCell, "9407199254740991")).toBe(true);
    expect(isNikNumericRisk(numberCell, "1811010101900001")).toBe(false); // below the float limit
    expect(isNikNumericRisk(stringCell, "9407199254740991")).toBe(false); // text, never at risk
    expect(isNikNumericRisk(numberCell, "not-16-digits")).toBe(false);
  });

  it("reads a name that Excel auto-linked as a hyperlink with nested rich text (e.g. '...M.Si')", async () => {
    const buffer = await buildFixtureWorkbook([]);
    // Simulate the shape exceljs produces for a hyperlinked, partially-rich-text cell, which a
    // naive String() coercion turns into "[object Object]".
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(buffer as any);
    const sheet = workbook.getWorksheet("Form")!;
    sheet.getRow(7).getCell(2).value = {
      text: {
        richText: [
          { font: {}, text: "Rika Elsya Putri, S.E., " },
          { font: { underline: true }, text: "M.Si" },
        ],
      },
      hyperlink: "http://m.si/",
    } as any;
    const rewritten = Buffer.from(await workbook.xlsx.writeBuffer());

    const result = await parseSubmissionFile(rewritten);
    expect(result.rows[0].nama).toBe("Rika Elsya Putri, S.E., M.Si");
  });

  it("returns an empty rows array when there is no data", async () => {
    const buffer = await buildFixtureWorkbook([]);
    const result = await parseSubmissionFile(buffer);
    expect(result.rows).toEqual([]);
  });
});

describe("parseSubmissionFile (real Template File.xlsx)", () => {
  it("reads the real template's Form sheet without error (still empty of data rows)", async () => {
    const buffer = readFileSync(path.join(process.cwd(), "data", "Template File.xlsx"));
    const result = await parseSubmissionFile(buffer);
    expect(result.rows).toEqual([]);
    expect(typeof result.fileProvinsi).toBe("string");
  });
});

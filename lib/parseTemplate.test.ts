import { describe, expect, it } from "vitest";
import ExcelJS from "exceljs";
import path from "node:path";
import { readFileSync } from "node:fs";
import { parseSubmissionFile } from "./parseTemplate";

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

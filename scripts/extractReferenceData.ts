// Generates data/referenceData.json from the "Master Data" sheet of data/Template File.xlsx.
// Run manually (npm run extract-reference-data) whenever the template's Master Data changes.
import ExcelJS from "exceljs";
import { writeFileSync } from "node:fs";
import path from "node:path";
import type { CityRef, JobRef, ProvinceRef, ReferenceData } from "../types/index";

const SOURCE_FILE = "Template File.xlsx";
const SOURCE_PATH = path.join(process.cwd(), "data", SOURCE_FILE);
const OUTPUT_PATH = path.join(process.cwd(), "data", "referenceData.json");

// 1-indexed column numbers on the "Master Data" sheet.
const COL = {
  cityId: 7, // G
  cityName: 8, // H
  cityCode: 9, // I
  provinceId: 10, // J
  provinceName: 11, // K
  provinceCode: 12, // L
  jobName: 15, // O
  jobId: 16, // P
};

// Strips zero-width/invisible unicode characters (seen in the source sheet, e.g. U+2060
// WORD JOINER before "Pendamping PKH") that would otherwise silently break exact-match lookups.
// Zero-width/invisible unicode code points seen in the source sheet (e.g. U+2060 WORD JOINER
// before "Pendamping PKH") that would otherwise silently break exact-match lookups.
const INVISIBLE_CODE_POINTS = [0x200b, 0x200c, 0x200d, 0x2060, 0xfeff];
const INVISIBLE_CHARS_RE = new RegExp(
  `[${INVISIBLE_CODE_POINTS.map((cp) => String.fromCharCode(cp)).join("")}]`,
  "g"
);

function stripInvisible(s: string): string {
  return s.replace(INVISIBLE_CHARS_RE, "").trim();
}

function cellText(cell: ExcelJS.Cell): string {
  const v = cell.value;
  if (v === null || v === undefined) return "";
  if (typeof v === "object" && "result" in v) return stripInvisible(String((v as any).result ?? ""));
  return stripInvisible(String(v));
}

async function main() {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.readFile(SOURCE_PATH);

  const sheet = workbook.getWorksheet("Master Data");
  if (!sheet) {
    throw new Error(`Sheet "Master Data" not found in ${SOURCE_FILE}`);
  }

  const citiesByCode = new Map<string, CityRef>();
  const provincesByCode = new Map<string, ProvinceRef>();
  const jobs: JobRef[] = [];
  const seenJobIds = new Set<string>();

  sheet.eachRow((row, rowNumber) => {
    const cityName = cellText(row.getCell(COL.cityName));
    const cityCode = cellText(row.getCell(COL.cityCode));
    const provinceName = cellText(row.getCell(COL.provinceName));
    const provinceCode = cellText(row.getCell(COL.provinceCode));

    if (rowNumber >= 2 && cityName && cityCode && provinceName && provinceCode) {
      if (!citiesByCode.has(cityCode)) {
        citiesByCode.set(cityCode, { cityCode, cityName, provinceCode, provinceName });
      }
      if (!provincesByCode.has(provinceCode)) {
        provincesByCode.set(provinceCode, { provinceCode, provinceName });
      }
    }

    const jobName = cellText(row.getCell(COL.jobName));
    const jobIdRaw = cellText(row.getCell(COL.jobId));
    if (jobName && jobIdRaw) {
      const jobId = jobIdRaw.replace(/\.0$/, "");
      if (!seenJobIds.has(jobId)) {
        seenJobIds.add(jobId);
        jobs.push({ jobId, jobName });
      }
    }
  });

  const referenceData: ReferenceData = {
    generatedAt: new Date().toISOString(),
    sourceFile: SOURCE_FILE,
    provinces: [...provincesByCode.values()].sort((a, b) =>
      a.provinceCode.localeCompare(b.provinceCode)
    ),
    cities: [...citiesByCode.values()].sort((a, b) => a.cityCode.localeCompare(b.cityCode)),
    jobs: jobs.sort((a, b) => Number(a.jobId) - Number(b.jobId)),
  };

  writeFileSync(OUTPUT_PATH, JSON.stringify(referenceData, null, 2) + "\n", "utf-8");

  console.log(`Wrote ${OUTPUT_PATH}`);
  console.log(`  provinces: ${referenceData.provinces.length}`);
  console.log(`  cities:    ${referenceData.cities.length}`);
  console.log(`  jobs:      ${referenceData.jobs.length}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

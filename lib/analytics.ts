import { getDb } from "./db";

// Raw error strings from lib/validate.ts carry dynamic details (a NIK, a count, a JOB title) that
// would otherwise make every occurrence look like a distinct error in a frequency count. These
// patterns collapse each one back to its stable category so "JOB tidak dikenali" shows up as one
// bucket instead of one per different bad JOB value.
const ERROR_CATEGORIES: Array<{ label: string; test: (e: string) => boolean }> = [
  { label: "Nama kosong", test: (e) => e === "Nama kosong" },
  { label: "NIK kosong", test: (e) => e === "NIK kosong" },
  { label: "JOB kosong", test: (e) => e === "JOB kosong" },
  { label: "Kota Kabupaten kosong", test: (e) => e === "Kota Kabupaten kosong" },
  { label: "NIK harus 16 digit angka", test: (e) => e === "NIK harus 16 digit angka" },
  { label: "NIK duplikat dalam file ini", test: (e) => e.startsWith("NIK duplikat dalam file ini") },
  {
    label: "NIK sudah terdaftar pada submission sebelumnya",
    test: (e) => e.startsWith("NIK sudah terdaftar pada submission sebelumnya"),
  },
  { label: "JOB tidak dikenali", test: (e) => e.startsWith("JOB tidak dikenali") },
  { label: "Kota/Kabupaten tidak sesuai dengan Provinsi", test: (e) => e.includes("tidak sesuai dengan Provinsi") },
];

function categorizeError(raw: string): string {
  return ERROR_CATEGORIES.find((c) => c.test(raw))?.label ?? raw;
}

export interface ErrorFrequency {
  label: string;
  count: number;
}

/** Tallies how often each category of validation error occurs across every invalid row ever stored, most common first. */
export async function getErrorFrequency(): Promise<ErrorFrequency[]> {
  const db = await getDb();
  const rs = await db.execute("SELECT errors FROM submission_rows WHERE status = 'invalid'");

  const counts = new Map<string, number>();
  for (const row of rs.rows) {
    const errors: string[] = JSON.parse(row.errors as string);
    for (const raw of errors) {
      const label = categorizeError(raw);
      counts.set(label, (counts.get(label) ?? 0) + 1);
    }
  }

  return [...counts.entries()].map(([label, count]) => ({ label, count })).sort((a, b) => b.count - a.count);
}

export interface ProvinceBreakdown {
  provinsi: string;
  submissionCount: number;
  validRows: number;
  invalidRows: number;
}

/** Submission and row-validity counts grouped by the PIC's declared Provinsi (from the Form, not the file) — surfaces which regions have the most volume or the worst data quality. */
export async function getProvinceBreakdown(): Promise<ProvinceBreakdown[]> {
  const db = await getDb();
  const rs = await db.execute(
    `SELECT
      declared_provinsi as provinsi,
      COUNT(*) as submissionCount,
      SUM(valid_count) as validRows,
      SUM(invalid_count) as invalidRows
    FROM submissions
    GROUP BY declared_provinsi
    ORDER BY submissionCount DESC`
  );
  return rs.rows as unknown as ProvinceBreakdown[];
}

export interface ValidityTrendPoint {
  date: string; // "DD/MM/YYYY", matching the Form's own timestamp format
  submissionCount: number;
  validCount: number;
  invalidCount: number;
}

/** Valid/invalid row counts bucketed by calendar day (from each submission's Form timestamp), newest day first — for spotting whether data quality is trending up or down over time. */
export async function getValidityTrend(): Promise<ValidityTrendPoint[]> {
  const db = await getDb();
  const rs = await db.execute(
    "SELECT timestamp, valid_count as validCount, invalid_count as invalidCount FROM submissions WHERE status = 'processed'"
  );

  const buckets = new Map<string, ValidityTrendPoint & { sortKey: number }>();
  for (const r of rs.rows as unknown as Array<{ timestamp: string; validCount: number; invalidCount: number }>) {
    const datePart = r.timestamp.split(" ")[0]; // "DD/MM/YYYY"
    const [d, m, y] = datePart.split("/").map(Number);
    const sortKey = new Date(y, (m || 1) - 1, d || 1).getTime();

    const existing = buckets.get(datePart) ?? { date: datePart, submissionCount: 0, validCount: 0, invalidCount: 0, sortKey };
    existing.submissionCount += 1;
    existing.validCount += r.validCount;
    existing.invalidCount += r.invalidCount;
    buckets.set(datePart, existing);
  }

  return [...buckets.values()]
    .sort((a, b) => b.sortKey - a.sortKey)
    .map(({ sortKey, ...rest }) => rest);
}

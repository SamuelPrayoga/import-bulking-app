export interface ProvinceRef {
  provinceCode: string;
  provinceName: string;
}

export interface CityRef {
  cityCode: string; // 4-digit combined province+city code, e.g. "1811"
  cityName: string;
  provinceCode: string;
  provinceName: string;
}

export interface JobRef {
  jobId: string;
  jobName: string;
}

export interface ReferenceData {
  generatedAt: string;
  sourceFile: string;
  provinces: ProvinceRef[];
  cities: CityRef[];
  jobs: JobRef[];
}

// One raw agent row as read from the "Form" sheet of an uploaded submission file.
export interface RawAgentRow {
  rowNumber: number;
  no: string;
  nama: string;
  nik: string;
  noWa: string;
  job: string;
  kotaKabupaten: string;
  /**
   * True when the NIK cell was stored as a Number (not Text) in the source file AND its value is
   * large enough (province code 90+) to exceed what a 64-bit float can represent exactly — Excel
   * itself silently rounds the trailing digit(s) in that case, before the file ever reaches us.
   * Not an error (we can't know the true original digits), just a flag for a manual-review warning.
   */
  nikNumericRisk?: boolean;
}

export interface ParsedSubmissionFile {
  fileProvinsi: string;
  rows: RawAgentRow[];
}

export type RowStatus = "valid" | "invalid";

export interface ValidatedRow extends RawAgentRow {
  status: RowStatus;
  errors: string[];
  /** Non-blocking notes — doesn't affect `status`, unlike `errors`. */
  warnings: string[];
  kodeProv: string | null;
  kodeKota: string | null;
  jobId: string | null;
}

export interface FormResponseRecord {
  id: string;
  timestamp: string;
  email: string;
  picName: string;
  picWhatsappRaw: string;
  picWhatsappNormalized: string | null;
  picWhatsappValid: boolean;
  declaredProvinsi: string;
  declaredKabKota: string;
  driveLink: string;
  driveFileId: string | null;
  instansi: string;
  /** Raw value of the response sheet's "Status" column (K) — set by a separate process outside this app. */
  sheetStatus: string;
  /** This response's literal row number in the sheet (header = row 1), so column K can be targeted for a write. */
  sheetRowNumber: number;
}

export interface ReportRow extends ValidatedRow {
  submissionId: string;
  fileProvinsi: string | null;
  picName: string;
  instansi: string;
  picWhatsapp: string;
  timestamp: string;
  locationMismatch: boolean;
  declaredProvinsi: string;
  declaredKabKota: string;
  sheetStatus: string;
}

export interface SubmissionRecord {
  id: string;
  timestamp: string;
  email: string;
  picName: string;
  picWhatsapp: string;
  picWhatsappValid: boolean;
  declaredProvinsi: string;
  declaredKabKota: string;
  instansi: string;
  driveFileId: string;
  fileProvinsi: string | null;
  locationMismatch: boolean;
  validCount: number;
  invalidCount: number;
  status: "processed" | "failed";
  processedAt: string;
  errorMessage: string | null;
  /** Raw value of the response sheet's "Status" column (K) — set by a separate process outside this app. */
  sheetStatus: string;
  /** This submission's literal row number in the response sheet (header = row 1) — null for submissions saved before this was tracked, until backfilled. Needed to write column K for this specific row. */
  sheetRowNumber: number | null;
  /** How the rows were extracted: from the official "Form" sheet, or guessed via lib/smartMapping.ts. */
  importMethod: "template" | "smart-mapped";
  /** Confidence score (0-100) from lib/smartMapping.ts, only set when importMethod is "smart-mapped". */
  mappingScore: number | null;
  /** When the operator marked this submission as followed up with the PIC (e.g. via WA) — null if not yet. */
  followedUpAt: string | null;
  /** True when at least one row's NIK also appears in an earlier submission under a different name. */
  hasNameMismatch: boolean;
  /** True when at least one row's Kota/Kabupaten was auto-corrected to the PIC's declared kab/kota because it didn't belong to the file's province at all. */
  hasKabKotaAutoFix: boolean;
  /** True when at least one row's JOB didn't match any reference category and was auto-corrected to "Lainnya". */
  hasJobFallback: boolean;
}

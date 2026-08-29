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
}

export interface ParsedSubmissionFile {
  fileProvinsi: string;
  rows: RawAgentRow[];
}

export type RowStatus = "valid" | "invalid";

export interface ValidatedRow extends RawAgentRow {
  status: RowStatus;
  errors: string[];
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
  /** How the rows were extracted: from the official "Form" sheet, or guessed via lib/smartMapping.ts. */
  importMethod: "template" | "smart-mapped";
  /** Confidence score (0-100) from lib/smartMapping.ts, only set when importMethod is "smart-mapped". */
  mappingScore: number | null;
}

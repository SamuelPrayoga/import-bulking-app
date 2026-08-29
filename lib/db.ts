import Database from "better-sqlite3";
import path from "node:path";
import { mkdirSync } from "node:fs";
import type { ReportRow, SubmissionRecord, ValidatedRow } from "../types/index";
import type { NikRegistryHit } from "./validate";
import { parseFormTimestamp } from "./formTimestamp";

const NIK_RE = /^\d{16}$/;

let db: Database.Database | null = null;

export function getDb(): Database.Database {
  if (db) return db;
  const dbPath = process.env.APP_DB_PATH || path.join(process.cwd(), "data", "app.db");
  mkdirSync(path.dirname(dbPath), { recursive: true });
  db = new Database(dbPath);
  db.pragma("journal_mode = WAL");
  initSchema(db);
  return db;
}

/** Closes the current connection so a fresh one (e.g. against a different APP_DB_PATH) can be opened. Test-only. */
export function closeDb(): void {
  db?.close();
  db = null;
}

function initSchema(database: Database.Database): void {
  database.exec(`
    CREATE TABLE IF NOT EXISTS submissions (
      id TEXT PRIMARY KEY,
      timestamp TEXT NOT NULL,
      email TEXT NOT NULL,
      pic_name TEXT NOT NULL,
      pic_whatsapp TEXT NOT NULL,
      pic_whatsapp_valid INTEGER NOT NULL,
      declared_provinsi TEXT NOT NULL,
      declared_kabkota TEXT NOT NULL,
      instansi TEXT NOT NULL,
      drive_file_id TEXT NOT NULL,
      file_provinsi TEXT,
      sheet_status TEXT NOT NULL DEFAULT '',
      location_mismatch INTEGER NOT NULL DEFAULT 0,
      valid_count INTEGER NOT NULL DEFAULT 0,
      invalid_count INTEGER NOT NULL DEFAULT 0,
      status TEXT NOT NULL,
      processed_at TEXT NOT NULL,
      error_message TEXT,
      import_method TEXT NOT NULL DEFAULT 'template',
      mapping_score INTEGER
    );

    CREATE TABLE IF NOT EXISTS submission_rows (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      submission_id TEXT NOT NULL REFERENCES submissions(id),
      row_number INTEGER NOT NULL,
      no TEXT,
      nama TEXT,
      nik TEXT,
      no_wa TEXT,
      job TEXT,
      kota_kabupaten TEXT,
      kode_prov TEXT,
      kode_kota TEXT,
      job_id TEXT,
      status TEXT NOT NULL,
      errors TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_submission_rows_submission_id ON submission_rows(submission_id);

    CREATE TABLE IF NOT EXISTS nik_registry (
      nik TEXT PRIMARY KEY,
      submission_id TEXT NOT NULL REFERENCES submissions(id),
      row_id INTEGER NOT NULL REFERENCES submission_rows(id),
      pic_name TEXT NOT NULL,
      timestamp TEXT NOT NULL,
      first_seen_at TEXT NOT NULL
    );
  `);
}

export function submissionExists(id: string): boolean {
  const row = getDb().prepare("SELECT 1 FROM submissions WHERE id = ?").get(id);
  return row !== undefined;
}

export function findNikInRegistry(nik: string): NikRegistryHit | null {
  const row = getDb()
    .prepare("SELECT pic_name as picName, timestamp FROM nik_registry WHERE nik = ?")
    .get(nik) as NikRegistryHit | undefined;
  return row ?? null;
}

/** Persists one fully-validated submission (header + all rows) and registers its valid-format NIKs, atomically. */
export function saveProcessedSubmission(submission: SubmissionRecord, rows: ValidatedRow[]): void {
  const database = getDb();

  const insertSubmission = database.prepare(`
    INSERT INTO submissions (
      id, timestamp, email, pic_name, pic_whatsapp, pic_whatsapp_valid,
      declared_provinsi, declared_kabkota, instansi, drive_file_id, file_provinsi,
      sheet_status, location_mismatch, valid_count, invalid_count, status, processed_at, error_message,
      import_method, mapping_score
    ) VALUES (
      @id, @timestamp, @email, @picName, @picWhatsapp, @picWhatsappValid,
      @declaredProvinsi, @declaredKabKota, @instansi, @driveFileId, @fileProvinsi,
      @sheetStatus, @locationMismatch, @validCount, @invalidCount, @status, @processedAt, @errorMessage,
      @importMethod, @mappingScore
    )
  `);

  const insertRow = database.prepare(`
    INSERT INTO submission_rows (
      submission_id, row_number, no, nama, nik, no_wa, job, kota_kabupaten,
      kode_prov, kode_kota, job_id, status, errors
    ) VALUES (
      @submissionId, @rowNumber, @no, @nama, @nik, @noWa, @job, @kotaKabupaten,
      @kodeProv, @kodeKota, @jobId, @status, @errors
    )
  `);

  const registerNik = database.prepare(`
    INSERT OR IGNORE INTO nik_registry (nik, submission_id, row_id, pic_name, timestamp, first_seen_at)
    VALUES (@nik, @submissionId, @rowId, @picName, @timestamp, @firstSeenAt)
  `);

  const run = database.transaction(() => {
    insertSubmission.run({
      ...submission,
      picWhatsappValid: submission.picWhatsappValid ? 1 : 0,
      locationMismatch: submission.locationMismatch ? 1 : 0,
    });

    for (const r of rows) {
      const info = insertRow.run({
        submissionId: submission.id,
        rowNumber: r.rowNumber,
        no: r.no,
        nama: r.nama,
        nik: r.nik,
        noWa: r.noWa,
        job: r.job,
        kotaKabupaten: r.kotaKabupaten,
        kodeProv: r.kodeProv,
        kodeKota: r.kodeKota,
        jobId: r.jobId,
        status: r.status,
        errors: JSON.stringify(r.errors),
      });

      if (NIK_RE.test(r.nik)) {
        registerNik.run({
          nik: r.nik,
          submissionId: submission.id,
          rowId: Number(info.lastInsertRowid),
          picName: submission.picName,
          timestamp: submission.timestamp,
          firstSeenAt: new Date().toISOString(),
        });
      }
    }
  });

  run();
}

export function listSubmissions(): SubmissionRecord[] {
  const rows = getDb()
    .prepare(
      `SELECT
        id, timestamp, email, pic_name as picName, pic_whatsapp as picWhatsapp,
        pic_whatsapp_valid as picWhatsappValid, declared_provinsi as declaredProvinsi,
        declared_kabkota as declaredKabKota, instansi, drive_file_id as driveFileId,
        file_provinsi as fileProvinsi, sheet_status as sheetStatus, location_mismatch as locationMismatch,
        valid_count as validCount, invalid_count as invalidCount, status, processed_at as processedAt,
        error_message as errorMessage, import_method as importMethod, mapping_score as mappingScore
      FROM submissions`
    )
    .all() as Array<Record<string, unknown>>;

  const submissions = rows.map((r) => ({
    ...r,
    picWhatsappValid: Boolean(r.picWhatsappValid),
    locationMismatch: Boolean(r.locationMismatch),
  })) as SubmissionRecord[];

  // The Form's "DD/MM/YYYY H:MM:SS" timestamp doesn't sort correctly as a plain string (e.g. "9:.."
  // vs "11:.." or single- vs double-digit days), so it must be parsed before sorting newest-first.
  return submissions.sort((a, b) => parseFormTimestamp(b.timestamp) - parseFormTimestamp(a.timestamp));
}

export function getSubmission(submissionId: string): SubmissionRecord | null {
  const r = getDb()
    .prepare(
      `SELECT
        id, timestamp, email, pic_name as picName, pic_whatsapp as picWhatsapp,
        pic_whatsapp_valid as picWhatsappValid, declared_provinsi as declaredProvinsi,
        declared_kabkota as declaredKabKota, instansi, drive_file_id as driveFileId,
        file_provinsi as fileProvinsi, sheet_status as sheetStatus, location_mismatch as locationMismatch,
        valid_count as validCount, invalid_count as invalidCount, status, processed_at as processedAt,
        error_message as errorMessage, import_method as importMethod, mapping_score as mappingScore
      FROM submissions WHERE id = ?`
    )
    .get(submissionId) as Record<string, unknown> | undefined;
  if (!r) return null;
  return { ...r, picWhatsappValid: Boolean(r.picWhatsappValid), locationMismatch: Boolean(r.locationMismatch) } as SubmissionRecord;
}

/** Raw (unvalidated) row fields plus the internal row id, for re-running validation against already-stored data. */
export function getRawSubmissionRows(
  submissionId: string
): Array<{ dbId: number; rowNumber: number; no: string; nama: string; nik: string; noWa: string; job: string; kotaKabupaten: string }> {
  return getDb()
    .prepare(
      `SELECT id as dbId, row_number as rowNumber, no, nama, nik, no_wa as noWa, job, kota_kabupaten as kotaKabupaten
      FROM submission_rows WHERE submission_id = ? ORDER BY row_number ASC`
    )
    .all(submissionId) as Array<{
    dbId: number;
    rowNumber: number;
    no: string;
    nama: string;
    nik: string;
    noWa: string;
    job: string;
    kotaKabupaten: string;
  }>;
}

/** Overwrites one row's computed validation fields in place (used by the revalidation backfill). */
export function updateRowValidation(
  dbId: number,
  patch: Pick<ValidatedRow, "nama" | "kotaKabupaten" | "status" | "errors" | "kodeProv" | "kodeKota" | "jobId">
): void {
  getDb()
    .prepare(
      `UPDATE submission_rows SET nama = @nama, kota_kabupaten = @kotaKabupaten, status = @status,
        errors = @errors, kode_prov = @kodeProv, kode_kota = @kodeKota, job_id = @jobId WHERE id = @dbId`
    )
    .run({
      dbId,
      nama: patch.nama,
      kotaKabupaten: patch.kotaKabupaten,
      status: patch.status,
      errors: JSON.stringify(patch.errors),
      kodeProv: patch.kodeProv,
      kodeKota: patch.kodeKota,
      jobId: patch.jobId,
    });
}

/** Updates a submission's cached valid/invalid row counts (used by the revalidation backfill). */
export function updateSubmissionCounts(submissionId: string, validCount: number, invalidCount: number): void {
  getDb()
    .prepare("UPDATE submissions SET valid_count = @validCount, invalid_count = @invalidCount WHERE id = @submissionId")
    .run({ submissionId, validCount, invalidCount });
}

/** Updates just the sheet_status field, e.g. once a submission that predates this column is re-synced. Backfill-only. */
export function updateSheetStatus(submissionId: string, sheetStatus: string): void {
  getDb()
    .prepare("UPDATE submissions SET sheet_status = @sheetStatus WHERE id = @submissionId")
    .run({ submissionId, sheetStatus });
}

/** Updates just the file_provinsi field — used when the revalidation backfill applies the declaredProvinsi fallback for a blank C2 to already-stored submissions. Backfill-only. */
export function updateSubmissionFileProvinsi(submissionId: string, fileProvinsi: string): void {
  getDb()
    .prepare("UPDATE submissions SET file_provinsi = @fileProvinsi WHERE id = @submissionId")
    .run({ submissionId, fileProvinsi });
}

/** Deletes a submission and its rows/NIK-registry entries entirely, so it can be reprocessed from scratch. Backfill-only. */
export function deleteSubmission(submissionId: string): void {
  const database = getDb();
  const run = database.transaction(() => {
    database.prepare("DELETE FROM nik_registry WHERE submission_id = ?").run(submissionId);
    database.prepare("DELETE FROM submission_rows WHERE submission_id = ?").run(submissionId);
    database.prepare("DELETE FROM submissions WHERE id = ?").run(submissionId);
  });
  run();
}

/** Wipes the NIK registry so it can be rebuilt from scratch in chronological order. Backfill-only. */
export function clearNikRegistry(): void {
  getDb().exec("DELETE FROM nik_registry");
}

/** Registers one NIK in the registry (used by the revalidation backfill, mirroring saveProcessedSubmission's logic). */
export function registerNikForBackfill(nik: string, submissionId: string, rowDbId: number, picName: string, timestamp: string): void {
  getDb()
    .prepare(
      `INSERT OR IGNORE INTO nik_registry (nik, submission_id, row_id, pic_name, timestamp, first_seen_at)
      VALUES (@nik, @submissionId, @rowDbId, @picName, @timestamp, @firstSeenAt)`
    )
    .run({ nik, submissionId, rowDbId, picName, timestamp, firstSeenAt: new Date().toISOString() });
}

/** All submissions ordered by their Form response timestamp (oldest first) — the order PICs actually submitted in, which is what "NIK already registered in an earlier submission" should be measured against. */
export function listSubmissionsChronological(): SubmissionRecord[] {
  return listSubmissions().sort((a, b) => parseFormTimestamp(a.timestamp) - parseFormTimestamp(b.timestamp));
}

export function getSubmissionRows(submissionId: string): ValidatedRow[] {
  const rows = getDb()
    .prepare(
      `SELECT
        row_number as rowNumber, no, nama, nik, no_wa as noWa, job, kota_kabupaten as kotaKabupaten,
        kode_prov as kodeProv, kode_kota as kodeKota, job_id as jobId, status, errors
      FROM submission_rows WHERE submission_id = ? ORDER BY row_number ASC`
    )
    .all(submissionId) as Array<Record<string, unknown>>;

  return rows.map((r) => ({
    ...r,
    errors: JSON.parse(r.errors as string),
  })) as ValidatedRow[];
}

/** Rows joined with their parent submission's metadata, for building the consolidated report. */
export function getReportRows(submissionId?: string): ReportRow[] {
  const query = `
    SELECT
      sr.row_number as rowNumber, sr.no, sr.nama, sr.nik, sr.no_wa as noWa, sr.job,
      sr.kota_kabupaten as kotaKabupaten, sr.kode_prov as kodeProv, sr.kode_kota as kodeKota,
      sr.job_id as jobId, sr.status, sr.errors,
      s.id as submissionId, s.file_provinsi as fileProvinsi, s.pic_name as picName,
      s.instansi, s.pic_whatsapp as picWhatsapp, s.timestamp,
      s.location_mismatch as locationMismatch, s.declared_provinsi as declaredProvinsi,
      s.declared_kabkota as declaredKabKota
    FROM submission_rows sr
    JOIN submissions s ON s.id = sr.submission_id
    ${submissionId ? "WHERE s.id = @submissionId" : ""}
    ORDER BY s.timestamp ASC, sr.row_number ASC
  `;
  const rows = getDb()
    .prepare(query)
    .all(submissionId ? { submissionId } : {}) as Array<Record<string, unknown>>;

  return rows.map((r) => ({
    ...r,
    locationMismatch: Boolean(r.locationMismatch),
    errors: JSON.parse(r.errors as string),
  })) as unknown as ReportRow[];
}

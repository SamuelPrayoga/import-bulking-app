import { createClient, type Client } from "@libsql/client";
import path from "node:path";
import { mkdirSync } from "node:fs";
import type { ReportRow, SubmissionRecord, ValidatedRow } from "../types/index";
import type { NikHistoryHit, NikRegistryHit } from "./validate";
import { parseFormTimestamp } from "./formTimestamp";
import { isSheetStatusDone } from "./sheetStatus";

const NIK_RE = /^\d{16}$/;

let schemaReady: Promise<void> | null = null;

// @libsql/client's HTTP transport calls the ambient global `fetch` under the hood, which in a
// Next.js Server Component is Next's own patched fetch with automatic request memoization/caching
// — the SECOND distinct call within one render was observed silently returning an empty/stale
// result instead of a fresh network response. Passing an explicit `cache: "no-store"` fetch
// override forces every libSQL request to opt out of that, regardless of route-level defaults.
function noStoreFetch(input: Parameters<typeof fetch>[0], init?: Parameters<typeof fetch>[1]): ReturnType<typeof fetch> {
  return fetch(input, { ...init, cache: "no-store" });
}

function buildClientConfig(): { url: string; authToken?: string; fetch: typeof noStoreFetch } {
  const tursoUrl = process.env.TURSO_DATABASE_URL;
  if (tursoUrl) {
    return { url: tursoUrl, authToken: process.env.TURSO_AUTH_TOKEN, fetch: noStoreFetch };
  }
  const dbPath = process.env.APP_DB_PATH || path.join(process.cwd(), "data", "app.db");
  mkdirSync(path.dirname(dbPath), { recursive: true });
  return { url: `file:${dbPath}`, fetch: noStoreFetch };
}

/**
 * Returns a fresh libSQL client, one per call — never a shared/reused instance. `createClient()`
 * itself does no network I/O (that only happens on `.execute()`), so this is cheap. Schema
 * initialization only actually runs once per process, via the memoized `schemaReady` promise. Uses
 * Turso (TURSO_DATABASE_URL/TURSO_AUTH_TOKEN) when configured — production — and otherwise falls
 * back to a local libSQL file (same APP_DB_PATH override the tests use).
 *
 * Prefer `withDb()` below for actually running a query — this is exported mainly for
 * interactive-transaction call sites and test setup that need the client object directly.
 */
export async function getDb(): Promise<Client> {
  const client = createClient(buildClientConfig());
  if (!schemaReady) schemaReady = initSchema(client);
  await schemaReady;
  return client;
}

let lastQueryDone: Promise<void> = Promise.resolve();
// Empirically the smallest reliable gap found (50ms always worked in testing; this adds margin).
// Only applied against real Turso — the local file: driver is a native binary with no HTTP
// round-trip, so there's nothing to race and no reason to slow down `npm run dev`/tests with it.
const MIN_QUERY_GAP_MS = 100;

/**
 * Runs one query/operation against a fresh client, serialized after any previous `withDb()` call
 * with a minimum gap enforced in between. On Vercel's serverless runtime, issuing a second,
 * independent HTTP request to Turso immediately after a prior one — even via unrelated
 * plain-`.execute()` calls, each with its own fresh Client — was observed to silently return an
 * empty result set instead of throwing or erroring; a small enforced gap between requests reliably
 * avoided it in testing (confirmed down to 50ms; this uses 100ms for margin). An interactive
 * `db.transaction()` should be run through here too (wrap the whole open→execute→commit sequence
 * in the callback) so its request doesn't collide with another `withDb()` call either.
 */
export async function withDb<T>(fn: (db: Client) => Promise<T>): Promise<T> {
  const previous = lastQueryDone;
  let releaseNext: () => void = () => {};
  lastQueryDone = new Promise<void>((resolve) => {
    releaseNext = resolve;
  });
  await previous;
  try {
    const client = await getDb();
    return await fn(client);
  } finally {
    if (process.env.TURSO_DATABASE_URL) {
      setTimeout(releaseNext, MIN_QUERY_GAP_MS);
    } else {
      releaseNext();
    }
  }
}

/** Forces the next getDb() call to re-run schema init (e.g. against a different APP_DB_PATH). Test-only. */
export function closeDb(): void {
  schemaReady = null;
  lastQueryDone = Promise.resolve();
}

async function initSchema(client: Client): Promise<void> {
  await client.executeMultiple(`
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
    CREATE INDEX IF NOT EXISTS idx_submission_rows_nik ON submission_rows(nik);

    CREATE TABLE IF NOT EXISTS nik_registry (
      nik TEXT PRIMARY KEY,
      submission_id TEXT NOT NULL REFERENCES submissions(id),
      row_id INTEGER NOT NULL REFERENCES submission_rows(id),
      pic_name TEXT NOT NULL,
      timestamp TEXT NOT NULL,
      first_seen_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS audit_log (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      timestamp TEXT NOT NULL,
      event_type TEXT NOT NULL,
      actor TEXT NOT NULL,
      ip TEXT NOT NULL,
      details TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_audit_log_timestamp ON audit_log(timestamp);
  `);

  // CREATE TABLE IF NOT EXISTS only handles a table that doesn't exist yet — a table that already
  // exists (the live data/app.db from before this column existed) needs an explicit ALTER TABLE.
  // Guarded by pragma table_info so this is safe to run on every startup, fresh DB or not.
  const submissionRowColumns = (await client.execute("PRAGMA table_info(submission_rows)")).rows as unknown as Array<{ name: string }>;
  if (!submissionRowColumns.some((c) => c.name === "warnings")) {
    await client.execute("ALTER TABLE submission_rows ADD COLUMN warnings TEXT NOT NULL DEFAULT '[]'");
  }
  if (!submissionRowColumns.some((c) => c.name === "nik_numeric_risk")) {
    await client.execute("ALTER TABLE submission_rows ADD COLUMN nik_numeric_risk INTEGER NOT NULL DEFAULT 0");
  }

  const submissionColumns = (await client.execute("PRAGMA table_info(submissions)")).rows as unknown as Array<{ name: string }>;
  if (!submissionColumns.some((c) => c.name === "followed_up_at")) {
    await client.execute("ALTER TABLE submissions ADD COLUMN followed_up_at TEXT");
  }
  if (!submissionColumns.some((c) => c.name === "has_name_mismatch")) {
    await client.execute("ALTER TABLE submissions ADD COLUMN has_name_mismatch INTEGER NOT NULL DEFAULT 0");
  }
  if (!submissionColumns.some((c) => c.name === "has_kabkota_autofix")) {
    await client.execute("ALTER TABLE submissions ADD COLUMN has_kabkota_autofix INTEGER NOT NULL DEFAULT 0");
  }
  if (!submissionColumns.some((c) => c.name === "has_job_fallback")) {
    await client.execute("ALTER TABLE submissions ADD COLUMN has_job_fallback INTEGER NOT NULL DEFAULT 0");
  }
  if (!submissionColumns.some((c) => c.name === "sheet_row_number")) {
    await client.execute("ALTER TABLE submissions ADD COLUMN sheet_row_number INTEGER");
  }
}

export async function submissionExists(id: string): Promise<boolean> {
  const rs = await withDb((db) => db.execute({ sql: "SELECT 1 FROM submissions WHERE id = ?", args: [id] }));
  return rs.rows.length > 0;
}

export async function findNikInRegistry(nik: string): Promise<NikRegistryHit | null> {
  const rs = await withDb((db) =>
    db.execute({
      sql: "SELECT pic_name as picName, timestamp FROM nik_registry WHERE nik = ?",
      args: [nik],
    })
  );
  return (rs.rows[0] as unknown as NikRegistryHit) ?? null;
}

/**
 * Finds the most recent submission's row for this NIK, including the agent name recorded there.
 * Pass `beforeProcessedAt` (a submission's own processedAt) when re-validating historical data in
 * chronological order, so a submission never sees NIKs from submissions processed after it.
 */
export async function findNikHistory(nik: string, beforeProcessedAt?: string): Promise<NikHistoryHit | null> {
  const rs = await withDb((db) =>
    beforeProcessedAt
      ? db.execute({
          sql: `SELECT r.nama as nama, s.pic_name as picName, s.timestamp as timestamp
           FROM submission_rows r
           JOIN submissions s ON s.id = r.submission_id
           WHERE r.nik = ? AND s.processed_at < ?
           ORDER BY s.processed_at DESC
           LIMIT 1`,
          args: [nik, beforeProcessedAt],
        })
      : db.execute({
          sql: `SELECT r.nama as nama, s.pic_name as picName, s.timestamp as timestamp
           FROM submission_rows r
           JOIN submissions s ON s.id = r.submission_id
           WHERE r.nik = ?
           ORDER BY s.processed_at DESC
           LIMIT 1`,
          args: [nik],
        })
  );
  return (rs.rows[0] as unknown as NikHistoryHit) ?? null;
}

/** Persists one fully-validated submission (header + all rows) and registers its valid-format NIKs, atomically. */
export async function saveProcessedSubmission(submission: SubmissionRecord, rows: ValidatedRow[]): Promise<void> {
  await withDb(async (db) => {
  const tx = await db.transaction("write");
  try {
    await tx.execute({
      sql: `INSERT INTO submissions (
        id, timestamp, email, pic_name, pic_whatsapp, pic_whatsapp_valid,
        declared_provinsi, declared_kabkota, instansi, drive_file_id, file_provinsi,
        sheet_status, location_mismatch, valid_count, invalid_count, status, processed_at, error_message,
        import_method, mapping_score, has_name_mismatch, has_kabkota_autofix, sheet_row_number, has_job_fallback
      ) VALUES (
        @id, @timestamp, @email, @picName, @picWhatsapp, @picWhatsappValid,
        @declaredProvinsi, @declaredKabKota, @instansi, @driveFileId, @fileProvinsi,
        @sheetStatus, @locationMismatch, @validCount, @invalidCount, @status, @processedAt, @errorMessage,
        @importMethod, @mappingScore, @hasNameMismatch, @hasKabKotaAutoFix, @sheetRowNumber, @hasJobFallback
      )`,
      args: {
        // Bound explicitly (not spread) — unlike better-sqlite3, @libsql/client requires the args
        // object to have exactly as many keys as named placeholders in the SQL, and SubmissionRecord
        // carries fields (like followedUpAt) that aren't part of this particular INSERT.
        id: submission.id,
        timestamp: submission.timestamp,
        email: submission.email,
        picName: submission.picName,
        picWhatsapp: submission.picWhatsapp,
        picWhatsappValid: submission.picWhatsappValid ? 1 : 0,
        declaredProvinsi: submission.declaredProvinsi,
        declaredKabKota: submission.declaredKabKota,
        instansi: submission.instansi,
        driveFileId: submission.driveFileId,
        fileProvinsi: submission.fileProvinsi,
        sheetStatus: submission.sheetStatus,
        locationMismatch: submission.locationMismatch ? 1 : 0,
        validCount: submission.validCount,
        invalidCount: submission.invalidCount,
        status: submission.status,
        processedAt: submission.processedAt,
        errorMessage: submission.errorMessage,
        importMethod: submission.importMethod,
        mappingScore: submission.mappingScore,
        hasNameMismatch: submission.hasNameMismatch ? 1 : 0,
        hasKabKotaAutoFix: submission.hasKabKotaAutoFix ? 1 : 0,
        sheetRowNumber: submission.sheetRowNumber,
        hasJobFallback: submission.hasJobFallback ? 1 : 0,
      } as never,
    });

    for (const r of rows) {
      const info = await tx.execute({
        sql: `INSERT INTO submission_rows (
          submission_id, row_number, no, nama, nik, no_wa, job, kota_kabupaten,
          kode_prov, kode_kota, job_id, status, errors, warnings, nik_numeric_risk
        ) VALUES (
          @submissionId, @rowNumber, @no, @nama, @nik, @noWa, @job, @kotaKabupaten,
          @kodeProv, @kodeKota, @jobId, @status, @errors, @warnings, @nikNumericRisk
        )`,
        args: {
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
          warnings: JSON.stringify(r.warnings),
          nikNumericRisk: r.nikNumericRisk ? 1 : 0,
        } as never,
      });

      if (NIK_RE.test(r.nik)) {
        await tx.execute({
          sql: `INSERT OR IGNORE INTO nik_registry (nik, submission_id, row_id, pic_name, timestamp, first_seen_at)
          VALUES (@nik, @submissionId, @rowId, @picName, @timestamp, @firstSeenAt)`,
          args: {
            nik: r.nik,
            submissionId: submission.id,
            rowId: Number(info.lastInsertRowid),
            picName: submission.picName,
            timestamp: submission.timestamp,
            firstSeenAt: new Date().toISOString(),
          } as never,
        });
      }
    }

    await tx.commit();
  } finally {
    // Not `await tx.close()` unguarded: a throw here (e.g. closing an already-committed
    // transaction) would override a successful `tx.commit()` above — a `finally` block that
    // throws replaces the try block's outcome even when the try already succeeded — silently
    // turning a real success into an apparent failure the caller then retries as a duplicate.
    try {
      tx.close();
    } catch {
      // already committed; a failure to close cleanly here isn't a real error.
    }
  }
  });
}

export async function listSubmissions(): Promise<SubmissionRecord[]> {
  const rs = await withDb((db) =>
    db.execute(
      `SELECT
      id, timestamp, email, pic_name as picName, pic_whatsapp as picWhatsapp,
      pic_whatsapp_valid as picWhatsappValid, declared_provinsi as declaredProvinsi,
      declared_kabkota as declaredKabKota, instansi, drive_file_id as driveFileId,
      file_provinsi as fileProvinsi, sheet_status as sheetStatus, location_mismatch as locationMismatch,
      valid_count as validCount, invalid_count as invalidCount, status, processed_at as processedAt,
      error_message as errorMessage, import_method as importMethod, mapping_score as mappingScore,
      followed_up_at as followedUpAt, has_name_mismatch as hasNameMismatch, has_kabkota_autofix as hasKabKotaAutoFix,
      sheet_row_number as sheetRowNumber, has_job_fallback as hasJobFallback
    FROM submissions`
    )
  );

  const submissions = rs.rows.map((r) => ({
    ...(r as unknown as Record<string, unknown>),
    picWhatsappValid: Boolean(r.picWhatsappValid),
    locationMismatch: Boolean(r.locationMismatch),
    hasNameMismatch: Boolean(r.hasNameMismatch),
    hasKabKotaAutoFix: Boolean(r.hasKabKotaAutoFix),
    hasJobFallback: Boolean(r.hasJobFallback),
  })) as SubmissionRecord[];

  // The Form's "DD/MM/YYYY H:MM:SS" timestamp doesn't sort correctly as a plain string (e.g. "9:.."
  // vs "11:.." or single- vs double-digit days), so it must be parsed before sorting newest-first.
  return submissions.sort((a, b) => parseFormTimestamp(b.timestamp) - parseFormTimestamp(a.timestamp));
}

/**
 * Finds every submission from one PIC's email, for the public self-service status lookup (no
 * login) — gated by a captcha (see lib/captcha.ts) plus the same per-IP lockout the login page
 * uses (see lib/auth.ts), rather than a second identity field, per explicit product decision.
 */
export async function findSubmissionsByEmail(email: string): Promise<SubmissionRecord[]> {
  const normalizedEmail = email.trim().toLowerCase();
  if (!normalizedEmail) return [];

  const submissions = await listSubmissions();
  return submissions.filter((s) => s.email.trim().toLowerCase() === normalizedEmail);
}

export async function getSubmission(submissionId: string): Promise<SubmissionRecord | null> {
  const rs = await withDb((db) =>
    db.execute({
      sql: `SELECT
      id, timestamp, email, pic_name as picName, pic_whatsapp as picWhatsapp,
      pic_whatsapp_valid as picWhatsappValid, declared_provinsi as declaredProvinsi,
      declared_kabkota as declaredKabKota, instansi, drive_file_id as driveFileId,
      file_provinsi as fileProvinsi, sheet_status as sheetStatus, location_mismatch as locationMismatch,
      valid_count as validCount, invalid_count as invalidCount, status, processed_at as processedAt,
      error_message as errorMessage, import_method as importMethod, mapping_score as mappingScore,
      followed_up_at as followedUpAt, has_name_mismatch as hasNameMismatch, has_kabkota_autofix as hasKabKotaAutoFix,
      sheet_row_number as sheetRowNumber, has_job_fallback as hasJobFallback
    FROM submissions WHERE id = ?`,
      args: [submissionId],
    })
  );
  const r = rs.rows[0];
  if (!r) return null;
  return {
    ...(r as unknown as Record<string, unknown>),
    picWhatsappValid: Boolean(r.picWhatsappValid),
    locationMismatch: Boolean(r.locationMismatch),
    hasNameMismatch: Boolean(r.hasNameMismatch),
    hasKabKotaAutoFix: Boolean(r.hasKabKotaAutoFix),
    hasJobFallback: Boolean(r.hasJobFallback),
  } as SubmissionRecord;
}

/** Raw (unvalidated) row fields plus the internal row id, for re-running validation against already-stored data. */
export async function getRawSubmissionRows(submissionId: string): Promise<Array<{
  dbId: number;
  rowNumber: number;
  no: string;
  nama: string;
  nik: string;
  noWa: string;
  job: string;
  kotaKabupaten: string;
  nikNumericRisk: boolean;
}>> {
  const rs = await withDb((db) =>
    db.execute({
      sql: `SELECT id as dbId, row_number as rowNumber, no, nama, nik, no_wa as noWa, job, kota_kabupaten as kotaKabupaten,
      nik_numeric_risk as nikNumericRisk
    FROM submission_rows WHERE submission_id = ? ORDER BY row_number ASC`,
      args: [submissionId],
    })
  );
  return rs.rows.map((r) => ({ ...(r as unknown as Record<string, unknown>), nikNumericRisk: Boolean(r.nikNumericRisk) })) as Array<{
    dbId: number;
    rowNumber: number;
    no: string;
    nama: string;
    nik: string;
    noWa: string;
    job: string;
    kotaKabupaten: string;
    nikNumericRisk: boolean;
  }>;
}

/** Overwrites one row's computed validation fields in place (used by the revalidation backfill). */
export async function updateRowValidation(
  dbId: number,
  patch: Pick<ValidatedRow, "nama" | "nik" | "noWa" | "job" | "kotaKabupaten" | "status" | "errors" | "warnings" | "kodeProv" | "kodeKota" | "jobId">
): Promise<void> {
  await withDb((db) =>
    db.execute({
      sql: `UPDATE submission_rows SET nama = @nama, nik = @nik, no_wa = @noWa, job = @job, kota_kabupaten = @kotaKabupaten, status = @status,
      errors = @errors, warnings = @warnings, kode_prov = @kodeProv, kode_kota = @kodeKota, job_id = @jobId WHERE id = @dbId`,
      args: {
        dbId,
        nama: patch.nama,
        nik: patch.nik,
        noWa: patch.noWa,
        job: patch.job,
        kotaKabupaten: patch.kotaKabupaten,
        status: patch.status,
        errors: JSON.stringify(patch.errors),
        warnings: JSON.stringify(patch.warnings),
        kodeProv: patch.kodeProv,
        kodeKota: patch.kodeKota,
        jobId: patch.jobId,
      } as never,
    })
  );
}

/** Updates a submission's cached valid/invalid row counts and name-mismatch flag (used by the revalidation backfill). */
export async function updateSubmissionCounts(
  submissionId: string,
  validCount: number,
  invalidCount: number,
  hasNameMismatch: boolean,
  hasKabKotaAutoFix: boolean,
  hasJobFallback: boolean
): Promise<void> {
  // has_kabkota_autofix and has_job_fallback are sticky (OR'd with their current value, never
  // reset to 0 here): both fixes overwrite the row in place (kota_kabupaten / job), so once fixed,
  // a *later* revalidation pass finds nothing left to flag — a plain overwrite would silently drop
  // the audit trail for exactly the rows these flags exist to surface. has_name_mismatch doesn't
  // have this problem (its NIK history comparison is unaffected by anything this function
  // changes), so it stays a live value.
  await withDb((db) =>
    db.execute({
      sql: `UPDATE submissions SET valid_count = @validCount, invalid_count = @invalidCount,
      has_name_mismatch = @hasNameMismatch,
      has_kabkota_autofix = has_kabkota_autofix OR @hasKabKotaAutoFix,
      has_job_fallback = has_job_fallback OR @hasJobFallback
      WHERE id = @submissionId`,
      args: {
        submissionId,
        validCount,
        invalidCount,
        hasNameMismatch: hasNameMismatch ? 1 : 0,
        hasKabKotaAutoFix: hasKabKotaAutoFix ? 1 : 0,
        hasJobFallback: hasJobFallback ? 1 : 0,
      } as never,
    })
  );
}

/** Updates just the sheet_status field, e.g. once a submission that predates this column is re-synced. Backfill-only. */
export async function updateSheetStatus(submissionId: string, sheetStatus: string, sheetRowNumber: number): Promise<void> {
  await withDb((db) =>
    db.execute({
      sql: "UPDATE submissions SET sheet_status = @sheetStatus, sheet_row_number = @sheetRowNumber WHERE id = @submissionId",
      args: { submissionId, sheetStatus, sheetRowNumber } as never,
    })
  );
}

/**
 * Every submission id with its current sheet_status/sheet_row_number, for pullNewResponses() to
 * check "does this response already exist, and did its sheet status change" against in-memory —
 * one round trip for up to thousands of responses, instead of two queries (exists + update) per
 * response, which used to be slow enough on a remote Turso connection to exceed Vercel's function
 * timeout on a pull where almost everything was already processed.
 */
export async function getSubmissionSheetStatuses(): Promise<Map<string, { sheetStatus: string; sheetRowNumber: number | null }>> {
  const rs = await withDb((db) => db.execute("SELECT id, sheet_status as sheetStatus, sheet_row_number as sheetRowNumber FROM submissions"));
  const map = new Map<string, { sheetStatus: string; sheetRowNumber: number | null }>();
  for (const r of rs.rows as unknown as Array<{ id: string; sheetStatus: string; sheetRowNumber: number | null }>) {
    map.set(r.id, { sheetStatus: r.sheetStatus, sheetRowNumber: r.sheetRowNumber });
  }
  return map;
}

/** Updates sheet_status/sheet_row_number for many submissions in a single round trip — the batched counterpart to updateSheetStatus, for pullNewResponses()'s per-pull refresh. */
export async function batchUpdateSheetStatuses(updates: Array<{ id: string; sheetStatus: string; sheetRowNumber: number }>): Promise<void> {
  if (updates.length === 0) return;
  await withDb((db) =>
    db.batch(
      updates.map((u) => ({
        sql: "UPDATE submissions SET sheet_status = @sheetStatus, sheet_row_number = @sheetRowNumber WHERE id = @id",
        args: { id: u.id, sheetStatus: u.sheetStatus, sheetRowNumber: u.sheetRowNumber } as never,
      })),
      "write"
    )
  );
}

/** Marks (or unmarks) a submission as followed up with the PIC — an operator-driven workflow flag, independent of the row-level Valid/Invalid status. */
export async function setFollowUpStatus(submissionId: string, followedUp: boolean): Promise<void> {
  await withDb((db) =>
    db.execute({
      sql: "UPDATE submissions SET followed_up_at = @followedUpAt WHERE id = @submissionId",
      args: { submissionId, followedUpAt: followedUp ? new Date().toISOString() : null } as never,
    })
  );
}

/** Updates just the file_provinsi field — used when the revalidation backfill applies the declaredProvinsi fallback for a blank C2 to already-stored submissions. Backfill-only. */
export async function updateSubmissionFileProvinsi(submissionId: string, fileProvinsi: string): Promise<void> {
  await withDb((db) =>
    db.execute({
      sql: "UPDATE submissions SET file_provinsi = @fileProvinsi WHERE id = @submissionId",
      args: { submissionId, fileProvinsi } as never,
    })
  );
}

/** Deletes a submission and its rows/NIK-registry entries entirely, so it can be reprocessed from scratch. Backfill-only. */
export async function deleteSubmission(submissionId: string): Promise<void> {
  await withDb(async (db) => {
    const tx = await db.transaction("write");
    try {
      await tx.execute({ sql: "DELETE FROM nik_registry WHERE submission_id = ?", args: [submissionId] });
      await tx.execute({ sql: "DELETE FROM submission_rows WHERE submission_id = ?", args: [submissionId] });
      await tx.execute({ sql: "DELETE FROM submissions WHERE id = ?", args: [submissionId] });
      await tx.commit();
    } finally {
      // See saveProcessedSubmission's identical guard above: a throw from close() here must never
      // override a commit that already succeeded.
      try {
        tx.close();
      } catch {
        // already committed; a failure to close cleanly here isn't a real error.
      }
    }
  });
}

/** Wipes the NIK registry so it can be rebuilt from scratch in chronological order. Backfill-only. */
export async function clearNikRegistry(): Promise<void> {
  await withDb((db) => db.execute("DELETE FROM nik_registry"));
}

/** Registers one NIK in the registry (used by the revalidation backfill, mirroring saveProcessedSubmission's logic). */
export async function registerNikForBackfill(nik: string, submissionId: string, rowDbId: number, picName: string, timestamp: string): Promise<void> {
  await withDb((db) =>
    db.execute({
      sql: `INSERT OR IGNORE INTO nik_registry (nik, submission_id, row_id, pic_name, timestamp, first_seen_at)
    VALUES (@nik, @submissionId, @rowDbId, @picName, @timestamp, @firstSeenAt)`,
      args: { nik, submissionId, rowDbId, picName, timestamp, firstSeenAt: new Date().toISOString() } as never,
    })
  );
}

/** All submissions ordered by their Form response timestamp (oldest first) — the order PICs actually submitted in, which is what "NIK already registered in an earlier submission" should be measured against. */
export async function listSubmissionsChronological(): Promise<SubmissionRecord[]> {
  const submissions = await listSubmissions();
  return submissions.sort((a, b) => parseFormTimestamp(a.timestamp) - parseFormTimestamp(b.timestamp));
}

/** Successfully processed submissions that haven't been marked followed-up yet, oldest first — the operational queue: whoever has been waiting longest gets handled first. */
export async function getPendingFollowUps(): Promise<SubmissionRecord[]> {
  const submissions = await listSubmissionsChronological();
  return submissions.filter((s) => s.status === "processed" && !s.followedUpAt);
}

export async function getSubmissionRows(submissionId: string): Promise<ValidatedRow[]> {
  const rs = await withDb((db) =>
    db.execute({
      sql: `SELECT
      row_number as rowNumber, no, nama, nik, no_wa as noWa, job, kota_kabupaten as kotaKabupaten,
      kode_prov as kodeProv, kode_kota as kodeKota, job_id as jobId, status, errors, warnings
    FROM submission_rows WHERE submission_id = ? ORDER BY row_number ASC`,
      args: [submissionId],
    })
  );

  return rs.rows.map((r) => ({
    ...(r as unknown as Record<string, unknown>),
    errors: JSON.parse(r.errors as string),
    warnings: JSON.parse(r.warnings as string),
  })) as ValidatedRow[];
}

/**
 * Rows joined with their parent submission's metadata, for building the consolidated report.
 * `pendingOnly` restricts to submissions whose sheet Status column (K) isn't "Done" yet — see
 * lib/sheetStatus.ts, the single source of truth for what counts as "pending".
 */
export async function getReportRows(submissionId?: string, options?: { pendingOnly?: boolean }): Promise<ReportRow[]> {
  const query = `
    SELECT
      sr.row_number as rowNumber, sr.no, sr.nama, sr.nik, sr.no_wa as noWa, sr.job,
      sr.kota_kabupaten as kotaKabupaten, sr.kode_prov as kodeProv, sr.kode_kota as kodeKota,
      sr.job_id as jobId, sr.status, sr.errors, sr.warnings,
      s.id as submissionId, s.file_provinsi as fileProvinsi, s.pic_name as picName,
      s.instansi, s.pic_whatsapp as picWhatsapp, s.timestamp,
      s.location_mismatch as locationMismatch, s.declared_provinsi as declaredProvinsi,
      s.declared_kabkota as declaredKabKota, s.sheet_status as sheetStatus
    FROM submission_rows sr
    JOIN submissions s ON s.id = sr.submission_id
    ${submissionId ? "WHERE s.id = @submissionId" : ""}
    ORDER BY s.timestamp ASC, sr.row_number ASC
  `;
  const rs = await withDb((db) =>
    db.execute({
      sql: query,
      args: submissionId ? ({ submissionId } as never) : [],
    })
  );

  const reportRows = rs.rows.map((r) => ({
    ...(r as unknown as Record<string, unknown>),
    locationMismatch: Boolean(r.locationMismatch),
    errors: JSON.parse(r.errors as string),
    warnings: JSON.parse(r.warnings as string),
  })) as unknown as ReportRow[];

  return options?.pendingOnly ? reportRows.filter((r) => !isSheetStatusDone(r.sheetStatus)) : reportRows;
}

export interface NikSearchHit {
  submissionId: string;
  picName: string;
  timestamp: string;
  rowNumber: number;
  nama: string;
  nik: string;
  status: "valid" | "invalid";
}

/**
 * Finds every row across every submission whose NIK contains the given digits — a partial match
 * (not just exact), since an operator chasing down a duplicate or a suspected typo often only has
 * part of the number, not the full 16 digits.
 */
export async function searchByNik(query: string): Promise<NikSearchHit[]> {
  const digits = query.replace(/\D/g, "");
  if (!digits) return [];
  const rs = await withDb((db) =>
    db.execute({
      sql: `SELECT
      s.id as submissionId, s.pic_name as picName, s.timestamp,
      sr.row_number as rowNumber, sr.nama, sr.nik, sr.status
    FROM submission_rows sr
    JOIN submissions s ON s.id = sr.submission_id
    WHERE sr.nik LIKE @pattern
    ORDER BY s.timestamp DESC
    LIMIT 200`,
      args: { pattern: `%${digits}%` } as never,
    })
  );
  return rs.rows as unknown as NikSearchHit[];
}

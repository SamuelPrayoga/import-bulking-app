import { put, list, del } from "@vercel/blob";
import { mkdirSync, readdirSync, statSync, unlinkSync, writeFileSync } from "node:fs";
import path from "node:path";
import { withDb } from "./db";
import type { ResultSet } from "@libsql/client";

// Backups are triggered by real data changes (a pull), not a fixed clock — so 20 is "the last ~20
// pulls" worth of history, plenty to recover from a bad pull or a corrupted database without the
// store growing unbounded over months of use.
const MAX_BACKUPS = 20;
const PREFIX = "backups/";

export interface BackupInfo {
  name: string;
  sizeBytes: number;
  createdAt: string;
}

interface BackupBlobEntry {
  pathname: string;
  sizeBytes: number;
  uploadedAt: string;
}

/** Thin seam over the actual blob store so tests can swap in an in-memory fake instead of hitting real Vercel Blob. */
export interface BackupStorage {
  put(pathname: string, content: string): Promise<void>;
  list(): Promise<BackupBlobEntry[]>;
  del(pathname: string): Promise<void>;
}

const vercelBlobStorage: BackupStorage = {
  async put(pathname, content) {
    await put(pathname, content, {
      access: "private", // this data is real citizen NIK/phone numbers — never a publicly-fetchable URL.
      contentType: "application/json",
      addRandomSuffix: false,
    });
  },
  async list() {
    const { blobs } = await list({ prefix: PREFIX });
    return blobs.map((b) => ({ pathname: b.pathname, sizeBytes: b.size, uploadedAt: b.uploadedAt.toISOString() }));
  },
  async del(pathname) {
    await del(pathname);
  },
};

function localBackupDir(): string {
  return process.env.APP_BACKUP_DIR || path.join(process.cwd(), "data", "backups");
}

function localFilePath(pathname: string): string {
  const name = pathname.startsWith(PREFIX) ? pathname.slice(PREFIX.length) : pathname;
  return path.join(localBackupDir(), name);
}

// Local dev/tests have no Vercel Blob token to talk to — mirrors lib/db.ts's Turso-vs-local-file
// fallback so `npm run dev` works with zero Vercel credentials configured.
const localFileBackupStorage: BackupStorage = {
  async put(pathname, content) {
    const filePath = localFilePath(pathname);
    mkdirSync(path.dirname(filePath), { recursive: true });
    writeFileSync(filePath, content);
  },
  async list() {
    const dir = localBackupDir();
    mkdirSync(dir, { recursive: true });
    return readdirSync(dir)
      .filter((f) => f.endsWith(".json"))
      .map((f) => {
        const stat = statSync(path.join(dir, f));
        return { pathname: `${PREFIX}${f}`, sizeBytes: stat.size, uploadedAt: stat.mtime.toISOString() };
      });
  },
  async del(pathname) {
    try {
      unlinkSync(localFilePath(pathname));
    } catch {
      // already gone — fine, del() is only ever asked to remove things list() just reported.
    }
  },
};

const defaultBackupStorage: BackupStorage = process.env.BLOB_READ_WRITE_TOKEN ? vercelBlobStorage : localFileBackupStorage;
let storage: BackupStorage = defaultBackupStorage;

/** Swaps the storage backend — test-only, so backup.test.ts doesn't need a real Vercel Blob store/token. */
export function setBackupStorage(custom: BackupStorage): void {
  storage = custom;
}

/** Resets to the real backend (Vercel Blob in production, local file in dev) — test-only cleanup counterpart to setBackupStorage. */
export function resetBackupStorage(): void {
  storage = defaultBackupStorage;
}

function rowsToPlainObjects(rs: ResultSet): Array<Record<string, unknown>> {
  return rs.rows.map((row) => Object.fromEntries(rs.columns.map((col) => [col, row[col]])));
}

/** Dumps every table to one JSON blob (there's no better-sqlite3-style binary snapshot API against a remote libSQL/Turso database), then prunes anything past MAX_BACKUPS. */
export async function createBackup(): Promise<string> {
  // Each query goes through its own withDb() call — its shared queue naturally serializes these
  // even though they're launched together via Promise.all — see withDb()'s comment in lib/db.ts.
  const [submissions, submissionRows, nikRegistry, auditLog] = await Promise.all([
    withDb((db) => db.execute("SELECT * FROM submissions")),
    withDb((db) => db.execute("SELECT * FROM submission_rows")),
    withDb((db) => db.execute("SELECT * FROM nik_registry")),
    withDb((db) => db.execute("SELECT * FROM audit_log")),
  ]);

  const dump = {
    createdAt: new Date().toISOString(),
    submissions: rowsToPlainObjects(submissions),
    submissionRows: rowsToPlainObjects(submissionRows),
    nikRegistry: rowsToPlainObjects(nikRegistry),
    auditLog: rowsToPlainObjects(auditLog),
  };

  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  const name = `app-${timestamp}.json`;
  await storage.put(`${PREFIX}${name}`, JSON.stringify(dump));
  await pruneOldBackups();
  return name;
}

async function listBackupEntries(): Promise<BackupBlobEntry[]> {
  const entries = await storage.list();
  return entries.sort((a, b) => new Date(b.uploadedAt).getTime() - new Date(a.uploadedAt).getTime());
}

async function pruneOldBackups(): Promise<void> {
  const entries = await listBackupEntries();
  for (const old of entries.slice(MAX_BACKUPS)) {
    await storage.del(old.pathname);
  }
}

export async function listBackups(): Promise<BackupInfo[]> {
  const entries = await listBackupEntries();
  return entries.map((e) => ({
    name: e.pathname.slice(PREFIX.length),
    sizeBytes: e.sizeBytes,
    createdAt: e.uploadedAt,
  }));
}

import path from "node:path";
import { mkdirSync, readdirSync, statSync, unlinkSync } from "node:fs";
import { getDb } from "./db";

const BACKUP_DIR = process.env.APP_BACKUP_DIR || path.join(process.cwd(), "data", "backups");
// Backups are triggered by real data changes (a pull), not a fixed clock — so 20 is "the last ~20
// pulls" worth of history, plenty to recover from a bad pull or a corrupted app.db without the
// directory growing unbounded over months of use.
const MAX_BACKUPS = 20;

export interface BackupInfo {
  name: string;
  sizeBytes: number;
  createdAt: string;
}

/** Snapshots the live app.db via SQLite's own backup API (safe under concurrent WAL writes, unlike a raw file copy), then prunes anything past MAX_BACKUPS. */
export async function createBackup(): Promise<string> {
  mkdirSync(BACKUP_DIR, { recursive: true });
  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  const destPath = path.join(BACKUP_DIR, `app-${timestamp}.db`);
  await getDb().backup(destPath);
  pruneOldBackups();
  return destPath;
}

function pruneOldBackups(): void {
  const files = listBackupFiles();
  for (const old of files.slice(MAX_BACKUPS)) {
    unlinkSync(old.path);
  }
}

function listBackupFiles(): Array<{ name: string; path: string; mtimeMs: number }> {
  mkdirSync(BACKUP_DIR, { recursive: true });
  return readdirSync(BACKUP_DIR)
    .filter((f) => f.startsWith("app-") && f.endsWith(".db"))
    .map((name) => {
      const full = path.join(BACKUP_DIR, name);
      return { name, path: full, mtimeMs: statSync(full).mtimeMs };
    })
    .sort((a, b) => b.mtimeMs - a.mtimeMs);
}

export function listBackups(): BackupInfo[] {
  return listBackupFiles().map((f) => {
    const stat = statSync(f.path);
    return { name: f.name, sizeBytes: stat.size, createdAt: stat.mtime.toISOString() };
  });
}

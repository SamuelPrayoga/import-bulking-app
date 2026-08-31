import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { mkdtempSync, rmSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

let backupModule: typeof import("./backup");
let dbModule: typeof import("./db");
let dbTmpDir: string;
let backupTmpDir: string;

beforeAll(async () => {
  dbTmpDir = mkdtempSync(path.join(tmpdir(), "import-bulking-backup-db-"));
  backupTmpDir = mkdtempSync(path.join(tmpdir(), "import-bulking-backup-dest-"));
  process.env.APP_DB_PATH = path.join(dbTmpDir, "test.db");
  process.env.APP_BACKUP_DIR = backupTmpDir;
  dbModule = await import("./db");
  backupModule = await import("./backup");
  dbModule.getDb(); // force-create the source DB file so backup() has something real to copy
});

afterAll(() => {
  dbModule.closeDb();
  rmSync(dbTmpDir, { recursive: true, force: true });
  rmSync(backupTmpDir, { recursive: true, force: true });
  delete process.env.APP_DB_PATH;
  delete process.env.APP_BACKUP_DIR;
});

describe("createBackup / listBackups", () => {
  it("creates a real, readable backup file", async () => {
    const backupPath = await backupModule.createBackup();
    expect(existsSync(backupPath)).toBe(true);
  });

  it("lists backups newest-first with size info", async () => {
    await new Promise((r) => setTimeout(r, 5)); // ensure a distinct mtime from the first backup
    await backupModule.createBackup();
    const backups = backupModule.listBackups();
    expect(backups.length).toBeGreaterThanOrEqual(2);
    expect(backups[0].sizeBytes).toBeGreaterThan(0);
    // newest-first: first entry's createdAt should be >= the last entry's
    expect(new Date(backups[0].createdAt).getTime()).toBeGreaterThanOrEqual(
      new Date(backups[backups.length - 1].createdAt).getTime()
    );
  });
});

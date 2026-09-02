import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

let backupModule: typeof import("./backup");
let dbModule: typeof import("./db");
let dbTmpDir: string;

/** In-memory stand-in for the real Vercel Blob store — tests shouldn't need a live token/network. */
function createFakeBackupStorage() {
  const store = new Map<string, { content: string; uploadedAt: string }>();
  return {
    async put(pathname: string, content: string) {
      store.set(pathname, { content, uploadedAt: new Date().toISOString() });
    },
    async list() {
      return [...store.entries()].map(([pathname, v]) => ({
        pathname,
        sizeBytes: Buffer.byteLength(v.content),
        uploadedAt: v.uploadedAt,
      }));
    },
    async del(pathname: string) {
      store.delete(pathname);
    },
  };
}

beforeAll(async () => {
  dbTmpDir = mkdtempSync(path.join(tmpdir(), "import-bulking-backup-db-"));
  process.env.APP_DB_PATH = path.join(dbTmpDir, "test.db");
  dbModule = await import("./db");
  backupModule = await import("./backup");
  await dbModule.getDb(); // ensure the schema exists so createBackup() has real tables to query
  backupModule.setBackupStorage(createFakeBackupStorage());
});

afterAll(() => {
  dbModule.closeDb();
  rmSync(dbTmpDir, { recursive: true, force: true });
  delete process.env.APP_DB_PATH;
});

describe("createBackup / listBackups", () => {
  it("creates a backup that shows up in the listing", async () => {
    const name = await backupModule.createBackup();
    const backups = await backupModule.listBackups();
    expect(backups.some((b) => b.name === name)).toBe(true);
    expect(backups.find((b) => b.name === name)?.sizeBytes).toBeGreaterThan(0);
  });

  it("lists backups newest-first with size info", async () => {
    await new Promise((r) => setTimeout(r, 5)); // ensure a distinct uploadedAt from the first backup
    await backupModule.createBackup();
    const backups = await backupModule.listBackups();
    expect(backups.length).toBeGreaterThanOrEqual(2);
    expect(backups[0].sizeBytes).toBeGreaterThan(0);
    // newest-first: first entry's createdAt should be >= the last entry's
    expect(new Date(backups[0].createdAt).getTime()).toBeGreaterThanOrEqual(
      new Date(backups[backups.length - 1].createdAt).getTime()
    );
  });
});

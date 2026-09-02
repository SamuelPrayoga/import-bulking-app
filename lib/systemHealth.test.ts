import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import type { SubmissionRecord } from "../types/index";

let dbModule: typeof import("./db");
let auditLogModule: typeof import("./auditLog");
let backupModule: typeof import("./backup");
let healthModule: typeof import("./systemHealth");
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

function submission(overrides: Partial<SubmissionRecord>): SubmissionRecord {
  return {
    id: overrides.id!,
    timestamp: "01/08/2026 10:00:00",
    email: "pic@example.com",
    picName: "Ani",
    picWhatsapp: "6281234567890",
    picWhatsappValid: true,
    declaredProvinsi: "LAMPUNG",
    declaredKabKota: "MESUJI",
    instansi: "Dinas Sosial",
    driveFileId: "file1",
    fileProvinsi: "LAMPUNG",
    locationMismatch: false,
    validCount: 1,
    invalidCount: 0,
    status: "processed",
    processedAt: "2026-08-01T10:00:00.000Z",
    errorMessage: null,
    sheetStatus: "",
    importMethod: "template",
    mappingScore: null,
    followedUpAt: null,
    hasNameMismatch: false,
    hasKabKotaAutoFix: false,
    hasJobFallback: false,
    sheetRowNumber: 5,
    ...overrides,
  };
}

beforeAll(async () => {
  dbTmpDir = mkdtempSync(path.join(tmpdir(), "import-bulking-health-db-"));
  process.env.APP_DB_PATH = path.join(dbTmpDir, "test.db");
  dbModule = await import("./db");
  auditLogModule = await import("./auditLog");
  backupModule = await import("./backup");
  healthModule = await import("./systemHealth");
  await dbModule.getDb();
  backupModule.setBackupStorage(createFakeBackupStorage());
});

afterAll(() => {
  dbModule.closeDb();
  rmSync(dbTmpDir, { recursive: true, force: true });
  delete process.env.APP_DB_PATH;
});

describe("getSystemHealth", () => {
  it("reports nulls and zero counts on a fresh, empty database", async () => {
    const health = await healthModule.getSystemHealth();
    expect(health.lastPullAt).toBeNull();
    expect(health.lastBackupAt).toBeNull();
    expect(health.failedSubmissionCount).toBe(0);
    expect(health.pendingFollowUpCount).toBe(0);
  });

  it("reflects a successful pull as not-failed", async () => {
    await auditLogModule.recordAuditEvent("pull_responses", "admin@gmail.com", "127.0.0.1", "Total respons: 5, baru diproses: 2, gagal: 0");
    const health = await healthModule.getSystemHealth();
    expect(health.lastPullAt).not.toBeNull();
    expect(health.lastPullFailed).toBe(false);
  });

  it("reflects a failed pull as failed", async () => {
    await auditLogModule.recordAuditEvent("pull_responses", "admin@gmail.com", "127.0.0.1", "Gagal: network error");
    const health = await healthModule.getSystemHealth();
    expect(health.lastPullFailed).toBe(true);
  });

  it("picks up the most recent backup", async () => {
    await backupModule.createBackup();
    const health = await healthModule.getSystemHealth();
    expect(health.lastBackupAt).not.toBeNull();
  });

  it("counts failed submissions and pending follow-ups", async () => {
    await dbModule.saveProcessedSubmission(submission({ id: "ok-1", status: "processed" }), []);
    await dbModule.saveProcessedSubmission(submission({ id: "ok-2", status: "processed" }), []);
    await dbModule.setFollowUpStatus("ok-2", true); // follow-up is always set via this call, never at insert time
    await dbModule.saveProcessedSubmission(submission({ id: "bad-1", status: "failed" }), []);

    const health = await healthModule.getSystemHealth();
    expect(health.failedSubmissionCount).toBe(1);
    expect(health.pendingFollowUpCount).toBe(1); // only ok-1, not ok-2 (already followed up)
  });
});

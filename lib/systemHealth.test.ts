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
let backupTmpDir: string;

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
    ...overrides,
  };
}

beforeAll(async () => {
  dbTmpDir = mkdtempSync(path.join(tmpdir(), "import-bulking-health-db-"));
  backupTmpDir = mkdtempSync(path.join(tmpdir(), "import-bulking-health-backup-"));
  process.env.APP_DB_PATH = path.join(dbTmpDir, "test.db");
  process.env.APP_BACKUP_DIR = backupTmpDir;
  dbModule = await import("./db");
  auditLogModule = await import("./auditLog");
  backupModule = await import("./backup");
  healthModule = await import("./systemHealth");
  dbModule.getDb();
});

afterAll(() => {
  dbModule.closeDb();
  rmSync(dbTmpDir, { recursive: true, force: true });
  rmSync(backupTmpDir, { recursive: true, force: true });
  delete process.env.APP_DB_PATH;
  delete process.env.APP_BACKUP_DIR;
});

describe("getSystemHealth", () => {
  it("reports nulls and zero counts on a fresh, empty database", () => {
    const health = healthModule.getSystemHealth();
    expect(health.lastPullAt).toBeNull();
    expect(health.lastBackupAt).toBeNull();
    expect(health.failedSubmissionCount).toBe(0);
    expect(health.pendingFollowUpCount).toBe(0);
  });

  it("reflects a successful pull as not-failed", () => {
    auditLogModule.recordAuditEvent("pull_responses", "admin@gmail.com", "127.0.0.1", "Total respons: 5, baru diproses: 2, gagal: 0");
    const health = healthModule.getSystemHealth();
    expect(health.lastPullAt).not.toBeNull();
    expect(health.lastPullFailed).toBe(false);
  });

  it("reflects a failed pull as failed", () => {
    auditLogModule.recordAuditEvent("pull_responses", "admin@gmail.com", "127.0.0.1", "Gagal: network error");
    const health = healthModule.getSystemHealth();
    expect(health.lastPullFailed).toBe(true);
  });

  it("picks up the most recent backup", async () => {
    await backupModule.createBackup();
    const health = healthModule.getSystemHealth();
    expect(health.lastBackupAt).not.toBeNull();
  });

  it("counts failed submissions and pending follow-ups", () => {
    dbModule.saveProcessedSubmission(submission({ id: "ok-1", status: "processed" }), []);
    dbModule.saveProcessedSubmission(submission({ id: "ok-2", status: "processed" }), []);
    dbModule.setFollowUpStatus("ok-2", true); // follow-up is always set via this call, never at insert time
    dbModule.saveProcessedSubmission(submission({ id: "bad-1", status: "failed" }), []);

    const health = healthModule.getSystemHealth();
    expect(health.failedSubmissionCount).toBe(1);
    expect(health.pendingFollowUpCount).toBe(1); // only ok-1, not ok-2 (already followed up)
  });
});

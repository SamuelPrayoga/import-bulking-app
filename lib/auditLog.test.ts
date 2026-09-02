import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

let auditLogModule: typeof import("./auditLog");
let dbModule: typeof import("./db");
let tmpDir: string;

beforeAll(async () => {
  tmpDir = mkdtempSync(path.join(tmpdir(), "import-bulking-auditlog-test-"));
  process.env.APP_DB_PATH = path.join(tmpDir, "test.db");
  dbModule = await import("./db");
  auditLogModule = await import("./auditLog");
});

afterAll(() => {
  dbModule.closeDb();
  rmSync(tmpDir, { recursive: true, force: true });
  delete process.env.APP_DB_PATH;
});

describe("recordAuditEvent / listAuditLog", () => {
  it("records an event and returns it back with a generated timestamp", async () => {
    await auditLogModule.recordAuditEvent("login_success", "admin@gmail.com", "127.0.0.1", "Login berhasil");
    const [entry] = await auditLogModule.listAuditLog();
    expect(entry).toMatchObject({
      eventType: "login_success",
      actor: "admin@gmail.com",
      ip: "127.0.0.1",
      details: "Login berhasil",
    });
    expect(typeof entry.timestamp).toBe("string");
    expect(new Date(entry.timestamp).toString()).not.toBe("Invalid Date");
  });

  it("returns entries newest-first", async () => {
    await auditLogModule.recordAuditEvent("logout", "admin@gmail.com", "127.0.0.1", "Logout 1");
    await auditLogModule.recordAuditEvent("logout", "admin@gmail.com", "127.0.0.1", "Logout 2");
    const entries = await auditLogModule.listAuditLog();
    expect(entries[0].details).toBe("Logout 2");
    expect(entries[1].details).toBe("Logout 1");
  });

  it("respects the limit parameter", async () => {
    for (let i = 0; i < 10; i++) {
      await auditLogModule.recordAuditEvent("pull_responses", "admin@gmail.com", "127.0.0.1", `Pull ${i}`);
    }
    const entries = await auditLogModule.listAuditLog(3);
    expect(entries).toHaveLength(3);
  });
});

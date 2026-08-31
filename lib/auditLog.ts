import { getDb } from "./db";

// A record of every significant action taken in this app — this handles real citizen PII (NIK,
// phone numbers), and now sits behind a single shared admin login, so knowing WHEN data was
// pulled, downloaded, or who attempted to log in (and failed) matters even with just one real
// user account.
export type AuditEventType =
  | "login_success"
  | "login_failed"
  | "login_locked_out"
  | "logout"
  | "pull_responses"
  | "report_download"
  | "clean_export_download"
  | "backup_created"
  | "follow_up_marked"
  | "follow_up_unmarked";

export interface AuditLogEntry {
  id: number;
  timestamp: string;
  eventType: AuditEventType;
  actor: string;
  ip: string;
  details: string;
}

export function recordAuditEvent(eventType: AuditEventType, actor: string, ip: string, details: string): void {
  getDb()
    .prepare(`INSERT INTO audit_log (timestamp, event_type, actor, ip, details) VALUES (@timestamp, @eventType, @actor, @ip, @details)`)
    .run({ timestamp: new Date().toISOString(), eventType, actor, ip, details });
}

export function listAuditLog(limit = 300): AuditLogEntry[] {
  return getDb()
    .prepare(
      `SELECT id, timestamp, event_type as eventType, actor, ip, details
      FROM audit_log ORDER BY id DESC LIMIT @limit`
    )
    .all({ limit }) as AuditLogEntry[];
}

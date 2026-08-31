import { NextRequest, NextResponse } from "next/server";
import { createBackup } from "../../../lib/backup";
import { recordAuditEvent } from "../../../lib/auditLog";

export async function POST(request: NextRequest) {
  const ip = request.headers.get("x-forwarded-for") ?? "local";
  try {
    const backupPath = await createBackup();
    const name = backupPath.split("/").pop() ?? backupPath;
    recordAuditEvent("backup_created", process.env.ADMIN_EMAIL ?? "-", ip, `${name} (manual)`);
    return NextResponse.json({ ok: true, name });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : String(err) }, { status: 500 });
  }
}

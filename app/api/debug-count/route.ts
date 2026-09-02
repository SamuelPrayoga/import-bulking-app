import { NextRequest, NextResponse } from "next/server";
import { listSubmissions } from "../../../lib/db";

// TEMPORARY diagnostic route — remove after use. Protected by CRON_SECRET so it's not wide open.
export async function GET(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  const auth = request.headers.get("authorization");
  if (!secret || auth !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const subs = await listSubmissions();
  return NextResponse.json({
    count: subs.length,
    tursoUrlHost: process.env.TURSO_DATABASE_URL?.split("/")[2] ?? null,
    hasTursoToken: Boolean(process.env.TURSO_AUTH_TOKEN),
  });
}

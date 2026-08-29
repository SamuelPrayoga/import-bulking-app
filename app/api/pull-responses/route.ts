import { NextResponse } from "next/server";
import { pullNewResponses } from "../../../lib/pullResponses";

export async function POST() {
  try {
    const result = await pullNewResponses();
    return NextResponse.json(result);
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 500 }
    );
  }
}

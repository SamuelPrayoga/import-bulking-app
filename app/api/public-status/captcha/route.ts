import { NextResponse } from "next/server";
import { createCaptchaChallenge } from "../../../../lib/captcha";

/** Issues a fresh arithmetic captcha challenge for the public status lookup. Stateless — no rate limit needed here, since a token alone is worthless without also guessing the right email (see /api/public-status). */
export async function GET() {
  const challenge = await createCaptchaChallenge();
  return NextResponse.json(challenge);
}

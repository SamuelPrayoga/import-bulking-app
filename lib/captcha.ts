// Stateless arithmetic captcha for the public status dashboard (app/dashboard-publik): the answer
// is embedded in an HMAC-signed token handed to the client, so verifying it later needs no
// server-side store — same idea as lib/session.ts's login token, reusing the same SESSION_SECRET.
// Not meant to stop a determined, purpose-built bot (a "3 + 5" sum is trivial to parse and solve)
// — it exists to block naive scripts that just POST straight to the API without ever fetching a
// challenge, and (combined with the per-IP lockout in lib/auth.ts) to slow down anyone guessing
// answers blind, since a wrong guess costs one of their limited attempts.
import { randomNonce, signHmac, verifyHmac } from "./hmac";

const CAPTCHA_TTL_MS = 5 * 60 * 1000;

function getSecret(): string {
  const value = process.env.SESSION_SECRET;
  if (!value) throw new Error("SESSION_SECRET belum diisi di .env.local");
  return value;
}

export interface CaptchaChallenge {
  question: string;
  token: string;
}

export async function createCaptchaChallenge(): Promise<CaptchaChallenge> {
  const a = 1 + Math.floor(Math.random() * 9);
  const b = 1 + Math.floor(Math.random() * 9);
  const answer = a + b;
  const expiresAt = Date.now() + CAPTCHA_TTL_MS;
  const payload = `${answer}.${expiresAt}.${randomNonce()}`;
  const token = `${payload}.${await signHmac(getSecret(), payload)}`;
  return { question: `${a} + ${b}`, token };
}

export async function verifyCaptchaAnswer(token: string | undefined | null, answer: string | undefined | null): Promise<boolean> {
  if (!token || !answer) return false;
  const parts = token.split(".");
  if (parts.length !== 4) return false;
  const [answerRaw, expiresAtRaw, nonce, signature] = parts;
  const payload = `${answerRaw}.${expiresAtRaw}.${nonce}`;

  const valid = await verifyHmac(getSecret(), payload, signature);
  if (!valid) return false;

  const expiresAt = Number(expiresAtRaw);
  if (!Number.isFinite(expiresAt) || Date.now() > expiresAt) return false;

  return answerRaw === answer.trim();
}

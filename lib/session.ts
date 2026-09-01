// Session-token signing, shared between the login API route (Node.js runtime) and middleware.ts
// (Edge runtime). Uses the standard Web Crypto API (via lib/hmac.ts) rather than node:crypto,
// since node:crypto is unavailable in the Edge runtime middleware runs in — Web Crypto works
// identically in both.
import { randomNonce, signHmac, verifyHmac } from "./hmac";

export const SESSION_COOKIE_NAME = "perlinsos_session";
export const SESSION_TTL_MS = 8 * 60 * 60 * 1000; // 8h, per explicit request.

function getSecret(): string {
  const value = process.env.SESSION_SECRET;
  if (!value) throw new Error("SESSION_SECRET belum diisi di .env.local");
  return value;
}

/** Opaque, HMAC-signed session token: "<expiresAtMs>.<nonce>.<signature>". No server-side session store needed — the signature alone proves it was minted by us and not tampered with. */
export async function createSessionToken(): Promise<string> {
  const expiresAt = Date.now() + SESSION_TTL_MS;
  const payload = `${expiresAt}.${randomNonce()}`;
  return `${payload}.${await signHmac(getSecret(), payload)}`;
}

export async function isValidSessionToken(token: string | undefined | null): Promise<boolean> {
  if (!token) return false;
  const parts = token.split(".");
  if (parts.length !== 3) return false;
  const [expiresAtRaw, nonce, signature] = parts;
  const payload = `${expiresAtRaw}.${nonce}`;

  const valid = await verifyHmac(getSecret(), payload, signature);
  if (!valid) return false;

  const expiresAt = Number(expiresAtRaw);
  if (!Number.isFinite(expiresAt) || Date.now() > expiresAt) return false;

  return true;
}

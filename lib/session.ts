// Session-token signing, shared between the login API route (Node.js runtime) and middleware.ts
// (Edge runtime). Uses the standard Web Crypto API (globalThis.crypto.subtle) rather than
// node:crypto, since node:crypto is unavailable in the Edge runtime middleware runs in — Web
// Crypto works identically in both.

export const SESSION_COOKIE_NAME = "perlinsos_session";
export const SESSION_TTL_MS = 60 * 60 * 1000; // 1h, per explicit request — short-lived given this handles real citizen NIK/phone numbers.

function getSecret(): string {
  const value = process.env.SESSION_SECRET;
  if (!value) throw new Error("SESSION_SECRET belum diisi di .env.local");
  return value;
}

function toHex(buffer: ArrayBuffer): string {
  return [...new Uint8Array(buffer)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

function fromHex(hex: string): Uint8Array {
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < bytes.length; i++) bytes[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  return bytes;
}

async function importHmacKey(secret: string): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign", "verify"]
  );
}

async function sign(payload: string): Promise<string> {
  const key = await importHmacKey(getSecret());
  const signature = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(payload));
  return toHex(signature);
}

function randomNonce(): string {
  return toHex(crypto.getRandomValues(new Uint8Array(8)).buffer);
}

/** Opaque, HMAC-signed session token: "<expiresAtMs>.<nonce>.<signature>". No server-side session store needed — the signature alone proves it was minted by us and not tampered with. */
export async function createSessionToken(): Promise<string> {
  const expiresAt = Date.now() + SESSION_TTL_MS;
  const payload = `${expiresAt}.${randomNonce()}`;
  return `${payload}.${await sign(payload)}`;
}

export async function isValidSessionToken(token: string | undefined | null): Promise<boolean> {
  if (!token) return false;
  const parts = token.split(".");
  if (parts.length !== 3) return false;
  const [expiresAtRaw, nonce, signature] = parts;
  const payload = `${expiresAtRaw}.${nonce}`;

  let signatureBytes: Uint8Array;
  try {
    signatureBytes = fromHex(signature);
  } catch {
    return false;
  }
  const key = await importHmacKey(getSecret());
  const valid = await crypto.subtle.verify(
    "HMAC",
    key,
    signatureBytes as BufferSource,
    new TextEncoder().encode(payload)
  );
  if (!valid) return false;

  const expiresAt = Number(expiresAtRaw);
  if (!Number.isFinite(expiresAt) || Date.now() > expiresAt) return false;

  return true;
}

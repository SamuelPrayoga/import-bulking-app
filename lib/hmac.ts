// Shared Web Crypto HMAC-SHA256 helpers — works in both Node and the Edge runtime (middleware.ts
// imports these indirectly via lib/session.ts), unlike node:crypto. Used anywhere a short opaque
// token needs to be signed/verified without a server-side store (login sessions, captcha answers).

export function toHex(buffer: ArrayBuffer): string {
  return [...new Uint8Array(buffer)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

export function fromHex(hex: string): Uint8Array {
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

export async function signHmac(secret: string, payload: string): Promise<string> {
  const key = await importHmacKey(secret);
  const signature = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(payload));
  return toHex(signature);
}

export async function verifyHmac(secret: string, payload: string, signatureHex: string): Promise<boolean> {
  let signatureBytes: Uint8Array;
  try {
    signatureBytes = fromHex(signatureHex);
  } catch {
    return false;
  }
  const key = await importHmacKey(secret);
  return crypto.subtle.verify("HMAC", key, signatureBytes as BufferSource, new TextEncoder().encode(payload));
}

export function randomNonce(byteLength = 8): string {
  return toHex(crypto.getRandomValues(new Uint8Array(byteLength)).buffer);
}

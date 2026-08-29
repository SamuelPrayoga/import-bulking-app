import { scryptSync, timingSafeEqual } from "node:crypto";

// Node-only: password verification (scrypt) and login lockout tracking. Only used from
// app/api/login/route.ts, which runs in the Node.js runtime — never import this from
// middleware.ts (Edge runtime, no node:crypto). Session-token signing lives in lib/session.ts
// instead, since that needs to work in both runtimes.

function getEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`${name} belum diisi di .env.local`);
  return value;
}

/** Constant-time password check against the scrypt hash stored in .env.local (never plaintext). */
export function verifyCredentials(email: string, password: string): boolean {
  const expectedEmail = getEnv("ADMIN_EMAIL");
  const salt = getEnv("ADMIN_PASSWORD_SALT");
  const expectedHash = Buffer.from(getEnv("ADMIN_PASSWORD_HASH"), "hex");

  if (email.trim().toLowerCase() !== expectedEmail.trim().toLowerCase()) return false;

  const actualHash = scryptSync(password, salt, 64);
  if (actualHash.length !== expectedHash.length) return false;
  return timingSafeEqual(actualHash, expectedHash);
}

// Simple in-memory lockout: this app runs as a single Node process (next dev/start), so a
// module-scoped Map is sufficient — no need for a shared store. Resets on server restart, which
// is an acceptable tradeoff for an internal tool with one real user.
const failedAttempts = new Map<string, { count: number; lockedUntil: number }>();
const MAX_ATTEMPTS = 5;
const LOCKOUT_MS = 15 * 60 * 1000;

export function isLockedOut(key: string): boolean {
  const entry = failedAttempts.get(key);
  if (!entry) return false;
  if (entry.lockedUntil && Date.now() < entry.lockedUntil) return true;
  if (entry.lockedUntil && Date.now() >= entry.lockedUntil) failedAttempts.delete(key);
  return false;
}

export function recordFailedAttempt(key: string): void {
  const entry = failedAttempts.get(key) ?? { count: 0, lockedUntil: 0 };
  entry.count += 1;
  if (entry.count >= MAX_ATTEMPTS) {
    entry.lockedUntil = Date.now() + LOCKOUT_MS;
    entry.count = 0;
  }
  failedAttempts.set(key, entry);
}

export function clearFailedAttempts(key: string): void {
  failedAttempts.delete(key);
}

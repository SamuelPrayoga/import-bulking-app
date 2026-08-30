import { beforeEach, describe, expect, it, vi } from "vitest";
import { SESSION_TTL_MS, createSessionToken, isValidSessionToken } from "./session";

beforeEach(() => {
  vi.stubEnv("SESSION_SECRET", "test-session-secret");
});

describe("session tokens", () => {
  it("a freshly created token is valid", async () => {
    const token = await createSessionToken();
    expect(await isValidSessionToken(token)).toBe(true);
  });

  it("rejects a missing token", async () => {
    expect(await isValidSessionToken(undefined)).toBe(false);
    expect(await isValidSessionToken(null)).toBe(false);
    expect(await isValidSessionToken("")).toBe(false);
  });

  it("rejects a malformed token", async () => {
    expect(await isValidSessionToken("not-a-real-token")).toBe(false);
  });

  it("rejects a token whose signature was tampered with", async () => {
    const token = await createSessionToken();
    const [expiresAt, nonce, signature] = token.split(".");
    const tampered = `${expiresAt}.${nonce}.${signature.slice(0, -2)}00`;
    expect(await isValidSessionToken(tampered)).toBe(false);
  });

  it("rejects a token whose expiry was tampered with (still same signature)", async () => {
    const token = await createSessionToken();
    const [, nonce, signature] = token.split(".");
    const forged = `${Date.now() + 999_999_999}.${nonce}.${signature}`;
    expect(await isValidSessionToken(forged)).toBe(false);
  });

  it("rejects a token once its TTL has passed", async () => {
    vi.useFakeTimers();
    try {
      const token = await createSessionToken();
      expect(await isValidSessionToken(token)).toBe(true);
      vi.advanceTimersByTime(SESSION_TTL_MS + 1000);
      expect(await isValidSessionToken(token)).toBe(false);
    } finally {
      vi.useRealTimers();
    }
  });

  it("tokens from different secrets don't validate against each other", async () => {
    const token = await createSessionToken();
    vi.stubEnv("SESSION_SECRET", "a-different-secret");
    expect(await isValidSessionToken(token)).toBe(false);
  });
});

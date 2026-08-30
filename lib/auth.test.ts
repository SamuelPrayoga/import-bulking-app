import { scryptSync } from "node:crypto";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { clearFailedAttempts, isLockedOut, recordFailedAttempt, verifyCredentials } from "./auth";

const TEST_SALT = "test-salt";
const TEST_PASSWORD = "correct-horse-battery";
const TEST_HASH = scryptSync(TEST_PASSWORD, TEST_SALT, 64).toString("hex");

beforeEach(() => {
  vi.stubEnv("ADMIN_EMAIL", "admin@gmail.com");
  vi.stubEnv("ADMIN_PASSWORD_SALT", TEST_SALT);
  vi.stubEnv("ADMIN_PASSWORD_HASH", TEST_HASH);
});

describe("verifyCredentials", () => {
  it("accepts the correct email + password", () => {
    expect(verifyCredentials("admin@gmail.com", TEST_PASSWORD)).toBe(true);
  });

  it("is case-insensitive on the email", () => {
    expect(verifyCredentials("Admin@Gmail.com", TEST_PASSWORD)).toBe(true);
  });

  it("rejects a wrong password", () => {
    expect(verifyCredentials("admin@gmail.com", "wrong-password")).toBe(false);
  });

  it("rejects a wrong email even with the right password", () => {
    expect(verifyCredentials("someone-else@gmail.com", TEST_PASSWORD)).toBe(false);
  });

  it("rejects an empty password", () => {
    expect(verifyCredentials("admin@gmail.com", "")).toBe(false);
  });
});

describe("login lockout", () => {
  it("locks out after 5 failed attempts and clears on success", () => {
    const key = `test-ip-${Math.random()}`;
    expect(isLockedOut(key)).toBe(false);

    for (let i = 0; i < 4; i++) recordFailedAttempt(key);
    expect(isLockedOut(key)).toBe(false); // still under the threshold

    recordFailedAttempt(key); // 5th failure trips the lockout
    expect(isLockedOut(key)).toBe(true);

    clearFailedAttempts(key);
    expect(isLockedOut(key)).toBe(false);
  });
});

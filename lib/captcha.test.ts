import { beforeEach, describe, expect, it, vi } from "vitest";
import { createCaptchaChallenge, verifyCaptchaAnswer } from "./captcha";

beforeEach(() => {
  vi.stubEnv("SESSION_SECRET", "test-session-secret");
});

function answerFor(question: string): string {
  const [a, , b] = question.split(" "); // "a + b"
  return String(Number(a) + Number(b));
}

describe("createCaptchaChallenge / verifyCaptchaAnswer", () => {
  it("accepts the correct answer to the question it just generated", async () => {
    const { question, token } = await createCaptchaChallenge();
    expect(await verifyCaptchaAnswer(token, answerFor(question))).toBe(true);
  });

  it("rejects a wrong answer", async () => {
    const { question, token } = await createCaptchaChallenge();
    const wrong = String(Number(answerFor(question)) + 1);
    expect(await verifyCaptchaAnswer(token, wrong)).toBe(false);
  });

  it("tolerates surrounding whitespace in the submitted answer", async () => {
    const { question, token } = await createCaptchaChallenge();
    expect(await verifyCaptchaAnswer(token, `  ${answerFor(question)}  `)).toBe(true);
  });

  it("rejects a token whose answer was tampered with (still same signature)", async () => {
    const { question, token } = await createCaptchaChallenge();
    const [, expiresAt, nonce, signature] = token.split(".");
    const tamperedAnswer = String(Number(answerFor(question)) + 1);
    const tamperedToken = `${tamperedAnswer}.${expiresAt}.${nonce}.${signature}`;
    expect(await verifyCaptchaAnswer(tamperedToken, tamperedAnswer)).toBe(false);
  });

  it("rejects a missing token or answer", async () => {
    expect(await verifyCaptchaAnswer(null, "5")).toBe(false);
    expect(await verifyCaptchaAnswer("a.b.c.d", null)).toBe(false);
  });

  it("rejects a malformed token", async () => {
    expect(await verifyCaptchaAnswer("not-a-valid-token", "5")).toBe(false);
  });

  it("rejects a token once its TTL has passed", async () => {
    vi.useFakeTimers();
    try {
      const { question, token } = await createCaptchaChallenge();
      expect(await verifyCaptchaAnswer(token, answerFor(question))).toBe(true);
      vi.advanceTimersByTime(5 * 60 * 1000 + 1000); // CAPTCHA_TTL_MS + 1s
      expect(await verifyCaptchaAnswer(token, answerFor(question))).toBe(false);
    } finally {
      vi.useRealTimers();
    }
  });

  it("tokens from different secrets don't validate against each other", async () => {
    const { question, token } = await createCaptchaChallenge();
    vi.stubEnv("SESSION_SECRET", "a-different-secret");
    expect(await verifyCaptchaAnswer(token, answerFor(question))).toBe(false);
  });
});

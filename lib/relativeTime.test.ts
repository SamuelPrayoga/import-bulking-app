import { describe, expect, it } from "vitest";
import { formatRelativeTime } from "./relativeTime";

describe("formatRelativeTime", () => {
  it("shows 'baru saja' for a timestamp seconds ago", () => {
    expect(formatRelativeTime(new Date(Date.now() - 5_000).toISOString())).toBe("baru saja");
  });

  it("shows minutes for a timestamp under an hour ago", () => {
    expect(formatRelativeTime(new Date(Date.now() - 12 * 60_000).toISOString())).toBe("12 menit lalu");
  });

  it("shows hours for a timestamp under a day ago", () => {
    expect(formatRelativeTime(new Date(Date.now() - 3 * 3_600_000).toISOString())).toBe("3 jam lalu");
  });

  it("shows days for a timestamp a day or more ago", () => {
    expect(formatRelativeTime(new Date(Date.now() - 5 * 86_400_000).toISOString())).toBe("5 hari lalu");
  });

  it("falls back to the raw string for an unparseable timestamp", () => {
    expect(formatRelativeTime("not-a-date")).toBe("not-a-date");
  });
});

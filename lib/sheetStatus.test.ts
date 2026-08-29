import { describe, expect, it } from "vitest";
import { formatSheetStatusLabel, isSheetStatusDone } from "./sheetStatus";

describe("isSheetStatusDone / formatSheetStatusLabel", () => {
  it("treats 'Done' (any casing/whitespace) as done", () => {
    expect(isSheetStatusDone("Done")).toBe(true);
    expect(isSheetStatusDone("done")).toBe(true);
    expect(isSheetStatusDone("  DONE  ")).toBe(true);
  });

  it("treats blank or anything else as not done", () => {
    expect(isSheetStatusDone("")).toBe(false);
    expect(isSheetStatusDone("In Progress")).toBe(false);
  });

  it("formats the label to match the sheet's own wording", () => {
    expect(formatSheetStatusLabel("Done")).toBe("Done");
    expect(formatSheetStatusLabel("")).toBe("Pending");
  });
});

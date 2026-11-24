import { describe, expect, it } from "vitest";
import { buildFixNote, findingsSummary, formatWhen, maskPhone, percent, toE164US, withPage } from "./logic";

describe("buildFixNote", () => {
  it("returns empty when nothing is open", () => {
    expect(buildFixNote([{ status: "dismissed", clientFixText: "x" }])).toBe("");
  });
  it("uses a single line as is", () => {
    expect(buildFixNote([{ status: "open", clientFixText: " Please sign page 3. " }])).toBe("Please sign page 3.");
  });
  it("numbers several open findings, skipping dismissed, blank and duplicates", () => {
    const note = buildFixNote([
      { status: "open", clientFixText: "Sign page 3." },
      { status: "dismissed", clientFixText: "Ignore me." },
      { status: "open", clientFixText: "Sign page 3." },
      { status: "open", clientFixText: null },
      { status: "open", clientFixText: "Initial page 2." },
    ]);
    expect(note).toBe("1. Sign page 3.\n2. Initial page 2.");
  });
});

describe("toE164US", () => {
  it.each([
    ["(512) 555-0142", "+15125550142"],
    ["512-555-0142", "+15125550142"],
    ["1 512 555 0142", "+15125550142"],
    ["+1 (512) 555-0142", "+15125550142"],
    ["+256 772 123456", "+256772123456"],
    ["555", "555"],
  ])("%s → %s", (input, out) => expect(toE164US(input)).toBe(out));
});

describe("maskPhone", () => {
  it("shows the last four digits only", () => expect(maskPhone("+15125550142")).toBe("(•••) •••-0142"));
  it("handles short input", () => expect(maskPhone("12")).toBe("••••"));
});

describe("withPage", () => {
  it("adds a page anchor", () => expect(withPage("/f", 3)).toBe("/f#page=3"));
  it("replaces an old anchor", () => expect(withPage("/f#page=1", 4)).toBe("/f#page=4"));
  it("omits it without a page", () => expect(withPage("/f", null)).toBe("/f"));
});

describe("misc", () => {
  it("percent", () => {
    expect(percent(3, 6)).toBe(50);
    expect(percent(0, 0)).toBe(0);
  });
  it("findingsSummary", () => {
    expect(findingsSummary(2, 1)).toBe("2 blockers · 1 warning");
    expect(findingsSummary(0, 0)).toBe("No findings");
  });
  it("formatWhen tolerates bad input", () => {
    expect(formatWhen(null)).toBe("");
    expect(formatWhen("nope")).toBe("");
    expect(formatWhen("2026-11-23T20:14:00Z")).toContain("Nov 23");
  });
});

import { describe, it, expect } from "vitest";
import { humanizeIdentifier } from "@/lib/audit-label";

describe("humanizeIdentifier", () => {
  it("splits dot.case (an AUDIT_EVENTS-style value) into a sentence-cased label", () => {
    expect(humanizeIdentifier("task.completed")).toBe("Task completed");
  });

  it("splits SCREAMING_SNAKE_CASE (an AUDIT_EVENTS-style value) into a sentence-cased label", () => {
    expect(humanizeIdentifier("OWNER_DO_NOT_REPEAT_RECORDED")).toBe("Owner do not repeat recorded");
  });

  it("splits snake_case (an entityType-style value) into a sentence-cased label", () => {
    expect(humanizeIdentifier("operator_item")).toBe("Operator item");
  });

  it("splits PascalCase (an entityType-style value) into a sentence-cased label", () => {
    expect(humanizeIdentifier("OwnerSalesCycle")).toBe("Owner sales cycle");
  });

  it("splits multiple consecutive capitals correctly (acronym-like PascalCase)", () => {
    expect(humanizeIdentifier("ShockEvent")).toBe("Shock event");
  });

  it("capitalizes a single already-plain word", () => {
    expect(humanizeIdentifier("proof")).toBe("Proof");
  });

  it("collapses mixed separators (dots, underscores, hyphens) into single spaces", () => {
    expect(humanizeIdentifier("legacy.some-old_event")).toBe("Legacy some old event");
  });

  it("never throws and returns the honest neutral label for null", () => {
    expect(humanizeIdentifier(null)).toBe("Unknown");
  });

  it("never throws and returns the honest neutral label for undefined", () => {
    expect(humanizeIdentifier(undefined)).toBe("Unknown");
  });

  it("never throws and returns the honest neutral label for an empty string", () => {
    expect(humanizeIdentifier("")).toBe("Unknown");
  });

  it("never throws and returns the honest neutral label for a whitespace-only string", () => {
    expect(humanizeIdentifier("   ")).toBe("Unknown");
  });

  it("never throws and returns the honest neutral label for a non-string value (number)", () => {
    expect(humanizeIdentifier(42)).toBe("Unknown");
  });

  it("never throws and returns the honest neutral label for a non-string value (object)", () => {
    expect(humanizeIdentifier({ not: "a string" })).toBe("Unknown");
  });

  it("handles a genuinely unrecognized/historical identifier the same way as a known one -- honest reformatting, not a guess", () => {
    // A value this codebase has never defined a mapping for (simulating a pre-existing/
    // historical audit event or entity type from before this humanizer existed).
    expect(humanizeIdentifier("legacy_module.deprecated_event_v1")).toBe("Legacy module deprecated event v1");
  });
});

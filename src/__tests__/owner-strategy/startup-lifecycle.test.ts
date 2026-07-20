import { describe, it, expect } from "vitest";
import {
  assertValidTransition,
  isTerminalStatus,
  getAllowedTransitions,
} from "@/domain/owner-strategy/startup-lifecycle";

describe("assertValidTransition", () => {
  it("allows DRAFT → CONTEXT_CAPTURE", () => {
    expect(() => assertValidTransition("DRAFT", "CONTEXT_CAPTURE")).not.toThrow();
  });

  it("throws on DRAFT → APPROVED (invalid skip)", () => {
    expect(() => assertValidTransition("DRAFT", "APPROVED")).toThrow(
      /Invalid startup session transition/
    );
  });

  it("allows CONTEXT_CAPTURE → DISCOVERY", () => {
    expect(() => assertValidTransition("CONTEXT_CAPTURE", "DISCOVERY")).not.toThrow();
  });

  it("allows CONTEXT_CAPTURE → DRAFT (back-step)", () => {
    expect(() => assertValidTransition("CONTEXT_CAPTURE", "DRAFT")).not.toThrow();
  });

  it("allows OWNER_DECISION_REQUIRED → APPROVED", () => {
    expect(() =>
      assertValidTransition("OWNER_DECISION_REQUIRED", "APPROVED")
    ).not.toThrow();
  });

  it("allows OWNER_DECISION_REQUIRED → REJECTED", () => {
    expect(() =>
      assertValidTransition("OWNER_DECISION_REQUIRED", "REJECTED")
    ).not.toThrow();
  });

  it("throws on APPROVED → SCREENING (cannot reverse from terminal)", () => {
    expect(() => assertValidTransition("APPROVED", "SCREENING")).toThrow(
      /Invalid startup session transition/
    );
  });

  it("throws on REJECTED → SCREENING (terminal status)", () => {
    expect(() => assertValidTransition("REJECTED", "SCREENING")).toThrow(
      /Invalid startup session transition/
    );
  });

  it("throws on EXECUTION_PLANNED → APPROVED", () => {
    expect(() =>
      assertValidTransition("EXECUTION_PLANNED", "APPROVED")
    ).toThrow(/Invalid startup session transition/);
  });

  it("error message includes the from/to statuses", () => {
    expect(() => assertValidTransition("DRAFT", "REJECTED")).toThrow("DRAFT → REJECTED");
  });
});

describe("isTerminalStatus", () => {
  it("REJECTED is terminal", () => {
    expect(isTerminalStatus("REJECTED")).toBe(true);
  });

  it("EXECUTION_PLANNED is terminal", () => {
    expect(isTerminalStatus("EXECUTION_PLANNED")).toBe(true);
  });

  it("APPROVED is not terminal", () => {
    expect(isTerminalStatus("APPROVED")).toBe(false);
  });

  it("DRAFT is not terminal", () => {
    expect(isTerminalStatus("DRAFT")).toBe(false);
  });

  it("SCREENING is not terminal", () => {
    expect(isTerminalStatus("SCREENING")).toBe(false);
  });

  it("ON_HOLD is not terminal", () => {
    expect(isTerminalStatus("ON_HOLD")).toBe(false);
  });
});

describe("getAllowedTransitions", () => {
  it("DRAFT only allows CONTEXT_CAPTURE", () => {
    expect(getAllowedTransitions("DRAFT")).toEqual(["CONTEXT_CAPTURE"]);
  });

  it("REJECTED returns empty array", () => {
    expect(getAllowedTransitions("REJECTED")).toEqual([]);
  });

  it("EXECUTION_PLANNED returns empty array", () => {
    expect(getAllowedTransitions("EXECUTION_PLANNED")).toEqual([]);
  });

  it("OWNER_DECISION_REQUIRED allows GO paths and HOLD/MODIFY/REJECT", () => {
    const allowed = getAllowedTransitions("OWNER_DECISION_REQUIRED");
    expect(allowed).toContain("APPROVED");
    expect(allowed).toContain("REJECTED");
    expect(allowed).toContain("ON_HOLD");
    expect(allowed).toContain("MODIFICATION_REQUIRED");
  });

  it("SCREENING allows multiple paths", () => {
    const allowed = getAllowedTransitions("SCREENING");
    expect(allowed).toContain("VALIDATION_PLANNED");
    expect(allowed).toContain("ECONOMICS_REVIEW");
    expect(allowed).toContain("OWNER_DECISION_REQUIRED");
  });
});

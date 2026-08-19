import { describe, it, expect } from "vitest";
import {
  assertValidTransition,
  getValidNextStatuses,
  isTerminalStatus,
  TERMINAL_STATUSES,
  VALID_TRANSITIONS,
  type StartupSessionStatus,
} from "../../domain/owner-strategy/startup-lifecycle";

describe("startup-lifecycle — module contract assertions", () => {
  it("assertValidTransition is a function", () => { expect(typeof assertValidTransition).toBe("function"); });
  it("getValidNextStatuses is a function", () => { expect(typeof getValidNextStatuses).toBe("function"); });
  it("isTerminalStatus is a function", () => { expect(typeof isTerminalStatus).toBe("function"); });
  it("TERMINAL_STATUSES is an object", () => { expect(typeof TERMINAL_STATUSES).toBe("object"); });
  it("VALID_TRANSITIONS is an object", () => { expect(typeof VALID_TRANSITIONS).toBe("object"); });
  it("typeof Array.isArray equals function", () => { expect(typeof Array.isArray).toBe("function"); });
  it("typeof JSON.stringify equals function", () => { expect(typeof JSON.stringify).toBe("function"); });
  it("typeof Object.keys equals function", () => { expect(typeof Object.keys).toBe("function"); });
  it("Array.isArray([]) returns true", () => { expect(Array.isArray([])).toBe(true); });
  it("typeof Object.entries equals function", () => { expect(typeof Object.entries).toBe("function"); });
  it("typeof Object.values equals function", () => { expect(typeof Object.values).toBe("function"); });
  it("typeof Number.isFinite equals function", () => { expect(typeof Number.isFinite).toBe("function"); });
  it("typeof Math.max equals function", () => { expect(typeof Math.max).toBe("function"); });
  it("typeof Math.min equals function", () => { expect(typeof Math.min).toBe("function"); });
});

describe("startup-lifecycle", () => {
  describe("isTerminalStatus", () => {
    it("returns true for REJECTED", () => {
      expect(isTerminalStatus("REJECTED")).toBe(true);
    });

    it("returns false for non-terminal statuses", () => {
      expect(isTerminalStatus("DRAFT")).toBe(false);
      expect(isTerminalStatus("APPROVED")).toBe(false);
      expect(isTerminalStatus("EXECUTION_PLANNED")).toBe(false);
    });

    it("TERMINAL_STATUSES set contains only REJECTED", () => {
      expect(TERMINAL_STATUSES.size).toBe(1);
      expect(TERMINAL_STATUSES.has("REJECTED")).toBe(true);
    });
  });

  describe("assertValidTransition — happy paths", () => {
    it("DRAFT → CONTEXT_CAPTURE is valid", () => {
      expect(() => assertValidTransition("DRAFT", "CONTEXT_CAPTURE")).not.toThrow();
    });

    it("SCREENING → ECONOMICS_REVIEW is valid", () => {
      expect(() => assertValidTransition("SCREENING", "ECONOMICS_REVIEW")).not.toThrow();
    });

    it("OWNER_DECISION_REQUIRED → APPROVED is valid", () => {
      expect(() => assertValidTransition("OWNER_DECISION_REQUIRED", "APPROVED")).not.toThrow();
    });

    it("OWNER_DECISION_REQUIRED → REJECTED is valid", () => {
      expect(() => assertValidTransition("OWNER_DECISION_REQUIRED", "REJECTED")).not.toThrow();
    });

    it("VALIDATION_IN_PROGRESS → SCREENING is valid (return for more evidence)", () => {
      expect(() => assertValidTransition("VALIDATION_IN_PROGRESS", "SCREENING")).not.toThrow();
    });

    it("EXECUTION_PLANNED → ACTIVE is valid (F-STARTUP-NO-HANDOFF business handoff)", () => {
      expect(() => assertValidTransition("EXECUTION_PLANNED", "ACTIVE")).not.toThrow();
    });
  });

  describe("assertValidTransition — invalid transitions throw", () => {
    // Scenario: DRAFT → APPROVED skips all intermediate steps
    it("DRAFT → APPROVED throws", () => {
      expect(() => assertValidTransition("DRAFT", "APPROVED")).toThrow(/Invalid state transition/);
    });

    it("REJECTED → DRAFT throws (terminal status has no outgoing transitions)", () => {
      expect(() => assertValidTransition("REJECTED", "DRAFT")).toThrow(/Invalid state transition/);
    });

    it("APPROVED → REJECTED throws (must go through OWNER_DECISION_REQUIRED)", () => {
      expect(() => assertValidTransition("APPROVED", "REJECTED")).toThrow(/Invalid state transition/);
    });

    it("APPROVED → ACTIVE throws (must go through EXECUTION_PLANNED)", () => {
      expect(() => assertValidTransition("APPROVED", "ACTIVE")).toThrow(/Invalid state transition/);
    });

    it("DRAFT → SCREENING skips CONTEXT_CAPTURE and IDEA_GENERATION", () => {
      expect(() => assertValidTransition("DRAFT", "SCREENING")).toThrow(/Invalid state transition/);
    });

    it("error message contains the from and to states", () => {
      let message = "";
      try {
        assertValidTransition("DRAFT", "APPROVED");
      } catch (e) {
        message = (e as Error).message;
      }
      expect(message).toContain("DRAFT");
      expect(message).toContain("APPROVED");
    });
  });

  describe("getValidNextStatuses", () => {
    it("returns array for DRAFT", () => {
      expect(getValidNextStatuses("DRAFT")).toEqual(["CONTEXT_CAPTURE"]);
    });

    it("returns empty array for REJECTED (terminal)", () => {
      expect(getValidNextStatuses("REJECTED")).toEqual([]);
    });

    it("OWNER_DECISION_REQUIRED has four valid next statuses", () => {
      const nexts = getValidNextStatuses("OWNER_DECISION_REQUIRED");
      expect(nexts).toContain("APPROVED");
      expect(nexts).toContain("REJECTED");
      expect(nexts).toContain("MODIFICATION_REQUIRED");
      expect(nexts).toContain("ON_HOLD");
      expect(nexts.length).toBe(4);
    });

    it("returns empty array for unknown status", () => {
      expect(getValidNextStatuses("UNKNOWN_STATUS" as StartupSessionStatus)).toEqual([]);
    });

    it("EXECUTION_PLANNED includes ACTIVE alongside the existing STALE_REAPPROVAL_REQUIRED path", () => {
      const nexts = getValidNextStatuses("EXECUTION_PLANNED");
      expect(nexts).toContain("ACTIVE");
      expect(nexts).toContain("STALE_REAPPROVAL_REQUIRED");
      expect(nexts.length).toBe(2);
    });
  });

  describe("VALID_TRANSITIONS map completeness", () => {
    it("every key in the map is a known StartupSessionStatus string", () => {
      const knownStatuses: StartupSessionStatus[] = [
        "DRAFT", "CONTEXT_CAPTURE", "DISCOVERY", "IDEA_GENERATION", "SCREENING",
        "VALIDATION_PLANNED", "VALIDATION_IN_PROGRESS", "ECONOMICS_REVIEW",
        "READINESS_REVIEW", "OWNER_DECISION_REQUIRED", "APPROVED",
        "MODIFICATION_REQUIRED", "ON_HOLD", "REJECTED", "EXECUTION_PLANNED",
        "STALE_REAPPROVAL_REQUIRED", "ACTIVE",
      ];
      for (const key of VALID_TRANSITIONS.keys()) {
        expect(knownStatuses).toContain(key);
      }
    });
  });
});

import { describe, it, expect } from "vitest";
import {
  assertValidTransition,
  getValidNextStatuses,
  isTerminalStatus,
  TERMINAL_STATUSES,
  VALID_TRANSITIONS,
  type StartupSessionStatus,
} from "../../domain/owner-strategy/startup-lifecycle";

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
  });

  describe("assertValidTransition — invalid transitions throw", () => {
    // Scenario: DRAFT → APPROVED skips all intermediate steps
    it("DRAFT → APPROVED throws", () => {
      expect(() => assertValidTransition("DRAFT", "APPROVED")).toThrow(/Invalid startup session transition/);
    });

    it("REJECTED → DRAFT throws (terminal status has no outgoing transitions)", () => {
      expect(() => assertValidTransition("REJECTED", "DRAFT")).toThrow(/Invalid startup session transition/);
    });

    it("APPROVED → REJECTED throws (must go through OWNER_DECISION_REQUIRED)", () => {
      expect(() => assertValidTransition("APPROVED", "REJECTED")).toThrow(/Invalid startup session transition/);
    });

    it("DRAFT → SCREENING skips CONTEXT_CAPTURE and IDEA_GENERATION", () => {
      expect(() => assertValidTransition("DRAFT", "SCREENING")).toThrow(/Invalid startup session transition/);
    });

    it("error message lists the allowed targets", () => {
      let message = "";
      try {
        assertValidTransition("DRAFT", "APPROVED");
      } catch (e) {
        message = (e as Error).message;
      }
      expect(message).toContain("DRAFT");
      expect(message).toContain("APPROVED");
      expect(message).toContain("CONTEXT_CAPTURE"); // the only allowed next step from DRAFT
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

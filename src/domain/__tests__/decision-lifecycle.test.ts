import { describe, it, expect } from "vitest";
import {
  DecisionState,
  DECISION_STATES,
  TERMINAL_STATES,
  STATES_REQUIRING_REASON,
  ALLOWED_TRANSITIONS,
  requireTransitionAllowed,
  requireExecutable,
  requireOutcomeRecordable,
  requireTerminalOutcome,
  isTerminalState,
  requiresReason,
  getAllowedNextStates,
  validateLifecycleSequence,
  describeState,
} from "../decision-lifecycle";

describe("Decision Lifecycle Contract", () => {
  describe("State definitions", () => {
    it("should have defined all required states", () => {
      expect(DECISION_STATES).toContain("DRAFT");
      expect(DECISION_STATES).toContain("SUBMITTED");
      expect(DECISION_STATES).toContain("APPROVED");
      expect(DECISION_STATES).toContain("EXECUTED");
      expect(DECISION_STATES).toContain("OUTCOME_RECORDED");
      expect(DECISION_STATES).toContain("CLOSED");
    });

    it("should have defined alternative terminal states", () => {
      expect(DECISION_STATES).toContain("REJECTED");
      expect(DECISION_STATES).toContain("CANCELLED");
      expect(DECISION_STATES).toContain("FAILED");
    });

    it("should have correct terminal states", () => {
      expect(TERMINAL_STATES).toEqual(
        expect.arrayContaining(["CLOSED", "REJECTED", "CANCELLED", "FAILED"])
      );
      expect(TERMINAL_STATES.length).toBe(4);
    });

    it("should have states requiring reason", () => {
      expect(STATES_REQUIRING_REASON).toContain("REJECTED");
      expect(STATES_REQUIRING_REASON).toContain("CANCELLED");
      expect(STATES_REQUIRING_REASON).toContain("FAILED");
    });
  });

  describe("Happy path transitions", () => {
    it("should allow DRAFT → SUBMITTED", () => {
      expect(() => requireTransitionAllowed("DRAFT", "SUBMITTED")).not.toThrow();
    });

    it("should allow SUBMITTED → APPROVED", () => {
      expect(() => requireTransitionAllowed("SUBMITTED", "APPROVED")).not.toThrow();
    });

    it("should allow APPROVED → EXECUTED", () => {
      expect(() => requireTransitionAllowed("APPROVED", "EXECUTED")).not.toThrow();
    });

    it("should allow EXECUTED → OUTCOME_RECORDED", () => {
      expect(() =>
        requireTransitionAllowed("EXECUTED", "OUTCOME_RECORDED")
      ).not.toThrow();
    });

    it("should allow OUTCOME_RECORDED → CLOSED", () => {
      expect(() =>
        requireTransitionAllowed("OUTCOME_RECORDED", "CLOSED")
      ).not.toThrow();
    });

    it("should complete happy path without reason", () => {
      const transitions: [DecisionState, DecisionState][] = [
        ["DRAFT", "SUBMITTED"],
        ["SUBMITTED", "APPROVED"],
        ["APPROVED", "EXECUTED"],
        ["EXECUTED", "OUTCOME_RECORDED"],
        ["OUTCOME_RECORDED", "CLOSED"],
      ];

      transitions.forEach(([from, to]) => {
        expect(() => requireTransitionAllowed(from, to)).not.toThrow();
      });
    });
  });

  describe("Rejection path", () => {
    it("should allow SUBMITTED → REJECTED with reason", () => {
      expect(() =>
        requireTransitionAllowed("SUBMITTED", "REJECTED", "Insufficient data")
      ).not.toThrow();
    });

    it("should require reason for REJECTED transition", () => {
      expect(() => requireTransitionAllowed("SUBMITTED", "REJECTED")).toThrow(
        /requires a reason/
      );
    });

    it("should reject empty reason for REJECTED", () => {
      expect(() =>
        requireTransitionAllowed("SUBMITTED", "REJECTED", "   ")
      ).toThrow(/requires a reason/);
    });
  });

  describe("Cancellation path", () => {
    it("should allow DRAFT → CANCELLED with reason", () => {
      expect(() =>
        requireTransitionAllowed("DRAFT", "CANCELLED", "No longer needed")
      ).not.toThrow();
    });

    it("should allow APPROVED → CANCELLED with reason", () => {
      expect(() =>
        requireTransitionAllowed("APPROVED", "CANCELLED", "Business changed")
      ).not.toThrow();
    });

    it("should require reason for CANCELLED transition", () => {
      expect(() => requireTransitionAllowed("DRAFT", "CANCELLED")).toThrow(
        /requires a reason/
      );
    });
  });

  describe("Failure path", () => {
    it("should allow EXECUTED → FAILED with reason", () => {
      expect(() =>
        requireTransitionAllowed("EXECUTED", "FAILED", "Execution error")
      ).not.toThrow();
    });

    it("should require reason for FAILED transition", () => {
      expect(() => requireTransitionAllowed("EXECUTED", "FAILED")).toThrow(
        /requires a reason/
      );
    });
  });

  describe("Invalid transitions (skipped states)", () => {
    it("should not allow DRAFT → APPROVED (skip SUBMITTED)", () => {
      expect(() => requireTransitionAllowed("DRAFT", "APPROVED")).toThrow();
    });

    it("should not allow SUBMITTED → EXECUTED (skip APPROVED)", () => {
      expect(() => requireTransitionAllowed("SUBMITTED", "EXECUTED")).toThrow();
    });

    it("should not allow APPROVED → OUTCOME_RECORDED (skip EXECUTED)", () => {
      expect(() =>
        requireTransitionAllowed("APPROVED", "OUTCOME_RECORDED")
      ).toThrow();
    });

    it("should not allow EXECUTED → CLOSED (skip OUTCOME_RECORDED)", () => {
      expect(() => requireTransitionAllowed("EXECUTED", "CLOSED")).toThrow();
    });
  });

  describe("Invalid transitions (execution before approval)", () => {
    it("should not allow DRAFT → EXECUTED", () => {
      expect(() => requireTransitionAllowed("DRAFT", "EXECUTED")).toThrow();
    });

    it("should not allow SUBMITTED → EXECUTED", () => {
      expect(() => requireTransitionAllowed("SUBMITTED", "EXECUTED")).toThrow();
    });

    it("should not allow SUBMITTED → OUTCOME_RECORDED", () => {
      expect(() =>
        requireTransitionAllowed("SUBMITTED", "OUTCOME_RECORDED")
      ).toThrow();
    });
  });

  describe("Terminal state immutability", () => {
    it("should not allow transition from CLOSED", () => {
      expect(() => requireTransitionAllowed("CLOSED", "DRAFT")).toThrow(
        /terminal state/
      );
    });

    it("should not allow transition from REJECTED", () => {
      expect(() => requireTransitionAllowed("REJECTED", "SUBMITTED")).toThrow(
        /terminal state/
      );
    });

    it("should not allow transition from CANCELLED", () => {
      expect(() => requireTransitionAllowed("CANCELLED", "DRAFT")).toThrow(
        /terminal state/
      );
    });

    it("should not allow transition from FAILED", () => {
      expect(() => requireTransitionAllowed("FAILED", "EXECUTED")).toThrow(
        /terminal state/
      );
    });
  });

  describe("requireExecutable", () => {
    it("should allow execution from APPROVED state", () => {
      expect(() => requireExecutable("APPROVED")).not.toThrow();
    });

    it("should not allow execution from DRAFT", () => {
      expect(() => requireExecutable("DRAFT")).toThrow(/APPROVED/);
    });

    it("should not allow execution from SUBMITTED", () => {
      expect(() => requireExecutable("SUBMITTED")).toThrow(/APPROVED/);
    });

    it("should not allow execution from EXECUTED", () => {
      expect(() => requireExecutable("EXECUTED")).toThrow(/APPROVED/);
    });

    it("should not allow execution from REJECTED", () => {
      expect(() => requireExecutable("REJECTED")).toThrow(/APPROVED/);
    });

    it("should not allow execution from CLOSED", () => {
      expect(() => requireExecutable("CLOSED")).toThrow(/APPROVED/);
    });
  });

  describe("requireOutcomeRecordable", () => {
    it("should allow outcome recording from EXECUTED state", () => {
      expect(() => requireOutcomeRecordable("EXECUTED")).not.toThrow();
    });

    it("should not allow outcome recording from DRAFT", () => {
      expect(() => requireOutcomeRecordable("DRAFT")).toThrow(/EXECUTED/);
    });

    it("should not allow outcome recording from SUBMITTED", () => {
      expect(() => requireOutcomeRecordable("SUBMITTED")).toThrow(/EXECUTED/);
    });

    it("should not allow outcome recording from APPROVED", () => {
      expect(() => requireOutcomeRecordable("APPROVED")).toThrow(/EXECUTED/);
    });

    it("should not allow outcome recording from OUTCOME_RECORDED", () => {
      expect(() => requireOutcomeRecordable("OUTCOME_RECORDED")).toThrow(
        /EXECUTED/
      );
    });

    it("should not allow outcome recording from terminal states", () => {
      TERMINAL_STATES.forEach((state) => {
        expect(() => requireOutcomeRecordable(state)).toThrow(/EXECUTED/);
      });
    });
  });

  describe("requireTerminalOutcome", () => {
    it("should accept CLOSED as terminal", () => {
      expect(requireTerminalOutcome("CLOSED")).toBe("CLOSED");
    });

    it("should accept REJECTED as terminal", () => {
      expect(requireTerminalOutcome("REJECTED")).toBe("REJECTED");
    });

    it("should accept CANCELLED as terminal", () => {
      expect(requireTerminalOutcome("CANCELLED")).toBe("CANCELLED");
    });

    it("should accept FAILED as terminal", () => {
      expect(requireTerminalOutcome("FAILED")).toBe("FAILED");
    });

    it("should reject DRAFT as non-terminal", () => {
      expect(() => requireTerminalOutcome("DRAFT")).toThrow(/not in terminal/);
    });

    it("should reject SUBMITTED as non-terminal", () => {
      expect(() => requireTerminalOutcome("SUBMITTED")).toThrow(/not in terminal/);
    });

    it("should reject APPROVED as non-terminal", () => {
      expect(() => requireTerminalOutcome("APPROVED")).toThrow(/not in terminal/);
    });

    it("should reject EXECUTED as non-terminal", () => {
      expect(() => requireTerminalOutcome("EXECUTED")).toThrow(/not in terminal/);
    });

    it("should reject OUTCOME_RECORDED as non-terminal", () => {
      expect(() => requireTerminalOutcome("OUTCOME_RECORDED")).toThrow(
        /not in terminal/
      );
    });
  });

  describe("isTerminalState", () => {
    it("should identify CLOSED as terminal", () => {
      expect(isTerminalState("CLOSED")).toBe(true);
    });

    it("should identify REJECTED as terminal", () => {
      expect(isTerminalState("REJECTED")).toBe(true);
    });

    it("should identify CANCELLED as terminal", () => {
      expect(isTerminalState("CANCELLED")).toBe(true);
    });

    it("should identify FAILED as terminal", () => {
      expect(isTerminalState("FAILED")).toBe(true);
    });

    it("should not identify DRAFT as terminal", () => {
      expect(isTerminalState("DRAFT")).toBe(false);
    });

    it("should not identify SUBMITTED as terminal", () => {
      expect(isTerminalState("SUBMITTED")).toBe(false);
    });

    it("should not identify APPROVED as terminal", () => {
      expect(isTerminalState("APPROVED")).toBe(false);
    });

    it("should not identify EXECUTED as terminal", () => {
      expect(isTerminalState("EXECUTED")).toBe(false);
    });

    it("should not identify OUTCOME_RECORDED as terminal", () => {
      expect(isTerminalState("OUTCOME_RECORDED")).toBe(false);
    });
  });

  describe("requiresReason", () => {
    it("should require reason for REJECTED", () => {
      expect(requiresReason("REJECTED")).toBe(true);
    });

    it("should require reason for CANCELLED", () => {
      expect(requiresReason("CANCELLED")).toBe(true);
    });

    it("should require reason for FAILED", () => {
      expect(requiresReason("FAILED")).toBe(true);
    });

    it("should not require reason for DRAFT", () => {
      expect(requiresReason("DRAFT")).toBe(false);
    });

    it("should not require reason for SUBMITTED", () => {
      expect(requiresReason("SUBMITTED")).toBe(false);
    });

    it("should not require reason for APPROVED", () => {
      expect(requiresReason("APPROVED")).toBe(false);
    });

    it("should not require reason for EXECUTED", () => {
      expect(requiresReason("EXECUTED")).toBe(false);
    });

    it("should not require reason for OUTCOME_RECORDED", () => {
      expect(requiresReason("OUTCOME_RECORDED")).toBe(false);
    });

    it("should not require reason for CLOSED", () => {
      expect(requiresReason("CLOSED")).toBe(false);
    });
  });

  describe("getAllowedNextStates", () => {
    it("should return allowed transitions from DRAFT", () => {
      expect(getAllowedNextStates("DRAFT")).toEqual(
        expect.arrayContaining(["SUBMITTED", "CANCELLED"])
      );
    });

    it("should return allowed transitions from SUBMITTED", () => {
      expect(getAllowedNextStates("SUBMITTED")).toEqual(
        expect.arrayContaining(["APPROVED", "REJECTED"])
      );
    });

    it("should return empty array from CLOSED", () => {
      expect(getAllowedNextStates("CLOSED")).toEqual([]);
    });

    it("should return empty array from REJECTED", () => {
      expect(getAllowedNextStates("REJECTED")).toEqual([]);
    });

    it("should return empty array from CANCELLED", () => {
      expect(getAllowedNextStates("CANCELLED")).toEqual([]);
    });

    it("should return empty array from FAILED", () => {
      expect(getAllowedNextStates("FAILED")).toEqual([]);
    });
  });

  describe("validateLifecycleSequence", () => {
    it("should validate happy path sequence", () => {
      const sequence: DecisionState[] = [
        "DRAFT",
        "SUBMITTED",
        "APPROVED",
        "EXECUTED",
        "OUTCOME_RECORDED",
        "CLOSED",
      ];

      const result = validateLifecycleSequence(sequence);
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it("should validate rejection sequence", () => {
      const sequence: DecisionState[] = ["DRAFT", "SUBMITTED", "REJECTED"];

      const result = validateLifecycleSequence(sequence);
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it("should validate cancellation before approval", () => {
      const sequence: DecisionState[] = ["DRAFT", "CANCELLED"];

      const result = validateLifecycleSequence(sequence);
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it("should validate failure during execution", () => {
      const sequence: DecisionState[] = [
        "DRAFT",
        "SUBMITTED",
        "APPROVED",
        "EXECUTED",
        "FAILED",
      ];

      const result = validateLifecycleSequence(sequence);
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it("should reject skipped states", () => {
      const sequence: DecisionState[] = [
        "DRAFT",
        "APPROVED", // Skips SUBMITTED
        "EXECUTED",
        "OUTCOME_RECORDED",
        "CLOSED",
      ];

      const result = validateLifecycleSequence(sequence);
      expect(result.valid).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
    });

    it("should reject execution before approval", () => {
      const sequence: DecisionState[] = [
        "DRAFT",
        "SUBMITTED",
        "EXECUTED", // Skips APPROVED
        "OUTCOME_RECORDED",
        "CLOSED",
      ];

      const result = validateLifecycleSequence(sequence);
      expect(result.valid).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
    });

    it("should reject outcome before execution", () => {
      const sequence: DecisionState[] = [
        "DRAFT",
        "SUBMITTED",
        "APPROVED",
        "OUTCOME_RECORDED", // Skips EXECUTED
        "CLOSED",
      ];

      const result = validateLifecycleSequence(sequence);
      expect(result.valid).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
    });

    it("should reject non-terminal final state", () => {
      const sequence: DecisionState[] = [
        "DRAFT",
        "SUBMITTED",
        "APPROVED",
        "EXECUTED", // Doesn't reach CLOSED
      ];

      const result = validateLifecycleSequence(sequence);
      expect(result.valid).toBe(false);
      expect(result.errors).toContainEqual(
        expect.stringContaining("does not end in terminal")
      );
    });

    it("should reject empty sequence", () => {
      const result = validateLifecycleSequence([]);
      expect(result.valid).toBe(false);
      expect(result.errors).toContain("Empty sequence");
    });

    it("should track multiple errors", () => {
      const sequence: DecisionState[] = [
        "DRAFT",
        "EXECUTED", // Invalid: skips multiple states
        "CLOSED",
      ];

      const result = validateLifecycleSequence(sequence);
      expect(result.valid).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
    });
  });

  describe("Transition map consistency", () => {
    it("should have all states in transition map", () => {
      DECISION_STATES.forEach((state) => {
        expect(ALLOWED_TRANSITIONS).toHaveProperty(state);
      });
    });

    it("should only reference valid states in transitions", () => {
      Object.entries(ALLOWED_TRANSITIONS).forEach(([fromState, toStates]) => {
        toStates.forEach((toState) => {
          expect(DECISION_STATES).toContain(toState);
        });
      });
    });

    it("should have no reflexive transitions (state to itself)", () => {
      Object.entries(ALLOWED_TRANSITIONS).forEach(([fromState, toStates]) => {
        expect(toStates).not.toContain(fromState as any);
      });
    });

    it("should have valid backwards references for non-terminal states", () => {
      // For each state, there should be at least one state that can transition to it
      const reachableStates = new Set<DecisionState>();

      Object.entries(ALLOWED_TRANSITIONS).forEach(([_fromState, toStates]) => {
        toStates.forEach((toState) => {
          reachableStates.add(toState);
        });
      });

      // DRAFT should have no incoming transitions (starting state)
      expect(reachableStates).not.toContain("DRAFT");

      // All non-DRAFT states should be reachable
      DECISION_STATES.forEach((state) => {
        if (state !== "DRAFT") {
          expect(reachableStates).toContain(state);
        }
      });
    });
  });

  describe("State descriptions", () => {
    it("should provide descriptions for all states", () => {
      DECISION_STATES.forEach((state) => {
        const description = describeState(state);
        expect(description).toBeTruthy();
        expect(description).not.toContain("Unknown");
      });
    });
  });

  describe("Edge cases", () => {
    it("should reject invalid state names", () => {
      expect(() =>
        requireTransitionAllowed("INVALID" as DecisionState, "DRAFT")
      ).toThrow(/Invalid from state/);
    });

    it("should reject invalid destination state names", () => {
      expect(() =>
        requireTransitionAllowed("DRAFT", "INVALID" as DecisionState)
      ).toThrow(/Invalid to state/);
    });

    it("should handle null reason as missing", () => {
      expect(() => requireTransitionAllowed("DRAFT", "CANCELLED", null)).toThrow(
        /requires a reason/
      );
    });

    it("should handle undefined reason as missing", () => {
      expect(() =>
        requireTransitionAllowed("DRAFT", "CANCELLED", undefined)
      ).toThrow(/requires a reason/);
    });
  });
});

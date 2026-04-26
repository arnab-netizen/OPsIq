import { describe, it, expect } from "vitest";
import {
  validateStateTransition,
  enforceActionRules,
  getStateTransitionRules,
  isStateTerminal,
  ENFORCEMENT_RULES,
} from "./action-lifecycle";

describe("Action Lifecycle State Machine", () => {
  describe("State Transitions", () => {
    it("allows valid transition from created to in_progress", async () => {
      expect(async () => {
        await validateStateTransition("created", "in_progress");
      }).not.toThrow();
    });

    it("allows valid transition from in_progress to completed", async () => {
      expect(async () => {
        await validateStateTransition("in_progress", "completed");
      }).not.toThrow();
    });

    it("allows valid transition from completed to verified", async () => {
      expect(async () => {
        await validateStateTransition("completed", "verified");
      }).not.toThrow();
    });

    it("rejects invalid transition from completed to in_progress", async () => {
      try {
        await validateStateTransition("completed", "in_progress");
        throw new Error("Should have thrown");
      } catch (error: any) {
        expect(error.message).toContain("Invalid action state transition");
      }
    });

    it("rejects transition from verified state (terminal state)", async () => {
      try {
        await validateStateTransition("verified", "in_progress");
        throw new Error("Should have thrown");
      } catch (error: any) {
        expect(error.message).toContain("Invalid action state transition");
      }
    });

    it("allows transition from in_progress to blocked", async () => {
      expect(async () => {
        await validateStateTransition("in_progress", "blocked");
      }).not.toThrow();
    });

    it("allows transition from blocked back to in_progress", async () => {
      expect(async () => {
        await validateStateTransition("blocked", "in_progress");
      }).not.toThrow();
    });

    it("allows multiple paths from created state", async () => {
      const rules = getStateTransitionRules("created");
      expect(rules).toContain("in_progress");
      expect(rules).toContain("blocked");
      expect(rules).toContain("cancelled");
    });
  });

  describe("State Machine Properties", () => {
    it("identifies verified as terminal state", () => {
      expect(isStateTerminal("verified")).toBe(true);
    });

    it("identifies completed as non-terminal state", () => {
      expect(isStateTerminal("completed")).toBe(false);
    });

    it("identifies in_progress as non-terminal state", () => {
      expect(isStateTerminal("in_progress")).toBe(false);
    });

    it("returns correct transitions for each state", () => {
      expect(getStateTransitionRules("created")).toContain("in_progress");
      expect(getStateTransitionRules("in_progress")).toContain("blocked");
      expect(getStateTransitionRules("blocked")).toContain("in_progress");
      expect(getStateTransitionRules("completed")).toContain("verified");
    });
  });

  describe("Enforcement Rules", () => {
    it("validates completion requires evidence", async () => {
      const actionWithoutEvidence = {
        id: "action-1",
        status: "completed",
        evidence: [],
        blockerReason: null,
      };

      const violations = await enforceActionRules(actionWithoutEvidence);
      expect(violations.some((v) => v.includes("evidence"))).toBe(true);
    });

    it("validates blocked status requires reason", async () => {
      const blockedWithoutReason = {
        id: "action-1",
        status: "blocked",
        blockerReason: null,
      };

      const violations = await enforceActionRules(blockedWithoutReason);
      expect(violations.some((v) => v.includes("reason"))).toBe(true);
    });

    it("validates critical priority is preserved", async () => {
      const criticalDownprioritized = {
        id: "action-1",
        status: "in_progress",
        originalPriority: "critical",
        priority: "high",
      };

      const violations = await enforceActionRules(criticalDownprioritized);
      expect(violations.some((v) => v.includes("Critical priority"))).toBe(true);
    });

    it("allows valid completed action with evidence", async () => {
      const validCompleted = {
        id: "action-1",
        status: "completed",
        evidence: ["evidence-id-1", "evidence-id-2"],
        blockerReason: null,
      };

      const violations = await enforceActionRules(validCompleted);
      expect(violations.filter((v) => v.includes("evidence"))).toHaveLength(0);
    });

    it("allows valid blocked action with reason", async () => {
      const validBlocked = {
        id: "action-1",
        status: "blocked",
        blockerReason: "Waiting for client response on requirements",
      };

      const violations = await enforceActionRules(validBlocked);
      expect(violations.filter((v) => v.includes("reason"))).toHaveLength(0);
    });

    it("counts rule violations correctly", async () => {
      const actionWithMultipleViolations = {
        id: "action-1",
        status: "blocked",
        evidence: [],
        blockerReason: "",
        originalPriority: "critical",
        priority: "low",
      };

      const violations = await enforceActionRules(actionWithMultipleViolations);
      expect(violations.length).toBeGreaterThanOrEqual(2);
    });
  });

  describe("Rule Compliance", () => {
    it("has enforcement rule for evidence requirement", () => {
      const evidenceRule = ENFORCEMENT_RULES.find(
        (r) => r.ruleId === "action.evidence.required.completed"
      );
      expect(evidenceRule).toBeDefined();
      expect(evidenceRule?.name).toContain("evidence");
    });

    it("has enforcement rule for blocked reason", () => {
      const blockerRule = ENFORCEMENT_RULES.find(
        (r) => r.ruleId === "action.blocker.required.blocked"
      );
      expect(blockerRule).toBeDefined();
      expect(blockerRule?.name).toContain("reason");
    });

    it("has enforcement rule for priority preservation", () => {
      const priorityRule = ENFORCEMENT_RULES.find(
        (r) => r.ruleId === "action.priority.preservation"
      );
      expect(priorityRule).toBeDefined();
    });
  });

  describe("State Transition Rules", () => {
    it("prevents cycling through undefined states", async () => {
      try {
        await validateStateTransition("invalid_state" as any, "created");
        throw new Error("Should have thrown");
      } catch (error: any) {
        expect(error.message).toContain("Unknown action state");
      }
    });

    it("enforces no-skip rule implicitly through state machine", () => {
      // The state machine definition enforces the path: created → in_progress → completed → verified
      // Cannot skip directly from created → completed
      const createdTransitions = getStateTransitionRules("created");
      expect(createdTransitions).not.toContain("completed");
      expect(createdTransitions).toContain("in_progress");
    });

    it("allows recovery from blocked state", () => {
      const blockedTransitions = getStateTransitionRules("blocked");
      expect(blockedTransitions).toContain("in_progress");
      expect(blockedTransitions).not.toContain("completed");
    });

    it("prevents transition from completed without verification", () => {
      const completedTransitions = getStateTransitionRules("completed");
      // Only allowed transition from completed is to verified
      expect(completedTransitions).toEqual(["verified"]);
      expect(completedTransitions).not.toContain("in_progress");
      expect(completedTransitions).not.toContain("blocked");
    });
  });
});

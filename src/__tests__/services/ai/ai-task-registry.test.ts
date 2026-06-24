/**
 * AI-2 task registry / context policy — governance-invariant tests.
 */
import { describe, it, expect } from "vitest";
import { AI_TASK_TYPES } from "@/services/ai/provider";
import {
  AI_TASK_REGISTRY,
  getAiTaskDefinition,
  taskRequiresOwnerApproval,
} from "@/services/ai/task-registry";

describe("AI-2 task registry", () => {
  it("defines every canonical AI task type exactly once", () => {
    for (const t of AI_TASK_TYPES) {
      expect(AI_TASK_REGISTRY[t]).toBeDefined();
      expect(AI_TASK_REGISTRY[t].taskType).toBe(t);
    }
    expect(Object.keys(AI_TASK_REGISTRY).sort()).toEqual([...AI_TASK_TYPES].sort());
  });

  it("NO task may mutate state — every task is stateMutation 'none'", () => {
    for (const t of AI_TASK_TYPES) {
      expect(AI_TASK_REGISTRY[t].stateMutation).toBe("none");
    }
  });

  it("every task requires audit and always includes workspace_scope precondition", () => {
    for (const t of AI_TASK_TYPES) {
      const def = AI_TASK_REGISTRY[t];
      expect(def.auditRequired).toBe(true);
      expect(def.requiredPreconditions).toContain("workspace_scope");
    }
  });

  it("no task allows secrets or other-workspace data as input", () => {
    for (const t of AI_TASK_TYPES) {
      const f = AI_TASK_REGISTRY[t].forbiddenInputs;
      expect(f).toContain("secrets");
      expect(f).toContain("other_workspace_data");
    }
  });

  it("HIGH_* risk tasks require owner approval downstream", () => {
    for (const t of AI_TASK_TYPES) {
      const def = AI_TASK_REGISTRY[t];
      if (def.riskLevel.startsWith("HIGH_")) {
        expect(def.requiresOwnerApproval).toBe(true);
      }
    }
  });

  it("the learning task gates on verified outcome + sufficient attribution and never promotes", () => {
    const def = getAiTaskDefinition("KNOWLEDGE_NOTE_DRAFT");
    expect(def.riskLevel).toBe("HIGH_LEARNING");
    expect(def.requiredPreconditions).toEqual(
      expect.arrayContaining(["verified_outcome", "attribution_sufficient"])
    );
    expect(def.requiresOwnerApproval).toBe(true);
  });

  it("the outcome-review task cannot self-verify (advisory, approval-gated)", () => {
    const def = getAiTaskDefinition("OUTCOME_REVIEW");
    expect(def.riskLevel).toBe("HIGH_OUTCOME");
    expect(def.requiresOwnerApproval).toBe(true);
  });

  it("execution/operator tasks forbid strategic reasoning + private learning internals", () => {
    for (const t of ["EXECUTION_COACH", "OPERATOR_CHECKLIST"] as const) {
      const f = getAiTaskDefinition(t).forbiddenInputs;
      expect(f).toContain("strategic_reasoning");
      expect(f).toContain("private_learning_internals");
      expect(getAiTaskDefinition(t).requiredPreconditions).toContain("action_owner_approved");
    }
  });

  it("taskRequiresOwnerApproval helper agrees with the registry", () => {
    expect(taskRequiresOwnerApproval("DIAGNOSIS_REVIEW")).toBe(true);
    expect(taskRequiresOwnerApproval("EVIDENCE_SUMMARY")).toBe(false);
  });

  it("model routing is sane: HIGH_DECISION uses the strong tier, deterministic temperature", () => {
    expect(getAiTaskDefinition("DIAGNOSIS_REVIEW").modelTier).toBe("strong");
    expect(getAiTaskDefinition("DIAGNOSIS_REVIEW").temperature).toBe(0);
  });
});

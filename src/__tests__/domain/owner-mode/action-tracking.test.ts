import { describe, it, expect } from "vitest";
import {
  ACTION_STATUS_TRANSITIONS,
  COMPLIANCE_SCORE_ALLOWS_LEARNING,
  isActionStatusTransitionAllowed,
  validateAction,
  validateExecutionLog,
  computeCompletionRate,
  type ActionStatus,
  type ActionInput,
  type ExecutionLogInput,
} from "@/domain/owner-mode/action-tracking";

const WS = "00000000-0000-0000-0000-000000000001";
const BIZ = "00000000-0000-0000-0000-000000000002";

function validAction(overrides: Partial<ActionInput> = {}): ActionInput {
  return {
    workspaceId: WS,
    businessId: BIZ,
    actionTitle: "Reduce COGS by 10%",
    actionSteps: ["Audit supplier contracts", "Renegotiate top 3 suppliers"],
    ...overrides,
  };
}

function validExecLog(overrides: Partial<ExecutionLogInput> = {}): ExecutionLogInput {
  return {
    workspaceId: WS,
    businessId: BIZ,
    actionId: "action-001",
    plannedStepsCompletedCount: 2,
    plannedStepsTotalCount: 2,
    deadlineMet: true,
    executionComplianceScore: "fully_executed",
    ...overrides,
  };
}

// ─── Status machine ───────────────────────────────────────────────────────────

describe("action status machine", () => {
  it("ACTION_STATUS_TRANSITIONS has exactly 6 keys", () => {
    expect(Object.keys(ACTION_STATUS_TRANSITIONS).length).toBe(6);
  });

  it("completed is terminal", () => {
    expect(ACTION_STATUS_TRANSITIONS.completed).toHaveLength(0);
  });

  it("cancelled is terminal", () => {
    expect(ACTION_STATUS_TRANSITIONS.cancelled).toHaveLength(0);
  });

  it("pending → in_progress is allowed", () => {
    expect(isActionStatusTransitionAllowed("pending", "in_progress")).toBe(true);
  });

  it("pending → blocked is allowed", () => {
    expect(isActionStatusTransitionAllowed("pending", "blocked")).toBe(true);
  });

  it("in_progress → completed is allowed", () => {
    expect(isActionStatusTransitionAllowed("in_progress", "completed")).toBe(true);
  });

  it("in_progress → overdue is allowed", () => {
    expect(isActionStatusTransitionAllowed("in_progress", "overdue")).toBe(true);
  });

  it("blocked → in_progress is allowed", () => {
    expect(isActionStatusTransitionAllowed("blocked", "in_progress")).toBe(true);
  });

  it("overdue → completed is allowed", () => {
    expect(isActionStatusTransitionAllowed("overdue", "completed")).toBe(true);
  });

  it("completed → pending is NOT allowed", () => {
    expect(isActionStatusTransitionAllowed("completed", "pending")).toBe(false);
  });

  it("cancelled → in_progress is NOT allowed", () => {
    expect(isActionStatusTransitionAllowed("cancelled", "in_progress")).toBe(false);
  });
});

// ─── Compliance score learning gate ──────────────────────────────────────────

describe("COMPLIANCE_SCORE_ALLOWS_LEARNING", () => {
  it("fully_executed allows learning", () => {
    expect(COMPLIANCE_SCORE_ALLOWS_LEARNING["fully_executed"]).toBe(true);
  });

  it("mostly_executed allows learning", () => {
    expect(COMPLIANCE_SCORE_ALLOWS_LEARNING["mostly_executed"]).toBe(true);
  });

  it("over_executed allows learning", () => {
    expect(COMPLIANCE_SCORE_ALLOWS_LEARNING["over_executed"]).toBe(true);
  });

  it("not_executed does not allow learning", () => {
    expect(COMPLIANCE_SCORE_ALLOWS_LEARNING["not_executed"]).toBe(false);
  });

  it("materially_deviated does not allow learning", () => {
    expect(COMPLIANCE_SCORE_ALLOWS_LEARNING["materially_deviated"]).toBe(false);
  });

  it("partially_executed does not allow learning", () => {
    expect(COMPLIANCE_SCORE_ALLOWS_LEARNING["partially_executed"]).toBe(false);
  });
});

// ─── validateAction — ACT-RULE-1 ─────────────────────────────────────────────

describe("validateAction — ACT-RULE-1 (actionTitle)", () => {
  it("violation when actionTitle is empty", () => {
    const result = validateAction(validAction({ actionTitle: "" }));
    expect(result.valid).toBe(false);
    expect(result.violations.some((v) => v.includes("ACT-RULE-1"))).toBe(true);
  });

  it("violation when actionTitle is too short (< 5 chars)", () => {
    const result = validateAction(validAction({ actionTitle: "Cut" }));
    expect(result.violations.some((v) => v.includes("ACT-RULE-1"))).toBe(true);
  });

  it("no violation when actionTitle is >= 5 chars", () => {
    const result = validateAction(validAction({ actionTitle: "Cut costs" }));
    expect(result.violations.some((v) => v.includes("ACT-RULE-1"))).toBe(false);
  });
});

// ─── validateAction — ACT-RULE-2 ─────────────────────────────────────────────

describe("validateAction — ACT-RULE-2 (actionSteps)", () => {
  it("violation when actionSteps is empty array", () => {
    const result = validateAction(validAction({ actionSteps: [] }));
    expect(result.valid).toBe(false);
    expect(result.violations.some((v) => v.includes("ACT-RULE-2"))).toBe(true);
  });

  it("no violation when actionSteps has 1 item", () => {
    const result = validateAction(validAction({ actionSteps: ["Do the thing"] }));
    expect(result.violations.some((v) => v.includes("ACT-RULE-2"))).toBe(false);
  });
});

// ─── validateAction — valid input ────────────────────────────────────────────

describe("validateAction — valid input", () => {
  it("returns valid for complete input", () => {
    const result = validateAction(validAction());
    expect(result.valid).toBe(true);
    expect(result.violations).toHaveLength(0);
  });
});

// ─── validateExecutionLog — EXEC-RULE-1 ──────────────────────────────────────

describe("validateExecutionLog — EXEC-RULE-1 (material deviation)", () => {
  it("violation when materially_deviated without deviationSummary", () => {
    const result = validateExecutionLog(validExecLog({
      executionComplianceScore: "materially_deviated",
      deviationSummary: undefined,
    }));
    expect(result.violations.some((v) => v.includes("EXEC-RULE-1"))).toBe(true);
  });

  it("violation when materially_deviated with short summary", () => {
    const result = validateExecutionLog(validExecLog({
      executionComplianceScore: "materially_deviated",
      deviationSummary: "too short",
    }));
    expect(result.violations.some((v) => v.includes("EXEC-RULE-1"))).toBe(true);
  });

  it("no EXEC-RULE-1 violation when materially_deviated with sufficient summary", () => {
    const result = validateExecutionLog(validExecLog({
      executionComplianceScore: "materially_deviated",
      deviationSummary: "Owner skipped the supplier renegotiation and substituted a different vendor instead.",
    }));
    expect(result.violations.some((v) => v.includes("EXEC-RULE-1"))).toBe(false);
  });
});

// ─── validateExecutionLog — EXEC-RULE-2 ──────────────────────────────────────

describe("validateExecutionLog — EXEC-RULE-2 (not_executed)", () => {
  it("violation when not_executed without blockerReason", () => {
    const result = validateExecutionLog(validExecLog({
      executionComplianceScore: "not_executed",
      blockerReason: undefined,
    }));
    expect(result.violations.some((v) => v.includes("EXEC-RULE-2"))).toBe(true);
  });

  it("no violation when not_executed with blockerReason", () => {
    const result = validateExecutionLog(validExecLog({
      executionComplianceScore: "not_executed",
      blockerReason: "Cash constraint — cannot proceed this quarter.",
    }));
    expect(result.violations.some((v) => v.includes("EXEC-RULE-2"))).toBe(false);
  });
});

// ─── validateExecutionLog — EXEC-RULE-3 ──────────────────────────────────────

describe("validateExecutionLog — EXEC-RULE-3 (proofText)", () => {
  it("violation when proofText is too short", () => {
    const result = validateExecutionLog(validExecLog({ proofText: "ok" }));
    expect(result.violations.some((v) => v.includes("EXEC-RULE-3"))).toBe(true);
  });

  it("no violation when proofText is undefined (optional)", () => {
    const result = validateExecutionLog(validExecLog({ proofText: undefined }));
    expect(result.violations.some((v) => v.includes("EXEC-RULE-3"))).toBe(false);
  });

  it("no violation when proofText is sufficient", () => {
    const result = validateExecutionLog(validExecLog({ proofText: "Completed all steps." }));
    expect(result.violations.some((v) => v.includes("EXEC-RULE-3"))).toBe(false);
  });
});

// ─── allowsLearning ──────────────────────────────────────────────────────────

describe("allowsLearning", () => {
  it("not_executed → allowsLearning = false", () => {
    const result = validateExecutionLog(validExecLog({
      executionComplianceScore: "not_executed",
      blockerReason: "Cash constraint this quarter.",
    }));
    expect(result.allowsLearning).toBe(false);
  });

  it("materially_deviated → allowsLearning = false", () => {
    const result = validateExecutionLog(validExecLog({
      executionComplianceScore: "materially_deviated",
      deviationSummary: "Owner substituted a completely different approach from what was recommended.",
    }));
    expect(result.allowsLearning).toBe(false);
  });

  it("fully_executed → allowsLearning = true", () => {
    const result = validateExecutionLog(validExecLog());
    expect(result.allowsLearning).toBe(true);
  });

  it("mostly_executed → allowsLearning = true", () => {
    const result = validateExecutionLog(validExecLog({ executionComplianceScore: "mostly_executed" }));
    expect(result.allowsLearning).toBe(true);
  });
});

// ─── downgradedConfidence ─────────────────────────────────────────────────────

describe("downgradedConfidence", () => {
  it("not_executed → downgradedConfidence = true with reason", () => {
    const result = validateExecutionLog(validExecLog({
      executionComplianceScore: "not_executed",
      blockerReason: "Cash constraint this quarter.",
    }));
    expect(result.downgradedConfidence).toBe(true);
    expect(result.downgradeReasons.some((r) => r.includes("not executed"))).toBe(true);
  });

  it("materially_deviated → downgradedConfidence = true with reason", () => {
    const result = validateExecutionLog(validExecLog({
      executionComplianceScore: "materially_deviated",
      deviationSummary: "Owner substituted a completely different approach from what was recommended.",
    }));
    expect(result.downgradedConfidence).toBe(true);
    expect(result.downgradeReasons.some((r) => r.includes("deviation"))).toBe(true);
  });

  it("small sampleSizeActual (< 5) → downgradedConfidence = true", () => {
    const result = validateExecutionLog(validExecLog({ sampleSizeActual: 3 }));
    expect(result.downgradedConfidence).toBe(true);
    expect(result.downgradeReasons.some((r) => r.includes("sample size"))).toBe(true);
  });

  it("deadline not met → downgradedConfidence = true", () => {
    const result = validateExecutionLog(validExecLog({ deadlineMet: false }));
    expect(result.downgradedConfidence).toBe(true);
    expect(result.downgradeReasons.some((r) => r.includes("deadline"))).toBe(true);
  });

  it("fully_executed, deadline met, no sample issue → downgradedConfidence = false", () => {
    const result = validateExecutionLog(validExecLog());
    expect(result.downgradedConfidence).toBe(false);
    expect(result.downgradeReasons).toHaveLength(0);
  });

  it("sample size >= 5 does not trigger downgrade", () => {
    const result = validateExecutionLog(validExecLog({ sampleSizeActual: 10 }));
    expect(result.downgradeReasons.some((r) => r.includes("sample size"))).toBe(false);
  });
});

// ─── computeCompletionRate ────────────────────────────────────────────────────

describe("computeCompletionRate", () => {
  it("2/2 = 100", () => {
    expect(computeCompletionRate(2, 2)).toBe(100);
  });

  it("1/2 = 50", () => {
    expect(computeCompletionRate(1, 2)).toBe(50);
  });

  it("0/4 = 0", () => {
    expect(computeCompletionRate(0, 4)).toBe(0);
  });

  it("0/0 = 0 (no division by zero)", () => {
    expect(computeCompletionRate(0, 0)).toBe(0);
  });

  it("clamped at 100 (never exceeds 100)", () => {
    expect(computeCompletionRate(5, 2)).toBe(100);
  });

  it("3/4 = 75", () => {
    expect(computeCompletionRate(3, 4)).toBe(75);
  });
});

// ─── Workspace scoping ────────────────────────────────────────────────────────

describe("workspace scoping", () => {
  it("validateAction throws when workspaceId is empty", () => {
    expect(() => validateAction(validAction({ workspaceId: "" }))).toThrow();
  });

  it("validateAction throws when workspaceId is whitespace", () => {
    expect(() => validateAction(validAction({ workspaceId: "   " }))).toThrow();
  });

  it("validateExecutionLog throws when workspaceId is empty", () => {
    expect(() => validateExecutionLog(validExecLog({ workspaceId: "" }))).toThrow();
  });
});

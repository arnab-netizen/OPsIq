/**
 * Process-Correction Execution Bridge (PASS 20) — pure domain tests.
 *
 * Proves the bridge converts each supported cockpit finding into a GOVERNED execution route (route + owner +
 * approval + evidence + completion + reassessment), keeps material/owner findings owner-gated, routes data
 * gaps to a data task (never a guess), explains monitor-only, dedupes, and fabricates nothing.
 */
import { describe, it, expect } from "vitest";
import { buildProcessExecutionBridge, type BridgedExecutionRoute } from "@/domain/owner-mode/process-execution-bridge";
import type { ProcessCorrection, ProcessCorrectionRouting, CorrectionType } from "@/domain/owner-mode/bottleneck-correction-routing";
import type { CashProfitProtectionAnalysis, CashProfitSignal } from "@/domain/owner-mode/cash-profit-protection";

const WS = "ws-bridge";
const AT = "2026-07-06T00:00:00.000Z";

function correction(over: Partial<ProcessCorrection> & { correctionType: CorrectionType }): ProcessCorrection {
  return {
    workspaceId: WS, correctionId: `c-${over.correctionType}`, sourceFindingType: "REWORK_LOOP",
    correctionType: over.correctionType, title: "T", instruction: "do the thing", rationale: "because risk",
    affectedStage: "DELIVERY" as ProcessCorrection["affectedStage"], targetActorId: null, targetManagerId: null,
    severity: "HIGH", confidence: "HIGH", priorityRank: 1, requiredApprovalLevel: "MANAGER", requiresOwnerApproval: false,
    autoExecutable: false, expectedImpactType: "QUALITY" as ProcessCorrection["expectedImpactType"],
    supportingProofIds: ["p1"], supportingOperationalEventIds: ["e1"], supportingEscalationIds: [], supportingAdjudicationIds: [],
    missingData: [], status: "PROPOSED", ...over,
  };
}
function routing(corrections: ProcessCorrection[]): ProcessCorrectionRouting {
  return { workspaceId: WS, corrections, topCorrection: corrections[0] ?? null, evaluatedAt: AT };
}
function cashSignal(over: Partial<CashProfitSignal> & { signalType: CashProfitSignal["signalType"] }): CashProfitSignal {
  return {
    workspaceId: WS, signalType: over.signalType, category: "CASH", severity: "HIGH", confidence: "HIGH",
    title: "Cash", ownerExplanation: "cash risk", protectiveAction: "PROTECT_CASH_RUNWAY", approvalLevel: "OWNER",
    requiresOwnerReview: true, riskGuardrail: "g", observedCount: 1, metricType: null, metricValue: null, metricThreshold: null,
    thresholdBreached: true, directionOnly: true, supportingProofIds: [], supportingOperationalEventIds: [],
    supportingFinancialSnapshotIds: [], relatedProcessFinding: null, missingData: [], evaluatedAt: AT, ...over,
  };
}
function cash(signals: CashProfitSignal[]): CashProfitProtectionAnalysis {
  return { workspaceId: WS, signals, topSignal: signals[0] ?? null, summary: { total: signals.length, critical: 0, high: 0, ownerReviewRequired: 0 }, evaluatedAt: AT };
}
const byKey = (r: { routes: BridgedExecutionRoute[] }, k: string) => r.routes.find((x) => x.taskKey === k)!;

describe("process-execution-bridge (PASS 20)", () => {
  it("1. a process-review correction creates a correction execution task with owner/evidence/completion/reassessment", () => {
    const r = buildProcessExecutionBridge(routing([correction({ correctionType: "REVIEW_PROCESS_STEP" })]), null, WS, AT);
    const t = byKey(r, "pc:c-REVIEW_PROCESS_STEP");
    expect(t.executionRoute).toBe("CREATE_CORRECTION_TASK");
    expect(t.actionOwner).toBe("MANAGER");
    expect(t.approvalLevel).toBe("MANAGER_APPROVAL_REQUIRED");
    expect(t.requiredEvidence.length).toBeGreaterThan(0);
    expect(t.completionCriteria).toBeTruthy();
    expect(t.reassessmentTrigger).toBeTruthy();
    expect(t.evidenceRefs).toContain("p1");
  });

  it("2. an update-checklist correction creates an SOP/checklist task (OpsIQ drafts; owner approves adoption)", () => {
    const t = byKey(buildProcessExecutionBridge(routing([correction({ correctionType: "UPDATE_CHECKLIST" })]), null, WS, AT), "pc:c-UPDATE_CHECKLIST");
    expect(t.executionRoute).toBe("CREATE_SOP_CHECKLIST_TASK");
    expect(t.requiredEvidence.join(" ")).toMatch(/owner approval/i);
  });

  it("3. an assign-training correction creates a training task requiring completion proof", () => {
    const t = byKey(buildProcessExecutionBridge(routing([correction({ correctionType: "ASSIGN_TRAINING_REVIEW" })]), null, WS, AT), "pc:c-ASSIGN_TRAINING_REVIEW");
    expect(t.executionRoute).toBe("CREATE_TRAINING_TASK");
    expect(t.requiredEvidence.join(" ")).toMatch(/completed/i);
  });

  it("5. a resolve-operational-event correction routes to a reassessment task", () => {
    const t = byKey(buildProcessExecutionBridge(routing([correction({ correctionType: "RESOLVE_OPERATIONAL_EVENT" })]), null, WS, AT), "pc:c-RESOLVE_OPERATIONAL_EVENT");
    expect(t.executionRoute).toBe("CREATE_REASSESSMENT_TASK");
  });

  it("6. a collect-missing-data correction routes to a missing-data task (NEEDS_DATA, never a guess)", () => {
    const t = byKey(buildProcessExecutionBridge(routing([correction({ correctionType: "COLLECT_MISSING_DATA", requiredApprovalLevel: "STAFF", missingData: ["unit cost per job"] })]), null, WS, AT), "pc:c-COLLECT_MISSING_DATA");
    expect(t.executionRoute).toBe("CREATE_MISSING_DATA_TASK");
    expect(t.approvalLevel).toBe("NEEDS_DATA");
    expect(t.requiredEvidence).toContain("unit cost per job");
  });

  it("8. a finding whose governed floor is OWNER always becomes an owner-approval task (material stays owner-gated)", () => {
    const t = byKey(buildProcessExecutionBridge(routing([correction({ correctionType: "REVIEW_PROCESS_STEP", requiredApprovalLevel: "OWNER", requiresOwnerApproval: true, severity: "CRITICAL" })]), null, WS, AT), "pc:c-REVIEW_PROCESS_STEP");
    expect(t.executionRoute).toBe("CREATE_OWNER_APPROVAL_TASK");
    expect(t.actionOwner).toBe("OWNER");
    expect(t.approvalLevel).toBe("OWNER_APPROVAL_REQUIRED");
  });

  it("9. no bridged route is ever an unsafe auto-execution (nothing is AUTO_ALLOWED that changes money/staff/legal)", () => {
    const r = buildProcessExecutionBridge(
      routing([correction({ correctionType: "ESCALATE_TO_OWNER", requiredApprovalLevel: "OWNER" })]),
      cash([cashSignal({ signalType: "CASH_SAFETY_RISK", requiresOwnerReview: true })]),
      WS, AT,
    );
    for (const t of r.routes) {
      if (t.approvalLevel === "AUTO_ALLOWED") {
        // Only safe, reversible routes may be auto-allowed (evidence requests / operational STAFF-floor work).
        expect(["CREATE_EVIDENCE_REQUEST", "CREATE_STAFF_TASK", "CREATE_CORRECTION_TASK", "CREATE_MISSING_DATA_TASK"]).toContain(t.executionRoute);
      }
    }
    // The owner-escalated correction and the material cash signal are both owner-gated.
    expect(byKey(r, "pc:c-ESCALATE_TO_OWNER").approvalLevel).toBe("OWNER_APPROVAL_REQUIRED");
    expect(byKey(r, "cp:CASH_SAFETY_RISK").approvalLevel).toBe("OWNER_APPROVAL_REQUIRED");
  });

  it("10. a data-insufficient correction becomes MONITOR_ONLY with an explicit reason (never silently dropped)", () => {
    const t = byKey(buildProcessExecutionBridge(routing([correction({ correctionType: "NO_ACTION_DATA_INSUFFICIENT", requiredApprovalLevel: "STAFF", missingData: ["linked proof"] })]), null, WS, AT), "pc:c-NO_ACTION_DATA_INSUFFICIENT");
    expect(t.executionRoute).toBe("MONITOR_ONLY");
    expect(t.actionOwner).toBe("NO_ACTION");
    expect(t.notActionableReason).toMatch(/data-insufficient/i);
  });

  it("5b. cash MISSING_UNIT_ECONOMICS routes to a missing-data (cost-data) task, not a fake precision figure", () => {
    const t = byKey(buildProcessExecutionBridge(null, cash([cashSignal({ signalType: "MISSING_UNIT_ECONOMICS", requiresOwnerReview: false, missingData: ["per-job cost"] })]), WS, AT), "cp:MISSING_UNIT_ECONOMICS");
    expect(t.executionRoute).toBe("CREATE_MISSING_DATA_TASK");
    expect(t.approvalLevel).toBe("NEEDS_DATA");
    expect(t.requiredEvidence).toContain("per-job cost");
  });

  it("11. duplicate findings do NOT create duplicate routes (deduped by taskKey)", () => {
    const c = correction({ correctionType: "REVIEW_PROCESS_STEP" });
    const r = buildProcessExecutionBridge(routing([c, { ...c }]), null, WS, AT);
    expect(r.routes.filter((x) => x.taskKey === "pc:c-REVIEW_PROCESS_STEP")).toHaveLength(1);
  });

  it("14. the owner sees ONE top bridged action (most severe actionable; monitor-only never leads)", () => {
    const r = buildProcessExecutionBridge(routing([
      correction({ correctionType: "NO_ACTION_DATA_INSUFFICIENT", correctionId: "c-mon", severity: "CRITICAL", requiredApprovalLevel: "STAFF" }),
      correction({ correctionType: "ESCALATE_TO_OWNER", correctionId: "c-own", severity: "HIGH", requiredApprovalLevel: "OWNER" }),
    ]), null, WS, AT);
    expect(r.topRoute).not.toBeNull();
    expect(r.topRoute!.executionRoute).not.toBe("MONITOR_ONLY");
    expect(r.topRoute!.taskKey).toBe("pc:c-own");
  });

  it("18. a clean/empty workspace fabricates no routes", () => {
    const r = buildProcessExecutionBridge(null, null, WS, AT);
    expect(r.routes).toHaveLength(0);
    expect(r.topRoute).toBeNull();
  });

  it("19-21. no hidden score, no fraud/HR label, no fabricated currency figure across the bridge output", () => {
    const r = buildProcessExecutionBridge(
      routing([correction({ correctionType: "ESCALATE_TO_OWNER", requiredApprovalLevel: "OWNER" })]),
      cash([cashSignal({ signalType: "CASH_SAFETY_RISK" })]),
      WS, AT,
    );
    const json = JSON.stringify(r);
    expect(json).not.toMatch(/hidden\s*score/i);
    expect(json).not.toMatch(/\b(fraud|negligent|negligence|lazy|dishonest|fire|payroll)\b/i);
    expect(json).not.toMatch(/[$£€]\s?\d/);
  });

  it("22. workspace id is carried through on every route (isolation-ready)", () => {
    const r = buildProcessExecutionBridge(routing([correction({ correctionType: "REVIEW_PROCESS_STEP" })]), cash([cashSignal({ signalType: "CASH_SAFETY_RISK" })]), WS, AT);
    for (const t of r.routes) expect(t.workspaceId).toBe(WS);
  });
});

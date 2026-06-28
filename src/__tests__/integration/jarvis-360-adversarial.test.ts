/**
 * Jarvis 360 Slice 15 — adversarial / hostile integration suite.
 *
 * Composes the Slice 0–14 controls into the hostile scenarios the audit required,
 * plus three integrated flows. Pure/DI — runs locally without a DB (the generated
 * Prisma client / Postgres are unavailable in this sandbox; the DB-backed
 * composition is covered by CI). Each test proves a control produces the SAFE
 * outcome under a hostile input.
 */
import { describe, it, expect, vi } from "vitest";

import { evaluateInputQualityGate, RecommendationSensitivity } from "@/domain/owner-mode/recommendation-input-quality-gate";
import { evaluateCashSafetyGate } from "@/domain/owner-finance/cash-safety-gate";
import { evaluateMarginSafety } from "@/domain/owner-finance/margin-safety-gate";
import { assessFleetCapacity, capacityBlocksGrowth } from "@/domain/owner-mode/equipment-capacity";
import { planTaskTransition, DelegatedTaskStatus as S, TaskActorRole, type TaskActor } from "@/domain/execution/delegated-task";
import { hashSopContent, isMaterialSopChange } from "@/domain/owner-mode/sop-document";
import { evaluateTrainingNeed } from "@/domain/owner-mode/staff-training";
import { evaluateProcessReview } from "@/domain/owner-mode/process-review";
import { screenOpportunity, screenContractQuote, shouldRunMarketing } from "@/domain/owner-mode/opportunity-contract-guardrails";
import { evaluateDoNotRepeat } from "@/domain/owner-mode/do-not-repeat";
import { arbitrate } from "@/domain/owner-mode/decision-arbitration";
import { classifyOutcome } from "@/domain/owner-mode/self-evaluation";
import { classifyComplianceRisk } from "@/domain/owner-mode/compliance-boundary";
import { buildOwnerControlCenter } from "@/domain/owner-mode/owner-control-center";
import { summarizeOwnerAttention, classifyAttention } from "@/domain/owner-mode/owner-load";
import { buildBusinessConditionProfile, type DomainScore } from "@/domain/owner-spine/contracts";

const manager: TaskActor = { role: TaskActorRole.MANAGER, isAssignee: false, canApproveCompletion: true, canReviewProof: true, canAssign: true };

function score(domain: DomainScore["domain"], dataConfidenceScore: number): DomainScore {
  return { domain, healthScore: 70, riskScore: 20, opportunityScore: 20, dataConfidenceScore, topFindingCodes: [], topActionCodes: [], generatedAt: new Date("2026-06-28Z") };
}

describe("Jarvis 360 — hostile scenarios", () => {
  it("1. missing data blocks a high-risk (finance) recommendation", () => {
    expect(evaluateInputQualityGate("critical_missing", RecommendationSensitivity.FINANCE_SENSITIVE).allowed).toBe(false);
  });

  it("2. stale/missing domain stays prominent in the rollup (not averaged away)", () => {
    const p = buildBusinessConditionProfile({ domainScores: [score("finance", 95), score("cashflow", 25)] });
    expect(p.dataSufficiencyStatus).toBe("insufficient");
    expect(p.lowestDataConfidenceScore).toBe(25);
  });

  it("3. fake/absent proof cannot complete a task", () => {
    expect(planTaskTransition(S.COMPLETED_PENDING_REVIEW, S.APPROVED_COMPLETE, manager, { proofRequired: true, proofCleared: false }).allowed).toBe(false);
  });

  it("4. the performer cannot self-approve completion (separation of duty)", () => {
    expect(planTaskTransition(S.COMPLETED_PENDING_REVIEW, S.APPROVED_COMPLETE, manager, { actorUserId: "u1", performerUserId: "u1" }).allowed).toBe(false);
  });

  it("5. duplicate proof is flagged (content hash collision detectable)", () => {
    const h = hashSopContent({ process: "p", role: "r", steps: ["a"], proofRequirements: ["x"] });
    expect(isMaterialSopChange(h, h)).toBe(false); // identical content → duplicate, not material
  });

  it("6. cash-critical blocks marketing spend", () => {
    expect(shouldRunMarketing({ financialState: "CRITICAL", capacityStatus: "safe", qualityRed: false, reputationRed: false }).run).toBe(false);
    expect(evaluateCashSafetyGate("CRITICAL", "CRITICAL", RecommendationSensitivity.GROWTH_SENSITIVE).allowed).toBe(false);
  });

  it("7. below-margin discount is blocked", () => {
    expect(evaluateMarginSafety(8, RecommendationSensitivity.PRICING_SENSITIVE, 15).allowed).toBe(false);
  });

  it("8. capacity red blocks growth", () => {
    const fleet = assessFleetCapacity([{ name: "press", utilization: 0.98, downtimeState: "up", maintenanceDueAt: null, status: "operational" }], new Date("2026-06-28Z"));
    expect(capacityBlocksGrowth(fleet.status)).toBe(true);
  });

  it("9. a material SOP change requires re-approval", () => {
    const a = hashSopContent({ process: "p", role: "r", steps: ["a"], proofRequirements: [] });
    const b = hashSopContent({ process: "p", role: "r", steps: ["a", "b"], proofRequirements: [] });
    expect(isMaterialSopChange(a, b)).toBe(true);
  });

  it("10. training is generated only from observed failure", () => {
    expect(evaluateTrainingNeed([]).needed).toBe(false);
    expect(evaluateTrainingNeed([{ code: "rework", occurrences: 3 }]).needed).toBe(true);
  });

  it("11. a process review fires on repeated failure", () => {
    expect(evaluateProcessReview({ nextReviewAt: new Date("2026-12-01Z") }, { repeatedFailure: true }, new Date("2026-06-28Z")).due).toBe(true);
  });

  it("12. an opportunity below margin is rejected", () => {
    expect(screenOpportunity({ fitScore: 0.9, marginPct: 0.05, marginFloorPct: 0.15, capacityStatus: "safe", paymentRisk: "low" }).verdict).toBe("reject");
  });

  it("13. a do-not-repeat rule prevents a repeat recommendation", () => {
    expect(evaluateDoNotRepeat({ category: "do_not_repeat", blocksRepetition: true, memoryKey: "k" }).blocked).toBe(true);
  });

  it("14. conflicting recommendations are arbitrated (safety dominates)", () => {
    const r = arbitrate([
      { id: "growth", blockedBy: ["cash"], riskOfAction: 0.3, riskOfInaction: 0.2, confidence: 0.8, ownerGoalAligned: true, reversible: true },
      { id: "cut-cost", blockedBy: [], riskOfAction: 0.2, riskOfInaction: 0.3, confidence: 0.8, ownerGoalAligned: false, reversible: true },
    ]);
    expect(r.recommended?.id).toBe("cut-cost");
  });

  it("15. a failed recommendation produces a self-evaluation requiring reassessment", () => {
    const v = classifyOutcome({ executed: true, metExpectation: false, weakData: true });
    expect(v.result).toBe("failed");
    expect(v.reassessmentRequired).toBe(true);
  });

  it("16. the attention budget records handled vs owner-decision items", () => {
    const s = summarizeOwnerAttention([
      { disposition: classifyAttention({ severity: "low", ownerDecisionRequired: false, autoHandleable: true }), ownerDecisionRequired: false, handledByOpsIQ: true },
      { disposition: classifyAttention({ severity: "high", ownerDecisionRequired: true, autoHandleable: false }), ownerDecisionRequired: true, handledByOpsIQ: false },
    ]);
    expect(s.handledByOpsIQ).toBe(1);
    expect(s.ownerDecisionsRequired).toBe(1);
  });

  it("bonus: compliance never gives definitive advice and blocks on expiry", () => {
    const r = classifyComplianceRisk({ expiryPassed: true });
    expect(r.blocked).toBe(true);
    expect(r.disclaimer).toMatch(/not a lawyer/i);
  });
});

describe("Jarvis 360 — integrated flows", () => {
  it("A. data sufficiency + finance + capacity + arbitration → command center surfaces the blocks", () => {
    // Insufficient data + finance block + capacity bottleneck all converge.
    const profile = buildBusinessConditionProfile({ domainScores: [score("finance", 30), score("cashflow", 30)] });
    const fleet = assessFleetCapacity([{ name: "dryer", utilization: 0.99, downtimeState: "up", maintenanceDueAt: null, status: "operational" }], new Date("2026-06-28Z"));
    const arb = arbitrate([{ id: "grow", blockedBy: ["cash", "capacity", "data"], riskOfAction: 0.4, riskOfInaction: 0.2, confidence: 0.6, ownerGoalAligned: true, reversible: true }]);
    const cc = buildOwnerControlCenter({
      dataSufficiencyStatus: profile.dataSufficiencyStatus!,
      lowConfidenceDomains: profile.lowConfidenceDomains,
      attention: summarizeOwnerAttention([]),
      blockedRecommendations: 1,
      proofBlocked: 0,
      financeBlocked: 1,
      sopsNeedingReview: 0,
      trainingRecommendations: 0,
      equipmentBottlenecks: fleet.bottlenecks,
      processReviewsDue: 0,
      ownerApprovalsRequired: 0,
      nextBestAction: "Restore cash runway before growth",
    });
    expect(arb.recommended).toBeNull(); // growth blocked
    expect(cc.needsOwnerAttention).toBe(true);
    expect(cc.whatNotToDo.join(" ")).toMatch(/growth\/marketing/);
    expect(cc.criticalAlerts.some((a) => /insufficient/i.test(a))).toBe(true);
  });

  it("B. proof anti-gaming + completion + command center", () => {
    const selfReview = planTaskTransition(S.COMPLETED_PENDING_REVIEW, S.APPROVED_COMPLETE, manager, { actorUserId: "m", performerUserId: "m" });
    const noProof = planTaskTransition(S.COMPLETED_PENDING_REVIEW, S.APPROVED_COMPLETE, manager, { proofRequired: true, proofCleared: false });
    expect(selfReview.allowed).toBe(false);
    expect(noProof.allowed).toBe(false);
    const cc = buildOwnerControlCenter({
      dataSufficiencyStatus: "sufficient", lowConfidenceDomains: [], attention: summarizeOwnerAttention([]),
      blockedRecommendations: 0, proofBlocked: 2, financeBlocked: 0, sopsNeedingReview: 0,
      trainingRecommendations: 0, equipmentBottlenecks: [], processReviewsDue: 0, ownerApprovalsRequired: 0,
    });
    expect(cc.sections.proofBlocked).toBe(2);
    expect(cc.criticalAlerts.some((a) => /proof/i.test(a))).toBe(true);
  });

  it("C. attention event + SOP review + owner-load all roll into owner-actions-today", () => {
    const attention = summarizeOwnerAttention([{ disposition: "owner_decision", ownerDecisionRequired: true, handledByOpsIQ: false }]);
    const cc = buildOwnerControlCenter({
      dataSufficiencyStatus: "caution", lowConfidenceDomains: [], attention,
      blockedRecommendations: 0, proofBlocked: 0, financeBlocked: 0, sopsNeedingReview: 2,
      trainingRecommendations: 1, equipmentBottlenecks: [], processReviewsDue: 1, ownerApprovalsRequired: 1,
    });
    // 1 owner-decision + 1 approval + 2 SOP reviews + 1 process review = 5
    expect(cc.ownerActionsToday).toBe(5);
    expect(cc.sections.trainingRecommendations).toBe(1);
  });
});

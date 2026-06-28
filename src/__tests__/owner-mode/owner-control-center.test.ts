/**
 * Jarvis 360 Slice 9 — owner control-center composer (pure) + service (DI). No DB.
 */
import { describe, it, expect, vi } from "vitest";
import { buildOwnerControlCenter, type ControlCenterInputs } from "@/domain/owner-mode/owner-control-center";
import { summarizeOwnerAttention } from "@/domain/owner-mode/owner-load";
import { getOwnerControlCenter, type ControlCenterDeps } from "@/services/owner-mode/owner-control-center.service";

const NOW = new Date("2026-06-28T00:00:00Z");
const calmAttention = summarizeOwnerAttention([{ disposition: "auto_handle", ownerDecisionRequired: false, handledByOpsIQ: true }]);

function inputs(over: Partial<ControlCenterInputs> = {}): ControlCenterInputs {
  return {
    dataSufficiencyStatus: "sufficient",
    lowConfidenceDomains: [],
    attention: calmAttention,
    blockedRecommendations: 0,
    proofBlocked: 0,
    financeBlocked: 0,
    sopsNeedingReview: 0,
    trainingRecommendations: 0,
    equipmentBottlenecks: [],
    processReviewsDue: 0,
    ownerApprovalsRequired: 0,
    reassessmentsDue: 0,
    approvalsAvoided: 0,
    nextBestAction: null,
    ...over,
  };
}

describe("buildOwnerControlCenter", () => {
  it("is calm with no issues", () => {
    const cc = buildOwnerControlCenter(inputs());
    expect(cc.needsOwnerAttention).toBe(false);
    expect(cc.criticalAlerts).toHaveLength(0);
    expect(cc.handledByOpsIQ).toBe(1);
  });
  it("raises alerts + what-not-to-do for insufficiency, finance block, and bottleneck", () => {
    const cc = buildOwnerControlCenter(inputs({ dataSufficiencyStatus: "insufficient", lowConfidenceDomains: ["cashflow"], financeBlocked: 2, equipmentBottlenecks: ["dryer"] }));
    expect(cc.needsOwnerAttention).toBe(true);
    expect(cc.criticalAlerts.length).toBeGreaterThanOrEqual(3);
    expect(cc.whatNotToDo.join(" ")).toMatch(/growth\/marketing/);
  });
  it("counts owner actions today across approvals, decisions, SOP reviews, process reviews", () => {
    const cc = buildOwnerControlCenter(inputs({ ownerApprovalsRequired: 2, sopsNeedingReview: 1, processReviewsDue: 3 }));
    expect(cc.ownerActionsToday).toBe(6);
  });
});

describe("getOwnerControlCenter (DI)", () => {
  it("aggregates equipment/SOP/training/process + attention into the panel", async () => {
    const deps: ControlCenterDeps = {
      now: () => NOW,
      db: {
        ownerEquipment: { findMany: vi.fn(async () => [{ name: "press", utilization: 0.99, downtimeState: "up", maintenanceDueAt: null, status: "operational" }]) },
        ownerAttentionEvent: { findMany: vi.fn(async () => [{ disposition: "owner_decision", ownerDecisionRequired: true, handledByOpsIQ: false }]) },
        ownerSopDocument: { count: vi.fn(async () => 2) },
        ownerTrainingRecommendation: { count: vi.fn(async () => 1) },
        ownerProcess: { count: vi.fn(async () => 3) },
        ownerSelfEvaluation: { count: vi.fn(async () => 2) },
      },
    };
    const cc = await getOwnerControlCenter("ws1", { dataSufficiencyStatus: "caution", lowConfidenceDomains: [], blockedRecommendations: 1, proofBlocked: 0, financeBlocked: 0, ownerApprovalsRequired: 0 }, deps);
    expect(cc.sections.sopsNeedingReview).toBe(2);
    expect(cc.sections.trainingRecommendations).toBe(1);
    expect(cc.sections.processReviewsDue).toBe(3);
    expect(cc.sections.reassessmentsDue).toBe(2);
    expect(cc.sections.equipmentBottlenecks).toBe(1); // press at 99%
    expect(cc.ownerActionsToday).toBeGreaterThanOrEqual(1 + 2 + 3); // decision + sop + process
  });
});

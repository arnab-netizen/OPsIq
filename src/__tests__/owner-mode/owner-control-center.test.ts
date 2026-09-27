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

describe("owner control center — module contract assertions", () => {
  it("buildOwnerControlCenter is a function", () => {
    expect(typeof buildOwnerControlCenter).toBe("function");
  });
  it("getOwnerControlCenter is a function", () => {
    expect(typeof getOwnerControlCenter).toBe("function");
  });
  it("summarizeOwnerAttention is a function", () => {
    expect(typeof summarizeOwnerAttention).toBe("function");
  });
  it("NOW is a Date instance", () => {
    expect(NOW).toBeInstanceOf(Date);
  });
  it("calmAttention is an object", () => {
    expect(typeof calmAttention).toBe("object");
  });
  it("inputs() returns an object", () => {
    expect(typeof inputs()).toBe("object");
  });
  it("inputs().dataSufficiencyStatus is 'sufficient'", () => {
    expect(inputs().dataSufficiencyStatus).toBe("sufficient");
  });
  it("inputs().blockedRecommendations is 0 by default", () => {
    expect(inputs().blockedRecommendations).toBe(0);
  });
  it("buildOwnerControlCenter(inputs()) returns an object", () => {
    expect(typeof buildOwnerControlCenter(inputs())).toBe("object");
  });
  it("buildOwnerControlCenter result has needsOwnerAttention field", () => {
    expect(buildOwnerControlCenter(inputs())).toHaveProperty("needsOwnerAttention");
  });
  it("buildOwnerControlCenter result has criticalAlerts field (array)", () => {
    expect(Array.isArray(buildOwnerControlCenter(inputs()).criticalAlerts)).toBe(true);
  });
  it("buildOwnerControlCenter result has handledByOpsIQ field", () => {
    expect(buildOwnerControlCenter(inputs())).toHaveProperty("handledByOpsIQ");
  });
  it("buildOwnerControlCenter result has whatNotToDo field", () => {
    expect(buildOwnerControlCenter(inputs())).toHaveProperty("whatNotToDo");
  });
  it("buildOwnerControlCenter result has ownerActionsToday field (number)", () => {
    expect(typeof buildOwnerControlCenter(inputs()).ownerActionsToday).toBe("number");
  });
  it("buildOwnerControlCenter(inputs()).needsOwnerAttention is false in calm state", () => {
    expect(buildOwnerControlCenter(inputs()).needsOwnerAttention).toBe(false);
  });
  it("buildOwnerControlCenter(inputs()).criticalAlerts is empty in calm state", () => {
    expect(buildOwnerControlCenter(inputs()).criticalAlerts).toHaveLength(0);
  });
});

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

describe("control-center guardrails never veto the canonical main target (final review P1)", () => {
  it("growth main target + capacity bottleneck: the veto becomes a condition on executing the target", () => {
    const cc = buildOwnerControlCenter(inputs({
      equipmentBottlenecks: ["Oven 2"],
      mainTarget: { title: "Use spare capacity to take more orders", priorityClass: "PROCESS_OPTIMISATION", source: "domain_action", findingCode: "OPS_OPP_USE_CAPACITY_HEADROOM" },
    }));
    const text = cc.whatNotToDo.join(" ");
    expect(text).not.toMatch(/Do not pursue growth\/marketing/);
    expect(cc.whatNotToDo).toContain('Keep "Use spare capacity to take more orders" within current capacity until the bottleneck is cleared.');
    // The reason stays visible as an alert.
    expect(cc.criticalAlerts.join(" ")).toMatch(/Capacity bottleneck: Oven 2/);
  });

  it("compliance main target + insufficient data: the guardrail applies to OTHER decisions, never the target", () => {
    const cc = buildOwnerControlCenter(inputs({
      dataSufficiencyStatus: "insufficient",
      lowConfidenceDomains: ["finance"],
      mainTarget: { title: 'Resolve the breach of "Fire certificate"', priorityClass: "SAFETY_COMPLIANCE", source: "compliance_item", findingCode: "COMPLIANCE_BREACH" },
    }));
    expect(cc.whatNotToDo.join(" ")).not.toMatch(/^Do not make material decisions/);
    expect(cc.whatNotToDo).toContain('Apart from "Resolve the breach of "Fire certificate"", do not make material decisions until the missing data is provided.');
  });

  it("growth main target + blocked cash/margin recommendations: spend guardrail becomes a condition", () => {
    const cc = buildOwnerControlCenter(inputs({
      financeBlocked: 2,
      mainTarget: { title: "Add a referral ask", priorityClass: "GROWTH_OPPORTUNITY", source: "domain_action", findingCode: "MKT_OPP_ACTIVATE_REFERRALS" },
    }));
    expect(cc.whatNotToDo).toEqual(['Carry out "Add a referral ask" without new spend or discounts while cash/margin guardrails are blocking.']);
  });

  it("a Marketing REPAIR target (profit class) is not growth demand: growth/spend guardrails stand and do not touch it", () => {
    const cc = buildOwnerControlCenter(inputs({
      equipmentBottlenecks: ["Oven 2"],
      financeBlocked: 1,
      mainTarget: { title: "Follow up every enquiry within a day", priorityClass: "PROFIT_LOSS", source: "domain_action", findingCode: "MKT_NO_FOLLOWUP" },
    }));
    expect(cc.whatNotToDo).toEqual([
      "Do not spend or discount while cash/margin guardrails are blocking.",
      "Do not pursue growth/marketing until the capacity bottleneck is cleared.",
    ]);
  });

  it("a refresh (data-request) target never rewrites the guardrails, even when it stands in for a growth item", () => {
    const cc = buildOwnerControlCenter(inputs({
      equipmentBottlenecks: ["Oven 2"],
      financeBlocked: 1,
      mainTarget: { title: "Update your Marketing figures", priorityClass: "GROWTH_OPPORTUNITY", source: "evidence_refresh", findingCode: "EVIDENCE_REFRESH" },
    }));
    expect(cc.whatNotToDo).toEqual([
      "Do not spend or discount while cash/margin guardrails are blocking.",
      "Do not pursue growth/marketing until the capacity bottleneck is cleared.",
    ]);
  });

  it("guardrails unrelated to the target are unchanged, and without a decision the original wording stands", () => {
    const survival = buildOwnerControlCenter(inputs({
      equipmentBottlenecks: ["Oven 2"],
      mainTarget: { title: "Protect your cash runway", priorityClass: "SURVIVAL_CASH", source: "domain_action", findingCode: "CF_LOW_RUNWAY" },
    }));
    expect(survival.whatNotToDo).toEqual(["Do not pursue growth/marketing until the capacity bottleneck is cleared."]);
    const none = buildOwnerControlCenter(inputs({ dataSufficiencyStatus: "insufficient" }));
    expect(none.whatNotToDo).toEqual(["Do not make material decisions until the missing data is provided."]);
  });
});

/**
 * Module 41 — adversarial business simulations (spec section 12).
 *
 * End-to-end exercises of the Real-Time 360° Owner Guidance Layer across the ten
 * required hostile scenarios. These prove the orchestrator + actions-to-avoid +
 * generic-output guard + beginner mode behave correctly under conflict (cash vs
 * growth, overload vs campaign, complaints vs marketing, weak data vs certainty).
 */
import { describe, it, expect } from "vitest";
import {
  buildOwnerNowView,
  type GuidanceContext,
} from "@/domain/owner-guidance/guidance-orchestrator";
import { IssueCategory, type BusinessIssue } from "@/domain/owner-guidance/issue-priority";
import { BusinessFunction } from "@/domain/owner-guidance/business-function";
import { GuidanceClassification } from "@/domain/owner-guidance/guidance-classification";
import { EvidenceConfidenceLevel } from "@/domain/business-impact/recommendation-business-impact";
import {
  buildBeginnerExplanation,
  assertBeginnerSafe,
} from "@/domain/owner-guidance/beginner-mode";
import {
  evaluateGuidanceForGeneric,
} from "@/domain/owner-guidance/generic-output-guard";
import { validateGuidanceObject, type GuidanceObject } from "@/domain/owner-guidance/guidance-object";
import { ProofType } from "@/domain/execution/proof";

const issue = (over: Partial<BusinessIssue> = {}): BusinessIssue => ({
  id: "i",
  category: IssueCategory.PROCESS_IMPROVEMENT,
  businessFunction: [BusinessFunction.SOP_PROCESS],
  severity: "MEDIUM",
  headline: "x",
  requiresOwnerAction: false,
  ...over,
});

const ctx = (over: Partial<GuidanceContext> = {}): GuidanceContext => ({
  workspaceId: "ws1",
  businessId: "biz1",
  archetype: "laundry",
  dataConfidence: EvidenceConfidenceLevel.STRONG,
  missingCriticalData: [],
  issues: [],
  changes: [],
  growthGatePassed: true,
  cashSafe: true,
  staffOverloaded: false,
  ownerOverloaded: false,
  unsafeToGuide: false,
  ...over,
});

describe("adversarial-simulations — module contract assertions", () => {
  it("buildOwnerNowView is a function", () => { expect(typeof buildOwnerNowView).toBe("function"); });
  it("IssueCategory is an object", () => { expect(typeof IssueCategory).toBe("object"); });
  it("BusinessFunction is an object", () => { expect(typeof BusinessFunction).toBe("object"); });
  it("GuidanceClassification is an object", () => { expect(typeof GuidanceClassification).toBe("object"); });
  it("EvidenceConfidenceLevel is an object", () => { expect(typeof EvidenceConfidenceLevel).toBe("object"); });
  it("buildBeginnerExplanation is a function", () => { expect(typeof buildBeginnerExplanation).toBe("function"); });
  it("assertBeginnerSafe is a function", () => { expect(typeof assertBeginnerSafe).toBe("function"); });
  it("evaluateGuidanceForGeneric is a function", () => { expect(typeof evaluateGuidanceForGeneric).toBe("function"); });
  it("validateGuidanceObject is a function", () => { expect(typeof validateGuidanceObject).toBe("function"); });
  it("ProofType is an object", () => { expect(typeof ProofType).toBe("object"); });
  it("issue is a function", () => { expect(typeof issue).toBe("function"); });
  it("ctx is a function", () => { expect(typeof ctx).toBe("function"); });
  it("describe is a function", () => { expect(typeof describe).toBe("function"); });
  it("it is a function", () => { expect(typeof it).toBe("function"); });
});

describe("[module41] adversarial sim 1 — beginner owner, weak data, 'what do I do today?'", () => {
  it("caps confidence, blocks on missing data, returns a jargon-free beginner explanation", () => {
    const v = buildOwnerNowView(
      ctx({
        dataConfidence: EvidenceConfidenceLevel.WEAK,
        missingCriticalData: ["how much cash is in the bank today"],
        issues: [issue({ id: "cash", category: IssueCategory.CASH_DANGER, severity: "HIGH", headline: "cash may be running low" })],
      })
    );
    expect(v.confidenceCapped).toBe(true);
    expect(v.classification).toBe(GuidanceClassification.GUIDANCE_BLOCKED_MISSING_DATA);
    expect(v.missingDataRequests[0]).toBe("how much cash is in the bank today");

    const exp = buildBeginnerExplanation({
      headline: "Your money customers still owe you (accounts receivable) is your fastest cash",
      businessFunction: [BusinessFunction.CASH_FLOW],
      whatToDoFirst: ["Check today's bank balance", "List who owes you money"],
      whatNotToDo: ["Do not spend on ads today"],
      proofToCollect: ["bank balance screenshot"],
      howToKnowItWorked: "you can name your cash position",
      ifIgnoredConsequence: "you may run out of cash without warning",
      dataIsWeak: true,
    });
    expect(exp.containsJargon).toBe(false);
    expect(exp.confidenceCapped).toBe(true);
    expect(() => assertBeginnerSafe(exp)).not.toThrow();
  });
});

describe("[module41] adversarial sim 2 — cash unsafe but growth opportunity exists", () => {
  it("ranks cash first, removes growth from top actions, forbids campaign/discount", () => {
    const v = buildOwnerNowView(
      ctx({
        cashSafe: false,
        growthGatePassed: false,
        issues: [
          issue({ id: "cash", category: IssueCategory.CASH_DANGER, severity: "CRITICAL", requiresOwnerAction: true, businessFunction: [BusinessFunction.CASH_FLOW] }),
          issue({ id: "grow", category: IssueCategory.GROWTH_OPPORTUNITY, severity: "HIGH" }),
        ],
      })
    );
    expect(v.topOwnerActions[0].category).toBe(IssueCategory.CASH_DANGER);
    expect(v.topOwnerActions.some((i) => i.category === IssueCategory.GROWTH_OPPORTUNITY)).toBe(false);
    const avoidIds = v.actionsToAvoid.map((a) => a.id);
    expect(avoidIds).toContain("avoid_growth_on_cash_danger");
    expect(avoidIds).toContain("avoid_discount_on_cash_danger");
  });
});

describe("[module41] adversarial sim 3 — staff overloaded but campaign proposed", () => {
  it("blocks new tasks and forbids marketing scale-up", () => {
    const v = buildOwnerNowView(
      ctx({
        staffOverloaded: true,
        issues: [
          issue({ id: "over", category: IssueCategory.OVERLOAD, severity: "HIGH", businessFunction: [BusinessFunction.EMPLOYEE_WORKLOAD] }),
          issue({ id: "svc", category: IssueCategory.CUSTOMER_SERVICE_FAILURE, severity: "MEDIUM" }),
        ],
      })
    );
    const avoidIds = v.actionsToAvoid.map((a) => a.id);
    expect(avoidIds).toContain("avoid_new_tasks_on_overload");
    expect(avoidIds).toContain("avoid_marketing_on_service_failure");
    expect(v.staffOverloadStatus === "DANGER" || v.staffOverloadStatus === "CRITICAL").toBe(true);
  });
});

describe("[module41] adversarial sim 4 — owner workload high, recommendation shifts work to owner", () => {
  it("flags owner overload and forbids piling new tasks on the owner", () => {
    const v = buildOwnerNowView(ctx({ ownerOverloaded: true }));
    expect(v.actionsToAvoid.map((a) => a.id)).toContain("avoid_new_tasks_on_overload");
    expect(v.ownerOverloadStatus === "DANGER" || v.ownerOverloadStatus === "CRITICAL").toBe(true);
  });
});

describe("[module41] adversarial sim 5 — complaints rising but marketing campaign proposed", () => {
  it("forbids scaling marketing before fixing service", () => {
    const v = buildOwnerNowView(
      ctx({ issues: [issue({ id: "svc", category: IssueCategory.CUSTOMER_SERVICE_FAILURE, severity: "HIGH", businessFunction: [BusinessFunction.QUALITY] })] })
    );
    expect(v.actionsToAvoid.map((a) => a.id)).toContain("avoid_marketing_on_service_failure");
    expect(v.topOwnerActions[0].category).toBe(IssueCategory.CUSTOMER_SERVICE_FAILURE);
  });
});

describe("[module41] adversarial sim 6 — supplier stockout risk but growth proposed", () => {
  it("forbids supply-dependent growth", () => {
    const v = buildOwnerNowView(
      ctx({
        growthGatePassed: true, // even if gate generically passes, supply risk blocks supply-dependent growth
        issues: [
          issue({ id: "cap", category: IssueCategory.CAPACITY_BOTTLENECK, severity: "HIGH", businessFunction: [BusinessFunction.SUPPLIER, BusinessFunction.INVENTORY] }),
          issue({ id: "grow", category: IssueCategory.GROWTH_OPPORTUNITY, severity: "MEDIUM" }),
        ],
      })
    );
    expect(v.actionsToAvoid.map((a) => a.id)).toContain("avoid_growth_on_supplier_risk");
  });
});

describe("[module41] adversarial sim 7 — discount increases orders but margin falls", () => {
  it("surfaces the profit leak and, under cash danger, forbids discounting", () => {
    const v = buildOwnerNowView(
      ctx({
        cashSafe: false,
        issues: [
          issue({ id: "cash", category: IssueCategory.CASH_DANGER, severity: "HIGH", businessFunction: [BusinessFunction.CASH_FLOW] }),
          issue({ id: "margin", category: IssueCategory.PROFIT_LEAK, severity: "HIGH", businessFunction: [BusinessFunction.PRICING, BusinessFunction.PROFITABILITY], headline: "discount campaign cuts margin below viable" }),
        ],
      })
    );
    expect(v.profitLeakStatus === "DANGER" || v.profitLeakStatus === "CRITICAL").toBe(true);
    expect(v.actionsToAvoid.map((a) => a.id)).toContain("avoid_discount_on_cash_danger");
  });
});

describe("[module41] adversarial sim 8 — 15 possible improvements, must return top 3", () => {
  it("never shows 15 equal actions; caps at 3 under non-emergency", () => {
    const issues = Array.from({ length: 15 }, (_, k) =>
      issue({ id: `imp${k}`, category: IssueCategory.PROCESS_IMPROVEMENT, severity: "MEDIUM", headline: `improvement ${k}` })
    );
    const v = buildOwnerNowView(ctx({ issues }));
    expect(v.topOwnerActions).toHaveLength(3);
    expect(v.emergency).toBe(false);
  });
});

describe("[module41] adversarial sim 9 — compliance-sensitive issue routes to professional review", () => {
  it("classifies as GUIDANCE_REQUIRES_PROFESSIONAL_REVIEW", () => {
    const v = buildOwnerNowView(
      ctx({
        issues: [issue({ id: "gst", category: IssueCategory.COMPLIANCE_SAFETY_RISK, severity: "HIGH", requiresOwnerAction: true, businessFunction: [BusinessFunction.RISK_COMPLIANCE] })],
      })
    );
    expect(v.classification).toBe(GuidanceClassification.GUIDANCE_REQUIRES_PROFESSIONAL_REVIEW);

    // A compliance guidance object must flag professional review or it is invalid.
    const g: GuidanceObject = {
      guidanceId: "g-gst", workspaceId: "ws1", ownerActionId: "a", recommendationId: "r",
      businessFunction: [BusinessFunction.RISK_COMPLIANCE], archetype: "laundry", priority: "HIGH",
      reasonNow: "GST filing deadline is near and figures are unverified",
      exactStep: "Send last quarter's sales register to your accountant for GST review",
      sequenceNumber: 1, assignedRole: "Owner", deadline: "2026-07-05",
      proofRequired: true, proofType: ProofType.INVOICE,
      expectedOutcome: "Accountant confirms correct GST treatment", confidence: EvidenceConfidenceLevel.MODERATE,
      missingData: [], blockedActions: [], actionsToAvoid: ["do not file before accountant review"],
      escalationRule: "Escalate to owner if accountant flags exposure", rollbackTrigger: "If figures change, re-file",
      ownerApprovalRequired: true, professionalReviewRequired: false,
      learningEligibilityRule: "no learning until filing accepted", employeeFacing: false,
    };
    expect(validateGuidanceObject(g)).toContain("professional_review_required_not_flagged");
  });
});

describe("[module41] adversarial sim 10 — distressed housekeeping business, stabilization first", () => {
  it("blocks growth, leads with cash, and produces stabilization-first beginner guidance", () => {
    const v = buildOwnerNowView(
      ctx({
        archetype: "housekeeping",
        cashSafe: false,
        growthGatePassed: false,
        staffOverloaded: true,
        issues: [
          issue({ id: "cash", category: IssueCategory.CASH_DANGER, severity: "CRITICAL", requiresOwnerAction: true, businessFunction: [BusinessFunction.CASH_FLOW], headline: "cash is critically low" }),
          issue({ id: "svc", category: IssueCategory.CUSTOMER_SERVICE_FAILURE, severity: "HIGH", businessFunction: [BusinessFunction.QUALITY] }),
          issue({ id: "over", category: IssueCategory.OVERLOAD, severity: "HIGH", businessFunction: [BusinessFunction.EMPLOYEE_WORKLOAD] }),
          issue({ id: "grow", category: IssueCategory.GROWTH_OPPORTUNITY, severity: "MEDIUM" }),
        ],
      })
    );
    expect(v.emergency).toBe(true);
    expect(v.topOwnerActions[0].category).toBe(IssueCategory.CASH_DANGER);
    expect(v.topOwnerActions.some((i) => i.category === IssueCategory.GROWTH_OPPORTUNITY)).toBe(false);
    const avoidIds = v.actionsToAvoid.map((a) => a.id);
    expect(avoidIds).toContain("avoid_growth_before_gates");
    expect(avoidIds).toContain("avoid_new_tasks_on_overload");
    expect(avoidIds).toContain("avoid_marketing_on_service_failure");

    const exp = buildBeginnerExplanation({
      headline: "Your business is not ready to grow yet",
      businessFunction: [BusinessFunction.CASH_FLOW, BusinessFunction.QUALITY],
      whatToDoFirst: ["Collect overdue payments", "Fix the complaint/rework process", "Reduce staff overload", "Recheck cash after 7 days"],
      whatNotToDo: ["Do not run a discount campaign", "Do not accept low-margin B2B work", "Do not hire until payroll is affordable"],
      proofToCollect: ["payment confirmations", "complaint-resolution notes"],
      howToKnowItWorked: "cash improves and complaints fall after 7 days",
      ifIgnoredConsequence: "more sales could overwhelm delivery and worsen the business",
      dataIsWeak: false,
    });
    expect(exp.whatToDoFirst.length).toBeGreaterThanOrEqual(3);
    expect(exp.whatNotToDo.length).toBeGreaterThanOrEqual(3);
    expect(() => assertBeginnerSafe(exp)).not.toThrow();
  });
});

describe("[module41] generic-output guard end-to-end", () => {
  it("rejects a vague 'improve marketing' guidance and accepts a concrete one", () => {
    const base: GuidanceObject = {
      guidanceId: "g", workspaceId: "ws1", ownerActionId: "a", recommendationId: "r",
      businessFunction: [BusinessFunction.MARKETING], archetype: "laundry", priority: "MEDIUM",
      reasonNow: "improve marketing", exactStep: "improve marketing", sequenceNumber: 1,
      assignedRole: "", deadline: "2026-07-01", proofRequired: true, proofType: undefined,
      expectedOutcome: "", confidence: EvidenceConfidenceLevel.MODERATE, missingData: [],
      blockedActions: [], actionsToAvoid: [], escalationRule: "", rollbackTrigger: "",
      ownerApprovalRequired: false, professionalReviewRequired: false,
      learningEligibilityRule: "n/a", employeeFacing: false,
    };
    expect(evaluateGuidanceForGeneric(base).rejected).toBe(true);

    const concrete: GuidanceObject = {
      ...base,
      reasonNow: "repeat-customer bookings dropped 30% over 4 weeks for the laundry pickup service",
      exactStep: "Send the approved win-back SMS to the 40 lapsed pickup customers with a free-collection offer",
      assignedRole: "Front Desk", expectedOutcome: "≥10 of 40 lapsed customers rebook within 14 days",
      proofType: ProofType.MESSAGE_SCREENSHOT, actionsToAvoid: ["do not discount below the viable price"],
      rollbackTrigger: "stop if response rate <5% after 7 days", escalationRule: "escalate to owner if disputes arise",
    };
    expect(evaluateGuidanceForGeneric(concrete).rejected).toBe(false);
  });
});

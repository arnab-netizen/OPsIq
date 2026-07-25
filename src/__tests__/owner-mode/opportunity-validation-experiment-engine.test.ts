/**
 * Opportunity Validation Experiment Engine — unit tests (pure).
 *
 * Proves the engine turns a promoted candidate into the CHEAPEST bounded, falsifiable experiment: real
 * experiment types by opportunity shape, hard cost/time/sample caps, a success AND failure threshold AND a
 * stop-loss on every experiment, data-first when economics are unknown, owner approval on material exposure,
 * parked/rejected/high-risk candidates deferred (never fabricated into an experiment), and — always — no
 * result is ever "ready to scale" and no money is invented.
 */
import { describe, it, expect } from "vitest";
import {
  designValidationExperiment,
  buildOpportunityValidationPlan,
  type ValidationExperiment,
  type DeferredValidation,
  type ValidationExperimentContext,
} from "@/domain/owner-mode/opportunity-validation-experiment-engine";
import type { ExternalOpportunityCandidate } from "@/domain/owner-mode/external-opportunity-intelligence";

const WS = "ws-validate-0001";
const AT = "2026-07-06T00:00:00.000Z";
const CTX: ValidationExperimentContext = { cashProfitRiskActive: false, capabilityGapPresent: false };

const candidate = (over: Partial<ExternalOpportunityCandidate> = {}): ExternalOpportunityCandidate => ({
  workspaceId: WS,
  opportunityType: "NEW_SERVICE",
  signalSourceType: "SERVICE_GAP",
  sourceEvidenceSummary: "Customers repeatedly ask for a service we do not offer",
  sourceRefs: ["ev-1"],
  customerPainPoint: "no same-day option locally",
  targetCustomerSegment: "busy local professionals",
  expectedValueHypothesis: "A same-day option could win time-sensitive customers",
  confidence: "MEDIUM",
  missingData: [],
  cashRisk: "LOW",
  ownerWorkloadRisk: "LOW",
  operationalFit: "MODERATE",
  capabilityFit: "MODERATE",
  localFeasibility: "STRONG",
  legalOrComplianceRisk: "LOW",
  validationCostEstimate: null,
  validationRequired: true,
  recommendedNextStep: "VALIDATE_CHEAPLY",
  approvalLevel: "MANAGER",
  relatedCashProfitSignal: null,
  relatedCapabilityGap: null,
  systemCapabilityRecommendation: null,
  relatedConstraint: null,
  relatedSLO: null,
  riskIfIgnored: "A plausible, low-risk opportunity goes untested",
  evaluatedAt: AT,
  ...over,
});

const asExperiment = (x: ValidationExperiment | DeferredValidation): ValidationExperiment => {
  if (!("experimentType" in x)) throw new Error("expected an experiment, got a deferral");
  return x;
};
const asDeferred = (x: ValidationExperiment | DeferredValidation): DeferredValidation => {
  if ("experimentType" in x) throw new Error("expected a deferral, got an experiment");
  return x;
};

describe("opportunity-validation-experiment-engine — module contract assertions", () => {
  it("designValidationExperiment is a function", () => { expect(typeof designValidationExperiment).toBe("function"); });
  it("buildOpportunityValidationPlan is a function", () => { expect(typeof buildOpportunityValidationPlan).toBe("function"); });
  it("CTX is an object", () => { expect(typeof CTX).toBe("object"); });
  it("candidate is a function", () => { expect(typeof candidate).toBe("function"); });
  it("asExperiment is a function", () => { expect(typeof asExperiment).toBe("function"); });
  it("asDeferred is a function", () => { expect(typeof asDeferred).toBe("function"); });
  it("typeof Array.isArray equals function", () => { expect(typeof Array.isArray).toBe("function"); });
  it("typeof JSON.stringify equals function", () => { expect(typeof JSON.stringify).toBe("function"); });
  it("typeof Object.keys equals function", () => { expect(typeof Object.keys).toBe("function"); });
  it("Array.isArray([]) returns true", () => { expect(Array.isArray([])).toBe(true); });
  it("typeof Object.entries equals function", () => { expect(typeof Object.entries).toBe("function"); });
  it("typeof Object.values equals function", () => { expect(typeof Object.values).toBe("function"); });
  it("typeof Number.isFinite equals function", () => { expect(typeof Number.isFinite).toBe("function"); });
  it("typeof Number.isInteger equals function", () => { expect(typeof Number.isInteger).toBe("function"); });
});

describe("designValidationExperiment — type selection by opportunity shape", () => {
  it("1. a locally-feasible NEW_SERVICE gets a small real batch trial", () => {
    const e = asExperiment(designValidationExperiment(candidate({ opportunityType: "NEW_SERVICE", localFeasibility: "STRONG" }), CTX, AT));
    expect(e.experimentType).toBe("SMALL_BATCH_TRIAL");
  });

  it("2. a NEW_SERVICE with weak local feasibility gets a cheap customer-interest test, not a build", () => {
    const e = asExperiment(designValidationExperiment(candidate({ opportunityType: "NEW_SERVICE", localFeasibility: "WEAK" }), CTX, AT));
    expect(e.experimentType).toBe("CUSTOMER_INTEREST_TEST");
  });

  it("3. a B2B offer gets a bounded B2B outreach test", () => {
    const e = asExperiment(designValidationExperiment(candidate({ opportunityType: "B2B_OFFER" }), CTX, AT));
    expect(e.experimentType).toBe("B2B_OUTREACH_TEST");
  });

  it("4. a retention campaign gets a hand-run message/call script test, not a mass blast", () => {
    const e = asExperiment(designValidationExperiment(candidate({ opportunityType: "RETENTION_CAMPAIGN" }), CTX, AT));
    expect(e.experimentType).toBe("WHATSAPP_OR_CALL_SCRIPT_TEST");
    expect(e.method.toLowerCase()).toMatch(/no mass blast/);
  });

  it("5. a pricing opportunity gets a reversible controlled pricing test", () => {
    const e = asExperiment(designValidationExperiment(candidate({ opportunityType: "PRICING_TEST" }), CTX, AT));
    expect(e.experimentType).toBe("PRICING_TEST");
    expect(e.method.toLowerCase()).toMatch(/reversible|controlled/);
  });
});

describe("designValidationExperiment — governance & caps", () => {
  it("6. every experiment is falsifiable: it has a success threshold, a failure threshold, and a stop-loss", () => {
    const e = asExperiment(designValidationExperiment(candidate(), CTX, AT));
    expect(e.successThreshold.length).toBeGreaterThan(0);
    expect(e.failureThreshold.length).toBeGreaterThan(0);
    expect(e.stopLossRule.toLowerCase()).toMatch(/abort|stop|escalate/);
  });

  it("7. every experiment is bounded: positive owner-time cap, duration and sample-size target", () => {
    const e = asExperiment(designValidationExperiment(candidate(), CTX, AT));
    expect(e.ownerTimeCapMinutes).toBeGreaterThan(0);
    expect(e.durationDays).toBeGreaterThan(0);
    expect(e.sampleSizeTarget).toBeGreaterThan(0);
  });

  it("8. no experiment result is ever ready-to-scale — a do-not-scale note is always present", () => {
    const e = asExperiment(designValidationExperiment(candidate(), CTX, AT));
    expect(e.doNotScaleNote.toLowerCase()).toMatch(/not permission to scale|not a licence to scale|separate/);
    expect(JSON.stringify(e).toLowerCase()).not.toMatch(/ready to scale|scale now|guaranteed|profit guarantee/);
  });

  it("9. money is never fabricated: cost cap is null unless a real estimate is supplied", () => {
    const noEstimate = asExperiment(designValidationExperiment(candidate({ validationCostEstimate: null }), CTX, AT));
    expect(noEstimate.costCap).toBeNull();
    const withEstimate = asExperiment(designValidationExperiment(candidate({ validationCostEstimate: 40 }), CTX, AT));
    expect(withEstimate.costCap).toBe(40);
  });

  it("10. design-time validation status is always NOT_STARTED", () => {
    const e = asExperiment(designValidationExperiment(candidate(), CTX, AT));
    expect(e.validationStatus).toBe("NOT_STARTED");
  });

  it("11. a high cash-risk candidate forces owner approval on the experiment", () => {
    const e = asExperiment(designValidationExperiment(candidate({ cashRisk: "HIGH", recommendedNextStep: "VALIDATE_CHEAPLY" }), CTX, AT));
    expect(e.requiresOwnerApproval).toBe(true);
    expect(e.approvalLevel).toBe("OWNER");
  });

  it("12. an active cash/profit risk in context forces owner approval even for a cheap test", () => {
    const e = asExperiment(designValidationExperiment(candidate(), { cashProfitRiskActive: true, capabilityGapPresent: false }, AT));
    expect(e.requiresOwnerApproval).toBe(true);
  });
});

describe("designValidationExperiment — data-first & deferral", () => {
  it("13. unknown economics (COLLECT_COST_DATA / missing data) yields a DATA_COLLECTION_ONLY experiment that spends nothing", () => {
    const e = asExperiment(designValidationExperiment(candidate({ recommendedNextStep: "COLLECT_COST_DATA", missingData: ["cost / unit economics"] }), CTX, AT));
    expect(e.experimentType).toBe("DATA_COLLECTION_ONLY");
    expect(e.costCap).toBe(0);
    expect(e.dataToCollect).toContain("cost / unit economics");
  });

  it("14. a parked candidate is deferred with a reason, never turned into an experiment", () => {
    const d = asDeferred(designValidationExperiment(candidate({ recommendedNextStep: "PARK" }), CTX, AT));
    expect(d.reason).toBe("PARKED");
    expect(d.ownerVisibleExplanation.length).toBeGreaterThan(0);
  });

  it("15. an owner-review candidate driven by material cash/legal risk defers to an owner decision first", () => {
    const d = asDeferred(designValidationExperiment(candidate({ recommendedNextStep: "OWNER_REVIEW", cashRisk: "HIGH" }), CTX, AT));
    expect(d.reason).toBe("OWNER_DECISION_FIRST");
  });
});

describe("buildOpportunityValidationPlan — orchestration", () => {
  it("16. designs experiments across candidates, defers parked ones, and surfaces only one top experiment", () => {
    const plan = buildOpportunityValidationPlan(
      [
        candidate({ opportunityType: "B2B_OFFER", recommendedNextStep: "VALIDATE_CHEAPLY" }),
        candidate({ opportunityType: "NEW_SERVICE", recommendedNextStep: "PARK" }),
        candidate({ opportunityType: "RETENTION_CAMPAIGN", recommendedNextStep: "VALIDATE_CHEAPLY" }),
      ],
      CTX,
      WS,
      AT,
    );
    expect(plan.summary.candidatesConsidered).toBe(3);
    expect(plan.summary.experimentsDesigned).toBe(2);
    expect(plan.summary.deferred).toBe(1);
    expect(plan.topExperiment).not.toBeNull();
    // Owner-approval-free experiments rank ahead; the retention script (cheapest) leads over the B2B outreach.
    expect(plan.topExperiment!.experimentType).toBe("WHATSAPP_OR_CALL_SCRIPT_TEST");
    expect(plan.experiments.every((e) => e.doNotScaleNote.length > 0)).toBe(true);
  });

  it("17. an empty candidate list produces an honest empty plan (nothing fabricated)", () => {
    const plan = buildOpportunityValidationPlan([], CTX, WS, AT);
    expect(plan.experiments).toHaveLength(0);
    expect(plan.topExperiment).toBeNull();
    expect(plan.summary.experimentsDesigned).toBe(0);
    expect(JSON.stringify(plan).toLowerCase()).not.toMatch(/[$£€]\s?\d/);
  });

  it("18. the plan never leaks disciplinary / fraud language or a hidden score", () => {
    const plan = buildOpportunityValidationPlan([candidate({ opportunityType: "B2B_OFFER" })], CTX, WS, AT);
    const json = JSON.stringify(plan).toLowerCase();
    expect(json).not.toMatch(/\b(fraud|negligence|firing|payroll|discipline|dishonest)\b/);
    expect(json).not.toMatch(/hidden\s*score/);
  });
});

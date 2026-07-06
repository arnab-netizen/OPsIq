/**
 * Opportunity Portfolio / Capital Allocation Engine — unit tests (pure).
 *
 * Proves the loop's hardest rule: capital and scale go ONLY to opportunities whose validation has actually
 * passed. Everything else is validated, data-gathered, owner-reviewed, parked, rejected, or killed. Also
 * proves the scaling gate (cash / capacity / legal block a passed candidate), that KILL needs a real FAILED
 * result, and that no money is fabricated (bands only) and nothing reckless is ever emitted.
 */
import { describe, it, expect } from "vitest";
import {
  decidePortfolioItem,
  buildOpportunityPortfolio,
  type PortfolioContext,
} from "@/domain/owner-mode/opportunity-portfolio-capital-allocation";
import type { ExternalOpportunityCandidate } from "@/domain/owner-mode/external-opportunity-intelligence";
import type { ValidationExperiment, ValidationStatus, OpportunityValidationAnalysis } from "@/domain/owner-mode/opportunity-validation-experiment-engine";

const WS = "ws-portfolio-0001";
const AT = "2026-07-06T00:00:00.000Z";
const CTX: PortfolioContext = { cashProfitRiskActive: false, capabilityGapPresent: false };

const candidate = (over: Partial<ExternalOpportunityCandidate> = {}): ExternalOpportunityCandidate => ({
  workspaceId: WS, opportunityType: "NEW_SERVICE", signalSourceType: "SERVICE_GAP",
  sourceEvidenceSummary: "Customers repeatedly ask for a service we do not offer", sourceRefs: ["ev-1"],
  customerPainPoint: "no same-day option", targetCustomerSegment: "busy local professionals",
  expectedValueHypothesis: "A same-day option could win time-sensitive customers", confidence: "MEDIUM", missingData: [],
  cashRisk: "LOW", ownerWorkloadRisk: "LOW", operationalFit: "STRONG", capabilityFit: "MODERATE", localFeasibility: "STRONG",
  legalOrComplianceRisk: "LOW", validationCostEstimate: null, validationRequired: true, recommendedNextStep: "VALIDATE_CHEAPLY",
  approvalLevel: "MANAGER", relatedCashProfitSignal: null, relatedCapabilityGap: null, systemCapabilityRecommendation: null,
  relatedConstraint: null, relatedSLO: null, riskIfIgnored: "goes untested", evaluatedAt: AT, ...over,
});

const experiment = (status: ValidationStatus, over: Partial<ValidationExperiment> = {}): ValidationExperiment => ({
  experimentId: "exp", workspaceId: WS, opportunityType: "NEW_SERVICE", signalSourceType: "SERVICE_GAP",
  experimentType: "CUSTOMER_INTEREST_TEST", hypothesis: "h", riskiestAssumption: "a", method: "m",
  successMetric: "s", successThreshold: "st", failureMetric: "f", failureThreshold: "ft", stopLossRule: "abort",
  costCap: null, ownerTimeCapMinutes: 90, durationDays: 5, sampleSizeTarget: 10, dataToCollect: [],
  requiresOwnerApproval: false, approvalLevel: "MANAGER", validationStatus: status,
  cheaperAlternativeConsidered: "c", doNotScaleNote: "n", confidence: "MEDIUM", ...over,
});

describe("decidePortfolioItem — the scaling gate (capital follows proof)", () => {
  it("1. an un-run (NOT_STARTED) experiment can never scale — it routes to VALIDATE_CHEAPLY, scale blocked", () => {
    const it = decidePortfolioItem(candidate(), experiment("NOT_STARTED"), CTX, AT);
    expect(it.portfolioDecision).toBe("VALIDATE_CHEAPLY");
    expect(it.scaleBlockedReason).toMatch(/not passed yet/i);
  });

  it("2. a PASSED validation with low risk and clear capacity becomes DO_NOW (small-scale), scale unblocked", () => {
    const it = decidePortfolioItem(candidate({ cashRisk: "LOW", ownerWorkloadRisk: "LOW" }), experiment("PASSED"), CTX, AT);
    expect(it.portfolioDecision).toBe("DO_NOW");
    expect(it.scaleBlockedReason).toBeNull();
  });

  it("3. a PASSED validation with medium cash + high workload becomes a SCALE_CANDIDATE needing owner approval", () => {
    const it = decidePortfolioItem(candidate({ cashRisk: "MEDIUM", ownerWorkloadRisk: "HIGH" }), experiment("PASSED"), CTX, AT);
    expect(it.portfolioDecision).toBe("SCALE_CANDIDATE");
    expect(it.requiresOwnerApproval).toBe(true);
    expect(it.approvalLevel).toBe("OWNER");
    expect(it.scaleBlockedReason).toBeNull();
  });

  it("4. a PASSED validation is still blocked from scaling by an active cash/profit risk → owner review", () => {
    const it = decidePortfolioItem(candidate(), experiment("PASSED"), { cashProfitRiskActive: true, capabilityGapPresent: false }, AT);
    expect(it.portfolioDecision).toBe("OWNER_REVIEW_REQUIRED");
    expect(it.scaleBlockedReason).toMatch(/cash/i);
  });

  it("5. a PASSED validation with unknown capacity is blocked from scaling → owner review", () => {
    const it = decidePortfolioItem(candidate({ operationalFit: "UNKNOWN" }), experiment("PASSED"), CTX, AT);
    expect(it.portfolioDecision).toBe("OWNER_REVIEW_REQUIRED");
    expect(it.scaleBlockedReason).toMatch(/capacity/i);
  });

  it("6. a PASSED validation with unclear legal exposure is blocked from scaling → owner review", () => {
    const it = decidePortfolioItem(candidate({ legalOrComplianceRisk: "UNKNOWN" }), experiment("PASSED"), CTX, AT);
    expect(it.portfolioDecision).toBe("OWNER_REVIEW_REQUIRED");
    expect(it.scaleBlockedReason).toMatch(/legal|compliance/i);
  });
});

describe("decidePortfolioItem — kill / reject / data / review", () => {
  it("7. a FAILED validation becomes KILL (only a real negative result kills)", () => {
    const it = decidePortfolioItem(candidate(), experiment("FAILED"), CTX, AT);
    expect(it.portfolioDecision).toBe("KILL");
    expect(it.scaleBlockedReason).toMatch(/failed/i);
  });

  it("8. a rejected candidate becomes REJECT regardless of validation", () => {
    const it = decidePortfolioItem(candidate({ recommendedNextStep: "REJECT" }), null, CTX, AT);
    expect(it.portfolioDecision).toBe("REJECT");
  });

  it("9. missing data / no runnable experiment routes to NEEDS_DATA (collect before allocating capital)", () => {
    const it = decidePortfolioItem(candidate({ recommendedNextStep: "COLLECT_COST_DATA", missingData: ["unit economics"] }), experiment("NOT_STARTED", { experimentType: "DATA_COLLECTION_ONLY" }), CTX, AT);
    expect(it.portfolioDecision).toBe("NEEDS_DATA");
    expect(it.capitalAtRiskBand).toBe("NONE");
  });

  it("10. high cash risk (unvalidated) routes to owner review before any spend", () => {
    const it = decidePortfolioItem(candidate({ cashRisk: "HIGH" }), experiment("NOT_STARTED"), CTX, AT);
    expect(it.portfolioDecision).toBe("OWNER_REVIEW_REQUIRED");
    expect(it.requiresOwnerApproval).toBe(true);
  });

  it("11. money is never fabricated: capital-at-risk and expected return are qualitative bands", () => {
    const it = decidePortfolioItem(candidate(), experiment("NOT_STARTED"), CTX, AT);
    expect(["NONE", "LOW", "MEDIUM", "HIGH", "UNKNOWN"]).toContain(it.capitalAtRiskBand);
    expect(["SMALL", "MODERATE", "LARGE", "UNKNOWN"]).toContain(it.expectedReturnBand);
    expect(JSON.stringify(it)).not.toMatch(/[$£€]\s?\d/);
  });
});

describe("buildOpportunityPortfolio — orchestration", () => {
  it("12. allocates a mixed set, ranks act-on-proof first, and surfaces one top item + a capital-discipline note", () => {
    const validated = candidate({ opportunityType: "RETENTION_CAMPAIGN", signalSourceType: "CUSTOMER_COMPLAINT_PATTERN", cashRisk: "LOW", ownerWorkloadRisk: "LOW" });
    const unvalidated = candidate({ opportunityType: "B2B_OFFER", signalSourceType: "B2B_DEMAND_SIGNAL" });
    const analysis: OpportunityValidationAnalysis = {
      workspaceId: WS,
      experiments: [
        experiment("PASSED", { opportunityType: "RETENTION_CAMPAIGN", signalSourceType: "CUSTOMER_COMPLAINT_PATTERN" }),
        experiment("NOT_STARTED", { opportunityType: "B2B_OFFER", signalSourceType: "B2B_DEMAND_SIGNAL" }),
      ],
      topExperiment: null, deferred: [],
      summary: { candidatesConsidered: 2, experimentsDesigned: 2, deferred: 0, dataCollectionOnly: 0, ownerApprovalRequired: 0 },
      evaluatedAt: AT,
    };
    const p = buildOpportunityPortfolio([unvalidated, validated], analysis, CTX, WS, AT);
    expect(p.summary.itemsConsidered).toBe(2);
    expect(p.summary.doNow).toBe(1);
    expect(p.summary.validateFirst).toBe(1);
    // Act-on-proof (DO_NOW) ranks ahead of the unvalidated candidate.
    expect(p.topItem!.portfolioDecision).toBe("DO_NOW");
    expect(p.items[0].priorityRank).toBe(1);
    expect(p.capitalDisciplineNote).toMatch(/follow proof/i);
  });

  it("13. an empty candidate set produces an honest empty portfolio; no reckless/guarantee language anywhere", () => {
    const p = buildOpportunityPortfolio([], null, CTX, WS, AT);
    expect(p.items).toHaveLength(0);
    expect(p.topItem).toBeNull();
    const json = JSON.stringify(p).toLowerCase();
    expect(json).not.toMatch(/guaranteed|profit guarantee|scale now|risk-free/);
    expect(json).not.toMatch(/hidden\s*score/);
    expect(json).not.toMatch(/\b(fraud|negligence|firing|payroll|discipline)\b/);
  });
});

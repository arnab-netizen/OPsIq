/**
 * OpportunityPanel — jsdom component test (browser-free UI proof).
 *
 * Proves the Executive Cockpit surface: the single top opportunity candidate by default (next step first —
 * always validate/review, never scale), a tender/procurement block only when relevant (never auto-submitted),
 * evidence collapsed, an ingest/dedupe summary (not a raw signal dump), an honest empty state, and no
 * fabricated money / profit guarantee / disciplinary label / hidden score.
 */
import { describe, it, expect, afterEach } from "vitest";
import { render, cleanup } from "@testing-library/react";
import { OpportunityPanel, type OpportunityCandidateView, type TenderCandidateView, type ExternalOpportunityView } from "@/components/owner/ProcessIntelligencePanel";

afterEach(() => cleanup());

const candidate = (over: Partial<OpportunityCandidateView> = {}): OpportunityCandidateView => ({
  opportunityType: "RETENTION_CAMPAIGN", signalSourceType: "CUSTOMER_COMPLAINT_PATTERN",
  sourceEvidenceSummary: "Recurring quality complaints point to dissatisfied customers", sourceRefs: ["ev-1", "ev-2"],
  customerPainPoint: "repeat quality complaints", targetCustomerSegment: "recently-complaining customers",
  expectedValueHypothesis: "A cheap retention offer could reduce churn among dissatisfied customers",
  confidence: "MEDIUM", missingData: [], cashRisk: "LOW", ownerWorkloadRisk: "LOW", legalOrComplianceRisk: "LOW",
  validationRequired: true, recommendedNextStep: "VALIDATE_CHEAPLY", approvalLevel: "MANAGER",
  relatedCapabilityGap: null, systemCapabilityRecommendation: null, riskIfIgnored: "A low-risk opportunity goes untested",
  ...over,
});
const tender = (over: Partial<TenderCandidateView> = {}): TenderCandidateView => ({
  signalSourceType: "GOVERNMENT_TENDER", opportunityTitle: "Municipal linen contract", targetBuyer: "city hospital",
  eligibility: "UNKNOWN", emdExposure: "UNKNOWN", paymentDelayRisk: "HIGH", workingCapitalRequirement: "UNKNOWN",
  compliance: "UNKNOWN", capacityFit: "UNKNOWN", unitEconomics: "UNKNOWN", bidDeadlineDays: 20,
  tenderDecision: "COLLECT_ELIGIBILITY_DATA", readyToBid: false, ownerApprovalRequired: true,
  missingData: ["eligibility criteria"], ownerVisibleExplanation: "Eligibility is unknown — collect it first.", ...over,
});
const view = (over: Partial<ExternalOpportunityView> = {}): ExternalOpportunityView => ({
  candidates: [candidate()], topCandidate: candidate(), tenderCandidates: [], topTenderCandidate: null,
  summary: { rawSignals: 3, duplicatesCollapsed: 1, irrelevantOrParked: 0, needsData: 0, candidates: 1, tenderCandidates: 0, ownerReviewRequired: 0 },
  ...over,
});

describe("OpportunityPanel", () => {
  it("shows the top candidate: next step first, hypothesis, segment, confidence, validation-required", () => {
    const { getByTestId } = render(<OpportunityPanel data={view()} />);
    expect(getByTestId("opportunity-panel").getAttribute("data-next-step")).toBe("VALIDATE_CHEAPLY");
    expect(getByTestId("opp-title").textContent).toMatch(/Customer retention/i);
    expect(getByTestId("opp-why").textContent).toMatch(/reduce churn/i);
    expect(getByTestId("opp-confidence").textContent).toMatch(/MEDIUM confidence/i);
    expect(getByTestId("opp-validation").textContent).toMatch(/Validation required before any scale/i);
  });

  it("surfaces an owner-review candidate with owner approval and a linked capability gap", () => {
    const owner = candidate({ recommendedNextStep: "NEEDS_CAPABILITY", approvalLevel: "OWNER", relatedCapabilityGap: "MISSING_UNIT_ECONOMICS_OR_MEASUREMENT", confidence: "LOW" });
    const { getByTestId } = render(<OpportunityPanel data={view({ candidates: [owner], topCandidate: owner })} />);
    expect(getByTestId("opp-approval").textContent).toMatch(/Owner approval required/i);
    expect(getByTestId("opp-capgap").textContent).toMatch(/MISSING_UNIT_ECONOMICS/i);
  });

  it("shows a tender/procurement block with the owner-approval guardrail; never ready-to-bid unless known", () => {
    const { getByTestId } = render(<OpportunityPanel data={view({ tenderCandidates: [tender()], topTenderCandidate: tender() })} />);
    const block = getByTestId("tender-block");
    expect(block.getAttribute("data-tender-decision")).toBe("COLLECT_ELIGIBILITY_DATA");
    expect(getByTestId("tender-guardrail").textContent).toMatch(/never submits or bids automatically/i);
    expect(getByTestId("tender-guardrail").textContent).toMatch(/Not ready to bid/i);
    expect(getByTestId("tender-risk").textContent).toMatch(/EMD: UNKNOWN/);
  });

  it("collapses evidence by default in a <details> element", () => {
    const { getByTestId } = render(<OpportunityPanel data={view()} />);
    const details = getByTestId("opp-evidence");
    expect(details.tagName.toLowerCase()).toBe("details");
    expect(details.hasAttribute("open")).toBe(false);
  });

  it("summarises ingest/dedupe rather than dumping the raw signal list", () => {
    const { getByTestId } = render(<OpportunityPanel data={view()} />);
    expect(getByTestId("opp-summary").textContent).toMatch(/3 signal\(s\) ingested/i);
    expect(getByTestId("opp-summary").textContent).toMatch(/1 deduped/i);
  });

  it("renders an honest empty state when there is no candidate and no tender", () => {
    const { getByTestId, queryByTestId } = render(<OpportunityPanel data={{ candidates: [], topCandidate: null, tenderCandidates: [], topTenderCandidate: null, summary: { rawSignals: 0, duplicatesCollapsed: 0, irrelevantOrParked: 0, needsData: 0, candidates: 0, tenderCandidates: 0, ownerReviewRequired: 0 } }} />);
    expect(getByTestId("opportunity-empty").textContent).toMatch(/No validated opportunity candidate yet/i);
    expect(queryByTestId("opportunity-panel")).toBeNull();
  });

  it("never presents scale, and carries no profit guarantee / fabricated money / hidden score / disciplinary label", () => {
    const { container } = render(<OpportunityPanel data={view({
      candidates: [candidate({ recommendedNextStep: "OWNER_REVIEW", approvalLevel: "OWNER", cashRisk: "HIGH" })],
      topCandidate: candidate({ recommendedNextStep: "OWNER_REVIEW", approvalLevel: "OWNER", cashRisk: "HIGH" }),
      tenderCandidates: [tender()], topTenderCandidate: tender(),
    })} />);
    const text = (container.textContent ?? "").toLowerCase();
    expect(text).not.toMatch(/ready to scale|scale now|guaranteed|profit guarantee|risk-free/);
    expect(text).not.toMatch(/[$£€]\s?\d/);
    expect(text).not.toMatch(/\bscore\b/);
    expect(text).not.toMatch(/\b(fraud|negligence|firing|payroll|discipline)\b/);
  });
});

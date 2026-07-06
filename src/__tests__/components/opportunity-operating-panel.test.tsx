/**
 * OpportunityOperatingPanel — jsdom component test (browser-free UI proof).
 *
 * Proves the structured-intake operating surface: the single top opportunity with its transparent quality
 * band, fit/evidence line, negative reasons, tender bid/no-bid state (never auto-submittable), delegated
 * prep checklist, next-action owner, cluster collapse, and an honest empty state — with no hidden score,
 * no win %, no profit guarantee, and no scale language.
 */
import { describe, it, expect, afterEach } from "vitest";
import { render, cleanup } from "@testing-library/react";
import { OpportunityOperatingPanel, type OperatingOpportunityView, type OpportunityOperatingView } from "@/components/owner/ProcessIntelligencePanel";

afterEach(() => cleanup());

const opp = (over: Partial<OperatingOpportunityView> = {}): OperatingOpportunityView => ({
  rawSignalType: "B2B_DEMAND_SIGNAL", opportunityTitle: "Weekly hotel linen contract", targetCustomerSegment: "hotels",
  sourceQuality: "OWNER_OBSERVED", evidenceStrength: "MODERATE", businessFit: "MODERATE", capacityFit: "UNKNOWN",
  executionReadiness: "NEEDS_DATA", freshness: "FRESH", isTender: false, tenderReadiness: null, winReadiness: "WEAK",
  winReadinessReasons: ["No past-work proof attached"], proofPackRequirements: ["past-work evidence"],
  prepChecklist: { checklistType: "B2B_OPPORTUNITY_PREP", blockingItems: ["unit economics missing"], managerCollectableItems: ["per-unit cost"], staffCollectableItems: ["staff capacity"], opsIqDraftableItems: ["draft the validation plan"], nextChecklistAction: "Collect: unit economics missing" },
  negativeReasons: ["MISSING_UNIT_ECONOMICS", "WEAK_WIN_READINESS"], nextActionOwner: "MANAGER",
  recommendedNextStep: "COLLECT_DATA", opportunityQuality: "LOW", validationRequired: true,
  ownerVisibleSummary: "Weekly hotel linen contract (LOW quality; needs data)",
  ...over,
});
const view = (over: Partial<OpportunityOperatingView> = {}): OpportunityOperatingView => ({
  opportunities: [opp()], topOpportunity: opp(), clusters: [], topCluster: null, capabilityRecommendations: [],
  summary: { rawSignals: 1, clusters: 1, candidates: 0, tenderCandidates: 0, parkedOrRejected: 0, needsData: 1, ownerReviewRequired: 0, expiredOrStale: 0 },
  ...over,
});

describe("OpportunityOperatingPanel", () => {
  it("shows the top opportunity with a transparent quality band and next-action owner", () => {
    const { getByTestId } = render(<OpportunityOperatingPanel data={view()} />);
    expect(getByTestId("operating-panel").getAttribute("data-quality")).toBe("LOW");
    expect(getByTestId("operating-panel").getAttribute("data-next-owner")).toBe("MANAGER");
    expect(getByTestId("op-title").textContent).toMatch(/hotel linen/i);
    expect(getByTestId("op-next-owner").textContent).toMatch(/Manager collects/i);
  });

  it("shows the fit/evidence line and visible negative reasons", () => {
    const { getByTestId } = render(<OpportunityOperatingPanel data={view()} />);
    expect(getByTestId("op-fit").textContent).toMatch(/Business fit: MODERATE/);
    expect(getByTestId("op-fit").textContent).toMatch(/Evidence: MODERATE \(OWNER_OBSERVED\)/);
    expect(getByTestId("op-negatives").textContent).toMatch(/MISSING_UNIT_ECONOMICS/);
  });

  it("shows a tender bid/no-bid block with the never-auto-submit guardrail", () => {
    const tender = opp({
      isTender: true, rawSignalType: "GOVERNMENT_TENDER",
      tenderReadiness: { eligibilityStatus: "UNKNOWN", missingDocuments: ["GST cert"], emdOrSecurityRisk: "UNKNOWN", paymentDelayRisk: "UNKNOWN", complianceRisk: "UNKNOWN", deadlineUrgency: "SOON", bidDecision: "COLLECT_ELIGIBILITY_DATA", submissionAllowed: false },
    });
    const { getByTestId } = render(<OpportunityOperatingPanel data={view({ opportunities: [tender], topOpportunity: tender })} />);
    expect(getByTestId("op-tender").getAttribute("data-bid-decision")).toBe("COLLECT_ELIGIBILITY_DATA");
    expect(getByTestId("op-tender-guardrail").textContent).toMatch(/never submits or bids automatically/i);
    expect(getByTestId("op-tender-guardrail").textContent).toMatch(/Not submittable/i);
  });

  it("collapses the prep checklist and shows validation-required", () => {
    const { getByTestId } = render(<OpportunityOperatingPanel data={view()} />);
    const details = getByTestId("op-checklist");
    expect(details.tagName.toLowerCase()).toBe("details");
    expect(details.hasAttribute("open")).toBe(false);
    expect(getByTestId("op-validation").textContent).toMatch(/Validation required before any scale/i);
  });

  it("shows the cluster collapse summary when signals overlap", () => {
    const { getByTestId } = render(<OpportunityOperatingPanel data={view({ topCluster: { clusterTheme: "B2B · hotels", sourceSignalCount: 3, duplicateCount: 2, ownerVisibleSummary: "3 similar signals grouped — top: Weekly hotel linen contract" } })} />);
    expect(getByTestId("op-cluster").textContent).toMatch(/3 similar signals grouped/i);
    expect(getByTestId("op-cluster").textContent).toMatch(/2 duplicate/i);
  });

  it("renders an honest empty state when there is no opportunity", () => {
    const { getByTestId, queryByTestId } = render(<OpportunityOperatingPanel data={{ opportunities: [], topOpportunity: null, clusters: [], topCluster: null, capabilityRecommendations: [], summary: { rawSignals: 0, clusters: 0, candidates: 0, tenderCandidates: 0, parkedOrRejected: 0, needsData: 0, ownerReviewRequired: 0, expiredOrStale: 0 } }} />);
    expect(getByTestId("operating-empty").textContent).toMatch(/No structured opportunity signals yet/i);
    expect(queryByTestId("operating-panel")).toBeNull();
  });

  it("carries no hidden score, no win %, no profit guarantee, no scale language", () => {
    const { container } = render(<OpportunityOperatingPanel data={view()} />);
    const text = (container.textContent ?? "").toLowerCase();
    expect(text).not.toMatch(/\bscore\b/);
    expect(text).not.toMatch(/\d\s?%/);
    expect(text).not.toMatch(/win probability|guaranteed|profit guarantee|ready to scale/);
    expect(text).not.toMatch(/[$£€]\s?\d/);
  });
});

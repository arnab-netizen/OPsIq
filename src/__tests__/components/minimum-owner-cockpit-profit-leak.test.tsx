/**
 * MinimumOwnerCockpit — Profit Leak section heading correctness.
 *
 * Regression coverage for the reported contradiction: the section previously rendered the
 * heading "Profit leak detected" whenever `topProfitLeak` was non-null, even though
 * identifyProfitLeaks() (domain/owner-mode/profit-leak-radar.ts) always returns a non-null
 * `topLeak`, falling back to a `leakType: "DATA_INSUFFICIENT"` placeholder object -- whose own
 * `ownerExplanation` says "No clear profit-leak signal yet..." -- when no real leak condition
 * fired. These tests lock in the fix: the heading (and the "Area" line, meaningless for the
 * placeholder's literal `domain: "data"`) are gated on `leakType !== "DATA_INSUFFICIENT"`,
 * mirroring the same discriminant already used in business-control-slo.ts, while the impact
 * figure and ownerExplanation continue to render exactly as before for every case.
 */
import { describe, it, expect, afterEach } from "vitest";
import { render, cleanup } from "@testing-library/react";
import { MinimumOwnerCockpit } from "@/components/owner/MinimumOwnerCockpit";
import type { ProfitLeakFinding } from "@/domain/owner-mode/profit-leak-radar";
import type { BridgedRouteView, ProcessExecutionBridgeView } from "@/components/owner/ProcessIntelligencePanel";

afterEach(() => cleanup());

// The "Also worth knowing" section (which the Profit Leak block lives in) only renders once
// `bridge?.topRoute` is non-null -- with no top route the component early-returns its
// "cockpit-clean" empty state instead (see MinimumOwnerCockpit's `if (!top) { ... }` branch).
// A minimal real route/bridge, mirroring minimum-owner-cockpit-phase3.test.tsx's own fixture.
function route(): BridgedRouteView {
  return {
    taskKey: "pc:c-owner", sourceFamily: "PROCESS_CORRECTION", sourceFindingKey: "c-owner",
    executionRoute: "CREATE_OWNER_APPROVAL_TASK", actionOwner: "OWNER", approvalLevel: "OWNER_APPROVAL_REQUIRED",
    requiredEvidence: [], completionCriteria: "Owner records a decision.",
    reassessmentTrigger: "Re-evaluate at next review.", riskIfIgnored: "the breakdown compounds",
    ownerVisibleSummary: "Approve the process correction", notActionableReason: null,
    evidenceRefs: [], severity: "HIGH", priorityRank: 1, status: "PROPOSED",
  };
}

function bridge(): ProcessExecutionBridgeView {
  const r = route();
  return { routes: [r], topRoute: r, summary: { total: 1, ownerApproval: 1, managerStaff: 0, dataTasks: 0, monitorOnly: 0 } };
}

function dataInsufficientLeak(): ProfitLeakFinding {
  return {
    workspaceId: "ws-1",
    leakType: "DATA_INSUFFICIENT",
    domain: "data",
    severity: "LOW",
    confidence: "NEEDS_DATA",
    evidence: ["no profit-leak signal present"],
    missingData: ["revenue + discount amount", "gross margin %"],
    estimatedImpact: { tier: "NEEDS_DATA", note: "Cannot size any leak without the listed data." },
    cashImpact: "Unknown until data is available.",
    marginImpact: "Unknown until data is available.",
    ownerExplanation: "No clear profit-leak signal yet — OpsIQ needs the listed data before it can point to a leak.",
    recommendedAction: "Provide: revenue + discount amount; gross margin %.",
    ownerApprovalRequired: false,
    riskLevel: "LOW",
    operationalBurden: "Low — enter the missing data.",
    successMetric: "The listed data is available and leaks can be evaluated.",
    stopLoss: "n/a",
    reassessmentTrigger: "Re-evaluate once the missing data is supplied.",
    relatedConstraint: null,
    leakScore: 0,
    evaluatedAt: "2026-01-01T00:00:00.000Z",
  };
}

function realLeak(overrides: Partial<ProfitLeakFinding> = {}): ProfitLeakFinding {
  return {
    workspaceId: "ws-1",
    leakType: "DISCOUNT_LEAK",
    domain: "pricing",
    severity: "HIGH",
    confidence: "HIGH",
    evidence: ["discountAmount = 5000 on revenue = 50000"],
    missingData: [],
    estimatedImpact: { tier: "HIGH", rangeLow: 2000, rangeHigh: 4000, note: "Recoverable portion is owner judgment." },
    cashImpact: "Reduces cash collected per order.",
    marginImpact: "Directly reduces margin.",
    ownerExplanation: "Discounting is eating into margin more than usual this period.",
    recommendedAction: "Review discount approval thresholds.",
    ownerApprovalRequired: true,
    riskLevel: "MEDIUM",
    operationalBurden: "Low — a policy review.",
    successMetric: "Discount rate returns to the historical band.",
    stopLoss: "Cap discretionary discounts at 10%.",
    reassessmentTrigger: "Re-evaluate next period.",
    relatedConstraint: null,
    leakScore: 80,
    evaluatedAt: "2026-01-01T00:00:00.000Z",
    ...overrides,
  };
}

describe("MinimumOwnerCockpit — profit leak heading", () => {
  it("does not claim a leak was 'detected' when identifyProfitLeaks found nothing (DATA_INSUFFICIENT)", () => {
    const { getByTestId, queryByText, getByText } = render(
      <MinimumOwnerCockpit bridge={bridge()} topProfitLeak={dataInsufficientLeak()} />
    );
    const section = getByTestId("cockpit-profit-leak-section");
    expect(section).toBeDefined();
    expect(queryByText("Profit leak detected")).toBeNull();
    expect(getByText("No profit leak detected yet")).toBeInTheDocument();
    // The body's own explanation is preserved unchanged.
    expect(
      getByText("No clear profit-leak signal yet — OpsIQ needs the listed data before it can point to a leak.")
    ).toBeInTheDocument();
  });

  it("does not render a meaningless 'Area: data' line for the DATA_INSUFFICIENT placeholder", () => {
    const { queryByTestId } = render(<MinimumOwnerCockpit bridge={bridge()} topProfitLeak={dataInsufficientLeak()} />);
    expect(queryByTestId("cockpit-profit-leak-area")).toBeNull();
  });

  it("never renders the estimated-impact figure for DATA_INSUFFICIENT (no rangeLow to show)", () => {
    const { queryByTestId } = render(<MinimumOwnerCockpit bridge={bridge()} topProfitLeak={dataInsufficientLeak()} />);
    expect(queryByTestId("cockpit-profit-leak-impact")).toBeNull();
  });

  it("keeps the 'detected' heading, Area, impact range, and explanation for a genuine leak (unchanged behavior)", () => {
    const { getByText, getByTestId } = render(<MinimumOwnerCockpit bridge={bridge()} topProfitLeak={realLeak()} />);
    expect(getByText("Profit leak detected")).toBeInTheDocument();
    expect(getByTestId("cockpit-profit-leak-area")).toHaveTextContent("Area: pricing");
    expect(getByTestId("cockpit-profit-leak-impact")).toHaveTextContent("Estimated impact: 2,000 – 4,000");
    expect(getByText("Discounting is eating into margin more than usual this period.")).toBeInTheDocument();
  });

  it("does not render the section at all when topProfitLeak is null (no now-view signal yet)", () => {
    const { queryByTestId } = render(<MinimumOwnerCockpit bridge={bridge()} topProfitLeak={null} />);
    expect(queryByTestId("cockpit-profit-leak-section")).toBeNull();
  });
});

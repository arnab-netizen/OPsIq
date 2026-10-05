/**
 * A2 — Portfolio page renders investment abstention visibly (and keeps the card for a genuine recommendation).
 * The page only renders what the server view says; it holds no eligibility logic.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, cleanup, screen, waitFor } from "@testing-library/react";
import OwnerPortfolioPage from "@/app/(authenticated)/owner/portfolio/page";

const BIZ = { businessId: "A", name: "Alpha", hasData: true, overallHealthScore: 70, survivalRiskScore: 20, growthOpportunityScore: 90, executionRiskScore: 10, financialScore: 70, salesScore: 70, operationsScore: null, cashflowScore: 70, executionScore: null };

function view(over: Record<string, unknown>) {
  return { hasData: true, businessCount: 1, portfolioHealthScore: 70, businesses: [BIZ], ranking: { bestGrowthCandidateBusinessId: "A" }, top3Priorities: [], riskAlerts: [], ...over };
}
function mockView(v: unknown) {
  vi.stubGlobal("fetch", vi.fn(async () => ({ ok: true, status: 200, json: async () => v }) as Response));
}

describe("Portfolio page — investment surface", () => {
  beforeEach(() => vi.unstubAllGlobals());
  afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

  it("a genuine recommendation keeps its card", async () => {
    mockView(view({
      investmentRecommendation: { businessId: "A", businessName: "Alpha", reason: "Because." },
      investmentAssessment: { status: "RECOMMENDED", summary: "s", held: [] },
    }));
    render(<OwnerPortfolioPage />);
    await waitFor(() => expect(screen.getByText("Investment recommendation")).toBeTruthy());
    expect(screen.getByText("Because.")).toBeTruthy();
  });

  it("a held business shows 'on hold' with why and what must happen first, and no recommendation card", async () => {
    mockView(view({
      investmentRecommendation: null,
      investmentAssessment: {
        status: "HELD", summary: "Investment recommendation on hold: not yet supported.",
        held: [{ businessId: "A", businessName: "Alpha", ownerStatement: "OpsIQ cannot support this decision yet: information it needs is missing.", reasons: ["Critical information is missing."], nextStep: "Provide the missing figures." }],
      },
    }));
    render(<OwnerPortfolioPage />);
    await waitFor(() => expect(screen.getByText("Investment recommendation on hold")).toBeTruthy());
    expect(screen.queryByText("Investment recommendation")).toBeNull();
    expect(screen.getByText(/cannot support this decision yet/)).toBeTruthy();
    expect(screen.getByText(/Provide the missing figures/)).toBeTruthy();
  });

  it("no qualifying candidate is stated, not silently omitted", async () => {
    mockView(view({
      investmentRecommendation: null,
      investmentAssessment: { status: "NO_QUALIFYING_CANDIDATE", summary: "No business currently meets the criteria.", held: [] },
    }));
    render(<OwnerPortfolioPage />);
    await waitFor(() => expect(screen.getByText("No investment recommendation")).toBeTruthy());
  });

  it("the best-growth-candidate line is labelled a ranking, not advice", async () => {
    mockView(view({ investmentRecommendation: null, investmentAssessment: { status: "HELD", summary: "x", held: [] } }));
    render(<OwnerPortfolioPage />);
    await waitFor(() => expect(screen.getByText(/a ranking only/)).toBeTruthy());
  });
});

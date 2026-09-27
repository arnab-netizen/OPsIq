/**
 * /owner/first-value disposition (final review): any OWNER_VIEW holder can load it, and its API elects
 * a "recommended first action" from engagement data. The page must never present that as the owner's
 * first action — it renders the ONE canonical owner decision instead (the same answer Home shows).
 */
import { describe, it, expect, afterEach, vi } from "vitest";
import { render, cleanup, screen, waitFor } from "@testing-library/react";
import FirstValuePage from "@/app/(authenticated)/owner/first-value/page";
import { resolveOwnerDecision } from "@/domain/owner-spine/owner-decision";

const activeBusiness = { activeBusinessId: "biz-2" as string | null };
vi.mock("@/context/active-business-context", () => ({ useActiveBusiness: () => activeBusiness }));

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const DECISION = JSON.parse(JSON.stringify(resolveOwnerDecision({
  businessId: "b", workspaceId: "w",
  candidates: [{
    candidateId: "domain_action:cashflow:a1", businessId: "b", workspaceId: "w", source: "domain_action", domain: "cashflow",
    sourceId: "a1", priorityClass: "SURVIVAL_CASH", findingCode: "CF_LOW_RUNWAY", findingId: null, title: "Protect your cash runway",
    explanation: "", severity: "high", priorityScore: 60, expectedImpactScore: 50, confidence: 0.8, effortScore: 30, status: "proposed",
    ownerActionRequired: true, blocking: false, evidence: [], missingData: [], verificationMetric: null, evidenceAsOf: null, stale: false,
    exclusion: null, targetRoute: "/owner/cashflow",
  }],
  diagnosedDomains: ["cashflow"],
  dataSufficiency: { status: "sufficient", lowestDataConfidenceScore: 90, lowConfidenceDomains: [], missingCriticalData: [] },
  staleDomains: [], strategy: null, reassessment: { days: 7, reason: "weekly" }, previous: null, events: [], now: new Date("2026-09-27T00:00:00Z"),
})));

const FIRST_VALUE = {
  workspaceId: "w", isDemo: false, state: "READY", confidence: "MEDIUM_CONFIDENCE", businessSnapshot: null,
  topRisks: [{ id: "r1", description: "Engagement risk", impact: "i", severity: "HIGH", confidenceState: "MEDIUM_CONFIDENCE" }],
  topOpportunities: [],
  recommendedFirstAction: {
    id: "x", action: "Consultant engagement action", reason: "from the engagement", expectedImpact: "", effort: "MEDIUM", risk: "MEDIUM",
    evidenceRefs: [], firstStep: "s", stopCondition: "c", confidenceState: "HIGH_CONFIDENCE", recommendedPriority: "HIGH", createdAt: "2026-09-01T00:00:00Z",
  },
  recommendedFirstActionReason: "ACTION_READY_FOR_EXECUTION",
  missingDataAreas: [], safetyWarnings: [],
  dataReadiness: { hasEngagement: true, hasFinding: true, hasAction: true, hasKPI: false, percentComplete: 60 },
  generatedAt: "2026-09-27T00:00:00Z",
};

const calls: string[] = [];
function stub(home: unknown, homeOk = true) {
  calls.length = 0;
  vi.stubGlobal("fetch", vi.fn((input: RequestInfo | URL) => {
    const url = String(input);
    calls.push(url);
    const isFirstValue = url.includes("/api/owner/first-value");
    const ok = isFirstValue || homeOk;
    return Promise.resolve({ ok, status: ok ? 200 : 500, json: async () => (isFirstValue ? FIRST_VALUE : home) });
  }));
}

describe("/owner/first-value never elects its own first action", () => {
  it("renders the canonical main target and never the engagement 'Recommended First Action'", async () => {
    stub({ currentOwnerDecision: DECISION });
    render(<FirstValuePage />);
    await waitFor(() => expect(screen.getByTestId("owner-decision-title").textContent).toBe("Protect your cash runway"));
    expect(screen.queryByText(/Recommended First Action/)).toBeNull();
    expect(screen.queryByText("Consultant engagement action")).toBeNull();
  });

  it("without a canonical decision it says so honestly — it does not fall back to the engagement action", async () => {
    stub({ currentOwnerDecision: null });
    render(<FirstValuePage />);
    await waitFor(() => expect(screen.getByTestId("first-value-no-decision")).toBeTruthy());
    expect(screen.queryByText("Consultant engagement action")).toBeNull();
  });

  it("reads the decision for the ACTIVE business and renders it before the engagement context", async () => {
    activeBusiness.activeBusinessId = "biz-2";
    stub({ currentOwnerDecision: DECISION });
    const { container } = render(<FirstValuePage />);
    await waitFor(() => expect(screen.getByTestId("owner-decision-title")).toBeTruthy());
    expect(calls).toContain("/api/owner/home?businessId=biz-2");
    const html = container.innerHTML;
    expect(html.indexOf("owner-decision-title")).toBeLessThan(html.indexOf("Engagement risk"));
    expect(screen.getByText(/Engagement risks/).textContent).toMatch(/not an action order/);
  });

  it("a failed decision load is shown as a failure, never as 'no main target'", async () => {
    stub(null, false);
    render(<FirstValuePage />);
    await waitFor(() => expect(screen.getByTestId("first-value-decision-error")).toBeTruthy());
    expect(screen.queryByTestId("first-value-no-decision")).toBeNull();
  });
});

/**
 * /owner/first-value disposition (final review): any OWNER_VIEW holder can load it, and its API elects
 * a "recommended first action" from engagement data. The page must never present that as the owner's
 * first action — it renders the ONE canonical owner decision instead (the same answer Home shows).
 */
import { describe, it, expect, afterEach, vi } from "vitest";
import { render, cleanup, screen, waitFor } from "@testing-library/react";
import FirstValuePage from "@/app/(authenticated)/owner/first-value/page";
import { resolveOwnerDecision } from "@/domain/owner-spine/owner-decision";

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
  topRisks: [], topOpportunities: [],
  recommendedFirstAction: {
    id: "x", action: "Consultant engagement action", reason: "from the engagement", expectedImpact: "", effort: "MEDIUM", risk: "MEDIUM",
    evidenceRefs: [], firstStep: "s", stopCondition: "c", confidenceState: "HIGH_CONFIDENCE", recommendedPriority: "HIGH", createdAt: "2026-09-01T00:00:00Z",
  },
  recommendedFirstActionReason: "ACTION_READY_FOR_EXECUTION",
  missingDataAreas: [], safetyWarnings: [],
  dataReadiness: { hasEngagement: true, hasFinding: true, hasAction: true, hasKPI: false, percentComplete: 60 },
  generatedAt: "2026-09-27T00:00:00Z",
};

function stub(home: unknown) {
  vi.stubGlobal("fetch", vi.fn((input: RequestInfo | URL) => {
    const url = String(input);
    const body = url.includes("/api/owner/first-value") ? FIRST_VALUE : home;
    return Promise.resolve({ ok: true, status: 200, json: async () => body });
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
});

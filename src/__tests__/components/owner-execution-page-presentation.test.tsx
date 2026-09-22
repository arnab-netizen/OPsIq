/**
 * /owner/execution — presentation-only regression proof (UX-05B, cosmetic scope only).
 *
 * Covers exactly one authorized candidate from docs/opsiq/ux/UX-05A-ACTIONS-LAYER-CONTRACT.md:
 *  - Candidate 3: ACTION_STATUS_LABEL was missing "cancelled" (RECOVERY_ACTION_STATUSES' own
 *    terminal value) and would have rendered the literal lowercase token.
 *
 * Candidate 2 (conditional -- operator-safe error governance on this page's six catch paths) has
 * its own dedicated suite, src/__tests__/owner-execution/execution-page-owner-safe-errors.test.tsx,
 * mirroring the {finance,sales,operations}-page-owner-safe-errors.test.tsx precedent and covering
 * all six catch paths individually; it is no longer tested here.
 *
 * No race-guard (Candidate 1) behavior is implemented or tested here -- that remains a separate,
 * functional-correctness change requiring its own authorization.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, cleanup, screen } from "@testing-library/react";
import OwnerExecutionPage from "@/app/(authenticated)/owner/execution/page";
import { ActiveBusinessProvider } from "@/context/active-business-context";

const BIZ_A = { id: "biz-a", name: "Trinity Services", currency: "USD" };

function renderWithProvider(ui: React.ReactElement) {
  return render(<ActiveBusinessProvider>{ui}</ActiveBusinessProvider>);
}

function dashboardWithCancelledAction() {
  return {
    businesses: [BIZ_A],
    selectedBusinessId: BIZ_A.id,
    hasData: true,
    latestSnapshot: { id: "snap-1", missingCriticalData: [] },
    missingCriticalData: [],
    domainScore: {
      domain: "sop",
      healthScore: 70,
      riskScore: 20,
      opportunityScore: 30,
      dataConfidenceScore: 90,
      executionState: "ON_TRACK",
    },
    recommendedNextAction: null,
    latestCycle: {
      id: "cycle-1",
      sequenceNumber: 1,
      executionState: "ON_TRACK",
      healthScore: 70,
      riskScore: 20,
      opportunityScore: 30,
      dataConfidenceScore: 90,
      findings: [],
      actions: [
        {
          id: "action-1",
          title: "Follow up with overdue accounts",
          description: "Contact the three overdue accounts.",
          ownerRole: "owner",
          priorityScore: 80,
          expectedTimeframeDays: 3,
          verificationMetric: "actionsOverdue",
          verificationMethod: "recheck",
          status: "cancelled",
          verifications: [],
        },
      ],
    },
    cycleHistory: [],
  };
}

beforeEach(() => {
  window.localStorage.clear();
  window.sessionStorage.clear();
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("Candidate 3 — /owner/execution 'cancelled' action label", () => {
  it("renders 'Cancelled', never the raw lowercase 'cancelled' token", async () => {
    window.localStorage.setItem("opsiq.lastActiveBusinessId", BIZ_A.id);
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: string | URL) => {
        const url = typeof input === "string" ? input : input.toString();
        if (url.includes("/api/owner/businesses")) {
          return { ok: true, status: 200, json: async () => ({ businesses: [BIZ_A] }) } as Response;
        }
        if (url.includes("/api/owner/sop/dashboard")) {
          return { ok: true, status: 200, json: async () => dashboardWithCancelledAction() } as Response;
        }
        return { ok: true, status: 200, json: async () => ({}) } as Response;
      })
    );

    renderWithProvider(<OwnerExecutionPage />);

    expect(await screen.findByText("Cancelled")).toBeInTheDocument();
    expect(screen.queryByText("cancelled")).not.toBeInTheDocument();
  });
});

/**
 * Owner Sales — FindingCard / DiagnosisEmptyState adoption (UX-06 Section S harmonization).
 *
 * `owner/sales/page.tsx` previously rendered its own bespoke findings block and its own
 * bespoke single-sentence empty-state box instead of the shared `FindingCard`/
 * `DiagnosisEmptyState` components Money and Operations already use for the identical data
 * shape (`OwnerSalesFinding` has the same fields as `OwnerFinanceFinding`/
 * `OwnerOperationsFinding`). This file drives the real `OwnerSalesPage` component end-to-end
 * with mocked network/context (per the existing `owner-sales-inline-actions.test.tsx`
 * convention) -- `FindingCard` and `DiagnosisEmptyState` are never mocked away, so these
 * assertions exercise the real shared components' actual rendered output, not a stand-in.
 *
 * Proves: every finding field previously shown is still shown; the four distinct
 * no-business/no-snapshot/snapshot-no-diagnosis/zero-findings states remain visually and
 * textually distinct; action controls and their focus/ARIA behavior are untouched.
 */
import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import { render, cleanup, screen, fireEvent, act } from "@testing-library/react";
import OwnerSalesPage from "@/app/(authenticated)/owner/sales/page";
import { ActiveBusinessProvider } from "@/context/active-business-context";

const BIZ_A = { id: "11111111-1111-4111-8111-111111111111", name: "ZZ-TEST-SALES-BIZ", currency: "USD" };

function ok(data: unknown): Response {
  return { ok: true, status: 200, json: async () => data } as Response;
}

function finding(overrides: Record<string, unknown> = {}) {
  return {
    id: "finding-1",
    findingType: "risk",
    code: "SALES_LOST_CUSTOMER_RATE_001",
    title: "Customers are churning fast",
    summary: "A large share of the customer base is being lost.",
    sourceMetric: "lostCustomerRatePercent",
    sourceValue: 57.1,
    threshold: 35,
    severity: "critical",
    confidence: 0.8,
    impactScore: 90,
    urgencyScore: 85,
    evidence: ["lost customer rate % = 57.1 > 35"],
    missingData: [],
    verificationMetric: "lostCustomerRatePercent",
    ...overrides,
  };
}

function action(overrides: Record<string, unknown> = {}) {
  return {
    id: "action-1",
    title: "Win back lost customers",
    status: "in_progress",
    ownerRole: "owner",
    priorityScore: 100,
    expectedTimeframeDays: 7,
    description: "Build a list of recently lost customers and run a focused win-back outreach.",
    verificationMetric: "lostCustomerRatePercent",
    verificationMethod: "Compare lost-customer rate before/after.",
    ...overrides,
  };
}

function dashboardFixture(overrides: Record<string, unknown> = {}) {
  return {
    businesses: [BIZ_A],
    selectedBusinessId: BIZ_A.id,
    hasData: false,
    latestSnapshot: null,
    latestCycle: null,
    domainScore: null,
    recommendedNextAction: null,
    missingCriticalData: [],
    cycleHistory: [],
    ...overrides,
  };
}

function populatedDashboardFixture(findings: unknown[] = [finding()], actions: unknown[] = [action()]) {
  return dashboardFixture({
    hasData: true,
    latestSnapshot: { id: "snap-1" },
    latestCycle: {
      id: "cycle-1",
      sequenceNumber: 1,
      healthScore: 44,
      riskScore: 44,
      opportunityScore: 46,
      dataConfidenceScore: 80,
      salesState: "WEAK",
      findings,
      actions,
    },
    recommendedNextAction: actions[0] ?? null,
  });
}

let dashboardResponse: unknown;

function installFetchMock() {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: string | URL, init?: RequestInit) => {
      const url = typeof input === "string" ? input : input.toString();
      const method = (init?.method ?? "GET").toUpperCase();

      if (url.includes("/api/owner/businesses")) return ok({ businesses: [BIZ_A] });
      if (method === "GET" && url.includes("/api/owner/sales/dashboard")) return ok(dashboardResponse);
      return ok({});
    })
  );
}

function renderPage() {
  return render(
    <ActiveBusinessProvider>
      <OwnerSalesPage />
    </ActiveBusinessProvider>
  );
}

async function flush() {
  await act(async () => {
    for (let i = 0; i < 8; i++) await Promise.resolve();
  });
}

beforeEach(() => {
  installFetchMock();
  window.sessionStorage.clear();
  window.localStorage.clear();
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("Owner Sales — no-snapshot vs snapshot-no-diagnosis are distinct DiagnosisEmptyState renders", () => {
  it("no snapshot at all: 'Not enough sales information yet'", async () => {
    dashboardResponse = dashboardFixture({ latestSnapshot: null });
    renderPage();
    await flush();

    expect(await screen.findByText("Not enough sales information yet")).toBeInTheDocument();
    expect(screen.getByText(/no sales snapshot has been added for this business/i)).toBeInTheDocument();
    expect(screen.queryByText("Ready for a first diagnosis")).not.toBeInTheDocument();
  });

  it("snapshot present, diagnosis not yet run: 'Ready for a first diagnosis'", async () => {
    dashboardResponse = dashboardFixture({ latestSnapshot: { id: "snap-1" } });
    renderPage();
    await flush();

    expect(await screen.findByText("Ready for a first diagnosis")).toBeInTheDocument();
    expect(screen.getByText(/click.*Run sales diagnosis.*above to generate real findings/i)).toBeInTheDocument();
    expect(screen.queryByText("Not enough sales information yet")).not.toBeInTheDocument();
  });

  it("zero businesses: the pre-existing, unrelated business-level empty state is untouched", async () => {
    dashboardResponse = dashboardFixture();
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: string | URL) => {
        const url = typeof input === "string" ? input : input.toString();
        if (url.includes("/api/owner/businesses")) return ok({ businesses: [] });
        return ok({});
      })
    );
    renderPage();
    await flush();

    expect(await screen.findByText(/No businesses yet/i)).toBeInTheDocument();
    // Never reaches DiagnosisEmptyState/FindingCard territory when there is no business at all.
    expect(screen.queryByText("Ready for a first diagnosis")).not.toBeInTheDocument();
  });
});

describe("Owner Sales — FindingCard adoption preserves every previously-shown field", () => {
  it("renders title, finding type, severity, summary, metric/value/threshold, confidence, evidence, and verification metric", async () => {
    dashboardResponse = populatedDashboardFixture([
      finding({
        title: "Customers are churning fast",
        findingType: "risk",
        severity: "critical",
        summary: "A large share of the customer base is being lost.",
        sourceMetric: "lostCustomerRatePercent",
        sourceValue: 57.1,
        threshold: 35,
        confidence: 0.8,
        evidence: ["lost customer rate % = 57.1 > 35"],
        verificationMetric: "lostCustomerRatePercent",
      }),
    ]);
    renderPage();
    await flush();

    expect(await screen.findByText("Customers are churning fast")).toBeInTheDocument();
    expect(screen.getByText("What OpsIQ found")).toBeInTheDocument();
    expect(screen.getByText("Risk")).toBeInTheDocument();
    expect(screen.getByText("Critical")).toBeInTheDocument();
    expect(screen.getByText("A large share of the customer base is being lost.")).toBeInTheDocument();
    // Evidence section: measured value, threshold comparison, confidence.
    expect(screen.getByText("Evidence")).toBeInTheDocument();
    expect(screen.getByText(/Measured:/)).toBeInTheDocument();
    // "57.1" legitimately appears twice: once in the measured-value line, once inside the
    // evidence line ("lost customer rate % = 57.1 > 35") -- both are asserted separately below.
    expect(screen.getAllByText(/57\.1/).length).toBeGreaterThanOrEqual(2);
    expect(screen.getByText(/compared against/i)).toBeInTheDocument();
    expect(screen.getByText(/threshold of 35/i)).toBeInTheDocument();
    expect(screen.getByText(/Supporting detail:/)).toBeInTheDocument();
    expect(screen.getByText(/lost customer rate % = 57.1 > 35/i)).toBeInTheDocument();
    expect(screen.getByText(/How sure OpsIQ is:/)).toBeInTheDocument();
    expect(screen.getByText(/evidence strength 80\/100/)).toBeInTheDocument();
    expect(screen.getByText(/verify by re-checking/i)).toBeInTheDocument();
  });

  it("a finding with no evidence and no verification metric omits those lines without crashing", async () => {
    dashboardResponse = populatedDashboardFixture([
      finding({ evidence: [], verificationMetric: null }),
    ]);
    renderPage();
    await flush();

    expect(await screen.findByText("Customers are churning fast")).toBeInTheDocument();
    expect(screen.queryByText(/Supporting detail:/)).not.toBeInTheDocument();
    expect(screen.queryByText(/verify by re-checking/i)).not.toBeInTheDocument();
  });

  it("a cycle with zero findings still renders the unchanged 'No sales issues detected.' text", async () => {
    dashboardResponse = populatedDashboardFixture([]);
    renderPage();
    await flush();

    expect(await screen.findByText("Findings (0)")).toBeInTheDocument();
    expect(screen.getByText("No sales issues detected.")).toBeInTheDocument();
  });

  it("multiple findings each render as their own FindingCard, in the order returned", async () => {
    dashboardResponse = populatedDashboardFixture([
      finding({ id: "f1", title: "Customers are churning fast", findingType: "risk" }),
      finding({ id: "f2", title: "Improve repeat purchase", findingType: "opportunity", severity: "low" }),
    ]);
    renderPage();
    await flush();

    expect(await screen.findByText("Findings (2)")).toBeInTheDocument();
    expect(screen.getByText("Customers are churning fast")).toBeInTheDocument();
    expect(screen.getByText("Improve repeat purchase")).toBeInTheDocument();
    expect(screen.getByText("Opportunity")).toBeInTheDocument();
  });
});

describe("Owner Sales — action controls and focus/ARIA behavior are untouched by this change", () => {
  it("action rows still render status-appropriate controls (Complete) unaffected by the findings-block swap", async () => {
    dashboardResponse = populatedDashboardFixture([finding()], [action({ status: "in_progress" })]);
    renderPage();
    await flush();

    const completeBtn = await screen.findByRole("button", { name: "Complete" });
    expect(completeBtn).toBeInTheDocument();
    expect(completeBtn).toHaveAttribute("aria-expanded", "false");

    fireEvent.click(completeBtn);
    expect(completeBtn).toHaveAttribute("aria-expanded", "true");
    expect(completeBtn).toHaveAttribute("aria-controls");
    expect(await screen.findByText("Complete action")).toBeInTheDocument();
  });

  it("Verify outcome control is present and independent of the findings section", async () => {
    dashboardResponse = populatedDashboardFixture([finding()], [action({ status: "in_progress" })]);
    renderPage();
    await flush();

    expect(await screen.findByRole("button", { name: "Verify outcome" })).toBeInTheDocument();
  });
});

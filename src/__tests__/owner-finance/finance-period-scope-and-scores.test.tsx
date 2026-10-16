// @vitest-environment jsdom
/**
 * Money page, rendered end-to-end (fetch mocked at the network boundary):
 *  - PERIOD SCOPE: a reading states which evidence period it rests on and that other periods are not combined; "still missing"
 *    is labelled for that period (hostile-audit "hidden period semantics").
 *  - UNKNOWN is never shown as healthy / zero-risk (WITHHELD: no number; PARTIAL: "None found so far", not "0/100").
 *  - Profit and margin are shown when KNOWN and explained when UNKNOWN.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, cleanup, screen } from "@testing-library/react";
import OwnerFinancePage from "@/app/(authenticated)/owner/finance/page";
import { ActiveBusinessProvider } from "@/context/active-business-context";

const BIZ = { id: "biz-a", name: "Acme Bakery", currency: "INR" };
let dashboard: Record<string, unknown>;

function payload(over: { cycle?: Record<string, unknown>; score?: Record<string, unknown>; missing?: string[]; profit?: unknown }) {
  return {
    businesses: [BIZ],
    selectedBusinessId: BIZ.id,
    hasData: true,
    latestSnapshot: { id: "snap-1" },
    missingCriticalData: over.missing ?? [],
    domainScore: { domain: "finance", healthScore: 75, riskScore: 0, opportunityScore: 0, dataConfidenceScore: 50, survivalState: "WATCH", scoreAvailability: "WITHHELD", ...over.score },
    recommendedNextAction: null,
    profitPosition: over.profit ?? null,
    latestCycle: {
      id: "cycle-1", sequenceNumber: 3, survivalState: "WATCH", overallHealthScore: 75, survivalRiskScore: 0, growthOpportunityScore: 0, dataConfidenceScore: 50,
      snapshot: { periodStart: "2026-09-01T00:00:00.000Z", periodEnd: "2026-09-30T00:00:00.000Z" },
      findings: [], actions: [], ...over.cycle,
    },
    cycleHistory: [],
  };
}

function renderPage() {
  return render(
    <ActiveBusinessProvider>
      <OwnerFinancePage />
    </ActiveBusinessProvider>,
  );
}

beforeEach(() => {
  window.localStorage.clear();
  window.sessionStorage.clear();
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: string | URL) => {
      const url = typeof input === "string" ? input : input.toString();
      if (url.includes("/api/owner/businesses")) return { ok: true, status: 200, json: async () => ({ businesses: [BIZ] }) } as Response;
      if (url.includes("/api/owner/finance/dashboard")) return { ok: true, status: 200, json: async () => dashboard } as Response;
      return { ok: true, status: 200, json: async () => ({}) } as Response;
    }),
  );
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("Money page: period scope disclosure", () => {
  it("names the period the reading rests on and says other periods are kept but not combined", async () => {
    dashboard = payload({ missing: ["revenue"] });
    renderPage();
    const note = await screen.findByTestId("finance-period-scope");
    expect(note.textContent).toMatch(/September 2026/);
    expect(note.textContent).toMatch(/figures only/);
    expect(note.textContent).toMatch(/other periods are kept on record but are not combined/);
  });
  it("labels what is still missing for that period", async () => {
    dashboard = payload({ missing: ["revenue"] });
    renderPage();
    await screen.findByTestId("finance-period-scope");
    expect(screen.getAllByText(/What is still missing for September 2026/i).length).toBeGreaterThan(0);
  });
  it("a partial calendar period is named by its dates, never rounded to a month", async () => {
    dashboard = payload({ cycle: { snapshot: { periodStart: "2026-09-05T00:00:00.000Z", periodEnd: "2026-09-20T00:00:00.000Z" } } });
    renderPage();
    const note = await screen.findByTestId("finance-period-scope");
    expect(note.textContent).toMatch(/5 Sep 2026 to 20 Sep 2026/);
  });
});

describe("Money page: UNKNOWN is never scored as healthy", () => {
  it("WITHHELD (revenue UNKNOWN): no 75/0/0 numbers are shown, only 'Not scored yet' and the reason", async () => {
    dashboard = payload({ missing: ["revenue"], score: { scoreAvailability: "WITHHELD" } });
    renderPage();
    const scores = await screen.findByTestId("finance-scores");
    expect(scores.getAttribute("data-score-availability")).toBe("WITHHELD");
    expect(scores.textContent).not.toMatch(/\d+\/100/);
    expect(scores.textContent).toMatch(/Not scored yet/);
    expect((await screen.findByTestId("finance-score-availability-note")).textContent).toMatch(/missing information/);
  });
  it("PARTIAL (cash UNKNOWN): risk 0 reads 'None found so far', never '0/100'", async () => {
    dashboard = payload({ score: { scoreAvailability: "PARTIAL", healthScore: 80, dataConfidenceScore: 90 }, cycle: { dataConfidenceScore: 90 } });
    renderPage();
    const risk = await screen.findByTestId("finance-score-risk");
    expect(risk.textContent).toBe("None found so far");
    expect((await screen.findByTestId("finance-score-opportunity")).textContent).toBe("None found so far");
    expect((await screen.findByTestId("finance-score-health")).textContent).toBe("80/100");
  });
  it("FULL (complete evidence): a measured 0 is shown as 0/100 with no limitation note", async () => {
    dashboard = payload({ score: { scoreAvailability: "FULL", healthScore: 90, dataConfidenceScore: 95 }, cycle: { dataConfidenceScore: 95 } });
    renderPage();
    expect((await screen.findByTestId("finance-score-risk")).textContent).toBe("0/100");
    expect(screen.queryByTestId("finance-score-availability-note")).toBeNull();
  });
});

describe("Money page: profit and margin", () => {
  it("KNOWN: shows the profit and the exact margin", async () => {
    dashboard = payload({
      score: { scoreAvailability: "FULL", dataConfidenceScore: 95 },
      profit: { status: "KNOWN", netProfit: 25000, marginPct: 31.25, currency: "INR", headline: "Net profit of INR 25,000", marginText: "Net margin 31.25%" },
    });
    renderPage();
    const el = await screen.findByTestId("finance-profit-position");
    expect(el.textContent).toMatch(/Net profit of INR 25,000 · Net margin 31\.25%/);
  });
  it("UNKNOWN: says why instead of showing a partial figure", async () => {
    dashboard = payload({ profit: { status: "UNKNOWN", reason: "Some cost information is missing (variable costs), so OpsIQ cannot calculate total profit or margin yet." } });
    renderPage();
    const el = await screen.findByTestId("finance-profit-position");
    expect(el.getAttribute("data-profit-status")).toBe("UNKNOWN");
    expect(el.textContent).toMatch(/variable costs/);
    expect(el.textContent).not.toMatch(/Net profit of/);
  });
});

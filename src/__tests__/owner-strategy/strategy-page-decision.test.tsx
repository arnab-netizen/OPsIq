/**
 * Owner Strategy page — decision-first presentation (Decision Overhaul, owner-facing UI).
 *
 * Drives the real page (fetch mocked at the network boundary) with decisions produced by the
 * real pure engine. Pins the hierarchy (decision → reasons → Profit/Cash/Downside/Evidence →
 * conditions → one next step), demoted /100 scores, on-hold carried actions, history labelled
 * with legacy ratings, unit-explicit input labels, and no NaN/undefined/null text.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, cleanup, screen, within, fireEvent } from "@testing-library/react";
import { ActiveBusinessProvider } from "@/context/active-business-context";
import OwnerStrategyPage from "@/app/(authenticated)/owner/strategy/page";
import { jsonResponse } from "../finding-label-lookup-fixtures";
import { deriveStrategyDecision, arbitrateStrategyActionRows, orderByDecisionFit, type StrategySnapshotInput } from "@/domain/owner-strategy";

const BIZ = { id: "biz-a", name: "Alpha Laundry", currency: "INR", isActive: true };
const NOW = new Date("2026-09-26T00:00:00Z");

function input(over: Partial<StrategySnapshotInput>): StrategySnapshotInput {
  return {
    periodStart: "2026-09-01",
    periodEnd: "2026-09-30",
    currency: "INR",
    currentRevenue: 500000,
    timeToImpactMonths: 2,
    capacityImpactPct: 10,
    staffImpact: 1,
    riskLevel: "medium",
    ...over,
  };
}

function action(over: Record<string, unknown>) {
  return {
    ownerRole: "owner",
    priorityScore: 60,
    effortScore: 30,
    expectedImpactScore: 50,
    confidence: 0.9,
    verificationMetric: "affordabilityRatio",
    verificationMethod: "Re-run the scenario.",
    expectedTimeframeDays: 14,
    description: "desc",
    verifications: [],
    ...over,
  };
}

function dashboard(decisionInput: StrategySnapshotInput, findings: unknown[] = []) {
  const decision = deriveStrategyDecision(decisionInput, { now: NOW });
  const rows = [
    action({ id: "a-primary", title: decision.primaryStep.title, recommendationCode: decision.primaryStep.recommendationCode, findingCode: decision.primaryStep.findingCode, status: "proposed", description: decision.primaryStep.description }),
    action({ id: "a-pursue", title: "Pursue this high-return option", recommendationCode: "STRREC_PURSUE", findingCode: "STR_OPP_STRONG_RETURN", status: "proposed", carriedFromCycleSequence: 1, stillFlaggedByLatestDiagnosis: true }),
  ];
  const actions = orderByDecisionFit(arbitrateStrategyActionRows(rows, decision));
  return {
    businesses: [BIZ],
    selectedBusinessId: BIZ.id,
    hasData: true,
    latestSnapshot: { id: "snap-2" },
    missingCriticalData: [],
    domainScore: { domain: "strategy", healthScore: 30, riskScore: 55, opportunityScore: 60, dataConfidenceScore: 95, strategyState: "RISKY" },
    recommendedNextAction: actions.find((a) => a.decisionFit === "primary") ?? null,
    // Server contract: the decision's own step is the next step while its row is canonically eligible.
    decisionStep: { state: actions.some((a) => a.decisionFit === "primary") ? "current" : "not_listed", replacedBecause: null },
    decision,
    latestCycle: {
      id: "cycle-2",
      sequenceNumber: 2,
      strategyState: "RISKY",
      healthScore: 30,
      riskScore: 55,
      opportunityScore: 60,
      dataConfidenceScore: 95,
      snapshot: { optionName: "Second van" },
      findings,
      actions,
    },
    cycleHistory: [
      { id: "cycle-2", sequenceNumber: 2, strategyState: "RISKY", verdictSource: "stored_legacy_state", healthScore: 30, findingCount: 1, actionCount: 2, createdAt: "2026-09-26T00:00:00.000Z" },
      { id: "cycle-1", sequenceNumber: 1, strategyState: "STRONG_GO", verdictSource: "stored_legacy_state", healthScore: 80, findingCount: 3, actionCount: 3, createdAt: "2026-08-01T00:00:00.000Z" },
    ],
  };
}

function installFetch(body: unknown) {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (req: string | URL) => {
      const url = typeof req === "string" ? req : req.toString();
      if (url === "/api/owner/businesses") return jsonResponse({ businesses: [BIZ] });
      if (url.startsWith("/api/owner/strategy/dashboard")) return jsonResponse(body);
      return jsonResponse({});
    })
  );
}

function renderPage() {
  return render(
    <ActiveBusinessProvider>
      <OwnerStrategyPage />
    </ActiveBusinessProvider>
  );
}

beforeEach(() => {
  window.sessionStorage.clear();
  window.localStorage.clear();
  window.sessionStorage.setItem("opsiq.activeBusinessId", BIZ.id);
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

const KNOWN_CASE = input({ investmentRequired: 150000, cashAvailable: 100000, expectedRevenueChange: 30000, costChange: 12000 });

describe("Strategy page — decision first", () => {
  it("NOT_YET: headline, gap, four support lines, one next step; scores demoted", async () => {
    installFetch(dashboard(KNOWN_CASE));
    renderPage();
    const card = await screen.findByTestId("strategy-decision");
    expect(card.getAttribute("data-decision")).toBe("NOT_YET");
    expect(within(card).getByRole("heading", { level: 2 }).textContent).toBe("Not yet");
    expect(within(card).getByText("You're ₹50,000 short.")).toBeTruthy();
    expect(screen.getByTestId("strategy-dimension-profit").textContent).toBe("Adds about ₹18,000 a month · earns back ₹1,50,000 in about 8 months.");
    expect(screen.getByTestId("strategy-dimension-cash").textContent).toBe("₹1,00,000 available for this — ₹50,000 short.");
    expect(screen.getByTestId("strategy-dimension-downside").textContent).toBe("If the extra sales come in 40% lower, this still adds about ₹6,000 a month.");
    expect(screen.getByTestId("strategy-dimension-evidence").textContent).toBe("9 of 9 inputs provided · values are owner estimates");
    const next = screen.getByTestId("strategy-next-step");
    expect(within(next).getByText("Close the ₹50,000 funding gap")).toBeTruthy();
    expect(within(next).getByText("Secure ₹50,000 of funding before committing")).toBeTruthy();
    expect(within(next).getByText("In your action list below — proposed.")).toBeTruthy();
    // Positive facts are reasons, not commands — and under "Not yet" they are not called promising.
    expect(within(card).getByText("What the numbers say")).toBeTruthy();
    expect(within(card).queryByText("Why this looks promising")).toBeNull();
    // The gap is stated once as the detail — not repeated as a "why" line.
    expect(within(card).queryByText("Why")).toBeNull();
    // The three /100 scores are not the headline: they sit in a collapsed "Detailed scores".
    const details = screen.getByText("Detailed scores").closest("details")!;
    expect(details.open).toBe(false);
    expect(within(details).getByText(/Attractiveness 30\/100/)).toBeTruthy();
    expect(card.textContent).not.toMatch(/\/100/);
    expect(screen.queryByText(/Next step within Strategy/)).toBeNull();
  });

  it("a carried Pursue is shown on hold with no Assign button; no Pursue/Size up command is recommended", async () => {
    installFetch(dashboard(KNOWN_CASE));
    renderPage();
    await screen.findByTestId("strategy-decision");
    const section = screen.getByText(/Strategy actions/).closest("section")!;
    const cards = section.querySelectorAll(".border.rounded.p-3");
    expect(cards[0].textContent).toContain("Close the ₹50,000 funding gap");
    expect(within(cards[0] as HTMLElement).getByText("Next step")).toBeTruthy();
    expect(within(cards[0] as HTMLElement).getByRole("button", { name: "Assign" })).toBeTruthy();
    const pursue = cards[1] as HTMLElement;
    expect(pursue.textContent).toContain("Not part of the current decision (not yet) — cancel it.");
    expect(pursue.textContent).toContain("How to check:");
    expect(pursue.textContent).not.toMatch(/affordability ratio|Verify /);
    expect(within(pursue).queryByRole("button", { name: "Assign" })).toBeNull();
    // It can still be closed: Cancel is offered for on-hold work.
    expect(within(pursue).getByRole("button", { name: "Cancel" })).toBeTruthy();
    expect(within(cards[0] as HTMLElement).queryByRole("button", { name: "Cancel" })).toBeNull();
    expect(screen.getByTestId("strategy-decision").textContent).not.toMatch(/pursue|size up/i);
  });

  it("blocked work can be resumed from the page; a carried note is not duplicated", async () => {
    const body = dashboard(KNOWN_CASE);
    body.latestCycle.actions = body.latestCycle.actions.map((a) =>
      a.id === "a-primary" ? { ...a, status: "blocked" } : { ...a, stillFlaggedByLatestDiagnosis: false }
    );
    installFetch(body);
    renderPage();
    await screen.findByTestId("strategy-decision");
    const cards = screen.getByText(/Strategy actions/).closest("section")!.querySelectorAll(".border.rounded.p-3");
    expect(within(cards[0] as HTMLElement).getByRole("button", { name: "Resume" })).toBeTruthy();
    expect(cards[1].textContent).not.toContain("the latest diagnosis no longer flags this");
  });

  it("history: the latest row shows the current decision; earlier rows are labelled as the previous model", async () => {
    installFetch(dashboard(KNOWN_CASE));
    renderPage();
    await screen.findByTestId("strategy-decision");
    const rows = screen.getAllByTestId("strategy-history-row");
    expect(rows[0].getAttribute("data-current")).toBe("true");
    expect(within(rows[0]).getByText("Current decision: Not yet")).toBeTruthy();
    expect(rows[0].textContent).not.toMatch(/Legacy rating/);
    // An earlier cycle keeps its stored rating, labelled as legacy — never shown as a current decision.
    expect(rows[1].getAttribute("data-current")).toBe("false");
    expect(within(rows[1]).getByText("Legacy rating: Strong go")).toBeTruthy();
    expect(within(rows[1]).getByText("Calculated using the previous Strategy model")).toBeTruthy();
    expect(rows[1].textContent).not.toMatch(/Current decision|Go ahead/);
    expect(screen.queryByText(/Stored rating/)).toBeNull();
  });

  it("NEED_INFO: 'Can't say yet', profit unknown (never scored as poor), missing values read 'not entered'", async () => {
    const missing = input({ investmentRequired: 150000, cashAvailable: 400000, costChange: 12000, riskLevel: undefined });
    const finding = {
      id: "f1", code: "STR_MISSING_RISK_LEVEL", findingType: "risk", title: "Execution risk is not chosen", summary: "s",
      sourceMetric: "riskLevel", sourceValue: null, threshold: null, severity: "medium", confidence: 1, evidence: ["riskLevel not provided"], verificationMetric: "worstMonthlyProfitDelta",
    };
    installFetch(dashboard(missing, [finding]));
    renderPage();
    const card = await screen.findByTestId("strategy-decision");
    expect(within(card).getByRole("heading", { level: 2 }).textContent).toBe("Can't say yet");
    expect(screen.getByTestId("strategy-dimension-profit").textContent).toBe("Profit not calculated — enter the expected revenue change per month.");
    expect(within(screen.getByTestId("strategy-next-step")).getByText("Enter the expected revenue change per month")).toBeTruthy();
    const details = screen.getByText("Detailed scores").closest("details")!;
    expect(details.textContent).toContain("Not scored — the profit effect is unknown");
    expect(details.textContent).not.toMatch(/Attractiveness/);
    expect(document.body.textContent).toContain("= not entered");
  });

  it("no NaN / Infinity / undefined / null text for any decision", async () => {
    const cases = [
      KNOWN_CASE,
      input({ investmentRequired: 150000, cashAvailable: 400000, expectedRevenueChange: 60000, costChange: 12000, riskLevel: "low" }),
      input({ investmentRequired: 50000, cashAvailable: 400000, expectedRevenueChange: 10000, costChange: 15000 }),
      input({ investmentRequired: 150000, expectedRevenueChange: 30000, costChange: 12000 }),
      input({ investmentRequired: 150000, cashAvailable: 400000, expectedRevenueChange: 60000, costChange: 12000, riskLevel: undefined }),
      input({}),
    ];
    for (const c of cases) {
      installFetch(dashboard(c));
      const { unmount } = renderPage();
      const card = await screen.findByTestId("strategy-decision");
      expect(document.body.textContent).not.toMatch(/NaN|Infinity|undefined|null/);
      expect(card.querySelectorAll("[data-testid^='strategy-dimension-']")).toHaveLength(4);
      unmount();
      vi.unstubAllGlobals();
    }
  });

  it("evidence names what is not entered; findings: technical numbers collapsed, no severity on upsides, invalid currency reads 'not valid'", async () => {
    const sparse = input({ investmentRequired: 150000, cashAvailable: 100000, expectedRevenueChange: 30000, costChange: 12000, staffImpact: undefined, capacityImpactPct: undefined });
    const findings = [
      { id: "f1", code: "STR_OPP_FAST_PAYBACK", findingType: "opportunity", title: "Capital comes back quickly", summary: "s", sourceMetric: "paybackMonths", sourceValue: 8.3, threshold: 18, severity: "low", confidence: 0.9, evidence: ["paybackMonths = 8.3 ≤ 18"], verificationMetric: "paybackMonths" },
      { id: "f2", code: "STR_INVALID_CURRENCY", findingType: "risk", title: "Reporting currency is invalid", summary: "s", sourceMetric: "currency", sourceValue: null, threshold: null, severity: "medium", confidence: 1, evidence: [], verificationMetric: "currency" },
    ];
    installFetch(dashboard(sparse, findings));
    renderPage();
    await screen.findByTestId("strategy-decision");
    expect(screen.getByTestId("strategy-evidence-missing").textContent).toBe("Not entered: capacity impact, staff impact");
    const section = screen.getByText(/What the evaluation found/).closest("section")!;
    const upside = within(section).getByText("Capital comes back quickly").closest("div.border-l-4") as HTMLElement;
    expect(within(upside).queryByText("Low")).toBeNull();
    expect(within(upside).getByText("Numbers behind this").closest("details")!.open).toBe(false);
    expect(section.textContent).toContain("currency = not valid");
  });

  it("scenario inputs are labelled with explicit units", async () => {
    installFetch(dashboard(KNOWN_CASE));
    renderPage();
    await screen.findByTestId("strategy-decision");
    fireEvent.click(screen.getByRole("button", { name: "+ Add scenario" }));
    for (const label of [
      "Expected revenue change per month (+/−) (INR)",
      "Expected cost change per month (+ more / − savings) (INR)",
      "Cash you can put into this (INR)",
      "Upfront investment (one-time) (INR)",
      "Current revenue per month (INR)",
      "Time to impact (months)",
    ]) {
      expect(screen.getByLabelText(label)).toBeTruthy();
    }
    expect(screen.getByText(/Enter 0 when an amount really is zero/)).toBeTruthy();
    expect(document.body.textContent).not.toMatch(/go \/ no-go/);
  });
});

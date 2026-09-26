/**
 * Owner Strategy page — explicit scenario evaluation (production polish).
 *
 * Production acceptance found that "Evaluate" silently evaluated the saved scenario with the
 * latest assessment period, so a newly entered scenario for an earlier period was ignored. The
 * page now lists every saved scenario and each one is evaluated by its own id. Drives the real
 * page (fetch mocked at the network boundary) with decisions from the real engine.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, cleanup, screen, within, fireEvent, waitFor } from "@testing-library/react";
import { ActiveBusinessProvider } from "@/context/active-business-context";
import OwnerStrategyPage from "@/app/(authenticated)/owner/strategy/page";
import { jsonResponse } from "../finding-label-lookup-fixtures";
import { deriveStrategyDecision, type StrategySnapshotInput } from "@/domain/owner-strategy";

const NOW = new Date("2026-09-26T00:00:00Z");
const BIZ_A = { id: "biz-a", name: "Alpha Laundry", currency: "INR", isActive: true };
const BIZ_B = { id: "biz-b", name: "Beta Bakery", currency: "INR", isActive: true };

const common = { currency: "INR", currentRevenue: 500000, timeToImpactMonths: 2, capacityImpactPct: 10, staffImpact: 1 };
// Older period: the known ₹50,000-short case (Not yet). Newer period: strong and affordable (Go).
const OLDER: StrategySnapshotInput = { ...common, periodStart: "2026-07-01", periodEnd: "2026-07-31", optionName: "Second van", investmentRequired: 150000, cashAvailable: 100000, expectedRevenueChange: 30000, costChange: 12000, riskLevel: "medium" };
const NEWER: StrategySnapshotInput = { ...common, periodStart: "2026-09-01", periodEnd: "2026-09-30", optionName: "Price rise", investmentRequired: 150000, cashAvailable: 400000, expectedRevenueChange: 60000, costChange: 12000, riskLevel: "low" };

type Scn = { id: string; input: StrategySnapshotInput };
const SCN_OLD: Scn = { id: "snap-old", input: OLDER };
const SCN_NEW: Scn = { id: "snap-new", input: NEWER };
const SCN_B: Scn = { id: "snap-b", input: { ...NEWER, optionName: "Beta oven" } };

/** Server state per business: saved scenarios (newest period first) and evaluations (newest first). */
const state: Record<string, { scenarios: Scn[]; evaluations: string[] }> = {};
let posts: Array<{ url: string; body: Record<string, unknown> }> = [];
let snapshotPostResponse: { status: number; body: unknown } | null = null;
/** When set, diagnosis POSTs wait for this promise (to interleave a business switch). */
let diagnosisGate: Promise<void> | null = null;

function dashboardFor(businessId: string) {
  const s = state[businessId];
  const currentId = s.evaluations[0] ?? null;
  const current = s.scenarios.find((x) => x.id === currentId) ?? null;
  const decision = current ? deriveStrategyDecision(current.input, { now: NOW }) : null;
  const seqOf = (id: string) => {
    const idx = s.evaluations.indexOf(id);
    return idx < 0 ? null : s.evaluations.length - idx;
  };
  return {
    businesses: [BIZ_A, BIZ_B],
    selectedBusinessId: businessId,
    hasData: current !== null,
    latestSnapshot: s.scenarios[0] ? { id: s.scenarios[0].id } : null,
    missingCriticalData: [],
    scenarios: s.scenarios.map((x) => ({
      id: x.id,
      optionName: x.input.optionName ?? null,
      periodStart: `${x.input.periodStart}T00:00:00.000Z`,
      periodEnd: `${x.input.periodEnd}T00:00:00.000Z`,
      createdAt: "2026-09-20T00:00:00.000Z",
      lastEvaluationSequence: seqOf(x.id),
      isCurrentDecision: x.id === currentId,
    })),
    domainScore: current ? { domain: "strategy", healthScore: 50, riskScore: 40, opportunityScore: 50, dataConfidenceScore: 95, strategyState: "GO" } : null,
    recommendedNextAction: null,
    decision,
    latestCycle: current
      ? {
          id: `cycle-${s.evaluations.length}`,
          sequenceNumber: s.evaluations.length,
          strategyState: "GO",
          healthScore: 50,
          riskScore: 40,
          opportunityScore: 50,
          dataConfidenceScore: 95,
          snapshot: { id: current.id, optionName: current.input.optionName, periodStart: `${current.input.periodStart}T00:00:00.000Z`, periodEnd: `${current.input.periodEnd}T00:00:00.000Z` },
          findings: [],
          actions: [],
        }
      : null,
    cycleHistory: [],
  };
}

function installFetch() {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (req: string | URL, init?: RequestInit) => {
      const url = typeof req === "string" ? req : req.toString();
      if (url === "/api/owner/businesses") return jsonResponse({ businesses: [BIZ_A, BIZ_B] });
      if (url.startsWith("/api/owner/strategy/dashboard")) {
        const id = new URL(url, "http://t.local").searchParams.get("businessId")!;
        return jsonResponse(dashboardFor(id));
      }
      const body = init?.body ? JSON.parse(String(init.body)) : {};
      posts.push({ url, body });
      const diag = url.match(/^\/api\/owner\/strategy\/businesses\/([^/]+)\/diagnoses$/);
      if (diag) {
        if (diagnosisGate) await diagnosisGate;
        state[diag[1]].evaluations.unshift(String(body.snapshotId));
        return jsonResponse({ id: "cycle" }, true, 201);
      }
      if (/\/snapshots$/.test(url) && snapshotPostResponse) {
        return jsonResponse(snapshotPostResponse.body, snapshotPostResponse.status < 400, snapshotPostResponse.status);
      }
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

function scenarioRow(name: RegExp): HTMLElement {
  return screen.getAllByTestId("strategy-scenario").find((el) => name.test(el.textContent ?? "")) as HTMLElement;
}

beforeEach(() => {
  window.sessionStorage.clear();
  window.localStorage.clear();
  window.sessionStorage.setItem("opsiq.activeBusinessId", BIZ_A.id);
  state[BIZ_A.id] = { scenarios: [SCN_NEW, SCN_OLD], evaluations: [] };
  state[BIZ_B.id] = { scenarios: [SCN_B], evaluations: [] };
  posts = [];
  snapshotPostResponse = null;
  diagnosisGate = null;
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("Strategy page — the owner explicitly chooses which saved scenario to evaluate", () => {
  it("lists every saved scenario with its period; there is no ambiguous page-level Evaluate button", async () => {
    installFetch();
    renderPage();
    const list = await screen.findByTestId("strategy-scenarios");
    const rows = within(list).getAllByTestId("strategy-scenario");
    expect(rows.map((r) => r.getAttribute("data-scenario-id"))).toEqual(["snap-new", "snap-old"]);
    expect(rows[0].textContent).toContain("Assessed 1 Sep 2026 – 30 Sep 2026");
    expect(rows[1].textContent).toContain("Assessed 1 Jul 2026 – 31 Jul 2026");
    expect(rows.every((r) => r.textContent?.includes("Not evaluated yet"))).toBe(true);
    expect(screen.queryByRole("button", { name: "Evaluate scenario" })).toBeNull();
    expect(screen.getAllByRole("button", { name: /^Evaluate this scenario: / })).toHaveLength(2);
    expect(screen.getByText(/Choose a saved scenario above/)).toBeTruthy();
  });

  it("evaluating the OLDER scenario sends its id — the decision follows it, not the latest period", async () => {
    installFetch();
    renderPage();
    await screen.findByTestId("strategy-scenarios");
    fireEvent.click(within(scenarioRow(/Second van/)).getByRole("button", { name: /Evaluate this scenario/ }));
    const card = await screen.findByTestId("strategy-decision");
    expect(posts.filter((p) => p.url.endsWith("/diagnoses"))).toEqual([
      { url: `/api/owner/strategy/businesses/${BIZ_A.id}/diagnoses`, body: { snapshotId: "snap-old" } },
    ]);
    expect(card.getAttribute("data-decision")).toBe("NOT_YET");
    expect(within(card).getByText(/Current decision · evaluation #1 · Second van · 1 Jul 2026 – 31 Jul 2026/)).toBeTruthy();
    expect(scenarioRow(/Second van/).getAttribute("data-current")).toBe("true");
    expect(within(scenarioRow(/Second van/)).getByText("Current decision")).toBeTruthy();
    expect(scenarioRow(/Price rise/).getAttribute("data-current")).toBe("false");
    expect(within(scenarioRow(/Price rise/)).getByText("Not evaluated yet")).toBeTruthy();
  });

  it("then evaluating the NEWER scenario sends its id and the current decision moves to it", async () => {
    installFetch();
    renderPage();
    await screen.findByTestId("strategy-scenarios");
    fireEvent.click(within(scenarioRow(/Second van/)).getByRole("button", { name: /Evaluate this scenario/ }));
    await screen.findByTestId("strategy-decision");
    fireEvent.click(within(scenarioRow(/Price rise/)).getByRole("button", { name: /Evaluate this scenario/ }));
    await waitFor(() => expect(screen.getByTestId("strategy-decision").getAttribute("data-decision")).toBe("GO"));
    expect(posts.filter((p) => p.url.endsWith("/diagnoses")).map((p) => p.body.snapshotId)).toEqual(["snap-old", "snap-new"]);
    expect(screen.getByText(/Current decision · evaluation #2 · Price rise/)).toBeTruthy();
    expect(scenarioRow(/Price rise/).getAttribute("data-current")).toBe("true");
    expect(within(scenarioRow(/Second van/)).getByText("Last evaluated in #1")).toBeTruthy();
    // And back to the older one: evaluation follows the choice every time.
    fireEvent.click(within(scenarioRow(/Second van/)).getByRole("button", { name: /Evaluate this scenario/ }));
    await waitFor(() => expect(screen.getByTestId("strategy-decision").getAttribute("data-decision")).toBe("NOT_YET"));
    expect(posts.filter((p) => p.url.endsWith("/diagnoses")).at(-1)!.body).toEqual({ snapshotId: "snap-old" });
  });

  it("a hard reload shows the same current scenario (server-derived, no client memory)", async () => {
    state[BIZ_A.id].evaluations = ["snap-old"];
    installFetch();
    const first = renderPage();
    await screen.findByTestId("strategy-decision");
    first.unmount();
    renderPage();
    const card = await screen.findByTestId("strategy-decision");
    expect(card.getAttribute("data-decision")).toBe("NOT_YET");
    expect(scenarioRow(/Second van/).getAttribute("data-current")).toBe("true");
    expect(posts).toEqual([]);
  });

  it("switching business shows that business's scenarios and evaluates within it", async () => {
    installFetch();
    renderPage();
    await screen.findByTestId("strategy-scenarios");
    fireEvent.change(screen.getByRole("combobox", { name: "Business" }), { target: { value: BIZ_B.id } });
    await waitFor(() => expect(screen.getAllByTestId("strategy-scenario").map((r) => r.getAttribute("data-scenario-id"))).toEqual(["snap-b"]));
    fireEvent.click(screen.getByRole("button", { name: /^Evaluate this scenario: Beta oven/ }));
    await screen.findByTestId("strategy-decision");
    expect(posts.filter((p) => p.url.endsWith("/diagnoses"))).toEqual([
      { url: `/api/owner/strategy/businesses/${BIZ_B.id}/diagnoses`, body: { snapshotId: "snap-b" } },
    ]);
  });

  it("once a decision exists it comes first; the saved scenarios follow it", async () => {
    state[BIZ_A.id].evaluations = ["snap-old"];
    installFetch();
    renderPage();
    const card = await screen.findByTestId("strategy-decision");
    const list = screen.getByTestId("strategy-scenarios");
    expect(card.compareDocumentPosition(list) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    const details = screen.getByText("Detailed scores").closest("details")!;
    expect(details.compareDocumentPosition(list) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it("switching business while an evaluation is in flight reloads the business now selected", async () => {
    let release!: () => void;
    diagnosisGate = new Promise<void>((r) => { release = r; });
    installFetch();
    renderPage();
    await screen.findByTestId("strategy-scenarios");
    fireEvent.click(within(scenarioRow(/Second van/)).getByRole("button", { name: /Evaluate this scenario/ }));
    fireEvent.change(screen.getByRole("combobox", { name: "Business" }), { target: { value: BIZ_B.id } });
    await waitFor(() => expect(screen.getAllByTestId("strategy-scenario").map((r) => r.getAttribute("data-scenario-id"))).toEqual(["snap-b"]));
    release();
    // The in-flight evaluation belonged to A and is posted to A...
    await waitFor(() => expect(posts.filter((p) => p.url.endsWith("/diagnoses"))).toHaveLength(1));
    expect(posts.find((p) => p.url.endsWith("/diagnoses"))!.url).toBe(`/api/owner/strategy/businesses/${BIZ_A.id}/diagnoses`);
    // ...but its follow-up reload shows B (the selection), never A's scenarios or decision.
    await new Promise((r) => setTimeout(r, 50));
    await waitFor(() => expect(screen.getAllByTestId("strategy-scenario").map((r) => r.getAttribute("data-scenario-id"))).toEqual(["snap-b"]));
    expect(screen.queryByText(/Second van/)).toBeNull();
    expect(screen.queryByTestId("strategy-decision")).toBeNull();
  });

  it("a duplicate assessment period is refused with the owner-safe conflict message", async () => {
    snapshotPostResponse = {
      status: 409,
      body: { error: "A strategy scenario for this business and assessment period already exists. Edit it instead of creating a duplicate.", classification: "handler_invocation_conflict" },
    };
    installFetch();
    const { container } = renderPage();
    await screen.findByTestId("strategy-scenarios");
    fireEvent.click(screen.getByRole("button", { name: "+ Add scenario" }));
    fireEvent.change(screen.getByLabelText("Assessed from"), { target: { value: "2026-07-01" } });
    fireEvent.change(screen.getByLabelText("Assessed to"), { target: { value: "2026-07-31" } });
    fireEvent.click(screen.getByRole("button", { name: "Save scenario" }));
    const banner = await waitFor(() => {
      const el = container.querySelector("[data-testid='strategy-page-error']");
      if (!el) throw new Error("no banner yet");
      return el;
    });
    expect(banner.textContent).toBe("You already have a scenario for these dates. Choose different dates, or evaluate the saved one under “Saved scenarios”.");
    // Nothing was evaluated and the saved scenarios are unchanged.
    expect(screen.getAllByTestId("strategy-scenario")).toHaveLength(2);
    expect(posts.some((p) => p.url.endsWith("/diagnoses"))).toBe(false);
  });
});

/**
 * Owner Cashflow page — an INCOMPLETE cash position is shown as an evidence gap, never as a known total, a runway,
 * insolvency, or safety. The page renders only what the dashboard payload says (the read-time projection already removed
 * any pre-fix false conclusion), plus an explicit, plain-language gap notice.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, cleanup, screen } from "@testing-library/react";
import { ActiveBusinessProvider } from "@/context/active-business-context";
import OwnerCashflowPage from "@/app/(authenticated)/owner/cashflow/page";

const BIZ = { id: "biz-a", name: "Alpha Bakery", currency: "INR", isActive: true };
const json = (body: unknown): Response => ({ ok: true, status: 200, json: async () => body }) as Response;

function dashboard(cashPosition: { judged: boolean; complete: boolean; missing: string[] } | null, missingCriticalData: string[]) {
  return {
    businesses: [BIZ], selectedBusinessId: BIZ.id, hasData: true, latestSnapshot: { id: "s1" }, missingCriticalData, cashPosition,
    domainScore: { domain: "cashflow", healthScore: 50, riskScore: 0, opportunityScore: 0, dataConfidenceScore: 70, cashflowState: "WATCH" },
    recommendedNextAction: null,
    latestCycle: { id: "c1", sequenceNumber: 1, cashflowState: "WATCH", healthScore: 50, dangerScore: 0, opportunityScore: 0, dataConfidenceScore: 70, findings: [], actions: [] },
    cycleHistory: [],
  };
}
function mount(payload: unknown) {
  window.sessionStorage.setItem("opsiq.activeBusinessId", BIZ.id);
  vi.stubGlobal("fetch", vi.fn(async (input: string | URL) => {
    const url = typeof input === "string" ? input : input.toString();
    if (url === "/api/owner/businesses") return json({ businesses: [BIZ] });
    if (url.startsWith("/api/owner/cashflow/dashboard")) return json(payload);
    return json({});
  }));
  return render(<ActiveBusinessProvider><OwnerCashflowPage /></ActiveBusinessProvider>);
}

beforeEach(() => { window.sessionStorage.clear(); window.localStorage.clear(); });
afterEach(() => { cleanup(); vi.restoreAllMocks(); });

describe("Owner Cashflow page — incomplete cash position", () => {
  it("names the missing component, says what to do, and claims no total, runway, insolvency or safety", async () => {
    mount(dashboard({ judged: true, complete: false, missing: ["bankBalance"] }, ["bankBalance"]));
    const notice = await screen.findByTestId("cash-position-incomplete");
    expect(notice.textContent).toMatch(/Total cash isn.t confirmed yet/);
    expect(notice.textContent).toMatch(/bank balance is not recorded/);
    expect(notice.textContent).toMatch(/enter 0 if there is none/);
    expect(notice.textContent).toMatch(/does not show a cash runway/);
    expect(notice.textContent).not.toMatch(/insolven|zero cash|runs out|cash is safe/i);
    expect(screen.getByText(/Missing critical data:/).parentElement!.textContent).toMatch(/bank balance/);
  });
  it("names both components when both are unknown", async () => {
    mount(dashboard({ judged: true, complete: false, missing: ["cashInHand", "bankBalance"] }, ["cashInHand", "bankBalance"]));
    const notice = await screen.findByTestId("cash-position-incomplete");
    expect(notice.textContent).toMatch(/cash in hand and bank balance are not recorded/);
  });
  it("a complete position shows no gap notice", async () => {
    mount(dashboard({ judged: true, complete: true, missing: [] }, []));
    await screen.findByText(/Latest diagnosis/);
    expect(screen.queryByTestId("cash-position-incomplete")).toBeNull();
  });
});

/**
 * First-input route convergence: a sidebar "Money" click, the owner-home empty state, Start Here and
 * Help must all lead to the SAME minimum-effort first-input experience — one shared
 * QuickFinancialPicture and one canonical first-read gate — without removing the full Money form.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, cleanup, screen, waitFor, fireEvent } from "@testing-library/react";
import { readFileSync } from "node:fs";

vi.mock("next/link", () => ({
  default: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => (
    <a href={href} {...rest}>{children}</a>
  ),
}));
const routerPush = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: routerPush, replace: vi.fn(), prefetch: vi.fn(), back: vi.fn() }),
}));

import OwnerFinancePage from "@/app/(authenticated)/owner/finance/page";
import OwnerDataHubPage from "@/app/(authenticated)/owner/data/page";
import OwnerHomePage from "@/app/(authenticated)/owner/page";
import OwnerHelpPage from "@/app/(authenticated)/owner/help/page";
import { ActiveBusinessProvider } from "@/context/active-business-context";
import { computeStartHereSteps } from "@/domain/owner-mode/start-here";

const BIZ = { id: "b1", name: "Acme", currency: "GBP", businessType: "generic_local_service" };
const fetchMock = vi.fn();
const json = (body: unknown, ok = true, status = ok ? 200 : 500) =>
  Promise.resolve({ ok, status, json: () => Promise.resolve(body) });

interface World {
  canRun: boolean;
  hasData: boolean;
  snapshots: Array<Record<string, unknown>>;
  businesses: Array<typeof BIZ>;
}
let world: World;

const emptyDashboard = (w: World) => ({
  businesses: w.businesses, selectedBusinessId: w.businesses[0]?.id ?? null, hasData: w.hasData,
  latestSnapshot: w.snapshots[0] ?? null, inProgressSnapshot: null, diagnosisTargetSnapshot: w.snapshots[0] ?? null,
  latestSnapshotPeriodState: null, latestCycle: null, domainScore: null, missingCriticalData: [], cycleHistory: [],
});

function install() {
  fetchMock.mockImplementation((input: string, init?: RequestInit) => {
    const url = String(input);
    const method = init?.method ?? "GET";
    if (url.includes("/api/owner/finance/dashboard")) return json(emptyDashboard(world));
    if (url.includes("/api/owner/onboarding")) {
      return json({
        businessName: "Acme", found: true, suppliedCategories: [], canRunFirstDiagnosis: world.canRun,
        firstRead: { sufficient: world.canRun, missing: world.canRun ? [] : ["revenue", "costs", "cashOnHand"], basis: world.canRun ? "completed" : "none" },
        requirements: { minimumRequired: [], recommended: [], optional: [] }, missingMinimum: [],
        minimumSuppliedCount: 0, minimumRequiredCount: 0, minimumComplete: false, confidenceBeforeDiagnosis: "none",
        firstAction: "", whatNotToDo: [], nextBestUpload: null,
      });
    }
    if (url.match(/\/finance\/businesses\/[^/]+\/snapshots$/)) {
      return method === "POST" ? json({ id: "snap-1" }, true, 201) : json(world.snapshots);
    }
    if (url.match(/\/diagnoses$/)) return json({ id: "c1" }, true, 201);
    if (url.includes("/api/owner/businesses")) return json({ businesses: world.businesses });
    return json({});
  });
}

const renderMoney = () => render(<ActiveBusinessProvider><OwnerFinancePage /></ActiveBusinessProvider>);
const gateFetches = () => fetchMock.mock.calls.map((c) => String(c[0])).filter((u) => u.includes("/api/owner/onboarding"));
const type = (name: string, value: string) =>
  fireEvent.change(document.querySelector(`input[name="${name}"]`) as HTMLInputElement, { target: { value } });

beforeEach(() => {
  fetchMock.mockReset();
  routerPush.mockReset();
  world = { canRun: false, hasData: false, snapshots: [], businesses: [BIZ] };
  vi.stubGlobal("fetch", fetchMock);
  window.sessionStorage.clear();
  window.localStorage.clear();
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

describe("Money (sidebar) before the first read", () => {
  it("leads with the shared quick start, not the legacy 7-field save-then-diagnose flow", async () => {
    install();
    const { container } = renderMoney();
    await screen.findByTestId("finance-quick-start");
    const form = screen.getByTestId("quick-financial-picture-form");
    expect(form.querySelectorAll('input[type="text"]')).toHaveLength(4);
    // Legacy dominant controls are absent until the owner has a first read.
    expect(screen.queryByText("+ Add financial snapshot")).toBeNull();
    expect(screen.queryByText(/Run finance diagnosis|Diagnose current period/)).toBeNull();
    expect(container.querySelector('input[name="periodStart"]')).toBeNull();
    expect(container.querySelector('[data-testid="snapshot-save-error"]')).toBeNull();
    // exactly ONE quick-start implementation on the page
    expect(document.querySelectorAll('[data-testid="quick-financial-picture-form"]')).toHaveLength(1);
  });

  it("keeps the full snapshot form reachable but secondary (opens only on request)", async () => {
    install();
    const { container } = renderMoney();
    await screen.findByTestId("finance-quick-start");
    expect(container.querySelector('input[name="cashOnHand"][type="number"]')).toBeNull(); // legacy number input not shown
    fireEvent.click(screen.getByTestId("finance-full-detail-toggle"));
    expect(container.querySelector('input[name="periodStart"]')).not.toBeNull();
    expect(container.querySelector('input[name="receivables"]')).not.toBeNull();
    // the quick path does not link to the page it is already on
    const more = screen.getByTestId("quick-more-detail");
    expect(Array.from(more.querySelectorAll("a")).map((a) => a.getAttribute("href"))).not.toContain("/owner/finance");
  });

  it("one click saves + diagnoses and then reloads Money in place (no same-route navigation)", async () => {
    install();
    renderMoney();
    await screen.findByTestId("finance-quick-start");
    type("revenue", "100"); type("fixedCosts", "40"); type("cashOnHand", "10");
    fireEvent.click(screen.getByTestId("quick-primary-action"));
    await waitFor(() => expect(fetchMock.mock.calls.some((c) => String(c[0]).endsWith("/diagnoses"))).toBe(true));
    const writes = fetchMock.mock.calls.filter((c) => (c[1] as RequestInit | undefined)?.method === "POST").map((c) => String(c[0]));
    expect(writes.filter((u) => u.endsWith("/snapshots"))).toHaveLength(1);
    expect(routerPush).not.toHaveBeenCalled();
    const dashboardCalls = () => fetchMock.mock.calls.filter((c) => String(c[0]).includes("/finance/dashboard")).length;
    await waitFor(() => expect(dashboardCalls()).toBeGreaterThanOrEqual(2)); // reloaded to show the read
  });
});

describe("Money once first-read evidence exists", () => {
  it("shows the normal Finance view (legacy actions available), not the quick start", async () => {
    world.canRun = true;
    world.snapshots = [{ id: "s1", periodStart: "2026-09-01T00:00:00Z", periodEnd: "2026-09-30T00:00:00Z", revenue: 1, fixedCosts: 1, cashOnHand: 1 }];
    install();
    renderMoney();
    expect(await screen.findByText("+ Add financial snapshot")).toBeTruthy();
    expect(screen.queryByTestId("finance-quick-start")).toBeNull();
    expect(screen.getAllByText(/Run finance diagnosis/).length).toBeGreaterThan(0);
  });
});

describe("existing incomplete same-period snapshot never causes a duplicate quick-start", () => {
  const lastMonth = () => {
    const now = new Date();
    const start = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const end = new Date(now.getFullYear(), now.getMonth(), 0);
    const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
    return { start: iso(start), end: iso(end) };
  };

  it("marks the saved period unavailable, explains what is missing, and never POSTs that period", async () => {
    const p = lastMonth();
    world.snapshots = [{ id: "s1", periodStart: `${p.start}T00:00:00.000Z`, periodEnd: `${p.end}T00:00:00.000Z`, revenue: 100, cashOnHand: 5 }];
    install();
    renderMoney();
    const note = await screen.findByTestId("quick-incomplete-saved");
    expect(note.textContent).toMatch(/still needs one cost figure/);
    expect(note.textContent).toMatch(/left as they are/);
    // the saved period is disabled and the default moved off it
    await waitFor(() => expect(screen.getByText(/Last month \(already saved\)/)).toBeTruthy());
    const lastRadio = screen.getByLabelText(/Last month/) as HTMLInputElement;
    expect(lastRadio.disabled).toBe(true);
    expect(lastRadio.checked).toBe(false);
    // choosing the same dates by hand is refused inline, nothing is sent
    fireEvent.click(screen.getByLabelText("Choose dates"));
    fireEvent.change(document.querySelector('input[name="periodStart"][type="date"]') as HTMLInputElement, { target: { value: p.start } });
    fireEvent.change(document.querySelectorAll('input[type="date"]')[1] as HTMLInputElement, { target: { value: p.end } });
    type("revenue", "1"); type("fixedCosts", "1"); type("cashOnHand", "1");
    expect(screen.getByTestId("quick-period-taken")).toBeTruthy();
    expect((screen.getByTestId("quick-primary-action") as HTMLButtonElement).disabled).toBe(true);
    fireEvent.submit(screen.getByTestId("quick-financial-picture-form"));
    expect(fetchMock.mock.calls.some((c) => (c[1] as RequestInit | undefined)?.method === "POST")).toBe(false);
  });
});

describe("one canonical gate across surfaces", () => {
  it("Money and My Business read the same /api/owner/onboarding gate and agree", async () => {
    install();
    renderMoney();
    await screen.findByTestId("finance-quick-start");
    const moneyGate = gateFetches()[0];
    cleanup(); fetchMock.mockClear(); install();
    render(<ActiveBusinessProvider><OwnerDataHubPage /></ActiveBusinessProvider>);
    await screen.findByTestId("data-hub-quick-start");
    expect(gateFetches()[0]).toBe(moneyGate);
    expect(screen.getByTestId("quick-financial-picture-form")).toBeTruthy();

    cleanup(); fetchMock.mockClear(); world.canRun = true; install();
    render(<ActiveBusinessProvider><OwnerDataHubPage /></ActiveBusinessProvider>);
    await screen.findByTestId("data-hub-readiness");
    expect(screen.queryByTestId("quick-financial-picture-form")).toBeNull();
    cleanup(); renderMoney();
    expect(await screen.findByText("+ Add financial snapshot")).toBeTruthy();
    expect(screen.queryByTestId("finance-quick-start")).toBeNull();
  });

  it("neither page restates the sufficiency rule (both defer to the gate / shared contract)", () => {
    for (const f of ["src/app/(authenticated)/owner/finance/page.tsx", "src/app/(authenticated)/owner/data/page.tsx"]) {
      const src = readFileSync(f, "utf8");
      expect(src).not.toMatch(/missingCriticalFinanceInputs|FIRST_DIAGNOSIS_GATE|costOfGoodsOrServices\s*\|\|/);
    }
    const money = readFileSync("src/app/(authenticated)/owner/finance/page.tsx", "utf8");
    const data = readFileSync("src/app/(authenticated)/owner/data/page.tsx", "utf8");
    expect(money).toContain("<QuickFinancialPicture");
    expect(data).toContain("<QuickFinancialPicture");
  });

  it("only ONE quick-financial-entry component is rendered by the first-run surfaces", () => {
    const impls = ["src/components/owner/QuickFinancialPicture.tsx"];
    for (const f of ["src/app/(authenticated)/owner/finance/page.tsx", "src/app/(authenticated)/owner/data/page.tsx"]) {
      const src = readFileSync(f, "utf8");
      expect(src).not.toMatch(/QUICK_ENTRY_FIELDS|parseQuickAmount/); // no private re-implementation
    }
    expect(impls).toHaveLength(1);
  });
});

describe("routing: owner empty state, Start Here, Help, navigation", () => {
  it("owner home with no business sends the owner to My Business, in owner language", async () => {
    fetchMock.mockImplementation((input: string) => {
      const url = String(input);
      if (url.includes("/api/owner/businesses")) return json({ businesses: [] });
      return json({ businesses: [] });
    });
    render(<ActiveBusinessProvider><OwnerHomePage /></ActiveBusinessProvider>);
    const cta = await screen.findByTestId("owner-empty-setup-cta");
    expect(cta.getAttribute("href")).toBe("/owner/data");
    expect(cta.textContent).toMatch(/Set up your first business/);
    expect(document.body.textContent).not.toMatch(/Start in Finance/);
  });

  it("Start Here's money step stays on My Business", () => {
    const steps = computeStartHereSteps({
      businessBasicsComplete: true, canRunFirstDiagnosis: false, missingMinimum: [], suppliedCategories: [],
      requirements: { minimumRequired: [], recommended: [], optional: [] }, hasEngagedAPriority: false,
    });
    expect(steps.find((s) => s.id === "money_numbers")!.href).toBe("/owner/data");
  });

  it("Help: My Business is the fastest first input; Money is full detail and history", () => {
    render(<OwnerHelpPage />);
    const text = document.body.textContent!;
    // topics may be collapsed; read the source of truth in the DOM
    expect(text).toMatch(/start in My Business/);
    expect(text).toMatch(/Money is for the full financial detail/);
    expect(text).not.toMatch(/Money is where you record financial snapshots/);
    const hrefs = Array.from(document.querySelectorAll("a")).map((a) => a.getAttribute("href"));
    expect(hrefs).toContain("/owner/data");
    expect(hrefs).toContain("/owner/finance");
  });

  it("Money stays in the navigation (it is a legitimate business surface)", () => {
    expect(readFileSync("src/ui/shell/sidebar-nav.tsx", "utf8")).toContain('{ label: "Money", href: "/owner/finance"');
  });
});

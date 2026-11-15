/**
 * N2 / N8 on the real My Business page (jsdom): the readiness statement is derived from what is actually known, and names the
 * period. Audit finding: a business with cash UNKNOWN was told "You have given OpsIQ revenue, a cost figure and cash" while
 * the same page listed cash as missing.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { render, cleanup, screen } from "@testing-library/react";

vi.mock("next/link", () => ({
  default: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => <a href={href} {...rest}>{children}</a>,
}));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn(), replace: vi.fn(), prefetch: vi.fn(), back: vi.fn() }) }));

import OwnerDataHubPage from "@/app/(authenticated)/owner/data/page";
import { ActiveBusinessProvider } from "@/context/active-business-context";

const json = (body: unknown) => Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve(body) });

const READY = (firstRead: Record<string, unknown>) => ({
  businessName: "Acme", suppliedCategories: ["revenue_sales", "expenses"],
  requirements: { minimumRequired: ["revenue_sales", "expenses", "cash_debt"], recommended: [], optional: [] },
  missingMinimum: [], minimumSuppliedCount: 2, minimumRequiredCount: 3, minimumComplete: false,
  confidenceBeforeDiagnosis: "medium", canRunFirstDiagnosis: true, firstAction: "", whatNotToDo: [], nextBestUpload: null, found: true,
  firstRead,
});
const SEPT = { start: "2026-09-01T00:00:00.000Z", end: "2026-09-30T00:00:00.000Z" };

async function mount(firstRead: Record<string, unknown> | undefined) {
  vi.stubGlobal("fetch", vi.fn((url: string) => {
    if (url.includes("/api/owner/onboarding")) return json(firstRead === undefined ? { ...READY({}), firstRead: undefined } : READY(firstRead));
    if (url.includes("/api/owner/businesses")) return json({ businesses: [{ id: "b1", name: "Acme", currency: "INR" }] });
    return json({});
  }));
  render(<ActiveBusinessProvider><OwnerDataHubPage /></ActiveBusinessProvider>);
  return screen.findByTestId("data-hub-first-read-ready");
}

beforeEach(() => { window.localStorage.clear(); window.sessionStorage.clear(); });
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

describe("N2 — My Business: what OpsIQ knows", () => {
  it("cash UNKNOWN: names revenue and a cost figure for the period, says cash is not entered, and never says cash was given", async () => {
    const el = await mount({ sufficient: true, revenueKnown: true, costKnown: true, cashKnown: false, missing: [], basis: "completed", period: SEPT });
    expect(el.textContent).toContain("You have given OpsIQ revenue and a cost figure for September 2026.");
    expect(el.textContent).toMatch(/Cash in hand is not entered, so OpsIQ can't yet say how long your cash will last\./);
    expect(el.textContent).not.toMatch(/revenue, a cost figure and cash/);
    expect(el.textContent).toMatch(/rough financial picture — it does not mean OpsIQ knows the whole business/);
  });

  it("everything known: says so, with the period, and reports nothing missing", async () => {
    const el = await mount({ sufficient: true, revenueKnown: true, costKnown: true, cashKnown: true, missing: [], basis: "completed", period: SEPT });
    expect(el.textContent).toContain("You have given OpsIQ revenue, a cost figure and cash in hand for September 2026.");
    expect(screen.queryByTestId("data-hub-first-read-not-given")).toBeNull();
  });

  it("a provisional month is called provisional", async () => {
    const el = await mount({ sufficient: true, revenueKnown: true, costKnown: true, cashKnown: true, missing: [], basis: "provisional", period: { start: "2026-10-01T00:00:00.000Z", end: "2026-10-31T00:00:00.000Z" } });
    expect(el.textContent).toMatch(/for October 2026, a month that is still in progress, so the read is provisional\./);
  });

  it("an older payload without sufficiency claims no specific fact", async () => {
    const el = await mount(undefined);
    expect(el.textContent).not.toMatch(/revenue|cost figure|cash/i);
    expect(el.textContent).toMatch(/enough saved to run a first read/);
  });
});

describe("N8 — saved costs and cash with revenue UNKNOWN is never 'no business data'", () => {
  it("the page tells the owner what is saved and what is still needed", async () => {
    vi.stubGlobal("fetch", vi.fn((url: string) => {
      if (url.includes("/api/owner/onboarding")) return json({
        businessName: "Acme", suppliedCategories: ["expenses", "cash_debt"], requirements: { minimumRequired: ["revenue_sales", "expenses", "cash_debt"], recommended: [], optional: [] },
        missingMinimum: [], minimumSuppliedCount: 2, minimumRequiredCount: 3, minimumComplete: false, confidenceBeforeDiagnosis: "low", canRunFirstDiagnosis: false,
        firstAction: "", whatNotToDo: [], nextBestUpload: null, found: true,
        firstRead: { sufficient: false, revenueKnown: false, costKnown: true, cashKnown: true, missing: ["revenue"], basis: "completed", period: SEPT },
      });
      if (url.includes("/api/owner/businesses")) return json({ businesses: [{ id: "b1", name: "Acme", currency: "INR" }] });
      return json({});
    }));
    render(<ActiveBusinessProvider><OwnerDataHubPage /></ActiveBusinessProvider>);
    const partial = await screen.findByTestId("data-hub-existing-partial");
    expect(partial.textContent).toMatch(/already holds some saved numbers but still needs revenue/);
    expect(document.body.textContent).not.toMatch(/no business data/i);
  });
});

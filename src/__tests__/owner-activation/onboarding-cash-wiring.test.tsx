/**
 * Onboarding cash-semantics wiring (P0 fix).
 *
 * The finance domain's `cashOnHand` means physical cash only -- `bankBalance` is documented as
 * "never persisted on the finance snapshot itself" (src/domain/owner-finance/types.ts) and is
 * instead enriched at diagnosis time from a separate OwnerCashflowSnapshot
 * (src/services/owner-finance/diagnosis.service.ts "DEFECT 1"). Onboarding used to ask for one
 * combined "cash on hand" figure and post it all as `cashOnHand`, which both violated that
 * boundary and would silently double-count if the same owner also entered a real bank balance in
 * Cashflow later.
 *
 * This proves the fixed wiring end-to-end at the request level: physical cash goes only to the
 * finance snapshot, bank balance goes only to a minimal cashflow snapshot for the same period
 * (the same governed endpoints /owner/finance and /owner/cashflow already use).
 *
 * It also proves the retry/conflict path is genuinely safe, not just non-blocking: cashflow
 * snapshots have no amend/update endpoint in this codebase (confirmed by enumerating every route
 * under src/app/api/owner/cashflow/**), so a 409 on re-submission must never be treated as
 * "saved" without checking whether the value on file actually matches what was just submitted.
 * Silently continuing on a DIFFERENT value would mean the diagnosis enriches itself from a stale
 * bank balance while the UI just accepted a new one, with no signal to the owner that their
 * correction never took effect.
 */
import { describe, it, expect, afterEach, vi } from "vitest";
import { render, cleanup, screen, waitFor, fireEvent } from "@testing-library/react";

vi.mock("next/link", () => ({
  default: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));

import OwnerOnboardingPage from "@/app/(authenticated)/owner/onboarding/page";

const BUSINESS_ID = "b1";

const ONBOARDING_STATE = {
  found: true,
  businessName: "Test Cafe",
  steps: [],
  requirements: { minimumRequired: [], recommended: [], optional: [] },
  missingMinimum: [],
  minimumSuppliedCount: 1,
  minimumRequiredCount: 3,
  minimumComplete: false,
  confidenceBeforeDiagnosis: "low",
  canRunFirstDiagnosis: false,
  firstAction: "",
  whatNotToDo: [],
  nextBestUpload: null,
};

type Call = { method: string; url: string; body: unknown };

function json(body: unknown, ok = true, status = ok ? 200 : 500) {
  return Promise.resolve({ ok, status, json: () => Promise.resolve(body) });
}

/**
 * @param existingCashflowSnapshot When set, the cashflow POST returns 409 (as if a snapshot for
 *   this exact period already exists) and the subsequent GET list resolves to this one row --
 *   `bankBalance: null` models scenario D (a snapshot exists for the period but without a bank
 *   balance on it), any number models scenarios B/C.
 */
function setupFetch(opts: { existingCashflowSnapshot?: { bankBalance: number | null } } = {}) {
  const calls: Call[] = [];
  const fetchMock = vi.fn((url: string, init?: RequestInit) => {
    const method = init?.method ?? "GET";
    const body = init?.body ? JSON.parse(init.body as string) : undefined;
    calls.push({ method, url, body });

    if (url.includes("/api/owner/businesses")) {
      return json({ businesses: [{ id: BUSINESS_ID, name: "Test Cafe", currency: "GBP" }] });
    }
    if (url.startsWith("/api/owner/onboarding?")) {
      return json(ONBOARDING_STATE);
    }
    if (url.startsWith("/api/owner/readiness?")) {
      return json({ found: false });
    }
    if (method === "POST" && url === `/api/owner/finance/businesses/${BUSINESS_ID}/snapshots`) {
      return json({ id: "snap-1" });
    }
    if (method === "POST" && url === `/api/owner/cashflow/businesses/${BUSINESS_ID}/snapshots`) {
      if (opts.existingCashflowSnapshot) {
        return json({ error: "A cashflow snapshot for this business and reporting period already exists." }, false, 409);
      }
      return json({ id: "cf-snap-1" });
    }
    if (method === "GET" && url === `/api/owner/cashflow/businesses/${BUSINESS_ID}/snapshots`) {
      if (!opts.existingCashflowSnapshot) throw new Error("Unexpected GET: no conflict was configured");
      const financePost = calls.find((c) => c.method === "POST" && c.url.endsWith("/finance/businesses/b1/snapshots"))!;
      const { periodStart, periodEnd } = financePost.body as Record<string, string>;
      return json([{ periodStart, periodEnd, bankBalance: opts.existingCashflowSnapshot.bankBalance }]);
    }
    if (method === "POST" && url === `/api/owner/finance/businesses/${BUSINESS_ID}/diagnoses`) {
      return json({ findings: [], actions: [], dataConfidenceScore: 40 });
    }
    throw new Error(`Unexpected fetch: ${method} ${url}`);
  });
  vi.stubGlobal("fetch", fetchMock);
  return calls;
}

async function fillAndSubmit(fields: { revenue?: string; cashOnHand?: string; bankBalance?: string }) {
  const form = await waitFor(() => screen.getByTestId("onboarding-essential-numbers"));
  const setField = (name: string, value: string) => {
    const input = form.querySelector(`input[name="${name}"]`) as HTMLInputElement;
    fireEvent.change(input, { target: { value } });
  };
  if (fields.revenue) setField("revenue", fields.revenue);
  if (fields.cashOnHand) setField("cashOnHand", fields.cashOnHand);
  if (fields.bankBalance) setField("bankBalance", fields.bankBalance);
  fireEvent.click(screen.getByText("See my first result"));
}

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("E/F/G/H: onboarding cash-field routing", () => {
  it("E. physical cash only: posts cashOnHand to Finance, never calls Cashflow", async () => {
    const calls = setupFetch();
    render(<OwnerOnboardingPage />);
    await fillAndSubmit({ revenue: "20000", cashOnHand: "3000" });

    await waitFor(() => expect(calls.some((c) => c.method === "POST" && c.url.includes("/diagnoses"))).toBe(true));

    const financePost = calls.find((c) => c.method === "POST" && c.url.endsWith("/finance/businesses/b1/snapshots"))!;
    expect((financePost.body as Record<string, unknown>).cashOnHand).toBe(3000);
    expect("bankBalance" in (financePost.body as Record<string, unknown>)).toBe(false);
    expect(calls.find((c) => c.url.endsWith("/cashflow/businesses/b1/snapshots"))).toBeUndefined();
  });

  it("F. bank balance only: never puts it on the Finance snapshot, creates a minimal Cashflow snapshot instead", async () => {
    const calls = setupFetch();
    render(<OwnerOnboardingPage />);
    await fillAndSubmit({ revenue: "20000", bankBalance: "5000" });

    await waitFor(() => expect(calls.some((c) => c.method === "POST" && c.url.includes("/diagnoses"))).toBe(true));

    const financePost = calls.find((c) => c.method === "POST" && c.url.endsWith("/finance/businesses/b1/snapshots"))!;
    expect("bankBalance" in (financePost.body as Record<string, unknown>)).toBe(false);
    expect((financePost.body as Record<string, unknown>).cashOnHand).toBeUndefined();

    const cashflowPost = calls.find((c) => c.method === "POST" && c.url.endsWith("/cashflow/businesses/b1/snapshots"))!;
    expect(cashflowPost).toBeDefined();
    const cfBody = cashflowPost.body as Record<string, unknown>;
    expect(cfBody.bankBalance).toBe(5000);
    expect(cfBody.periodStart).toBe((financePost.body as Record<string, unknown>).periodStart);
    expect(cfBody.periodEnd).toBe((financePost.body as Record<string, unknown>).periodEnd);
  });

  it("G. both physical cash and bank balance: each lands in its own domain, neither is dropped", async () => {
    const calls = setupFetch();
    render(<OwnerOnboardingPage />);
    await fillAndSubmit({ revenue: "20000", cashOnHand: "3000", bankBalance: "5000" });

    await waitFor(() => expect(calls.some((c) => c.method === "POST" && c.url.includes("/diagnoses"))).toBe(true));

    const financePost = calls.find((c) => c.method === "POST" && c.url.endsWith("/finance/businesses/b1/snapshots"))!;
    expect((financePost.body as Record<string, unknown>).cashOnHand).toBe(3000);
    expect("bankBalance" in (financePost.body as Record<string, unknown>)).toBe(false);

    const cashflowPost = calls.find((c) => c.method === "POST" && c.url.endsWith("/cashflow/businesses/b1/snapshots"))!;
    expect((cashflowPost.body as Record<string, unknown>).bankBalance).toBe(5000);
  });

  it("H. neither cash field filled: no cash value on Finance, Cashflow is never called", async () => {
    const calls = setupFetch();
    render(<OwnerOnboardingPage />);
    await fillAndSubmit({ revenue: "20000" });

    await waitFor(() => expect(calls.some((c) => c.method === "POST" && c.url.includes("/diagnoses"))).toBe(true));

    const financePost = calls.find((c) => c.method === "POST" && c.url.endsWith("/finance/businesses/b1/snapshots"))!;
    expect((financePost.body as Record<string, unknown>).cashOnHand).toBeUndefined();
    expect(calls.find((c) => c.url.endsWith("/cashflow/businesses/b1/snapshots"))).toBeUndefined();
  });
});

describe("A/B/C/D: Cashflow 409 conflict resolution is genuinely safe, not just non-blocking", () => {
  it("A. no existing snapshot + bank balance: plain create succeeds, no conflict path taken, no warning", async () => {
    const calls = setupFetch();
    render(<OwnerOnboardingPage />);
    await fillAndSubmit({ revenue: "20000", bankBalance: "5000" });

    await waitFor(() => expect(screen.getByTestId("onboarding-first-result")).toBeTruthy());
    expect(calls.find((c) => c.method === "GET" && c.url.endsWith("/cashflow/businesses/b1/snapshots"))).toBeUndefined();
    expect(screen.queryByTestId("onboarding-bank-balance-warning")).toBeNull();
  });

  it("B. existing snapshot with the SAME bank balance: genuinely idempotent, proceeds with no warning", async () => {
    const calls = setupFetch({ existingCashflowSnapshot: { bankBalance: 5000 } });
    render(<OwnerOnboardingPage />);
    await fillAndSubmit({ revenue: "20000", bankBalance: "5000" });

    await waitFor(() => expect(screen.getByTestId("onboarding-first-result")).toBeTruthy());
    // The conflict was resolved by reading the existing value back, not assumed.
    expect(calls.some((c) => c.method === "GET" && c.url.endsWith("/cashflow/businesses/b1/snapshots"))).toBe(true);
    expect(calls.some((c) => c.method === "POST" && c.url.includes("/diagnoses"))).toBe(true);
    expect(screen.queryByTestId("onboarding-bank-balance-warning")).toBeNull();
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("C. existing snapshot with a DIFFERENT bank balance: never silently proceeds as if the new number was saved", async () => {
    const calls = setupFetch({ existingCashflowSnapshot: { bankBalance: 100000 } });
    render(<OwnerOnboardingPage />);
    await fillAndSubmit({ revenue: "20000", bankBalance: "70000" });

    // The first result still renders (finance data was saved correctly) --
    await waitFor(() => expect(screen.getByTestId("onboarding-first-result")).toBeTruthy());
    expect(calls.some((c) => c.method === "POST" && c.url.includes("/diagnoses"))).toBe(true);
    // -- but it is NOT presented as though the bank balance correction took effect.
    const warning = screen.getByTestId("onboarding-bank-balance-warning");
    expect(warning.textContent).toMatch(/70,000/);
    expect(warning.textContent).toMatch(/100,000/);
    expect(warning.textContent).toMatch(/couldn.t be saved/i);
    expect(warning.querySelector("a")!.getAttribute("href")).toBe("/owner/cashflow");
  });

  it("D. existing snapshot for the period with NO bank balance on it: still flagged, not silently treated as a match", async () => {
    setupFetch({ existingCashflowSnapshot: { bankBalance: null } });
    render(<OwnerOnboardingPage />);
    await fillAndSubmit({ revenue: "20000", bankBalance: "5000" });

    await waitFor(() => expect(screen.getByTestId("onboarding-first-result")).toBeTruthy());
    const warning = screen.getByTestId("onboarding-bank-balance-warning");
    expect(warning.textContent).toMatch(/couldn.t be saved/i);
    expect(warning.querySelector("a")!.getAttribute("href")).toBe("/owner/cashflow");
  });
});

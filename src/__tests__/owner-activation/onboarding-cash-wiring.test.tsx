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
 * (the same governed endpoints /owner/finance and /owner/cashflow already use), and a 409 on the
 * cashflow side (no amend endpoint exists for cashflow snapshots in this codebase) never blocks
 * the first-result flow.
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

function setupFetch(opts: { cashflowStatus?: number } = {}) {
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
      const status = opts.cashflowStatus ?? 201;
      if (status === 409) return json({ error: "A cashflow snapshot for this business and reporting period already exists." }, false, 409);
      return json({ id: "cf-snap-1" });
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

describe("onboarding cash-field wiring", () => {
  it("physical cash only: posts cashOnHand to Finance, never calls Cashflow", async () => {
    const calls = setupFetch();
    render(<OwnerOnboardingPage />);
    await fillAndSubmit({ revenue: "20000", cashOnHand: "3000" });

    await waitFor(() => expect(calls.some((c) => c.method === "POST" && c.url.includes("/diagnoses"))).toBe(true));

    const financePost = calls.find((c) => c.method === "POST" && c.url.endsWith("/finance/businesses/b1/snapshots"))!;
    expect((financePost.body as Record<string, unknown>).cashOnHand).toBe(3000);
    expect("bankBalance" in (financePost.body as Record<string, unknown>)).toBe(false);

    const cashflowPost = calls.find((c) => c.url.includes("/cashflow/businesses/b1/snapshots"));
    expect(cashflowPost).toBeUndefined();
  });

  it("bank balance only: never puts it on the Finance snapshot, creates a minimal Cashflow snapshot instead", async () => {
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
    // Same reporting period as the finance snapshot, so the diagnosis enrichment (at-or-before,
    // same period => age 0 days) actually picks it up.
    expect(cfBody.periodStart).toBe((financePost.body as Record<string, unknown>).periodStart);
    expect(cfBody.periodEnd).toBe((financePost.body as Record<string, unknown>).periodEnd);
  });

  it("both physical cash and bank balance: each lands in its own domain, neither is dropped", async () => {
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

  it("neither cash field filled: no cash value on Finance, Cashflow is never called", async () => {
    const calls = setupFetch();
    render(<OwnerOnboardingPage />);
    await fillAndSubmit({ revenue: "20000" });

    await waitFor(() => expect(calls.some((c) => c.method === "POST" && c.url.includes("/diagnoses"))).toBe(true));

    const financePost = calls.find((c) => c.method === "POST" && c.url.endsWith("/finance/businesses/b1/snapshots"))!;
    expect((financePost.body as Record<string, unknown>).cashOnHand).toBeUndefined();
    expect(calls.find((c) => c.url.endsWith("/cashflow/businesses/b1/snapshots"))).toBeUndefined();
  });

  it("a same-period Cashflow conflict (409, no amend endpoint exists) never blocks the first result", async () => {
    const calls = setupFetch({ cashflowStatus: 409 });
    render(<OwnerOnboardingPage />);
    await fillAndSubmit({ revenue: "20000", bankBalance: "5000" });

    // The 409 is swallowed -- diagnosis still runs and a first result is still produced.
    await waitFor(() => expect(screen.getByTestId("onboarding-first-result")).toBeTruthy());
    expect(calls.some((c) => c.method === "POST" && c.url.includes("/diagnoses"))).toBe(true);
    expect(screen.queryByRole("alert")).toBeNull();
  });
});

// @vitest-environment jsdom
/**
 * The screen side of FIRST LOGIN -> DATA SOURCE -> DATA -> AUTOMATIC FIRST ADVICE. The server contract (routing, convergence,
 * idempotent first diagnosis) is proven in first-run-convergence.db.test.ts and first-run-sources.test.ts; this proves what is
 * shown and that the first read starts by itself - once - from persisted state, with no "run analysis" step.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor, fireEvent, cleanup, act } from "@testing-library/react";

const api = vi.hoisted(() => ({
  context: vi.fn(), result: vi.fn(), markViewed: vi.fn(), accept: vi.fn(), correct: vi.fn(),
  improve: vi.fn(), skipQuestion: vi.fn(), nextQuestion: vi.fn(), feedback: vi.fn(), createBusiness: vi.fn(), improveTarget: vi.fn(),
}));
const retry = vi.hoisted(() => vi.fn());
vi.mock("@/lib/owner-first-run-client", () => ({ firstRunApi: api, newIdempotencyKey: () => `key-${Math.random().toString(36).slice(2, 12)}` }));
vi.mock("@/lib/owner-quick-start", () => ({ retryDiagnosis: retry }));
vi.mock("@/context/active-business-context", () => ({ useActiveBusiness: () => ({ refreshBusinesses: vi.fn(), setActiveBusinessId: vi.fn(), activeBusinessId: "b1", loading: false }) }));
vi.mock("@/components/owner/QuickFinancialPicture", () => ({ QuickFinancialPicture: () => <div data-testid="quick-stub" /> }));
vi.mock("@/components/owner/QuickBooksConnectionCard", () => ({ QuickBooksConnectionCard: (p: { firstRun?: boolean }) => <div data-testid="qbo-card-stub" data-first-run={String(p.firstRun)} /> }));
vi.mock("next/link", () => ({
  default: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => <a href={href} {...rest}>{children}</a>,
}));

import { FirstRunFlow } from "@/components/owner/first-run/FirstRunFlow";
import { buildFirstMoneyRead } from "@/domain/owner-first-run/first-money-read";

const PERIOD = { start: "2026-09-01T00:00:00.000Z", end: "2026-09-30T00:00:00.000Z", state: "completed" as const };
const finding = { title: "Fixed costs are high", summary: "Rent and wages are most of revenue.", sourceMetric: "fixed_cost_ratio", sourceValue: 0.6, evidence: [], missingData: [] };
const action = { title: "Review fixed costs", description: "Find the biggest two.", ownerRole: "owner", expectedTimeframeDays: 14, verificationMetric: "fixed_cost_ratio" };
const view = () => ({
  read: buildFirstMoneyRead({ period: PERIOD, finding, action, dataRequest: null, confidenceScore: 60, evidenceQuality: "GOOD_ESTIMATE", missingEvidence: [] } as never),
  businessId: "b1", currency: "GBP", cycleId: "c1", snapshotId: "s1", candidateId: "domain_action:finance:a1",
  presentedAction: { title: action.title, verificationMetric: action.verificationMetric, expectedTimeframeDays: 14 }, decisionState: null,
  figures: { revenue: 12000, fixedCosts: 7000, variableCosts: 4000, cashOnHand: 1500 }, staleReason: null,
});
const ctx = (over: Record<string, unknown> = {}) => ({
  state: "NEEDS_EVIDENCE", href: "/owner/first-run", loginHref: "/owner/first-run", facts: {}, suggestedBusinessName: "Maple",
  business: { id: "b1", name: "Maple", businessType: "laundry_local_service", currency: "GBP" },
  currentSnapshotId: null, latestCycleId: null, diagnosisStale: false, staleReason: null, firstTrustedInteractionAt: null, businessTypes: [], goalFamilies: [],
  evidenceSources: { quickBooks: "HIDDEN", manual: true, poll: false }, ...over,
});

beforeEach(() => {
  vi.clearAllMocks();
  window.sessionStorage.clear();
  window.history.replaceState(null, "", "/owner/first-run");
  api.markViewed.mockResolvedValue({ ok: true });
});
afterEach(() => { cleanup(); vi.useRealTimers(); });

describe("source step: only what the server offers", () => {
  it("QuickBooks not offered: manual form only, no QuickBooks card or button, no unsupported connector", async () => {
    api.context.mockResolvedValue(ctx());
    render(<FirstRunFlow />);
    expect(await screen.findByTestId("quick-stub")).toBeTruthy();
    expect(screen.getByText(/Let.s understand your business/)).toBeTruthy();
    expect(screen.queryByTestId("qbo-card-stub")).toBeNull();
    expect(screen.queryByTestId("first-run-choose-manual")).toBeNull();
    for (const name of [/xero/i, /shopify/i, /hubspot/i, /bank/i, /\bPOS\b/, /stripe/i]) expect(screen.queryByText(name)).toBeNull();
  });

  it("QuickBooks offered: both choices are shown, the QuickBooks card is in first-run mode, manual is one click away", async () => {
    api.context.mockResolvedValue(ctx({ evidenceSources: { quickBooks: "OFFER", manual: true, poll: false } }));
    render(<FirstRunFlow />);
    const card = await screen.findByTestId("qbo-card-stub");
    expect(card.getAttribute("data-first-run")).toBe("true");
    expect(screen.getByTestId("first-run-quickbooks-explainer").textContent).toMatch(/read-only/i);
    expect(screen.getByTestId("first-run-quickbooks-explainer").textContent).toMatch(/never changes anything in QuickBooks/i);
    expect(screen.queryByTestId("quick-stub")).toBeNull();
    fireEvent.click(screen.getByTestId("first-run-choose-manual"));
    expect(await screen.findByTestId("quick-stub")).toBeTruthy();
  });

  it("import in progress resumes as a truthful progress state, with no manual form forced and no 'run analysis' wording", async () => {
    api.context.mockResolvedValue(ctx({ evidenceSources: { quickBooks: "IN_PROGRESS", manual: true, poll: true } }));
    render(<FirstRunFlow />);
    const p = await screen.findByTestId("first-run-quickbooks-progress");
    expect(p.textContent).toMatch(/start by itself/i);
    expect(document.body.textContent).not.toMatch(/run (your )?analysis/i);
  });

  it("connected but not yet enough: shows the attention state AND the manual fallback", async () => {
    api.context.mockResolvedValue(ctx({ evidenceSources: { quickBooks: "ATTENTION", manual: true, poll: false } }));
    render(<FirstRunFlow />);
    expect(await screen.findByTestId("first-run-quickbooks-attention")).toBeTruthy();
    expect(screen.getByTestId("quick-stub")).toBeTruthy();
  });
});

describe("the first read starts by itself, once, from persisted state", () => {
  it("NEEDS_DIAGNOSIS triggers exactly one first-only diagnosis, then shows the read - no button press", async () => {
    api.context.mockResolvedValueOnce(ctx({ state: "NEEDS_DIAGNOSIS", currentSnapshotId: "s1", evidenceSources: null }))
      .mockResolvedValue(ctx({ state: "FIRST_RESULT", currentSnapshotId: "s1", latestCycleId: "c1", evidenceSources: null }));
    api.result.mockResolvedValue(view());
    retry.mockResolvedValue({ status: "diagnosed", snapshotId: "s1" });
    render(<FirstRunFlow />);
    await waitFor(() => expect(retry).toHaveBeenCalledTimes(1));
    expect(retry.mock.calls[0].slice(1)).toEqual(["b1", "s1", { firstDiagnosisOnly: true }]);
    expect(await screen.findByTestId("first-run-accept")).toBeTruthy(); // the recommended next move is on screen
    expect(retry).toHaveBeenCalledTimes(1);
  });

  it("while the QuickBooks import runs the page re-reads persisted state (bounded) and then starts the read when the router says so", async () => {
    vi.useFakeTimers();
    api.context
      .mockResolvedValueOnce(ctx({ evidenceSources: { quickBooks: "IN_PROGRESS", manual: true, poll: true } }))
      .mockResolvedValueOnce(ctx({ evidenceSources: { quickBooks: "IN_PROGRESS", manual: true, poll: true } }))
      .mockResolvedValue(ctx({ state: "NEEDS_DIAGNOSIS", currentSnapshotId: "s9", evidenceSources: null }));
    retry.mockResolvedValue({ status: "diagnosed", snapshotId: "s9" });
    api.result.mockResolvedValue(view());
    render(<FirstRunFlow />);
    await act(async () => { await vi.advanceTimersByTimeAsync(100); });
    expect(retry).not.toHaveBeenCalled(); // still importing: nothing decided by the screen
    await act(async () => { await vi.advanceTimersByTimeAsync(6_100); });
    await act(async () => { await vi.advanceTimersByTimeAsync(6_100); });
    expect(retry).toHaveBeenCalledTimes(1);
    expect(retry.mock.calls[0][3]).toEqual({ firstDiagnosisOnly: true });
  });

  it("a failed first read keeps the numbers, says so, and the retry is again a first-only request", async () => {
    api.context.mockResolvedValue(ctx({ state: "NEEDS_DIAGNOSIS", currentSnapshotId: "s1", evidenceSources: null }));
    retry.mockResolvedValueOnce({ status: "diagnosis_failed", snapshotId: "s1", error: new Error("x") }).mockResolvedValue({ status: "diagnosed", snapshotId: "s1" });
    render(<FirstRunFlow />);
    expect((await screen.findByRole("alert")).textContent).toMatch(/numbers are saved/i);
    fireEvent.click(screen.getByText("Try the first read again"));
    await waitFor(() => expect(retry).toHaveBeenCalledTimes(2));
    expect(retry.mock.calls[1][3]).toEqual({ firstDiagnosisOnly: true });
  });
});

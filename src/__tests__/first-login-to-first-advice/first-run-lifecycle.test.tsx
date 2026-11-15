// @vitest-environment jsdom
/**
 * FirstRunFlow lifecycle under hostile conditions: business switching, remount/refresh, concurrent/out-of-order loads, a refused
 * first read, and an import that outlasts the polling window. The server-side guarantees are proven in the *.db.test.ts files.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor, fireEvent, cleanup, act } from "@testing-library/react";

const api = vi.hoisted(() => ({
  context: vi.fn(), result: vi.fn(), markViewed: vi.fn(), accept: vi.fn(), correct: vi.fn(),
  improve: vi.fn(), skipQuestion: vi.fn(), nextQuestion: vi.fn(), feedback: vi.fn(), createBusiness: vi.fn(), improveTarget: vi.fn(),
}));
const retry = vi.hoisted(() => vi.fn());
const active = vi.hoisted(() => ({ id: "bA" as string | null }));
vi.mock("@/lib/owner-first-run-client", () => ({ firstRunApi: api, newIdempotencyKey: () => `key-${Math.random().toString(36).slice(2, 12)}` }));
vi.mock("@/lib/owner-quick-start", () => ({ retryDiagnosis: retry }));
vi.mock("@/context/active-business-context", () => ({ useActiveBusiness: () => ({ refreshBusinesses: vi.fn(), setActiveBusinessId: vi.fn(), activeBusinessId: active.id, loading: false }) }));
vi.mock("@/components/owner/QuickFinancialPicture", () => ({ QuickFinancialPicture: () => <div data-testid="quick-stub" /> }));
vi.mock("@/components/owner/QuickBooksConnectionCard", () => ({ QuickBooksConnectionCard: () => <div data-testid="qbo-card-stub" /> }));
vi.mock("next/link", () => ({ default: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => <a href={href} {...rest}>{children}</a> }));

import { FirstRunFlow } from "@/components/owner/first-run/FirstRunFlow";
import { buildFirstMoneyRead } from "@/domain/owner-first-run/first-money-read";

const PERIOD = { start: "2026-09-01T00:00:00.000Z", end: "2026-09-30T00:00:00.000Z", state: "completed" as const };
const view = (businessId = "bA") => ({
  read: buildFirstMoneyRead({ period: PERIOD, finding: { title: "Fixed costs are high", summary: "x", sourceMetric: "fixed_cost_ratio", sourceValue: 0.6, evidence: [], missingData: [] }, action: { title: "Review fixed costs", description: "d", ownerRole: "owner", expectedTimeframeDays: 14, verificationMetric: "fixed_cost_ratio" }, dataRequest: null, confidenceScore: 60, evidenceQuality: "GOOD_ESTIMATE", missingEvidence: [] } as never),
  businessId, currency: "GBP", cycleId: "c1", snapshotId: "s1", candidateId: "x", presentedAction: { title: "Review fixed costs", verificationMetric: "fixed_cost_ratio", expectedTimeframeDays: 14 },
  decisionState: null, figures: { revenue: 1, fixedCosts: 1, variableCosts: 1, cashOnHand: 1 }, staleReason: null,
});
const ctx = (id: string, over: Record<string, unknown> = {}) => ({
  state: "NEEDS_EVIDENCE", href: "/owner/first-run", loginHref: "/owner/first-run", facts: {}, suggestedBusinessName: "Maple",
  business: { id, name: `Biz ${id}`, businessType: "laundry_local_service", currency: "GBP" },
  currentSnapshotId: null, latestCycleId: null, diagnosisStale: false, staleReason: null, firstTrustedInteractionAt: null, businessTypes: [], goalFamilies: [],
  evidenceSources: { quickBooks: "HIDDEN", manual: true, poll: false }, ...over,
});
const needsDiagnosis = (id: string, snap: string) => ctx(id, { state: "NEEDS_DIAGNOSIS", currentSnapshotId: snap, evidenceSources: null });
const importing = (id: string) => ctx(id, { evidenceSources: { quickBooks: "IN_PROGRESS", manual: true, poll: true } });

beforeEach(() => {
  vi.clearAllMocks();
  active.id = "bA";
  window.sessionStorage.clear();
  window.history.replaceState(null, "", "/owner/first-run");
  api.markViewed.mockResolvedValue({ ok: true });
  api.result.mockResolvedValue(view());
});
afterEach(() => { cleanup(); vi.useRealTimers(); });

describe("automatic first read: one attempt per (business, figures)", () => {
  it("switching to a DIFFERENT business that also needs its first read gets its own attempt (no 'working out…' forever)", async () => {
    api.context.mockImplementation(async (id: string | null) => (id === "bB" ? needsDiagnosis("bB", "sB") : needsDiagnosis("bA", "sA")));
    retry.mockResolvedValue({ status: "diagnosed", snapshotId: "x" });
    const { rerender } = render(<FirstRunFlow />);
    await waitFor(() => expect(retry).toHaveBeenCalledTimes(1));
    expect(retry.mock.calls[0].slice(1, 3)).toEqual(["bA", "sA"]);
    active.id = "bB";
    rerender(<FirstRunFlow />);
    await waitFor(() => expect(retry).toHaveBeenCalledTimes(2));
    expect(retry.mock.calls[1].slice(1, 3)).toEqual(["bB", "sB"]);
    expect(retry.mock.calls.every((c) => c[3]?.firstDiagnosisOnly === true)).toBe(true);
  });

  it("does not fire twice for the same business and figures while the screen re-renders", async () => {
    api.context.mockResolvedValue(needsDiagnosis("bA", "sA"));
    retry.mockImplementation(() => new Promise(() => undefined)); // still running
    const { rerender } = render(<FirstRunFlow />);
    await waitFor(() => expect(retry).toHaveBeenCalledTimes(1));
    rerender(<FirstRunFlow />);
    rerender(<FirstRunFlow />);
    expect(retry).toHaveBeenCalledTimes(1);
  });

  it("a remount or page refresh asks again (the server replays an already-committed read)", async () => {
    api.context.mockResolvedValue(needsDiagnosis("bA", "sA"));
    retry.mockResolvedValue({ status: "diagnosis_failed", snapshotId: "sA", error: new Error("lost") });
    const first = render(<FirstRunFlow />);
    await waitFor(() => expect(retry).toHaveBeenCalledTimes(1));
    first.unmount();
    render(<FirstRunFlow />);
    await waitFor(() => expect(retry).toHaveBeenCalledTimes(2));
    expect(retry.mock.calls[1][3]).toEqual({ firstDiagnosisOnly: true });
  });

  it("a refused first read (figures moved / a read exists) reloads the persisted state and shows the ordinary 'update my read'", async () => {
    api.context
      .mockResolvedValueOnce(needsDiagnosis("bA", "sA"))
      .mockResolvedValue(ctx("bA", { state: "FIRST_RESULT", currentSnapshotId: "sA2", latestCycleId: "c1", diagnosisStale: true, staleReason: "FIGURES_CHANGED", evidenceSources: null }));
    retry.mockResolvedValue({ status: "diagnosis_failed", snapshotId: "sA", error: new Error("409") });
    render(<FirstRunFlow />);
    expect(await screen.findByTestId("first-run-update-read")).toBeTruthy();
    expect(screen.queryByTestId("first-run-diagnosis-step")).toBeNull();
    expect(api.context.mock.calls.length).toBeGreaterThanOrEqual(2);
  });
});

describe("persisted-state loads cannot go backwards", () => {
  it("a slow EARLIER response never overwrites a newer one", async () => {
    vi.useFakeTimers();
    let release!: (v: unknown) => void;
    const slow = new Promise((r) => { release = r; });
    api.context
      .mockResolvedValueOnce(importing("bA"))      // initial
      .mockImplementationOnce(() => slow)           // poll #1: slow, will resolve late with the OLD state
      .mockResolvedValue(needsDiagnosis("bA", "sA")); // poll #2: newer truth
    retry.mockImplementation(() => new Promise(() => undefined));
    render(<FirstRunFlow />);
    await act(async () => { await vi.advanceTimersByTimeAsync(100); });
    await act(async () => { await vi.advanceTimersByTimeAsync(6_100); });
    await act(async () => { await vi.advanceTimersByTimeAsync(6_100); });
    expect(retry).toHaveBeenCalledTimes(1);
    await act(async () => { release(importing("bA")); await Promise.resolve(); });
    expect(screen.queryByTestId("first-run-quickbooks-progress")).toBeNull(); // did not regress to the import screen
    expect(screen.getByTestId("first-run-diagnosis-step")).toBeTruthy();
  });

  it("a response for the PREVIOUS business is dropped after switching", async () => {
    vi.useFakeTimers();
    let release!: (v: unknown) => void;
    const slowA = new Promise((r) => { release = r; });
    api.context.mockImplementation((id: string | null) => (id === "bA" ? slowA : Promise.resolve(ctx("bB"))));
    const { rerender } = render(<FirstRunFlow />);
    await act(async () => { await vi.advanceTimersByTimeAsync(100); });
    active.id = "bB";
    rerender(<FirstRunFlow />);
    await act(async () => { await vi.advanceTimersByTimeAsync(50); });
    expect(screen.getByText(/Biz bB/)).toBeTruthy();
    await act(async () => { release(ctx("bA")); await Promise.resolve(); });
    expect(screen.queryByText(/Biz bA/)).toBeNull();
    expect(screen.getByText(/Biz bB/)).toBeTruthy();
  });
});

describe("an import longer than the polling window", () => {
  it("says so truthfully, keeps a manual route, and offers an explicit 'Check again' that restarts the window", async () => {
    vi.useFakeTimers();
    api.context.mockResolvedValue(importing("bA"));
    render(<FirstRunFlow />);
    await act(async () => { await vi.advanceTimersByTimeAsync(100); });
    await act(async () => { await vi.advanceTimersByTimeAsync(6_000 * 41 + 100); });
    const slow = screen.getByTestId("first-run-quickbooks-slow");
    expect(slow.textContent).toMatch(/taking longer than usual/i);
    expect(slow.textContent).toMatch(/nothing is lost/i);
    expect(screen.queryByTestId("first-run-quickbooks-progress")).toBeNull();
    expect(screen.getByTestId("first-run-choose-manual")).toBeTruthy();
    const callsBefore = api.context.mock.calls.length;
    await act(async () => { await vi.advanceTimersByTimeAsync(60_000); });
    expect(api.context.mock.calls.length).toBe(callsBefore); // stopped polling: no indefinite background traffic

    api.context.mockResolvedValue(needsDiagnosis("bA", "sA"));
    retry.mockResolvedValue({ status: "diagnosed", snapshotId: "sA" });
    await act(async () => { fireEvent.click(screen.getByTestId("first-run-recheck-import")); await vi.advanceTimersByTimeAsync(50); });
    expect(api.context.mock.calls.length).toBeGreaterThan(callsBefore);
    expect(retry).toHaveBeenCalledTimes(1); // the recheck found enough evidence -> the first read starts
  });

  it("the window-ended notice does not leak to another business", async () => {
    vi.useFakeTimers();
    api.context.mockImplementation(async (id: string | null) => importing(id ?? "bA"));
    const { rerender } = render(<FirstRunFlow />);
    await act(async () => { await vi.advanceTimersByTimeAsync(100); });
    await act(async () => { await vi.advanceTimersByTimeAsync(6_000 * 41 + 100); });
    expect(screen.getByTestId("first-run-quickbooks-slow")).toBeTruthy();
    active.id = "bB";
    rerender(<FirstRunFlow />);
    await act(async () => { await vi.advanceTimersByTimeAsync(50); });
    expect(screen.queryByTestId("first-run-quickbooks-slow")).toBeNull();
    expect(screen.getByTestId("first-run-quickbooks-progress")).toBeTruthy();
  });
});

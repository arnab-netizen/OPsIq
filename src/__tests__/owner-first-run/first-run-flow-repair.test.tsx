// @vitest-environment jsdom
/**
 * FirstRunFlow behaviour for the repaired paths: acceptance names the read it is looking at and handles READ_STALE,
 * a correction whose diagnosis re-run failed is reported truthfully, and returning from "Add this" re-runs the read
 * and shows what changed. The server contract is proven in first-run-repair.db.test.ts; this proves the screen.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor, fireEvent, cleanup } from "@testing-library/react";

const api = vi.hoisted(() => ({
  context: vi.fn(), result: vi.fn(), markViewed: vi.fn(), accept: vi.fn(), correct: vi.fn(),
  improve: vi.fn(), skipQuestion: vi.fn(), nextQuestion: vi.fn(), feedback: vi.fn(), createBusiness: vi.fn(),
}));
const retry = vi.hoisted(() => vi.fn());
vi.mock("@/lib/owner-first-run-client", () => ({ firstRunApi: api, newIdempotencyKey: () => `key-${Math.random().toString(36).slice(2, 12)}` }));
vi.mock("@/lib/owner-quick-start", () => ({ retryDiagnosis: retry }));
vi.mock("@/context/active-business-context", () => ({ useActiveBusiness: () => ({ refreshBusinesses: vi.fn(), setActiveBusinessId: vi.fn() }) }));
vi.mock("@/components/owner/QuickFinancialPicture", () => ({ QuickFinancialPicture: () => <div data-testid="quick-stub" /> }));
vi.mock("next/link", () => ({
  default: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => <a href={href} {...rest}>{children}</a>,
}));

import { FirstRunFlow } from "@/components/owner/first-run/FirstRunFlow";
import { buildFirstMoneyRead } from "@/domain/owner-first-run/first-money-read";
import { HttpResponseError } from "@/lib/operator-safe-errors";
import { CORRECTION_SAVED_READ_PENDING_MESSAGE, READ_REFRESHED_AFTER_STALE_MESSAGE, READ_STALE_MESSAGE } from "@/domain/owner-first-run/read-staleness";

const PERIOD = { start: "2026-09-01T00:00:00.000Z", end: "2026-09-30T00:00:00.000Z", state: "completed" as const };
const finding = { title: "Fixed costs are high", summary: "Rent and wages are most of revenue.", sourceMetric: "fixed_cost_ratio", sourceValue: 0.6, evidence: [], missingData: [] };
const act = { title: "Review fixed costs", description: "Find the biggest two.", ownerRole: "owner", expectedTimeframeDays: 14, verificationMetric: "fixed_cost_ratio" };
const mkRead = (over: Record<string, unknown> = {}) => buildFirstMoneyRead({ period: PERIOD, finding, action: act, dataRequest: null, confidenceScore: 60, evidenceQuality: "GOOD_ESTIMATE", missingEvidence: ["Fixed costs"], ...over } as never);
const mkView = (cycleId: string, over: Record<string, unknown> = {}) => ({
  read: mkRead(), businessId: "b1", currency: "GBP", cycleId, snapshotId: "s1", candidateId: "domain_action:finance:a1",
  presentedAction: { title: act.title, verificationMetric: act.verificationMetric, expectedTimeframeDays: 14 }, decisionState: null, ...over,
});
const mkCtx = (over: Record<string, unknown> = {}) => ({
  state: "FIRST_RESULT", href: "/owner/first-run", loginHref: "/owner/cockpit", facts: {}, suggestedBusinessName: "Maple", business: { id: "b1", name: "Maple", businessType: "laundry_local_service", currency: "GBP" },
  currentSnapshotId: "s1", latestCycleId: "c1", diagnosisStale: false, firstTrustedInteractionAt: null, businessTypes: [], goalFamilies: [], ...over,
});

beforeEach(() => {
  vi.clearAllMocks();
  window.sessionStorage.clear();
  window.history.replaceState(null, "", "/owner/first-run");
  api.markViewed.mockResolvedValue({ ok: true });
});
afterEach(() => cleanup());

describe("accept names the read on screen and handles a stale read", () => {
  it("sends the cycle id of the read the owner is looking at", async () => {
    api.context.mockResolvedValue(mkCtx());
    api.result.mockResolvedValue(mkView("c1"));
    api.accept.mockResolvedValue({ replayed: false });
    render(<FirstRunFlow />);
    fireEvent.click(await screen.findByTestId("first-run-accept"));
    await waitFor(() => expect(api.accept).toHaveBeenCalled());
    expect(api.accept).toHaveBeenCalledWith("b1", "c1", expect.any(String));
  });
  it("on 409 READ_STALE it refreshes the read, says so (not 'update it' when it already is), and uses a fresh attempt key next time", async () => {
    api.context.mockResolvedValue(mkCtx());
    api.result.mockResolvedValueOnce(mkView("c1")).mockResolvedValue(mkView("c2"));
    api.accept.mockRejectedValueOnce(new HttpResponseError(READ_STALE_MESSAGE, 409, true)).mockResolvedValue({ replayed: false });
    render(<FirstRunFlow />);
    fireEvent.click(await screen.findByTestId("first-run-accept"));
    await waitFor(() => expect(screen.getByTestId("first-run-action-error").textContent).toBe(READ_REFRESHED_AFTER_STALE_MESSAGE));
    await waitFor(() => expect(api.result).toHaveBeenCalledTimes(2)); // the newer read was loaded
    const firstKey = api.accept.mock.calls[0][2];
    fireEvent.click(screen.getByTestId("first-run-accept"));
    await waitFor(() => expect(api.accept).toHaveBeenCalledTimes(2));
    expect(api.accept.mock.calls[1][1]).toBe("c2"); // now names the NEW read
    expect(api.accept.mock.calls[1][2]).not.toBe(firstKey);
  });
  it("a stale refusal when the figures are not yet re-diagnosed shows the update prompt and no usable old read", async () => {
    api.context.mockResolvedValueOnce(mkCtx()).mockResolvedValue(mkCtx({ diagnosisStale: true }));
    api.result.mockResolvedValue(mkView("c1"));
    api.accept.mockRejectedValue(new HttpResponseError(READ_STALE_MESSAGE, 409, true));
    render(<FirstRunFlow />);
    fireEvent.click(await screen.findByTestId("first-run-accept"));
    await waitFor(() => expect(screen.getByTestId("first-run-update-read")).toBeTruthy());
    expect(screen.queryByTestId("first-money-read")).toBeNull();
    expect(screen.getByTestId("first-run-stale-cockpit")).toBeTruthy(); // never a single dead-end button
    expect(screen.getByTestId("first-run-update-read").textContent).not.toContain(READ_REFRESHED_AFTER_STALE_MESSAGE);
  });
});

describe("correction whose diagnosis re-run failed", () => {
  it("states the corrected numbers were saved, withdraws the old read, and offers a retry that restores a read", async () => {
    api.context.mockResolvedValueOnce(mkCtx()).mockResolvedValue(mkCtx({ diagnosisStale: true, currentSnapshotId: "s2" }));
    api.result.mockResolvedValue(mkView("c1"));
    api.correct.mockResolvedValue({ before: {}, after: null, diagnosisFailed: true, changedFields: ["revenue"], newSnapshotId: "s2", previousSnapshotId: "s1" });
    render(<FirstRunFlow />);
    fireEvent.click(await screen.findByTestId("first-run-correct"));
    fireEvent.change(await screen.findByLabelText(/revenue/i), { target: { value: "8000" } });
    fireEvent.click(screen.getByTestId("first-result-correction-submit"));
    const note = await screen.findByTestId("first-run-update-read-note");
    expect(note.textContent).toBe(CORRECTION_SAVED_READ_PENDING_MESSAGE);
    expect(screen.queryByTestId("first-money-read")).toBeNull(); // the previous recommendation is not shown
    expect(screen.queryByTestId("first-result-correction-error")).toBeNull(); // not reported as a failed correction
    // retry
    retry.mockResolvedValue({ status: "diagnosed", snapshotId: "s2" });
    api.context.mockResolvedValue(mkCtx({ currentSnapshotId: "s2" }));
    api.result.mockResolvedValue(mkView("c2", { snapshotId: "s2" }));
    fireEvent.click(screen.getByRole("button", { name: /update my read/i }));
    await waitFor(() => expect(retry).toHaveBeenCalledWith(expect.anything(), "b1", "s2"));
    await screen.findByTestId("first-money-read");
  });
});

describe("returning from 'Add this'", () => {
  it("re-runs the canonical diagnosis once, clears the round trip, and shows what changed", async () => {
    window.sessionStorage.setItem("opsiq:first-run:round-trip", "1");
    window.sessionStorage.setItem("opsiq:first-run:before", JSON.stringify({
      recommendedAction: "Review fixed costs", confidenceTier: "LOW", evidenceQuality: "GOOD_ESTIMATE", missingEvidence: ["Fixed costs", "Receivables"], questionLabel: "Fixed costs",
    }));
    window.history.replaceState(null, "", "/owner/first-run?update=1");
    api.context.mockResolvedValue(mkCtx());
    retry.mockResolvedValue({ status: "diagnosed", snapshotId: "s1" });
    api.result.mockResolvedValue(mkView("c2", { read: mkRead({ confidenceScore: 90, missingEvidence: ["Receivables"] }) }));
    render(<FirstRunFlow />);
    const panel = await screen.findByTestId("first-result-improved");
    expect(retry).toHaveBeenCalledTimes(1);
    expect(panel.textContent).toMatch(/You went to add: fixed costs/);
    expect(panel.textContent).toMatch(/How sure OpsIQ is: low → high/);
    expect(panel.textContent).toMatch(/No longer missing: fixed costs/i);
    expect(panel.textContent).toMatch(/Recommendation: Review fixed costs \(unchanged\)/);
    expect(window.sessionStorage.getItem("opsiq:first-run:round-trip")).toBeNull();
    expect(window.location.search).toBe(""); // a reload does not repeat the refresh
  });
  it("works without per-viewer storage (nothing to compare, but the read is still refreshed)", async () => {
    window.history.replaceState(null, "", "/owner/first-run?update=1");
    api.context.mockResolvedValue(mkCtx());
    retry.mockResolvedValue({ status: "diagnosed", snapshotId: "s1" });
    api.result.mockResolvedValue(mkView("c2"));
    render(<FirstRunFlow />);
    const panel = await screen.findByTestId("first-result-improved");
    expect(panel.textContent).toMatch(/re-run on your latest information/);
  });
  it("a failed refresh offers the existing retry, not a dead end", async () => {
    window.history.replaceState(null, "", "/owner/first-run?update=1");
    api.context.mockResolvedValue(mkCtx());
    retry.mockResolvedValue({ status: "diagnosis_failed", snapshotId: "s1", error: new Error("x") });
    api.result.mockResolvedValue(mkView("c1"));
    render(<FirstRunFlow />);
    await waitFor(() => expect(retry).toHaveBeenCalled());
    expect(screen.queryByTestId("first-result-improved")).toBeNull();
  });
});

describe("the read card derives its claim from the runtime scope", () => {
  it("shows the period/provisional/quality line and money-only scope", async () => {
    api.context.mockResolvedValue(mkCtx());
    api.result.mockResolvedValue(mkView("c1", { read: mkRead({ period: { ...PERIOD, state: "provisional" }, evidenceQuality: "ROUGH_ESTIMATE" }) }));
    render(<FirstRunFlow />);
    const basis = await screen.findByTestId("first-money-read-basis");
    expect(basis.textContent).toBe("Based on your September 2026 figures so far · still in progress (provisional) · A rough guess");
    expect(basis.getAttribute("data-period-state")).toBe("provisional");
    const scope = screen.getByTestId("first-money-read-scope");
    expect(scope.getAttribute("data-scope-kind")).toBe("FINANCIAL_FIRST_READ");
    expect(scope.textContent).toMatch(/money figures only/);
    expect(document.body.textContent).not.toMatch(/workspace/i);
  });
});

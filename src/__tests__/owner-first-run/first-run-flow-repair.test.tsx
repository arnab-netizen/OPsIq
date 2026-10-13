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
  improve: vi.fn(), skipQuestion: vi.fn(), nextQuestion: vi.fn(), feedback: vi.fn(), createBusiness: vi.fn(), improveTarget: vi.fn(),
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
  presentedAction: { title: act.title, verificationMetric: act.verificationMetric, expectedTimeframeDays: 14 }, decisionState: null,
  figures: { revenue: 12000, fixedCosts: 7000, variableCosts: 4000, cashOnHand: 1500 }, staleReason: null, ...over,
});
const mkCtx = (over: Record<string, unknown> = {}) => ({
  state: "FIRST_RESULT", href: "/owner/first-run", loginHref: "/owner/cockpit", facts: {}, suggestedBusinessName: "Maple", business: { id: "b1", name: "Maple", businessType: "laundry_local_service", currency: "GBP" },
  currentSnapshotId: "s1", latestCycleId: "c1", diagnosisStale: false, staleReason: null, firstTrustedInteractionAt: null, businessTypes: [], goalFamilies: [], ...over,
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
  it("works without per-viewer storage: the read is refreshed, but NO improvement is claimed (there is nothing to compare)", async () => {
    window.history.replaceState(null, "", "/owner/first-run?update=1");
    api.context.mockResolvedValue(mkCtx());
    retry.mockResolvedValue({ status: "diagnosed", snapshotId: "s1" });
    api.result.mockResolvedValue(mkView("c2"));
    render(<FirstRunFlow />);
    const panel = await screen.findByTestId("first-result-improved");
    expect(panel.getAttribute("data-outcome")).toBe("UNCOMPARABLE");
    expect(panel.textContent).toMatch(/Your read was re-run/);
    expect(panel.textContent).toMatch(/can't compare it/);
    expect(panel.textContent).not.toMatch(/re-run on your latest information|improved|What changed/i);
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

describe("returning from Improve — the summary is truthful", () => {
  const tokensOf = (read: ReturnType<typeof mkRead>, extra: Record<string, unknown> = {}) => ({
    recommendedAction: read.recommendedAction, confidenceTier: read.confidenceTier, evidenceQuality: read.evidenceQuality, missingEvidence: read.missingEvidence,
    questionLabel: "Payroll / staff cost", category: "payroll", cycleId: "c1", noticed: read.noticed, sharpenBy: read.sharpenBy?.title ?? null, cautions: read.cautions, ...extra,
  });
  function arrive(before: Record<string, unknown>) {
    window.sessionStorage.setItem("opsiq:first-run:round-trip", "1");
    window.sessionStorage.setItem("opsiq:first-run:before", JSON.stringify(before));
    window.history.replaceState(null, "", "/owner/first-run?update=1");
    api.context.mockResolvedValue(mkCtx());
    retry.mockResolvedValue({ status: "diagnosed", snapshotId: "s1" });
  }
  it("an identical read says 'Nothing changed in your read' and never claims improvement", async () => {
    const same = mkRead();
    arrive(tokensOf(same));
    api.result.mockResolvedValue(mkView("c2", { read: mkRead() }));
    api.improveTarget.mockResolvedValue({ target: { kind: "EDIT_FINANCE", category: "payroll", hasValue: false, actionLabel: "Add this", currentValues: [] } });
    render(<FirstRunFlow />);
    const panel = await screen.findByTestId("first-result-improved");
    expect(panel.getAttribute("data-outcome")).toBe("UNCHANGED");
    expect(screen.getByTestId("first-result-improved-headline").textContent).toBe("Nothing changed in your read");
    expect(panel.textContent).toMatch(/still missing/);
    expect(panel.textContent).not.toMatch(/What changed|improved|latest information|No longer missing/i);
    expect(api.improveTarget).toHaveBeenCalledWith("b1", "payroll"); // the SERVER is asked whether what was saved is used
  });
  it("evidence saved for a period the read does not use: says so plainly, with both periods", async () => {
    const same = mkRead();
    arrive(tokensOf(same));
    api.result.mockResolvedValue(mkView("c2", { read: mkRead() }));
    const explanation = "Saved, but this read doesn't use it, because it covers October 2026 and your read covers September 2026.";
    api.improveTarget.mockResolvedValue({ target: { kind: "NOT_USED_BY_READ", category: "cash_debt", reason: "PERIOD_MISMATCH", explanation, afterExplanation: explanation, actionLabel: "Add this", addHref: "/x", next: null } });
    render(<FirstRunFlow />);
    const panel = await screen.findByTestId("first-result-improved");
    expect(panel.getAttribute("data-outcome")).toBe("NOT_USED");
    expect(screen.getByTestId("first-result-improved-headline").textContent).toBe("Saved, but this read doesn't use it");
    expect(panel.textContent).toContain(explanation);
    expect(panel.textContent).not.toMatch(/What changed after you added that/);
  });
  it("a real change is described from the before/after tokens", async () => {
    const before = mkRead();
    arrive(tokensOf(before, { missingEvidence: ["Fixed costs", "Receivables"] }));
    api.result.mockResolvedValue(mkView("c2", { read: mkRead({ confidenceScore: 90, missingEvidence: ["Receivables"] }) }));
    api.improveTarget.mockResolvedValue({ target: { kind: "EDIT_FINANCE", category: "payroll", hasValue: true, actionLabel: "Edit this", currentValues: [] } });
    render(<FirstRunFlow />);
    const panel = await screen.findByTestId("first-result-improved");
    expect(panel.getAttribute("data-outcome")).toBe("CHANGED");
    expect(panel.textContent).toMatch(/No longer missing: fixed costs/i);
  });
  it("a failed re-run keeps the owner on the read with the retry and shows NO improvement summary", async () => {
    arrive(tokensOf(mkRead()));
    retry.mockResolvedValue({ status: "diagnosis_failed", snapshotId: "s1", error: new Error("x") });
    api.result.mockResolvedValue(mkView("c1"));
    render(<FirstRunFlow />);
    await screen.findByTestId("first-run-update-failed");
    expect(screen.queryByTestId("first-result-improved")).toBeNull();
    expect(screen.getByRole("button", { name: /try the update again/i })).toBeTruthy();
  });
});

describe("a read that went stale because the bank balance changed", () => {
  it("is withdrawn with the truthful reason and a way to update it — no Accept on the old read", async () => {
    api.context.mockResolvedValue(mkCtx({ diagnosisStale: true, staleReason: "CASH_POSITION_CHANGED" }));
    api.result.mockResolvedValue(mkView("c1"));
    render(<FirstRunFlow />);
    const headline = await screen.findByTestId("first-run-update-read-headline");
    expect(headline.textContent).toBe("Your cash figures changed since this read.");
    expect(headline.getAttribute("data-stale-reason")).toBe("CASH_POSITION_CHANGED");
    expect(screen.getByTestId("first-run-update-read-note").textContent).toMatch(/cash figures changed since this read was made/);
    expect(screen.queryByTestId("first-run-accept")).toBeNull();
    expect(screen.getByRole("button", { name: /update my read/i })).toBeTruthy();
  });
  it("a read loaded while stale (another tab changed the balance) is withdrawn too, even if the context was fresh", async () => {
    api.context.mockResolvedValue(mkCtx());
    api.result.mockResolvedValue(mkView("c1", { staleReason: "CASH_POSITION_CHANGED" }));
    render(<FirstRunFlow />);
    await screen.findByTestId("first-run-update-read");
    expect(screen.queryByTestId("first-run-accept")).toBeNull();
    expect(screen.getByTestId("first-run-update-read-headline").textContent).toBe("Your cash figures changed since this read.");
  });
  it("corrected figures keep their own wording", async () => {
    api.context.mockResolvedValue(mkCtx({ diagnosisStale: true, staleReason: "FIGURES_CHANGED" }));
    render(<FirstRunFlow />);
    expect((await screen.findByTestId("first-run-update-read-headline")).textContent).toBe("Your numbers have changed since your last read.");
  });
});

describe("the Correct flow opened by an Improve answer", () => {
  it("?correct=<category> opens the form on the server's fields with the CURRENT values shown", async () => {
    window.history.replaceState(null, "", "/owner/first-run?correct=payroll");
    api.context.mockResolvedValue(mkCtx());
    api.result.mockResolvedValue(mkView("c1"));
    api.improveTarget.mockResolvedValue({ target: { kind: "EDIT_FINANCE", category: "payroll", snapshotId: "s1", hasValue: true, actionLabel: "Edit this", currency: "GBP", currentValues: [{ field: "salaryPayroll", label: "Payroll / staff cost", value: 4200 }] } });
    render(<FirstRunFlow />);
    await screen.findByTestId("first-result-correction");
    expect(api.improveTarget).toHaveBeenCalledWith("b1", "payroll");
    expect(screen.getByLabelText(/payroll \/ staff cost/i)).toBeTruthy();
    expect(screen.getByText(/Recorded now: GBP 4,200/)).toBeTruthy();
    expect(screen.getByText(/Recorded now: GBP 12,000/)).toBeTruthy(); // the other figures show what is recorded too
    expect(window.location.search).toBe(""); // the deep link is consumed
  });
  it("a deep link whose server answer is not an Edit does not open a form", async () => {
    window.history.replaceState(null, "", "/owner/first-run?correct=marketing");
    api.context.mockResolvedValue(mkCtx());
    api.result.mockResolvedValue(mkView("c1"));
    api.improveTarget.mockResolvedValue({ target: { kind: "NOT_USED_BY_READ", category: "marketing" } });
    render(<FirstRunFlow />);
    await screen.findByTestId("first-money-read");
    await waitFor(() => expect(api.improveTarget).toHaveBeenCalled());
    expect(screen.queryByTestId("first-result-correction")).toBeNull();
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

describe("an in-place Improve edit leaves no round trip behind", () => {
  const FIN = {
    kind: "EDIT_FINANCE", category: "payroll", actionLabel: "Edit this", why: "w", readPeriodLabel: "September 2026", snapshotId: "s1",
    href: "/owner/first-run?correct=payroll", currency: "GBP", hasValue: true,
    currentValues: [{ field: "salaryPayroll", label: "Payroll / staff cost", value: 4200 }],
  };
  const question = { result: { done: false, question: { category: "payroll", label: "Payroll", request: "Payroll", why: "w", couldChange: "c", effort: "low", effortLabel: "About a minute" } }, target: FIN, inputHref: null, inputActionLabel: null, progress: { handled: 0, max: 3 } };
  const markers = () => [window.sessionStorage.getItem("opsiq:first-run:before"), window.sessionStorage.getItem("opsiq:first-run:round-trip")];

  async function openEditFromImprove() {
    api.context.mockResolvedValue(mkCtx());
    api.result.mockResolvedValue(mkView("c1"));
    api.improve.mockResolvedValue({ replayed: false });
    api.nextQuestion.mockResolvedValue(question);
    render(<FirstRunFlow />);
    fireEvent.click(await screen.findByTestId("first-run-improve"));
    fireEvent.click(await screen.findByTestId("first-result-improvement-add"));
    await screen.findByTestId("first-result-correction");
  }

  it("starting the edit never keeps a 'before' for a trip that is not happening (and drops an abandoned earlier one)", async () => {
    window.sessionStorage.setItem("opsiq:first-run:before", JSON.stringify({ confidenceTier: "LOW", questionLabel: "Old", missingEvidence: [] }));
    window.sessionStorage.setItem("opsiq:first-run:round-trip", "1");
    await openEditFromImprove();
    expect(markers()).toEqual([null, null]);
    await waitFor(() => expect(api.improve).toHaveBeenCalledWith("b1", "payroll")); // the request itself is still recorded
  });
  it("completing the edit clears the marker (the return bar stops nagging; a later update compares nothing stale)", async () => {
    await openEditFromImprove();
    window.sessionStorage.setItem("opsiq:first-run:before", JSON.stringify({ confidenceTier: "LOW", questionLabel: "Payroll", missingEvidence: [] }));
    window.sessionStorage.setItem("opsiq:first-run:round-trip", "1");
    api.correct.mockResolvedValue({
      before: { confidenceTier: "LOW", evidenceQuality: "GOOD_ESTIMATE", recommendedAction: "Review fixed costs", noticed: "n", actualValue: null },
      after: mkView("c2", { snapshotId: "s2" }), diagnosisFailed: false, changedFields: ["salaryPayroll"], newSnapshotId: "s2", previousSnapshotId: "s1",
    });
    fireEvent.change(screen.getByLabelText(/payroll \/ staff cost/i), { target: { value: "5000" } });
    fireEvent.click(screen.getByTestId("first-result-correction-submit"));
    await waitFor(() => expect(screen.queryByTestId("first-result-correction")).toBeNull());
    expect(markers()).toEqual([null, null]);
  });
  it("a correction whose re-run failed also clears it (the old 'before' is stale either way)", async () => {
    await openEditFromImprove();
    window.sessionStorage.setItem("opsiq:first-run:round-trip", "1");
    window.sessionStorage.setItem("opsiq:first-run:before", "{}");
    api.correct.mockResolvedValue({ before: {}, after: null, diagnosisFailed: true, changedFields: ["salaryPayroll"], newSnapshotId: "s2", previousSnapshotId: "s1" });
    fireEvent.change(screen.getByLabelText(/payroll \/ staff cost/i), { target: { value: "5000" } });
    fireEvent.click(screen.getByTestId("first-result-correction-submit"));
    await waitFor(() => expect(screen.queryByTestId("first-result-correction")).toBeNull());
    expect(markers()).toEqual([null, null]);
  });
  it("cancelling an edit opened from Improve clears it; cancelling a plain Correct leaves another pending trip alone", async () => {
    await openEditFromImprove();
    window.sessionStorage.setItem("opsiq:first-run:round-trip", "1");
    window.sessionStorage.setItem("opsiq:first-run:before", "{}");
    fireEvent.click(screen.getByRole("button", { name: /cancel/i }));
    await waitFor(() => expect(screen.queryByTestId("first-result-correction")).toBeNull());
    expect(markers()).toEqual([null, null]);

    window.sessionStorage.setItem("opsiq:first-run:round-trip", "1");
    window.sessionStorage.setItem("opsiq:first-run:before", "{}");
    fireEvent.click(screen.getByTestId("first-run-correct"));
    await screen.findByTestId("first-result-correction");
    fireEvent.click(screen.getByRole("button", { name: /cancel/i }));
    await waitFor(() => expect(screen.queryByTestId("first-result-correction")).toBeNull());
    expect(markers()).toEqual(["{}", "1"]);
  });
});

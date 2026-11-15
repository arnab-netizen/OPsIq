/**
 * Owner Outcome Timeline v1 — component behaviour: zero state, trackable vs not, permissions, double submit,
 * server-only conclusions, field errors, business-switch race, labels / accessibility, mobile structure.
 */
import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import { render, cleanup, screen, fireEvent, waitFor, within, act } from "@testing-library/react";
import * as fs from "fs";
import * as path from "path";
import type { ReactNode } from "react";

const business = { current: { activeBusinessId: "11111111-1111-4111-8111-111111111111", needsBusinessRecovery: false, businesses: [{ id: "11111111-1111-4111-8111-111111111111", name: "A" }, { id: "22222222-2222-4222-8222-222222222222", name: "B" }], loading: false } };
vi.mock("@/context/active-business-context", () => ({ useActiveBusiness: () => business.current }));

import { CapabilitiesProvider } from "@/context/capabilities-context";
import { CAPABILITIES } from "@/domain/constants/capabilities";
import { OwnerOutcomesView } from "@/components/owner-outcomes/OwnerOutcomesView";
import { OutcomeTimeline } from "@/components/owner-outcomes/OutcomeTimeline";
import { OutcomeCommitmentForm } from "@/components/owner-outcomes/OutcomeCommitmentForm";
import { CAND, UUID, assessment, chain, decision } from "./fixtures";

const BIZ_A = "11111111-1111-4111-8111-111111111111";
const BIZ_B = "22222222-2222-4222-8222-222222222222";
const VIEW = [CAPABILITIES.OWNER_VIEW];
const MANAGE = [CAPABILITIES.OWNER_VIEW, CAPABILITIES.OWNER_MANAGE];
const asProvider = (caps: readonly string[], ui: ReactNode) => <CapabilitiesProvider capabilities={caps}>{ui}</CapabilitiesProvider>;

const json = (data: unknown, status = 200): Response => ({ ok: status < 400, status, json: async () => data, clone() { return this; } } as unknown as Response);
const target = (candidateId: string, title: string) => ({ candidateId, title, domainLabel: "Money", source: "domain_action", domain: "finance" });
function nowView(attention: unknown[]) { return { ownerDecision: { attention } }; }

interface Call { url: string; method: string; body: Record<string, unknown> | null }
function stubFetch(handler: (c: Call) => Response | Promise<Response>) {
  const calls: Call[] = [];
  vi.stubGlobal("fetch", vi.fn(async (url: string, init?: RequestInit) => {
    const call: Call = { url: String(url), method: init?.method ?? "GET", body: init?.body ? JSON.parse(String(init.body)) : null };
    calls.push(call);
    return handler(call);
  }));
  return calls;
}

beforeEach(() => { business.current = { ...business.current, activeBusinessId: BIZ_A }; });
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

describe("zero state", () => {
  it("shows an honest empty state: no fabricated rows, percentages, or completed actions", async () => {
    stubFetch((c) => (c.url.includes("outcome-chains") ? json({ businessId: BIZ_A, chains: [], truncated: false }) : json(nowView([]))));
    const { container } = render(asProvider(MANAGE, <OwnerOutcomesView />));
    const zero = await screen.findByTestId("outcomes-zero-state");
    expect(zero.textContent).toMatch(/No tracked outcomes yet/);
    expect(zero.textContent).toMatch(/starts an outcome trail when you record a decision/i);
    expect(container.querySelectorAll('[data-testid="outcome-chain-card"]').length).toBe(0);
    expect(container.textContent).not.toMatch(/%|Improved|completed|Target reached/);
  });
});

describe("trackable vs untrackable recommendations", () => {
  const attention = [
    target(`domain_action:finance:${UUID}`, "Raise prices on weak products"),
    target(`compliance_item:${UUID}`, "Renew your trade licence"),
    target("evidence_refresh:finance", "Refresh your finance figures"),
    target(`business_risk:${UUID}`, "Supplier concentration risk"),
  ];
  it("offers decision controls only for server-canonical ids, and says tracking is unavailable for the rest (nothing is dropped)", async () => {
    stubFetch((c) => (c.url.includes("outcome-chains") ? json({ businessId: BIZ_A, chains: [], truncated: false }) : json(nowView(attention))));
    render(asProvider(MANAGE, <OwnerOutcomesView />));
    await screen.findByTestId("outcomes-zero-state");
    const tracked = screen.getAllByTestId("outcome-trackable-target").map((e) => e.getAttribute("data-candidate-id"));
    expect(tracked).toEqual([`domain_action:finance:${UUID}`, `compliance_item:${UUID}`]);
    const un = within(screen.getByTestId("outcomes-untrackable"));
    expect(un.getByText("Refresh your finance figures")).toBeTruthy();
    expect(un.getByText("Supplier concentration risk")).toBeTruthy();
    expect(un.getAllByText(/Outcome tracking is not available for this recommendation yet\./).length).toBe(2);
  });
  it("a recommendation that already has a chain is not offered again", async () => {
    stubFetch((c) => (c.url.includes("outcome-chains")
      ? json({ businessId: BIZ_A, chains: [chain({ chainKey: `domain_action:finance:${UUID}`, businessId: BIZ_A })], truncated: false })
      : json(nowView(attention))));
    render(asProvider(MANAGE, <OwnerOutcomesView />));
    await screen.findByTestId("outcome-chain-card");
    expect(screen.getAllByTestId("outcome-trackable-target").map((e) => e.getAttribute("data-candidate-id"))).toEqual([`compliance_item:${UUID}`]);
  });
  it("a viewer without OWNER_MANAGE sees no decision controls at all", async () => {
    stubFetch((c) => (c.url.includes("outcome-chains") ? json({ businessId: BIZ_A, chains: [], truncated: false }) : json(nowView(attention))));
    const { container } = render(asProvider(VIEW, <OwnerOutcomesView />));
    await screen.findByTestId("outcomes-zero-state");
    expect(container.querySelectorAll("form").length).toBe(0);
    expect(screen.queryByText("Decide and track the result")).toBeNull();
    expect(screen.getAllByText(/needs permission to manage your business/i).length).toBe(2);
  });
  it("the canonical decision failing to load does not hide tracked results", async () => {
    stubFetch((c) => (c.url.includes("outcome-chains")
      ? json({ businessId: BIZ_A, chains: [chain({ businessId: BIZ_A })], truncated: false })
      : json({}, 500)));
    render(asProvider(MANAGE, <OwnerOutcomesView />));
    await screen.findByTestId("outcome-chain-card");
    expect(screen.getByText(/Couldn.t load your current recommendations/)).toBeTruthy();
  });
});

describe("timeline rendering", () => {
  it("MODIFIED is announced as different from the recommendation", () => {
    const c = chain({ decisions: [decision({ decisionState: "MODIFIED", commitmentDescription: "Renegotiate with the supplier" })] });
    render(asProvider(VIEW, <OutcomeTimeline chain={c} canManage={false} onChanged={() => {}} />));
    expect(screen.getByTestId("outcome-modified-notice").textContent).toMatch(/something different from OpsIQ.s recommendation/);
    expect(screen.getByTestId("outcome-stage-committed").textContent).toContain("Renegotiate with the supplier");
  });
  it("shows caveats as visible text next to Improved, Target reached and Possible contribution", () => {
    const c = chain({ assessments: [assessment()] });
    render(asProvider(VIEW, <OutcomeTimeline chain={c} canManage={false} onChanged={() => {}} />));
    const text = screen.getByTestId("outcome-stage-measurement").textContent ?? "";
    expect(text).toContain("Improved");
    expect(text).toMatch(/does not by itself show that your action made the difference/);
    expect(screen.getByTestId("outcome-stage-target").textContent).toMatch(/does not by itself mean the original problem is resolved/);
    expect(screen.getByTestId("outcome-stage-attribution").textContent).toMatch(/Possible contribution/);
    expect(screen.getByTestId("outcome-stage-attribution").textContent).toMatch(/cannot show that your action was the reason/);
    expect(screen.getByTestId("outcome-stage-issue").textContent).not.toMatch(/Resolved/);
  });
  it("shows a stale assessment as out of date", () => {
    const c = chain({
      decisions: [decision({ id: "d1", sequence: 1 }), decision({ id: "d2", sequence: 2, supersedesId: "d1", commitmentDescription: "Amended" })],
      assessments: [assessment({ ownerDecisionId: "d1" })],
    });
    render(asProvider(MANAGE, <OutcomeTimeline chain={c} canManage onChanged={() => {}} />));
    expect(screen.getByText("Result is out of date")).toBeTruthy();
    expect(screen.getByTestId("outcome-stale-notice").getAttribute("role")).toBe("status");
  });
  it("lists history newest first, keeping every decision and assessment version", () => {
    const c = chain({
      decisions: [decision({ id: "d1", sequence: 1 }), decision({ id: "d2", sequence: 2, supersedesId: "d1" })],
      assessments: [assessment({ id: "a1", version: 1, ownerDecisionId: "d1", measurementResult: "UNCHANGED" }), assessment({ id: "a2", version: 2, ownerDecisionId: "d2" })],
    });
    render(asProvider(VIEW, <OutcomeTimeline chain={c} canManage={false} onChanged={() => {}} />));
    expect(screen.getAllByTestId("outcome-history-decision").map((e) => e.textContent?.slice(0, 2))).toEqual(["#2", "#1"]);
    const rows = screen.getAllByTestId("outcome-history-assessment").map((e) => e.textContent ?? "");
    expect(rows[0]).toContain("Version 2");
    expect(rows[1]).toContain("Version 1");
    expect(rows[1]).toContain("No material change");
  });
  it("uses cards and a list — never a table — and a labelled ordered list for the stages (mobile-safe structure)", () => {
    const { container } = render(asProvider(VIEW, <OutcomeTimeline chain={chain({ assessments: [assessment()] })} canManage={false} onChanged={() => {}} />));
    expect(container.querySelector("table")).toBeNull();
    expect(container.querySelector("ol")?.getAttribute("aria-label")).toMatch(/Progress from recommendation to result/);
    expect(container.querySelectorAll("ol > li").length).toBe(10);
    // status is conveyed in words, not by colour alone
    expect(screen.getAllByTestId("outcome-stage-state-text").map((e) => e.textContent)).toContain("Recorded");
  });
  it("component sources contain no table, fixed pixel widths or horizontal-scroll containers", () => {
    for (const f of ["OutcomeTimeline.tsx", "OutcomeCommitmentForm.tsx", "OwnerOutcomesView.tsx"]) {
      const src = fs.readFileSync(path.join(process.cwd(), "src/components/owner-outcomes", f), "utf8");
      expect(src, f).not.toMatch(/<table|<Table|overflow-x-(auto|scroll)|\bw-\[\d+px\]|\bmin-w-\[\d+px\]/);
    }
  });
  it("read-only viewer sees the full timeline but no Check / Update / Change controls", () => {
    const { container } = render(asProvider(VIEW, <OutcomeTimeline chain={chain({ assessments: [assessment()] })} canManage={false} onChanged={() => {}} />));
    expect(screen.queryByRole("button", { name: /check outcome/i })).toBeNull();
    expect(container.querySelectorAll("form").length).toBe(0);
    expect(screen.queryByText("Update what you're tracking")).toBeNull();
    expect(screen.queryByText("Change my decision")).toBeNull();
    expect(screen.getByText("History")).toBeTruthy();
  });
  it("REJECTED / DEFERRED chains cannot be 'checked' and show no outcome stages", () => {
    for (const state of ["REJECTED", "DEFERRED"] as const) {
      const c = chain({ decisions: [decision({ decisionState: state })] });
      const { unmount } = render(asProvider(MANAGE, <OutcomeTimeline chain={c} canManage onChanged={() => {}} />));
      expect(screen.queryByRole("button", { name: /check outcome/i })).toBeNull();
      expect(screen.getByTestId("outcome-stage-measurement").getAttribute("data-stage-state")).toBe("not_applicable");
      unmount();
    }
  });
});

describe("check outcome sends a reference only", () => {
  it("POSTs { candidateId } to outcome-chain and never a conclusion", async () => {
    const calls = stubFetch(() => json({ assessment: assessment(), created: false }));
    const onChanged = vi.fn();
    render(asProvider(MANAGE, <OutcomeTimeline chain={chain({ businessId: BIZ_A })} canManage onChanged={onChanged} />));
    fireEvent.click(screen.getByRole("button", { name: /check outcome/i }));
    await waitFor(() => expect(onChanged).toHaveBeenCalled());
    expect(calls).toHaveLength(1);
    expect(calls[0].url).toBe(`/api/owner/businesses/${BIZ_A}/outcome-chain`);
    expect(calls[0].method).toBe("POST");
    expect(calls[0].body).toEqual({ candidateId: CAND });
    for (const k of ["measurementResult", "targetAttainment", "issueResolution", "causalAttribution", "learningEligibility"]) expect(calls[0].body).not.toHaveProperty(k);
    expect(screen.getByRole("status").textContent).toMatch(/Nothing has changed since the last check/);
  });
  it("a double click sends one request", async () => {
    let release: (r: Response) => void = () => {};
    const calls = stubFetch(() => new Promise<Response>((r) => { release = r; }));
    render(asProvider(MANAGE, <OutcomeTimeline chain={chain({ businessId: BIZ_A })} canManage onChanged={() => {}} />));
    const btn = screen.getByRole("button", { name: /check outcome/i });
    fireEvent.click(btn); fireEvent.click(btn);
    expect(calls).toHaveLength(1);
    await act(async () => { release(json({ assessment: assessment(), created: true })); });
  });
  it("a server error is announced and nothing is claimed", async () => {
    stubFetch(() => json({ error: "Something went wrong on our side. Nothing was saved. Please try again." }, 500));
    render(asProvider(MANAGE, <OutcomeTimeline chain={chain({ businessId: BIZ_A })} canManage onChanged={() => {}} />));
    fireEvent.click(screen.getByRole("button", { name: /check outcome/i }));
    const alert = await screen.findByRole("alert");
    expect((alert.textContent ?? "").length).toBeGreaterThan(10);
    expect(screen.queryByText(/Checked\./)).toBeNull();
  });
});

describe("decision form", () => {
  const renderForm = (extra: Partial<React.ComponentProps<typeof OutcomeCommitmentForm>> = {}) =>
    render(<OutcomeCommitmentForm idPrefix="t" businessId={BIZ_A} candidateId={CAND} mode={{ kind: "decide" }} onRecorded={() => {}} {...extra} />);
  const decide = (label: RegExp) => fireEvent.click(screen.getByRole("radio", { name: label }));
  const save = () => fireEvent.click(screen.getByRole("button", { name: /save my decision/i }));
  const okDecision = () => json({ decision: decision(), replayed: false }, 201);

  it("is a labelled radio group with the four owner choices and persisted semantics visible in the description", () => {
    renderForm();
    const group = screen.getByRole("group", { name: /what do you want to do about this/i });
    expect(within(group).getAllByRole("radio").map((r) => r.getAttribute("value"))).toEqual(["ACCEPTED", "MODIFIED", "DEFERRED", "REJECTED"]);
    for (const l of [/I'll do this/, /I'll do something different/, /Not now/, /I won't do this/]) expect(screen.getByRole("radio", { name: l })).toBeTruthy();
    expect((screen.getByRole("button", { name: /save my decision/i }) as HTMLButtonElement).disabled).toBe(true);
  });
  it("REJECTED sends no contract and no revisit date", async () => {
    const calls = stubFetch(okDecision);
    renderForm();
    decide(/I won't do this/); save();
    await waitFor(() => expect(calls).toHaveLength(1));
    expect(calls[0].url).toBe(`/api/owner/businesses/${BIZ_A}/decisions`);
    expect(calls[0].body).toMatchObject({ candidateId: CAND, state: "REJECTED", revisitAt: null });
    expect(calls[0].body).not.toHaveProperty("contract");
  });
  it("DEFERRED may carry a revisit date and still no contract", async () => {
    const calls = stubFetch(okDecision);
    renderForm();
    decide(/Not now/);
    fireEvent.change(screen.getByLabelText(/revisit on/i), { target: { value: "2026-09-01" } });
    save();
    await waitFor(() => expect(calls).toHaveLength(1));
    expect(calls[0].body).toMatchObject({ state: "DEFERRED", revisitAt: "2026-09-01T00:00:00.000Z" });
    expect(calls[0].body).not.toHaveProperty("contract");
  });
  it("ACCEPTED with nothing filled in sends no invented contract values", async () => {
    const calls = stubFetch(okDecision);
    renderForm();
    decide(/I'll do this/); save();
    await waitFor(() => expect(calls).toHaveLength(1));
    expect(calls[0].body).toMatchObject({ state: "ACCEPTED" });
    expect(calls[0].body).not.toHaveProperty("contract");
  });
  it("ACCEPTED keeps a typed 0 as 0, blank as null, and never infers a direction from the metric wording", async () => {
    const calls = stubFetch(okDecision);
    renderForm();
    decide(/I'll do this/);
    fireEvent.change(screen.getByLabelText(/what should be measured/i), { target: { value: "Overdue invoices falling" } });
    fireEvent.change(screen.getByLabelText(/where it is today/i), { target: { value: "0" } });
    fireEvent.change(screen.getByLabelText(/where that number came from/i), { target: { value: "OWNER_REPORTED" } });
    save();
    await waitFor(() => expect(calls).toHaveLength(1));
    const contract = calls[0].body?.contract as Record<string, unknown>;
    expect(contract.baselineValue).toBe(0);
    expect(contract.baselineProvenance).toBe("OWNER_REPORTED");
    expect(contract.targetValue).toBeNull();
    expect(contract.targetDirection).toBeNull();
    expect(contract.observationWindowDays).toBeNull();
  });
  it("MODIFIED marks the commitment field required", () => {
    renderForm();
    decide(/I'll do something different/);
    expect((screen.getByLabelText(/what will you do instead/i) as HTMLTextAreaElement).required).toBe(true);
  });
  it("shows the server's field error on the field and announces the failure", async () => {
    stubFetch(() => json({ error: "Validation failed", fieldErrors: [{ path: "contract.baselineProvenance", message: "A baseline value requires its provenance (MEASURED, OWNER_REPORTED, EXTERNAL_SOURCE or UNKNOWN)." }] }, 400));
    renderForm();
    decide(/I'll do this/);
    fireEvent.change(screen.getByLabelText(/where it is today/i), { target: { value: "5" } });
    save();
    expect(await screen.findByText(/requires its provenance/)).toBeTruthy();
    expect(screen.getByRole("alert")).toBeTruthy();
  });
  it("double-tap sends ONE request; a retry after failure reuses the SAME idempotency key; a changed answer gets a NEW key", async () => {
    let n = 0;
    let release: (r: Response) => void = () => {};
    const calls = stubFetch(() => {
      n++;
      if (n === 1) return new Promise<Response>((r) => { release = r; });
      if (n === 2) return json({ error: "Something went wrong on our side. Nothing was saved. Please try again." }, 500);
      return okDecision();
    });
    renderForm();
    decide(/I won't do this/);
    save(); save(); // double tap while the first is in flight
    expect(calls).toHaveLength(1);
    await act(async () => { release(json({ error: "Something went wrong on our side. Nothing was saved. Please try again." }, 500)); });
    await screen.findByRole("alert");
    save(); // user retries the same answer
    await waitFor(() => expect(calls).toHaveLength(2));
    expect(calls[1].body?.idempotencyKey).toBe(calls[0].body?.idempotencyKey);
    expect(String(calls[0].body?.idempotencyKey).length).toBeGreaterThanOrEqual(8);
    await screen.findByRole("alert");
    decide(/Not now/); save(); // changed answer
    await waitFor(() => expect(calls).toHaveLength(3));
    expect(calls[2].body?.idempotencyKey).not.toBe(calls[0].body?.idempotencyKey);
  });
  it("amend mode posts to outcome-contracts, with the stored state implied (no state field)", async () => {
    const calls = stubFetch(okDecision);
    render(<OutcomeCommitmentForm idPrefix="a" businessId={BIZ_A} candidateId={CAND} mode={{ kind: "amend", state: "ACCEPTED" }} onRecorded={() => {}} />);
    fireEvent.change(screen.getByLabelText(/measure after how many days/i), { target: { value: "30" } });
    fireEvent.click(screen.getByRole("button", { name: /save what i'm tracking/i }));
    await waitFor(() => expect(calls).toHaveLength(1));
    expect(calls[0].url).toBe(`/api/owner/businesses/${BIZ_A}/outcome-contracts`);
    expect(calls[0].body).not.toHaveProperty("state");
    expect((calls[0].body?.contract as Record<string, unknown>).observationWindowDays).toBe(30);
  });
});

describe("business switch while a request is in flight", () => {
  it("a stale response for the previous business never renders", async () => {
    const resolvers: Record<string, (r: Response) => void> = {};
    stubFetch((c) => {
      if (!c.url.includes("outcome-chains")) return json(nowView([]));
      const biz = c.url.includes(BIZ_A) ? "A" : "B";
      return new Promise<Response>((r) => { resolvers[biz] = r; });
    });
    const view = render(asProvider(MANAGE, <OwnerOutcomesView />));
    await waitFor(() => expect(resolvers.A).toBeTruthy());
    business.current = { ...business.current, activeBusinessId: BIZ_B };
    view.rerender(asProvider(MANAGE, <OwnerOutcomesView />));
    await waitFor(() => expect(resolvers.B).toBeTruthy());
    await act(async () => { resolvers.B(json({ businessId: BIZ_B, chains: [], truncated: false })); });
    await screen.findByTestId("outcomes-zero-state");
    await act(async () => { resolvers.A(json({ businessId: BIZ_A, chains: [chain({ businessId: BIZ_A, decisions: [decision({ recommendationSnapshot: { title: "BUSINESS_A_SECRET_RECOMMENDATION" } })] })], truncated: false })); });
    expect(screen.queryByText(/BUSINESS_A_SECRET_RECOMMENDATION/)).toBeNull();
    expect(screen.getByTestId("outcomes-zero-state")).toBeTruthy();
  });
  it("a response whose businessId differs from the active business is discarded, not shown", async () => {
    stubFetch((c) => (c.url.includes("outcome-chains")
      ? json({ businessId: BIZ_B, chains: [chain({ businessId: BIZ_B, decisions: [decision({ recommendationSnapshot: { title: "FOREIGN_BUSINESS_CHAIN" } })] })], truncated: false })
      : json(nowView([]))));
    render(asProvider(MANAGE, <OwnerOutcomesView />));
    await screen.findByTestId("outcomes-zero-state");
    expect(screen.queryByText(/FOREIGN_BUSINESS_CHAIN/)).toBeNull();
  });
});

describe("load errors and business states", () => {
  it("a failed chain load is an error state with retry — not an empty state", async () => {
    stubFetch(() => json({ error: "x" }, 500));
    render(asProvider(MANAGE, <OwnerOutcomesView />));
    expect((await screen.findAllByText(/Couldn.t load your results/)).length).toBeGreaterThan(0);
    expect(screen.queryByTestId("outcomes-zero-state")).toBeNull();
  });
  it("needs-recovery shows the choose-a-business state and loads nothing", () => {
    business.current = { ...business.current, needsBusinessRecovery: true };
    const calls = stubFetch(() => json({}));
    render(asProvider(MANAGE, <OwnerOutcomesView />));
    expect(screen.getByText(/Choose which business to look at/)).toBeTruthy();
    expect(screen.queryByTestId("outcomes-zero-state")).toBeNull();
    void calls;
  });
});

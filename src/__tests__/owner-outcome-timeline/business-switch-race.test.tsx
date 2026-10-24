/**
 * BUSINESS_CONTEXT_MUTATION_RACE — real components, forced promise ordering.
 *
 * Invariant: rendered outcome data and mutation follow-up reads always correspond to the currently active business. A write
 * that began under Business A may validly commit server-side after the owner moved to Business B; its completion must not
 * reload, re-render or "become the latest" over B. (The write is never cancelled or rolled back — only its follow-up read
 * is refused.)
 */
import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import { render, cleanup, screen, fireEvent, act, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";

const BIZ_A = "11111111-1111-4111-8111-111111111111";
const BIZ_B = "22222222-2222-4222-8222-222222222222";
const UUID_A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const UUID_B = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const CAND_A = `domain_action:finance:${UUID_A}`;
const CAND_B = `domain_action:finance:${UUID_B}`;

const business = { current: { activeBusinessId: BIZ_A as string | null, needsBusinessRecovery: false, businesses: [{ id: BIZ_A, name: "A" }, { id: BIZ_B, name: "B" }], loading: false } };
vi.mock("@/context/active-business-context", () => ({ useActiveBusiness: () => business.current }));

import { CapabilitiesProvider } from "@/context/capabilities-context";
import { CAPABILITIES } from "@/domain/constants/capabilities";
import { OwnerOutcomesView } from "@/components/owner-outcomes/OwnerOutcomesView";
import { assessment, chain, decision } from "./fixtures";

const MANAGE = [CAPABILITIES.OWNER_VIEW, CAPABILITIES.OWNER_MANAGE];
const ui = (): ReactNode => <CapabilitiesProvider capabilities={MANAGE}><OwnerOutcomesView /></CapabilitiesProvider>;
const json = (data: unknown, status = 200): Response => ({ ok: status < 400, status, json: async () => data, clone() { return this; } } as unknown as Response);
const target = (candidateId: string, title: string) => ({ candidateId, title, domainLabel: "Money", source: "domain_action", domain: "finance" });

function deferred<T>() {
  let resolve!: (v: T) => void;
  const promise = new Promise<T>((r) => { resolve = r; });
  return { promise, resolve };
}
const flush = async () => { await act(async () => { for (let i = 0; i < 8; i++) await Promise.resolve(); }); };

const chainFor = (biz: string, cand: string, title: string) =>
  chain({ chainKey: cand, businessId: biz, decisions: [decision({ candidateId: cand, recommendationSnapshot: { title } })], assessments: [assessment({ chainKey: cand })] });

interface Call { url: string; method: string }
let calls: Call[] = [];
const gets = (biz: string) => calls.filter((c) => c.method === "GET" && c.url.includes(`/${biz}/outcome-chains`)).length;

/** Per-business controllable server. A's first list resolves immediately; everything else is held until the test releases it. */
function server(opts: { aPost: ReturnType<typeof deferred<Response>>; bList: ReturnType<typeof deferred<Response>>; bNow?: ReturnType<typeof deferred<Response>> }) {
  calls = [];
  vi.stubGlobal("fetch", vi.fn((url: string, init?: RequestInit) => {
    const call = { url: String(url), method: init?.method ?? "GET" };
    calls.push(call);
    if (call.method === "POST" && call.url.includes(`/${BIZ_A}/outcome-chain`)) return opts.aPost.promise;
    if (call.method === "GET" && call.url.includes(`/${BIZ_A}/outcome-chains`)) {
      return Promise.resolve(json({ businessId: BIZ_A, chains: [chainFor(BIZ_A, CAND_A, "BUSINESS_A_RECOMMENDATION")], truncated: false }));
    }
    if (call.url.includes(`businessId=${BIZ_A}`)) return Promise.resolve(json({ ownerDecision: { attention: [target(CAND_A, "A_TARGET")] } }));
    if (call.method === "GET" && call.url.includes(`/${BIZ_B}/outcome-chains`)) return opts.bList.promise;
    if (call.url.includes(`businessId=${BIZ_B}`)) return opts.bNow?.promise ?? Promise.resolve(json({ ownerDecision: { attention: [] } }));
    return Promise.reject(new Error(`unexpected request ${call.method} ${call.url}`));
  }));
}
const bChains = () => json({ businessId: BIZ_B, chains: [chainFor(BIZ_B, CAND_B, "BUSINESS_B_RECOMMENDATION")], truncated: false });
const onScreen = (t: string) => screen.queryAllByText(t).length > 0;
const renderedBusiness = () => document.querySelector("[data-business-id]")?.getAttribute("data-business-id") ?? null;

beforeEach(() => { business.current = { ...business.current, activeBusinessId: BIZ_A, needsBusinessRecovery: false }; });
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

describe("in-flight mutation, then business switch", () => {
  it("TEST 2 — A's write completing after the switch cannot reload or render A over B (B's list already loaded)", async () => {
    const aPost = deferred<Response>(); const bList = deferred<Response>();
    server({ aPost, bList });
    const view = render(ui());
    await screen.findAllByText("BUSINESS_A_RECOMMENDATION");
    expect(gets(BIZ_A)).toBe(1);

    fireEvent.click(screen.getByRole("button", { name: /check outcome/i })); // 2. start A's POST …
    await flush();
    expect(calls.some((c) => c.method === "POST")).toBe(true); // 3. … and keep it unresolved

    business.current = { ...business.current, activeBusinessId: BIZ_B }; // 4. switch to B
    view.rerender(ui());
    expect(onScreen("BUSINESS_A_RECOMMENDATION")).toBe(false); // 6. A is gone immediately (B still loading)
    expect(screen.queryByTestId("outcome-chain-card")).toBeNull();

    await act(async () => { bList.resolve(bChains()); }); // 5. B's list loads
    await screen.findAllByText("BUSINESS_B_RECOMMENDATION");
    expect(onScreen("BUSINESS_A_RECOMMENDATION")).toBe(false);
    expect(renderedBusiness()).toBe(BIZ_B);

    await act(async () => { aPost.resolve(json({ assessment: assessment(), created: true }, 201)); }); // 7. A's POST succeeds
    await flush(); await flush(); // 8. let any callbacks run

    expect(renderedBusiness()).toBe(BIZ_B); // 9. page still shows B
    expect(onScreen("BUSINESS_B_RECOMMENDATION")).toBe(true);
    expect(onScreen("BUSINESS_A_RECOMMENDATION")).toBe(false);
    expect(gets(BIZ_A)).toBe(1); // 10. no A follow-up read ever happened
    expect(calls.filter((c) => c.method === "GET" && c.url.includes(`businessId=${BIZ_A}`)).length).toBe(1);
  });

  it("TEST 3 — A's write completing WHILE B is still loading cannot take the newest lease: B's response still commits", async () => {
    const aPost = deferred<Response>(); const bList = deferred<Response>();
    server({ aPost, bList });
    const view = render(ui());
    await screen.findAllByText("BUSINESS_A_RECOMMENDATION");
    fireEvent.click(screen.getByRole("button", { name: /check outcome/i }));
    await flush();

    business.current = { ...business.current, activeBusinessId: BIZ_B };
    view.rerender(ui());
    await flush();
    expect(gets(BIZ_B)).toBe(1); // B's read is in flight

    await act(async () => { aPost.resolve(json({ assessment: assessment(), created: true }, 201)); }); // A completes FIRST
    await flush(); await flush();
    expect(gets(BIZ_A)).toBe(1); // the old onRecorded did not start a read, so it did not advance the generation …
    expect(onScreen("BUSINESS_A_RECOMMENDATION")).toBe(false);

    await act(async () => { bList.resolve(bChains()); }); // … so B's (older) response is still the newest and commits
    await screen.findAllByText("BUSINESS_B_RECOMMENDATION");
    await flush();
    expect(renderedBusiness()).toBe(BIZ_B);
    expect(onScreen("BUSINESS_A_RECOMMENDATION")).toBe(false);
    expect(gets(BIZ_A)).toBe(1);
  });

  it("TEST 5 — B stays authoritative after every A promise settles (including a failed A write)", async () => {
    const aPost = deferred<Response>(); const bList = deferred<Response>();
    server({ aPost, bList });
    const view = render(ui());
    await screen.findAllByText("BUSINESS_A_RECOMMENDATION");
    fireEvent.click(screen.getByRole("button", { name: /check outcome/i }));
    await flush();
    business.current = { ...business.current, activeBusinessId: BIZ_B };
    view.rerender(ui());
    await act(async () => { bList.resolve(bChains()); });
    await screen.findAllByText("BUSINESS_B_RECOMMENDATION");
    await act(async () => { aPost.resolve(json({ error: "Something went wrong on our side. Nothing was saved. Please try again." }, 500)); });
    await flush(); await flush();
    expect(renderedBusiness()).toBe(BIZ_B);
    expect(onScreen("BUSINESS_A_RECOMMENDATION")).toBe(false);
    expect(gets(BIZ_A)).toBe(1);
    expect(screen.queryByRole("alert")).toBeNull(); // A's failure message did not surface in B's page
  });

  it("a refresh after the write still happens when the SAME business is still active (no over-blocking)", async () => {
    const aPost = deferred<Response>(); const bList = deferred<Response>();
    server({ aPost, bList });
    render(ui());
    await screen.findAllByText("BUSINESS_A_RECOMMENDATION");
    fireEvent.click(screen.getByRole("button", { name: /check outcome/i }));
    await flush();
    await act(async () => { aPost.resolve(json({ assessment: assessment(), created: true }, 201)); });
    await waitFor(() => expect(gets(BIZ_A)).toBe(2)); // A is still active → its follow-up read runs
    expect(renderedBusiness()).toBe(BIZ_A);
    expect(onScreen("BUSINESS_A_RECOMMENDATION")).toBe(true);
  });

  it("A → B → A: a write from the first A visit refreshes A (A is active again), and never B", async () => {
    const aPost = deferred<Response>(); const bList = deferred<Response>();
    server({ aPost, bList });
    const view = render(ui());
    await screen.findAllByText("BUSINESS_A_RECOMMENDATION");
    fireEvent.click(screen.getByRole("button", { name: /check outcome/i }));
    await flush();
    business.current = { ...business.current, activeBusinessId: BIZ_B };
    view.rerender(ui());
    business.current = { ...business.current, activeBusinessId: BIZ_A };
    view.rerender(ui());
    await screen.findAllByText("BUSINESS_A_RECOMMENDATION");
    await act(async () => { aPost.resolve(json({ assessment: assessment(), created: true }, 201)); });
    await flush(); await flush();
    expect(renderedBusiness()).toBe(BIZ_A);
  });
});

describe("TEST 4 — no transient cross-business form", () => {
  it("the instant active business changes A → B (B's reads still pending) there is no actionable A control or A-candidate form", async () => {
    const aPost = deferred<Response>(); const bList = deferred<Response>(); const bNow = deferred<Response>();
    server({ aPost, bList, bNow });
    const view = render(ui());
    await screen.findAllByText("BUSINESS_A_RECOMMENDATION");
    expect(document.querySelectorAll("form").length).toBeGreaterThan(0); // A's controls exist while A is active (forms live in closed disclosures)
    expect(screen.getByRole("button", { name: /check outcome/i })).toBeTruthy();

    business.current = { ...business.current, activeBusinessId: BIZ_B };
    view.rerender(ui()); // B's reads are unresolved
    expect(document.querySelectorAll("form").length).toBe(0);
    expect(screen.queryByRole("button", { name: /check outcome/i })).toBeNull();
    expect(screen.queryByTestId("outcome-trackable-target")).toBeNull();
    expect(screen.queryByTestId("outcome-chain-card")).toBeNull();
    expect(document.body.innerHTML).not.toContain(UUID_A); // not even an A candidate id in the DOM
    expect(onScreen("A_TARGET")).toBe(false);
    expect(screen.getByRole("status", { name: /loading your results/i })).toBeTruthy();

    await act(async () => { bList.resolve(bChains()); bNow.resolve(json({ ownerDecision: { attention: [target(CAND_B, "B_TARGET")] } })); });
    await screen.findAllByText("BUSINESS_B_RECOMMENDATION");
    expect(document.body.innerHTML).not.toContain(UUID_A);
    expect(document.querySelector(`[data-candidate-id="${CAND_B}"]`)).toBeNull(); // B's own chain is tracked, so not offered again
  });

  it("an owner with no active business (recovery pending) sees no controls and triggers no read", async () => {
    const aPost = deferred<Response>(); const bList = deferred<Response>();
    server({ aPost, bList });
    const view = render(ui());
    await screen.findAllByText("BUSINESS_A_RECOMMENDATION");
    const before = calls.length;
    business.current = { ...business.current, activeBusinessId: null, needsBusinessRecovery: true };
    view.rerender(ui());
    expect(document.querySelectorAll("form").length).toBe(0);
    expect(onScreen("BUSINESS_A_RECOMMENDATION")).toBe(false);
    expect(screen.getByText(/Choose which business to look at/)).toBeTruthy();
    await flush();
    expect(calls.length).toBe(before);
  });
});

describe("stale GET race (existing guard stays green)", () => {
  it("a slow A read resolving after B committed never renders", async () => {
    const aList = deferred<Response>();
    calls = [];
    vi.stubGlobal("fetch", vi.fn((url: string, init?: RequestInit) => {
      const u = String(url); calls.push({ url: u, method: init?.method ?? "GET" });
      if (u.includes(`/${BIZ_A}/outcome-chains`)) return aList.promise;
      if (u.includes(`/${BIZ_B}/outcome-chains`)) return Promise.resolve(bChains());
      return Promise.resolve(json({ ownerDecision: { attention: [] } }));
    }));
    const view = render(ui());
    await flush();
    business.current = { ...business.current, activeBusinessId: BIZ_B };
    view.rerender(ui());
    await screen.findAllByText("BUSINESS_B_RECOMMENDATION");
    await act(async () => { aList.resolve(json({ businessId: BIZ_A, chains: [chainFor(BIZ_A, CAND_A, "BUSINESS_A_RECOMMENDATION")], truncated: false })); });
    await flush();
    expect(onScreen("BUSINESS_A_RECOMMENDATION")).toBe(false);
    expect(renderedBusiness()).toBe(BIZ_B);
  });
});

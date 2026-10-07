/**
 * BUSINESS_CONTEXT_MUTATION_RACE — render-frame proof (no transient cross-business render).
 *
 * `act()` hides intermediate renders, so this records EVERY render of the business-scoped components (probes replace the
 * real ones) together with the active business at that exact render. The invariant: a chain or form is never rendered
 * while the active business is a different one — not even for the single frame between the context changing and the
 * page's effects running — and a candidate from A is never paired with business B's path.
 */
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, cleanup, act } from "@testing-library/react";
import type { ReactNode } from "react";

const BIZ_A = "11111111-1111-4111-8111-111111111111";
const BIZ_B = "22222222-2222-4222-8222-222222222222";
const UUID_A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const UUID_B = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const CAND_A = `domain_action:finance:${UUID_A}`;
const CAND_B = `domain_action:finance:${UUID_B}`;

const h = vi.hoisted(() => ({
  active: { current: { activeBusinessId: "11111111-1111-4111-8111-111111111111" as string | null, needsBusinessRecovery: false, businesses: [{ id: "x", name: "x" }], loading: false } },
  frames: [] as Array<{ kind: "chain" | "form"; businessId: string; candidateId: string; active: string | null }>,
}));
vi.mock("@/context/active-business-context", () => ({ useActiveBusiness: () => h.active.current }));
vi.mock("@/components/owner-outcomes/OutcomeTimeline", () => ({
  OutcomeTimeline: (p: { chain: { businessId: string; chainKey: string } }) => {
    h.frames.push({ kind: "chain", businessId: p.chain.businessId, candidateId: p.chain.chainKey, active: h.active.current.activeBusinessId });
    return <div data-testid="outcome-chain-card" />;
  },
}));
vi.mock("@/components/owner-outcomes/OutcomeCommitmentForm", () => ({
  OutcomeCommitmentForm: (p: { businessId: string; candidateId: string }) => {
    h.frames.push({ kind: "form", businessId: p.businessId, candidateId: p.candidateId, active: h.active.current.activeBusinessId });
    return <form data-testid="probe-form" />;
  },
}));

import { CapabilitiesProvider } from "@/context/capabilities-context";
import { CAPABILITIES } from "@/domain/constants/capabilities";
import { OwnerOutcomesView } from "@/components/owner-outcomes/OwnerOutcomesView";
import { chain, decision } from "./fixtures";

const ui = (): ReactNode => <CapabilitiesProvider capabilities={[CAPABILITIES.OWNER_VIEW, CAPABILITIES.OWNER_MANAGE]}><OwnerOutcomesView /></CapabilitiesProvider>;
const json = (data: unknown): Response => ({ ok: true, status: 200, json: async () => data, clone() { return this; } } as unknown as Response);
const target = (candidateId: string, title: string) => ({ candidateId, title, domainLabel: "Money", source: "domain_action", domain: "finance" });
const flush = async () => { await act(async () => { for (let i = 0; i < 8; i++) await Promise.resolve(); }); };

afterEach(() => { cleanup(); vi.unstubAllGlobals(); h.frames.length = 0; });

describe("no render frame pairs one business's data with another active business", () => {
  it("A → B switch (B still loading): every recorded render is internally consistent with the active business", async () => {
    let releaseB: (r: Response) => void = () => {};
    vi.stubGlobal("fetch", vi.fn((url: string) => {
      const u = String(url);
      if (u.includes(`/${BIZ_A}/outcome-chains`)) return Promise.resolve(json({ businessId: BIZ_A, chains: [chain({ chainKey: `domain_action:finance:${"c".repeat(8)}-cccc-4ccc-8ccc-cccccccccccc`, businessId: BIZ_A })], truncated: false }));
      if (u.includes(`businessId=${BIZ_A}`)) return Promise.resolve(json({ ownerDecision: { attention: [target(CAND_A, "A_TARGET")] } }));
      if (u.includes(`/${BIZ_B}/outcome-chains`)) return new Promise<Response>((r) => { releaseB = r; });
      return Promise.resolve(json({ ownerDecision: { attention: [target(CAND_B, "B_TARGET")] } }));
    }));
    h.active.current = { ...h.active.current, activeBusinessId: BIZ_A };
    const view = render(ui());
    await flush();
    expect(h.frames.some((f) => f.kind === "chain" && f.businessId === BIZ_A)).toBe(true);
    expect(h.frames.some((f) => f.kind === "form" && f.candidateId === CAND_A && f.businessId === BIZ_A)).toBe(true);

    h.frames.length = 0; // from here on: only frames rendered at/after the switch
    h.active.current = { ...h.active.current, activeBusinessId: BIZ_B };
    view.rerender(ui());
    await flush();
    // B's reads are still pending: nothing business-scoped may have rendered at all.
    expect(h.frames).toEqual([]);

    await act(async () => { releaseB(json({ businessId: BIZ_B, chains: [chain({ chainKey: CAND_B, businessId: BIZ_B })], truncated: false })); });
    await flush();

    for (const f of h.frames) {
      expect(f.businessId, `${f.kind} rendered for ${f.businessId} while ${f.active} was active`).toBe(f.active);
      expect(f.candidateId.includes(UUID_A), `A candidate rendered while ${f.active} active`).toBe(false);
    }
    expect(h.frames.some((f) => f.kind === "chain" && f.businessId === BIZ_B)).toBe(true);
  });

  it("recovery pending (no usable business): no business-scoped render at all after the switch", async () => {
    vi.stubGlobal("fetch", vi.fn((url: string) => Promise.resolve(String(url).includes("outcome-chains")
      ? json({ businessId: BIZ_A, chains: [chain({ businessId: BIZ_A, decisions: [decision()] })], truncated: false })
      : json({ ownerDecision: { attention: [target(CAND_A, "A_TARGET")] } }))));
    h.active.current = { ...h.active.current, activeBusinessId: BIZ_A, needsBusinessRecovery: false };
    const view = render(ui());
    await flush();
    h.frames.length = 0;
    h.active.current = { ...h.active.current, activeBusinessId: BIZ_A, needsBusinessRecovery: true }; // same id, but recovery pending
    view.rerender(ui());
    await flush();
    expect(h.frames).toEqual([]);
  });
});

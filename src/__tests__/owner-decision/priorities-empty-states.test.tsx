/**
 * /owner/priorities never collapses different situations into one "No main target yet":
 * selected business unavailable (needs recovery) ≠ decision fetch failed ≠ no business at all.
 * (A canonical decision with no evidence / no open target is rendered by the decision card itself.)
 */
import { describe, it, expect, afterEach, vi } from "vitest";
import { render, cleanup, screen, waitFor } from "@testing-library/react";

const ctx = { activeBusinessId: null as string | null, needsBusinessRecovery: false, businesses: [] as Array<{ id: string; name: string }> };
vi.mock("@/context/active-business-context", () => ({ useActiveBusiness: () => ctx }));

import OwnerPrioritiesPage from "@/app/(authenticated)/owner/priorities/page";

function stub(nowView: { ok: boolean; body?: unknown }) {
  vi.stubGlobal("fetch", vi.fn((input: RequestInfo | URL) => {
    const url = String(input);
    if (url.includes("/api/owner/now-view")) return Promise.resolve({ ok: nowView.ok, status: nowView.ok ? 200 : 500, json: async () => nowView.body ?? {} });
    return Promise.resolve({ ok: true, status: 200, json: async () => ({ risks: [], alerts: [] }) });
  }));
}

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("Priorities empty states", () => {
  it("selected business unavailable → asks the owner to choose a business (not 'no main target')", async () => {
    Object.assign(ctx, { activeBusinessId: null, needsBusinessRecovery: true, businesses: [{ id: "a", name: "A" }, { id: "b", name: "B" }] });
    stub({ ok: true, body: { ownerDecision: null } });
    render(<OwnerPrioritiesPage />);
    await waitFor(() => expect(screen.getByTestId("priorities-business-recovery")).toBeTruthy());
    expect(screen.queryByText(/No main target/)).toBeNull();
  });

  it("decision fetch failed → says so, distinct from business recovery", async () => {
    Object.assign(ctx, { activeBusinessId: "a", needsBusinessRecovery: false, businesses: [{ id: "a", name: "A" }] });
    stub({ ok: false });
    render(<OwnerPrioritiesPage />);
    await waitFor(() => expect(screen.getByText("Couldn't load your main target")).toBeTruthy());
    expect(screen.queryByTestId("priorities-business-recovery")).toBeNull();
  });

  it("no business at all → asks the owner to add one", async () => {
    Object.assign(ctx, { activeBusinessId: null, needsBusinessRecovery: false, businesses: [] });
    stub({ ok: true, body: { ownerDecision: null } });
    render(<OwnerPrioritiesPage />);
    await waitFor(() => expect(screen.getByText("Add your business first")).toBeTruthy());
  });
});

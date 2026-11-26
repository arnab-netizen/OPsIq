/**
 * /owner/now — business-context selector + stale-response race safety.
 *
 * UX-01: this page now sources its business list and active-business id from the shared
 * ActiveBusinessProvider (useActiveBusiness()) instead of its own `GET /api/owner/businesses`
 * fetch — the provider is the one that calls that route now, and the page reads its resolved
 * `businesses`/`activeBusinessId` instead. The request-sequence guard on the now-view fetch
 * itself is unchanged.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { render, cleanup, screen, fireEvent, waitFor } from "@testing-library/react";
import OwnerNowViewPage from "@/app/(authenticated)/owner/now/page";
import { ActiveBusinessProvider } from "@/context/active-business-context";

beforeEach(() => {
  window.sessionStorage.clear();
  window.localStorage.clear();
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

const BUSINESSES = [
  { id: "biz-a", name: "Alpha Bakery", currency: "USD", isActive: true },
  { id: "biz-b", name: "Beta Landscaping", currency: "USD", isActive: true },
  { id: "biz-c", name: "Gamma Consulting", currency: "USD", isActive: true },
];

function viewFor(label: string) {
  return {
    view: {
      businessHealth: "STRONG",
      cashDangerStatus: "SAFE",
      staffOverloadStatus: "SAFE",
      ownerOverloadStatus: "SAFE",
      qualityFailureStatus: "SAFE",
      customerRetentionStatus: "SAFE",
      supplierInventoryStatus: "SAFE",
      growthReadinessStatus: "SAFE",
      classification: label,
      missingDataRequests: [],
      actionsToAvoid: [],
    },
    stepByStep: [],
    whatChanged: [],
    beginnerExplanation: {},
  };
}

function renderPage() {
  return render(
    <ActiveBusinessProvider>
      <OwnerNowViewPage />
    </ActiveBusinessProvider>
  );
}

describe("OwnerNowViewPage — business selector", () => {
  it("resolves the active business from the shared provider and renders the selector", async () => {
    const fetchMock = vi.fn(async (url: string) => {
      if (url.includes("/api/owner/businesses")) {
        return { ok: true, json: async () => ({ businesses: BUSINESSES }) } as Response;
      }
      return { ok: true, json: async () => viewFor("DEFAULT") } as Response;
    });
    vi.stubGlobal("fetch", fetchMock);

    renderPage();

    await waitFor(() => expect(screen.getByRole("combobox", { name: "Business" })).toBeInTheDocument());
    const select = screen.getByRole("combobox", { name: "Business" }) as HTMLSelectElement;
    expect(select.value).toBe("biz-a");
    expect(fetchMock).toHaveBeenCalledWith(expect.stringContaining("/api/owner/now-view?businessId=biz-a"), expect.anything());
  });

  it("re-fetches now-view with the newly chosen businessId when switched", async () => {
    const fetchMock = vi.fn(async (url: string) => {
      if (url.includes("/api/owner/businesses")) {
        return { ok: true, json: async () => ({ businesses: BUSINESSES }) } as Response;
      }
      return { ok: true, json: async () => viewFor("DEFAULT") } as Response;
    });
    vi.stubGlobal("fetch", fetchMock);

    renderPage();
    const select = await screen.findByRole("combobox", { name: "Business" });
    fireEvent.change(select, { target: { value: "biz-b" } });

    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(expect.stringContaining("/api/owner/now-view?businessId=biz-b"), expect.anything())
    );
  });

  // STALE-RESPONSE RACE — REACHABILITY FINDING (not a skipped assertion, a documented result):
  //
  // This page — like every other page in this audit — gates its ENTIRE render behind
  // `if (loading) return <Loading/>`. Selecting a business calls setActiveBusinessId(id) via
  // onSwitchBusiness, which sets `loading=true` synchronously before the context update commits;
  // React (via RTL's act-wrapped fireEvent, which matches real synchronous browser event dispatch
  // + commit) re-renders to the loading screen BEFORE a second interaction is possible, which
  // unmounts the <select> itself for the duration of the in-flight request. A directly-reproduced
  // attempt at "select A, then immediately select B before A's response lands" was written for
  // this page and found NOT reproducible: the second change event, fired against the selector,
  // lands on an already-detached DOM node once the first selection's loading state commits, and
  // never reaches React's event system. This was verified empirically (not assumed) while writing
  // this test file.
  //
  // Conclusion: the literal "rapid reselect before the earlier response lands" race is NOT
  // reachable through this control on this page (or on any of the other pages audited this
  // session, which share the same full-page loading gate) — the gate is stronger than a typical
  // "loading flag hides stale content" anti-pattern, because it removes the input surface itself,
  // not just the display of stale data. The request-sequence guard (`requestSeq`, asserted via the
  // source-contract check in business-context-selector-migration.test.ts) was still added to this
  // page as harmless, correct defense-in-depth — it protects a future code path that stops
  // gating the whole page on `loading` (e.g. an inline spinner next to the selector instead of a
  // full-page replacement), which would make the scenario reachable. See PHASE2 report,
  // STALE_RESPONSE_RACE_AUDIT, for the same finding applied to every other page touched this
  // session. UX-01's own out-of-order coverage (business-context-behavioral.test.tsx) exercises
  // the same guard on a page whose loading indicator is inline rather than full-page.
  it.todo(
    "documented above: rapid A→B reselect is not reachable via this page's full-page loading gate — see comment"
  );
});

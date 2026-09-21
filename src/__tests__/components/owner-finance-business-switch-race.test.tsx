/**
 * Owner Money (/owner/finance) — stale business-switch response race (UX-04B, Section Q item 1).
 *
 * ROOT CAUSE (documented in UX-04A Section J item 1 / Section I "Stale-response race guard"):
 * `load(businessId)` in owner/finance/page.tsx had no request-generation guard. Every call fires
 * a single `GET /api/owner/finance/dashboard?businessId=...` and, on resolution, unconditionally
 * commits the result via `setDashboard`/`setSelected` and re-anchors the shared `activeBusinessId`
 * via `setActiveBusinessId`. If the active business changes while an OLDER load() for a DIFFERENT
 * business is still in flight, and that older request resolves AFTER the newer one, its stale
 * response could silently overwrite the correctly-rendered newer business's state AND re-anchor
 * the shared context back to the stale business — exactly the bug class UX-03 already fixed for
 * Home via `loadGenerationRef`.
 *
 * FIX: `load()` now stamps a monotonically increasing generation number (a ref, not state) at the
 * start of each call, and every state commit (success, error, and the loading flag itself) is
 * guarded by "is this still the latest generation?" before applying — mirroring
 * `owner-cockpit-business-switch-race.test.tsx`'s proven pattern and assertions exactly.
 *
 * HOSTILE-AUDIT ADDITION: the generation guard above closes the STALE-RESPONSE race (an old
 * load() resolving late), but a hostile re-audit found a SECOND, distinct race it does not
 * close — a business-scoped MUTATION (addSnapshot/runDiagnosis/updateAction/verifyAction)
 * started for business A can still be in flight when the owner switches to B; if A's mutation
 * succeeds (or fails) afterward, its own stale closure would otherwise reload (or error-render)
 * A regardless of the newer generation counter, because its own `await load(selected)` call
 * starts AFTER B's and so would receive a NEWER generation. The "stale mutation-intent race"
 * tests below prove `activeBusinessIdRef` (owner/finance/page.tsx) closes this second race,
 * using `runDiagnosis` as the representative business-scoped mutation.
 */
import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import { render, cleanup, waitFor, screen, fireEvent, act } from "@testing-library/react";
import OwnerFinancePage from "@/app/(authenticated)/owner/finance/page";
import { ActiveBusinessProvider, useActiveBusiness } from "@/context/active-business-context";

const BIZ_A = { id: "11111111-1111-4111-8111-111111111111", name: "ZZ-TEST-FIELD-SERVICE", currency: "USD" };
const BIZ_B = { id: "22222222-2222-4222-8222-222222222222", name: "Trinity Services", currency: "USD" };

function ok(data: unknown): Response {
  return { ok: true, status: 200, json: async () => data } as Response;
}

function dashboardFixture(label: string, businessId: string, actions: unknown[] = []) {
  return {
    businesses: [BIZ_A, BIZ_B],
    selectedBusinessId: businessId,
    hasData: true,
    latestSnapshot: { id: `snap-${label}` },
    missingCriticalData: [],
    domainScore: null,
    latestCycle: {
      id: `cycle-${label}`,
      sequenceNumber: 1,
      survivalState: "SAFE",
      overallHealthScore: 80,
      survivalRiskScore: 10,
      growthOpportunityScore: 50,
      dataConfidenceScore: 90,
      findings: [],
      actions,
    },
    recommendedNextAction: {
      title: `BUSINESS_${label}_FINANCE_ACTION`,
      description: "x",
      priorityScore: 1,
      expectedImpactScore: 1,
      effortScore: 1,
      verificationMetric: "revenue",
    },
    cycleHistory: [],
  };
}

/** Test-only harness so the test can drive a business switch exactly like
 *  BusinessContextSelector would. */
function SwitchHarness() {
  const { setActiveBusinessId } = useActiveBusiness();
  return (
    <div>
      <button data-testid="switch-to-a" onClick={() => setActiveBusinessId(BIZ_A.id)}>switch to A</button>
      <button data-testid="switch-to-b" onClick={() => setActiveBusinessId(BIZ_B.id)}>switch to B</button>
    </div>
  );
}

function renderPage() {
  return render(
    <ActiveBusinessProvider>
      <SwitchHarness />
      <OwnerFinancePage />
    </ActiveBusinessProvider>
  );
}

interface PendingCall { businessId: string; resolve: (data: unknown) => void; reject: (err: unknown) => void }
let dashboardCalls: PendingCall[];
/** Pending POST .../diagnoses calls, for the stale-mutation-intent race tests below. */
let diagnosisCalls: PendingCall[];

function installFetchMock() {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: string | URL) => {
      const url = typeof input === "string" ? input : input.toString();
      if (url.includes("/api/owner/businesses")) {
        return ok({ businesses: [BIZ_A, BIZ_B] });
      }
      if (url.includes("/api/owner/finance/dashboard")) {
        const params = new URL(url, "https://example.com").searchParams;
        const businessId = params.get("businessId")!;
        return new Promise<Response>((resolve, reject) => {
          dashboardCalls.push({
            businessId,
            resolve: (data) => resolve(ok(data)),
            reject,
          });
        });
      }
      const diagMatch = url.match(/\/api\/owner\/finance\/businesses\/([^/]+)\/diagnoses$/);
      if (diagMatch) {
        const businessId = diagMatch[1]!;
        return new Promise<Response>((resolve, reject) => {
          diagnosisCalls.push({
            businessId,
            resolve: (data) => resolve(ok(data)),
            reject,
          });
        });
      }
      return ok({});
    })
  );
}

/** Flush the microtask queue enough times for a resolved/rejected fetch promise to propagate
 *  through the subsequent `setState` calls inside `load()`. */
async function flush() {
  await act(async () => {
    for (let i = 0; i < 8; i++) await Promise.resolve();
  });
}

/** Wait until the (0-indexed) Nth dashboard call for a given business has been issued, and return
 *  its pending resolve/reject pair. */
async function waitForCall(businessId: string, occurrence = 0): Promise<PendingCall> {
  await waitFor(
    () => {
      const matches = dashboardCalls.filter((c) => c.businessId === businessId);
      expect(matches.length).toBeGreaterThan(occurrence);
    },
    { timeout: 3000 }
  );
  return dashboardCalls.filter((c) => c.businessId === businessId)[occurrence]!;
}

/** Wait until the (0-indexed) Nth diagnosis POST for a given business has been issued. */
async function waitForDiagnosisCall(businessId: string, occurrence = 0): Promise<PendingCall> {
  await waitFor(
    () => {
      const matches = diagnosisCalls.filter((c) => c.businessId === businessId);
      expect(matches.length).toBeGreaterThan(occurrence);
    },
    { timeout: 3000 }
  );
  return diagnosisCalls.filter((c) => c.businessId === businessId)[occurrence]!;
}

beforeEach(() => {
  dashboardCalls = [];
  diagnosisCalls = [];
  installFetchMock();
  // jsdom does not reset storage between tests within the same file — every test must start from
  // a clean, unresolved preference so businesses[0] (BIZ_A) is deterministically the initial
  // active business.
  window.sessionStorage.clear();
  window.localStorage.clear();
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("Owner Money — stale business-switch response race (UX-04B)", () => {
  it("a stale A response arriving AFTER a switch to B must never overwrite B's rendered state", async () => {
    renderPage();

    const callA = await waitForCall(BIZ_A.id);
    fireEvent.click(screen.getByTestId("switch-to-b"));
    const callB = await waitForCall(BIZ_B.id);

    // B resolves first — the correct, current business.
    await act(async () => { callB.resolve(dashboardFixture("B", BIZ_B.id)); });
    await flush();
    await waitFor(() => expect(screen.getByText("BUSINESS_B_FINANCE_ACTION")).toBeInTheDocument());

    // The stale A response finally arrives.
    await act(async () => { callA.resolve(dashboardFixture("A", BIZ_A.id)); });
    await flush();

    // B must still be displayed — no A content leaks in, and no stale-A re-anchor of the shared
    // active business either (asserted implicitly: the rendered dashboard stays B's).
    expect(screen.getByText("BUSINESS_B_FINANCE_ACTION")).toBeInTheDocument();
    expect(screen.queryByText("BUSINESS_A_FINANCE_ACTION")).not.toBeInTheDocument();
  });

  it("inverse timing: A resolves first, B resolves second (the ordinary case) — B must win", async () => {
    renderPage();
    const callA = await waitForCall(BIZ_A.id);
    fireEvent.click(screen.getByTestId("switch-to-b"));
    const callB = await waitForCall(BIZ_B.id);

    await act(async () => { callA.resolve(dashboardFixture("A", BIZ_A.id)); });
    await flush();
    await act(async () => { callB.resolve(dashboardFixture("B", BIZ_B.id)); });
    await flush();

    await waitFor(() => expect(screen.getByText("BUSINESS_B_FINANCE_ACTION")).toBeInTheDocument());
    expect(screen.queryByText("BUSINESS_A_FINANCE_ACTION")).not.toBeInTheDocument();
  });

  it("rapid A -> B -> A: only the LATEST (second A) load may ever commit; the discarded first-A and B responses must not persist", async () => {
    renderPage();
    const firstCallA = await waitForCall(BIZ_A.id, 0);

    fireEvent.click(screen.getByTestId("switch-to-b"));
    const callB = await waitForCall(BIZ_B.id, 0);

    fireEvent.click(screen.getByTestId("switch-to-a"));
    const secondCallA = await waitForCall(BIZ_A.id, 1);

    // Resolve completely out of order: the discarded middle request (B) first, then the discarded
    // FIRST A request, then finally the second (current, latest) A request.
    await act(async () => { callB.resolve(dashboardFixture("B", BIZ_B.id)); });
    await flush();
    await act(async () => { firstCallA.resolve(dashboardFixture("A-stale-first", BIZ_A.id)); });
    await flush();
    await act(async () => { secondCallA.resolve(dashboardFixture("A", BIZ_A.id)); });
    await flush();

    await waitFor(() => expect(screen.getByText("BUSINESS_A_FINANCE_ACTION")).toBeInTheDocument());
    expect(screen.queryByText("BUSINESS_B_FINANCE_ACTION")).not.toBeInTheDocument();
    expect(screen.queryByText("BUSINESS_A-stale-first_FINANCE_ACTION")).not.toBeInTheDocument();
  });

  it("a stale FAILED request from the old business must not overwrite (or error out) a successful newer business's render", async () => {
    renderPage();
    const callA = await waitForCall(BIZ_A.id);
    fireEvent.click(screen.getByTestId("switch-to-b"));
    const callB = await waitForCall(BIZ_B.id);

    // B (current) succeeds first.
    await act(async () => { callB.resolve(dashboardFixture("B", BIZ_B.id)); });
    await flush();
    await waitFor(() => expect(screen.getByText("BUSINESS_B_FINANCE_ACTION")).toBeInTheDocument());

    // A's stale in-flight request rejects afterwards (e.g. a timeout or network failure).
    await act(async () => { callA.reject(new Error("Request timed out")); });
    await flush();

    // The already-successful, current (B) render must survive untouched — no error banner.
    expect(screen.getByText("BUSINESS_B_FINANCE_ACTION")).toBeInTheDocument();
    expect(screen.queryByTestId("finance-page-error")).not.toBeInTheDocument();
  });

  it("reload (remount) starts a fresh generation sequence with no leakage from the previous mount's unresolved requests", async () => {
    const { unmount } = renderPage();
    await waitForCall(BIZ_A.id);
    fireEvent.click(screen.getByTestId("switch-to-b"));
    const staleCallB = await waitForCall(BIZ_B.id);
    // Never resolve either request — simulate navigating away mid-flight, with B as the
    // last-switched-to (and therefore persisted) business.
    unmount();

    renderPage();
    const freshCallB = await waitForCall(BIZ_B.id, 1);
    await act(async () => { freshCallB.resolve(dashboardFixture("B-fresh", BIZ_B.id)); });
    await flush();
    await waitFor(() => expect(screen.getByText("BUSINESS_B-fresh_FINANCE_ACTION")).toBeInTheDocument());

    // The previous (unmounted) instance's still-pending request for B finally resolves late — it
    // must not overwrite the fresh instance's already-correct render.
    await act(async () => { staleCallB.resolve(dashboardFixture("B-stale-from-old-mount", BIZ_B.id)); });
    await flush();
    expect(screen.getByText("BUSINESS_B-fresh_FINANCE_ACTION")).toBeInTheDocument();
  });

  // UX-04B hostile-audit correction: this map omitted "cancelled" (see page.tsx) -- a hostile
  // audit found the original claim that Money already had complete coverage was incorrect.
  it("Money's action-status label map covers the shared domain's \"cancelled\" status", async () => {
    renderPage();
    const callA = await waitForCall(BIZ_A.id);
    await act(async () => {
      callA.resolve(dashboardFixture("A", BIZ_A.id, [{
        id: "action-cancelled",
        title: "Reduce discretionary spend",
        status: "cancelled",
        ownerRole: "owner",
        priorityScore: 1,
        expectedTimeframeDays: 3,
        description: "x",
        verificationMetric: "revenue",
        verificationMethod: "x",
      }]));
    });
    await flush();
    // The shared RECOVERY_ACTION_STATUSES source of truth
    // (src/domain/founder-recovery/action-status.ts) includes "cancelled" -- this must render as
    // "Cancelled", never the raw lowercase status literal.
    expect(await screen.findByText("Cancelled")).toBeInTheDocument();
  });

  // Stale MUTATION-INTENT race (distinct from the stale load()-RESPONSE races above): a
  // business-scoped mutation started for A can still be in flight when the owner switches to B.
  describe("stale mutation-intent race (runDiagnosis)", () => {
    it("a diagnosis mutation started for A that succeeds AFTER a switch to B must not reload or re-anchor A", async () => {
      renderPage();
      const callA = await waitForCall(BIZ_A.id);
      await act(async () => { callA.resolve(dashboardFixture("A", BIZ_A.id)); });
      await flush();
      await waitFor(() => expect(screen.getByText("BUSINESS_A_FINANCE_ACTION")).toBeInTheDocument());

      // Start a diagnosis mutation for A, but leave its POST pending.
      fireEvent.click(screen.getByText("Run finance diagnosis"));
      const diagA = await waitForDiagnosisCall(BIZ_A.id);

      // Switch to B before A's mutation resolves.
      fireEvent.click(screen.getByTestId("switch-to-b"));
      const callB = await waitForCall(BIZ_B.id);
      await act(async () => { callB.resolve(dashboardFixture("B", BIZ_B.id)); });
      await flush();
      await waitFor(() => expect(screen.getByText("BUSINESS_B_FINANCE_ACTION")).toBeInTheDocument());

      // The old A diagnosis mutation now succeeds.
      await act(async () => { diagA.resolve({ id: "diag-1" }); });
      await flush();

      // B must remain displayed and active; the old mutation's own continuation must not start a
      // fresh load for A -- that would be the stale-mutation-intent bug this guard closes.
      expect(screen.getByText("BUSINESS_B_FINANCE_ACTION")).toBeInTheDocument();
      expect(screen.queryByText("BUSINESS_A_FINANCE_ACTION")).not.toBeInTheDocument();
      expect(dashboardCalls.filter((c) => c.businessId === BIZ_A.id)).toHaveLength(1);
    });

    it("a diagnosis mutation started for A that FAILS after a switch to B must not surface A's error on B", async () => {
      renderPage();
      const callA = await waitForCall(BIZ_A.id);
      await act(async () => { callA.resolve(dashboardFixture("A", BIZ_A.id)); });
      await flush();
      await waitFor(() => expect(screen.getByText("BUSINESS_A_FINANCE_ACTION")).toBeInTheDocument());

      fireEvent.click(screen.getByText("Run finance diagnosis"));
      const diagA = await waitForDiagnosisCall(BIZ_A.id);

      fireEvent.click(screen.getByTestId("switch-to-b"));
      const callB = await waitForCall(BIZ_B.id);
      await act(async () => { callB.resolve(dashboardFixture("B", BIZ_B.id)); });
      await flush();
      await waitFor(() => expect(screen.getByText("BUSINESS_B_FINANCE_ACTION")).toBeInTheDocument());

      // The old A diagnosis mutation now fails.
      await act(async () => { diagA.reject(new Error("Request failed (500)")); });
      await flush();

      // B must remain displayed with no A-specific error surfacing on it, and no context
      // re-anchor to A.
      expect(screen.getByText("BUSINESS_B_FINANCE_ACTION")).toBeInTheDocument();
      expect(screen.queryByTestId("finance-page-error")).not.toBeInTheDocument();
    });
  });
});

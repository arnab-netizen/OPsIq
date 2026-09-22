/**
 * Owner Execution & SOP (/owner/execution) — stale business-switch response race (UX-05C,
 * Candidate 1 from docs/opsiq/ux/UX-05A-ACTIONS-LAYER-CONTRACT.md Section AC).
 *
 * ROOT CAUSE: `load(businessId)` in owner/execution/page.tsx had no request-generation guard.
 * Every call fires a single `GET /api/owner/sop/dashboard?businessId=...` and, on resolution,
 * unconditionally commits the result via `setDashboard`/`setSelected` and re-anchors the shared
 * `activeBusinessId` via `setActiveBusinessId`. If the active business changes while an OLDER
 * load() for a DIFFERENT business is still in flight, and that older request resolves AFTER the
 * newer one, its stale response could silently overwrite the correctly-rendered newer business's
 * state AND re-anchor the shared context back to the stale business -- the same bug class already
 * fixed for Home/Money/Sales/Operations.
 *
 * FIX: `load()` now stamps a monotonically increasing generation number (a ref, not state) at the
 * start of each call, and every state commit (success, error, and the loading flag itself) is
 * guarded by "is this still the latest generation?" before applying -- mirroring
 * `owner-finance-business-switch-race.test.tsx`'s proven pattern and assertions exactly.
 *
 * SECOND RACE: the generation guard above closes the STALE-RESPONSE race, but a distinct
 * stale-mutation-INTENT race survives it -- a business-scoped mutation (addSnapshot/runDiagnosis/
 * updateAction/verifyAction) started for business A can still be in flight when the owner switches
 * to B; if A's mutation succeeds (or fails) afterward, its own stale closure would otherwise reload
 * (or error-render) A regardless of the newer generation counter, because its own
 * `await load(selected)` call starts AFTER B's and so would receive a NEWER generation. The
 * "stale mutation-intent race" tests below prove `activeBusinessIdRef` closes this second race,
 * using `runDiagnosis` as the representative business-scoped mutation, plus a dedicated test for
 * the create-business continuation's own distinct semantics (a successful creation intentionally
 * activates the new business, so it needs its own intent re-check after `refreshBusinesses()`).
 */
import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import { render, cleanup, waitFor, screen, fireEvent, act } from "@testing-library/react";
import OwnerExecutionPage from "@/app/(authenticated)/owner/execution/page";
import { ActiveBusinessProvider, useActiveBusiness } from "@/context/active-business-context";

const BIZ_A = { id: "biz-a", name: "Acme Bakery", currency: "USD" };
const BIZ_B = { id: "biz-b", name: "Trinity Services", currency: "USD" };
const BIZ_C = { id: "biz-c", name: "Newly Created Co", currency: "USD" };

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
      executionState: "ON_TRACK",
      healthScore: 80,
      riskScore: 10,
      opportunityScore: 50,
      dataConfidenceScore: 90,
      findings: [],
      actions,
    },
    recommendedNextAction: {
      title: `BUSINESS_${label}_EXECUTION_ACTION`,
      description: "x",
      priorityScore: 1,
      expectedImpactScore: 1,
      effortScore: 1,
      verificationMetric: "actionsOverdue",
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
      <OwnerExecutionPage />
    </ActiveBusinessProvider>
  );
}

interface PendingCall { businessId: string; resolve: (data: unknown) => void; reject: (err: unknown) => void }
let dashboardCalls: PendingCall[];
/** Pending POST .../diagnoses calls, for the stale-mutation-intent race tests below. */
let diagnosisCalls: PendingCall[];
/** Pending GET /api/owner/businesses calls, for the create-business continuation test below --
 *  only armed (made controllable) for that one test's own refreshBusinesses() call; every other
 *  /api/owner/businesses call (including a fresh mount's own bootstrap fetch) resolves
 *  immediately, exactly like the proven Finance/Sales/Operations precedent. */
let businessesRefreshCalls: Array<{ resolve: (data: unknown) => void }>;
let nextBusinessesCallIsControlled: boolean;

function installFetchMock() {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: string | URL, init?: RequestInit) => {
      const url = typeof input === "string" ? input : input.toString();
      const method = init?.method ?? "GET";

      if (url.includes("/api/owner/businesses") && method === "GET") {
        if (nextBusinessesCallIsControlled) {
          nextBusinessesCallIsControlled = false;
          return new Promise<Response>((resolve) => {
            businessesRefreshCalls.push({ resolve: (data) => resolve(ok(data)) });
          });
        }
        return ok({ businesses: [BIZ_A, BIZ_B] });
      }
      if (url.includes("/api/owner/sop/dashboard")) {
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
      if (url.includes("/api/owner/recovery/businesses") && method === "POST") {
        return ok({ id: BIZ_C.id });
      }
      const diagMatch = url.match(/\/api\/owner\/sop\/businesses\/([^/]+)\/diagnoses$/);
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
  businessesRefreshCalls = [];
  nextBusinessesCallIsControlled = false;
  installFetchMock();
  // jsdom does not reset storage between tests within the same file -- every test must start from
  // a clean, unresolved preference so businesses[0] (BIZ_A) is deterministically the initial
  // active business.
  window.sessionStorage.clear();
  window.localStorage.clear();
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("Owner Execution — stale business-switch response race (UX-05C Candidate 1)", () => {
  it("a stale A response arriving AFTER a switch to B must never overwrite B's rendered state", async () => {
    renderPage();

    const callA = await waitForCall(BIZ_A.id);
    fireEvent.click(screen.getByTestId("switch-to-b"));
    const callB = await waitForCall(BIZ_B.id);

    // B resolves first — the correct, current business.
    await act(async () => { callB.resolve(dashboardFixture("B", BIZ_B.id)); });
    await flush();
    await waitFor(() => expect(screen.getByText("BUSINESS_B_EXECUTION_ACTION")).toBeInTheDocument());

    // The stale A response finally arrives.
    await act(async () => { callA.resolve(dashboardFixture("A", BIZ_A.id)); });
    await flush();

    // B must still be displayed — no A content leaks in, and no stale-A re-anchor of the shared
    // active business either (asserted implicitly: the rendered dashboard stays B's).
    expect(screen.getByText("BUSINESS_B_EXECUTION_ACTION")).toBeInTheDocument();
    expect(screen.queryByText("BUSINESS_A_EXECUTION_ACTION")).not.toBeInTheDocument();
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

    await waitFor(() => expect(screen.getByText("BUSINESS_B_EXECUTION_ACTION")).toBeInTheDocument());
    expect(screen.queryByText("BUSINESS_A_EXECUTION_ACTION")).not.toBeInTheDocument();
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

    await waitFor(() => expect(screen.getByText("BUSINESS_A_EXECUTION_ACTION")).toBeInTheDocument());
    expect(screen.queryByText("BUSINESS_B_EXECUTION_ACTION")).not.toBeInTheDocument();
    expect(screen.queryByText("BUSINESS_A-stale-first_EXECUTION_ACTION")).not.toBeInTheDocument();
  });

  it("a stale FAILED request from the old business must not overwrite (or error out) a successful newer business's render", async () => {
    renderPage();
    const callA = await waitForCall(BIZ_A.id);
    fireEvent.click(screen.getByTestId("switch-to-b"));
    const callB = await waitForCall(BIZ_B.id);

    // B (current) succeeds first.
    await act(async () => { callB.resolve(dashboardFixture("B", BIZ_B.id)); });
    await flush();
    await waitFor(() => expect(screen.getByText("BUSINESS_B_EXECUTION_ACTION")).toBeInTheDocument());

    // A's stale in-flight request rejects afterwards (e.g. a timeout or network failure).
    await act(async () => { callA.reject(new Error("Request timed out")); });
    await flush();

    // The already-successful, current (B) render must survive untouched — no error banner.
    expect(screen.getByText("BUSINESS_B_EXECUTION_ACTION")).toBeInTheDocument();
    expect(document.querySelector(".text-destructive")).toBeNull();
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
    await waitFor(() => expect(screen.getByText("BUSINESS_B-fresh_EXECUTION_ACTION")).toBeInTheDocument());

    // The previous (unmounted) instance's still-pending request for B finally resolves late — it
    // must not overwrite the fresh instance's already-correct render.
    await act(async () => { staleCallB.resolve(dashboardFixture("B-stale-from-old-mount", BIZ_B.id)); });
    await flush();
    expect(screen.getByText("BUSINESS_B-fresh_EXECUTION_ACTION")).toBeInTheDocument();
  });

  // Stale MUTATION-INTENT race (distinct from the stale load()-RESPONSE races above): a
  // business-scoped mutation started for A can still be in flight when the owner switches to B.
  describe("stale mutation-intent race (runDiagnosis)", () => {
    it("a diagnosis mutation started for A that succeeds AFTER a switch to B must not reload or re-anchor A", async () => {
      renderPage();
      const callA = await waitForCall(BIZ_A.id);
      await act(async () => { callA.resolve(dashboardFixture("A", BIZ_A.id)); });
      await flush();
      await waitFor(() => expect(screen.getByText("BUSINESS_A_EXECUTION_ACTION")).toBeInTheDocument());

      // Start a diagnosis mutation for A, but leave its POST pending.
      fireEvent.click(screen.getByText("Run execution diagnosis"));
      const diagA = await waitForDiagnosisCall(BIZ_A.id);

      // Switch to B before A's mutation resolves.
      fireEvent.click(screen.getByTestId("switch-to-b"));
      const callB = await waitForCall(BIZ_B.id);
      await act(async () => { callB.resolve(dashboardFixture("B", BIZ_B.id)); });
      await flush();
      await waitFor(() => expect(screen.getByText("BUSINESS_B_EXECUTION_ACTION")).toBeInTheDocument());

      // The old A diagnosis mutation now succeeds.
      await act(async () => { diagA.resolve({ id: "diag-1" }); });
      await flush();

      // B must remain displayed and active; the old mutation's own continuation must not start a
      // fresh load for A -- that would be the stale-mutation-intent bug this guard closes.
      expect(screen.getByText("BUSINESS_B_EXECUTION_ACTION")).toBeInTheDocument();
      expect(screen.queryByText("BUSINESS_A_EXECUTION_ACTION")).not.toBeInTheDocument();
      expect(dashboardCalls.filter((c) => c.businessId === BIZ_A.id)).toHaveLength(1);
    });

    it("a diagnosis mutation started for A that FAILS after a switch to B must not surface A's error on B", async () => {
      renderPage();
      const callA = await waitForCall(BIZ_A.id);
      await act(async () => { callA.resolve(dashboardFixture("A", BIZ_A.id)); });
      await flush();
      await waitFor(() => expect(screen.getByText("BUSINESS_A_EXECUTION_ACTION")).toBeInTheDocument());

      fireEvent.click(screen.getByText("Run execution diagnosis"));
      const diagA = await waitForDiagnosisCall(BIZ_A.id);

      fireEvent.click(screen.getByTestId("switch-to-b"));
      const callB = await waitForCall(BIZ_B.id);
      await act(async () => { callB.resolve(dashboardFixture("B", BIZ_B.id)); });
      await flush();
      await waitFor(() => expect(screen.getByText("BUSINESS_B_EXECUTION_ACTION")).toBeInTheDocument());

      // The old A diagnosis mutation now fails.
      await act(async () => { diagA.reject(new Error("Request failed (500)")); });
      await flush();

      // B must remain displayed with no A-specific error surfacing on it, and no context
      // re-anchor to A.
      expect(screen.getByText("BUSINESS_B_EXECUTION_ACTION")).toBeInTheDocument();
      expect(document.querySelector(".text-destructive")).toBeNull();
    });
  });

  // create-business continuation has different semantics from the four ordinary business-scoped
  // mutations above: a successful creation intentionally activates the new business, so its own
  // continuation (after refreshBusinesses()) needs its own intent re-check, proven independently.
  describe("create-business continuation intent guard", () => {
    it("a stale create-business continuation must not force the newly created business back into view if the owner switched away during refreshBusinesses()", async () => {
      renderPage();
      const callA = await waitForCall(BIZ_A.id);
      await act(async () => { callA.resolve(dashboardFixture("A", BIZ_A.id)); });
      await flush();
      await waitFor(() => expect(screen.getByText("+ New business")).toBeInTheDocument());

      fireEvent.click(screen.getByRole("button", { name: "+ New business" }));
      await screen.findByRole("heading", { name: "Create a business" });
      fireEvent.change(screen.getByLabelText("Business name"), { target: { value: "Newly Created Co" } });
      fireEvent.change(screen.getByLabelText("Currency"), { target: { value: "USD" } });
      // Arm the NEXT /api/owner/businesses call (refreshBusinesses()'s own fetch, triggered by
      // createBusiness() below) to be controllable/pending, rather than resolving immediately.
      nextBusinessesCallIsControlled = true;
      fireEvent.click(screen.getByRole("button", { name: /Create business/ }));

      // The create POST resolves immediately (see installFetchMock); refreshBusinesses()'s own
      // GET /api/owner/businesses is left pending here.
      await waitFor(() => expect(businessesRefreshCalls.length).toBe(1));

      // The owner explicitly switches to B while refreshBusinesses() is still pending. The
      // shared ActiveBusinessContext's own `loading` flag is true for the whole duration of
      // refreshBusinesses(), which gates this page's own reactive load-on-business-change effect
      // (see `if (contextLoading) return;` in load()'s useEffect) -- so no new dashboard request
      // fires yet, for either B or C.
      fireEvent.click(screen.getByTestId("switch-to-b"));

      // refreshBusinesses() now resolves.
      await act(async () => { businessesRefreshCalls[0]!.resolve({ businesses: [BIZ_A, BIZ_B, BIZ_C] }); });
      await flush();

      // The stale create continuation must NOT call load(C) -- no dashboard request for C's id
      // should ever be issued.
      expect(dashboardCalls.filter((c) => c.businessId === BIZ_C.id)).toHaveLength(0);

      // Once contextLoading clears, the page's own (unrelated) reactive effect fires load(B) for
      // the now-current business -- this is the ordinary, expected path, not the stale
      // continuation under test.
      const callB = await waitForCall(BIZ_B.id);
      await act(async () => { callB.resolve(dashboardFixture("B", BIZ_B.id)); });
      await flush();
      await waitFor(() => expect(screen.getByText("BUSINESS_B_EXECUTION_ACTION")).toBeInTheDocument());
      expect(screen.queryByText("BUSINESS_C_EXECUTION_ACTION")).not.toBeInTheDocument();
    });
  });
});

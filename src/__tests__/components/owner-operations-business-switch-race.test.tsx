/**
 * Owner Operations (/owner/operations) — stale business-switch response race (UX-04B, Section Q
 * item 1).
 *
 * ROOT CAUSE (documented in UX-04A Section H/I/J item 1): `load(businessId)` in
 * owner/operations/page.tsx had zero `useRef`/`AbortController`/generation guard. Every call
 * fires a single `GET /api/owner/operations/dashboard?businessId=...` and, on resolution,
 * unconditionally commits the result via `setDashboard`/`setSelected` and re-anchors the shared
 * `activeBusinessId` via `setActiveBusinessId`. If the active business changes while an OLDER
 * load() for a DIFFERENT business is still in flight, and that older request resolves AFTER the
 * newer one, its stale response could silently overwrite the correctly-rendered newer business's
 * state AND re-anchor the shared context back to the stale business — UX-04A's re-verification
 * confirmed this mechanism is structurally identical to Money's and Sales's, not an
 * Operations-specific "extra hazard" as an earlier draft of that document had overstated.
 *
 * FIX: `load()` now stamps a monotonically increasing generation number (a ref, not state) at the
 * start of each call, and every state commit (success, error, and the loading flag itself) is
 * guarded by "is this still the latest generation?" before applying — mirroring
 * `owner-cockpit-business-switch-race.test.tsx`'s proven pattern and assertions exactly.
 *
 * HOSTILE-AUDIT ADDITION: the generation guard above closes the STALE-RESPONSE race, but a
 * hostile re-audit found a SECOND, distinct race it does not close — a business-scoped MUTATION
 * (addSnapshot/addCapacity/addWorkload/runDiagnosis/updateAction/verifyAction) started for
 * business A can still be in flight when the owner switches to B; if A's mutation succeeds (or
 * fails) afterward, its own stale closure would otherwise reload (or error-render) A regardless
 * of the newer generation counter. The "stale mutation-intent race" tests below prove
 * `activeBusinessIdRef` (owner/operations/page.tsx) closes this second race, using
 * `runDiagnosis` as the representative business-scoped mutation. This file also adds a
 * real-component regression test for the `OwnerLoadBand` -> `LOAD_BAND_LABEL` translation
 * (owner-workload-save toast), which the original UX-04B test suite implemented but never
 * asserted.
 */
import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import { render, cleanup, waitFor, screen, fireEvent, act } from "@testing-library/react";
import OwnerOperationsPage from "@/app/(authenticated)/owner/operations/page";
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
      operationsState: "SMOOTH",
      healthScore: 80,
      riskScore: 10,
      opportunityScore: 50,
      dataConfidenceScore: 90,
      findings: [],
      actions,
    },
    recommendedNextAction: {
      title: `BUSINESS_${label}_OPERATIONS_ACTION`,
      description: "x",
      priorityScore: 1,
      expectedImpactScore: 1,
      effortScore: 1,
      verificationMetric: "throughput",
    },
    cycleHistory: [],
  };
}

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
      <OwnerOperationsPage />
    </ActiveBusinessProvider>
  );
}

interface PendingCall { businessId: string; resolve: (data: unknown) => void; reject: (err: unknown) => void }
let dashboardCalls: PendingCall[];
/** Pending POST .../diagnoses calls, for the stale-mutation-intent race tests below. */
let diagnosisCalls: PendingCall[];
/** Fixed response for the next workload-snapshot save, for the OwnerLoadBand label test below. */
let nextWorkloadResponse: { dailyLoadPct: number; band: string } | null = null;

function installFetchMock() {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: string | URL) => {
      const url = typeof input === "string" ? input : input.toString();
      if (url.includes("/api/owner/businesses")) {
        return ok({ businesses: [BIZ_A, BIZ_B] });
      }
      if (url.includes("/api/owner/operations/dashboard")) {
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
      const diagMatch = url.match(/\/api\/owner\/operations\/businesses\/([^/]+)\/diagnoses$/);
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
      if (url.match(/\/api\/owner\/operations\/businesses\/[^/]+\/workload-snapshots$/)) {
        return ok(nextWorkloadResponse ?? { dailyLoadPct: 50, band: "SUSTAINABLE" });
      }
      return ok({});
    })
  );
}

async function flush() {
  await act(async () => {
    for (let i = 0; i < 8; i++) await Promise.resolve();
  });
}

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
  nextWorkloadResponse = null;
  installFetchMock();
  window.sessionStorage.clear();
  window.localStorage.clear();
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("Owner Operations — stale business-switch response race (UX-04B)", () => {
  it("a stale A response arriving AFTER a switch to B must never overwrite B's rendered state, and must not re-anchor the shared context to A", async () => {
    renderPage();

    const callA = await waitForCall(BIZ_A.id);
    fireEvent.click(screen.getByTestId("switch-to-b"));
    const callB = await waitForCall(BIZ_B.id);

    await act(async () => { callB.resolve(dashboardFixture("B", BIZ_B.id)); });
    await flush();
    await waitFor(() => expect(screen.getByText("BUSINESS_B_OPERATIONS_ACTION")).toBeInTheDocument());

    await act(async () => { callA.resolve(dashboardFixture("A", BIZ_A.id)); });
    await flush();

    // B must still be displayed. If the stale-A response had re-anchored the shared
    // activeBusinessId back to A (the exact defect this fix closes), this page's own effect
    // would have re-fetched for A and this assertion would fail.
    expect(screen.getByText("BUSINESS_B_OPERATIONS_ACTION")).toBeInTheDocument();
    expect(screen.queryByText("BUSINESS_A_OPERATIONS_ACTION")).not.toBeInTheDocument();
    expect(dashboardCalls.filter((c) => c.businessId === BIZ_A.id)).toHaveLength(1);
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

    await waitFor(() => expect(screen.getByText("BUSINESS_B_OPERATIONS_ACTION")).toBeInTheDocument());
    expect(screen.queryByText("BUSINESS_A_OPERATIONS_ACTION")).not.toBeInTheDocument();
  });

  it("rapid A -> B -> A: only the LATEST (second A) load may ever commit; the discarded first-A and B responses must not persist", async () => {
    renderPage();
    const firstCallA = await waitForCall(BIZ_A.id, 0);

    fireEvent.click(screen.getByTestId("switch-to-b"));
    const callB = await waitForCall(BIZ_B.id, 0);

    fireEvent.click(screen.getByTestId("switch-to-a"));
    const secondCallA = await waitForCall(BIZ_A.id, 1);

    await act(async () => { callB.resolve(dashboardFixture("B", BIZ_B.id)); });
    await flush();
    await act(async () => { firstCallA.resolve(dashboardFixture("A-stale-first", BIZ_A.id)); });
    await flush();
    await act(async () => { secondCallA.resolve(dashboardFixture("A", BIZ_A.id)); });
    await flush();

    await waitFor(() => expect(screen.getByText("BUSINESS_A_OPERATIONS_ACTION")).toBeInTheDocument());
    expect(screen.queryByText("BUSINESS_B_OPERATIONS_ACTION")).not.toBeInTheDocument();
    expect(screen.queryByText("BUSINESS_A-stale-first_OPERATIONS_ACTION")).not.toBeInTheDocument();
  });

  it("a stale FAILED request from the old business must not overwrite (or error out) a successful newer business's render", async () => {
    const { container } = renderPage();
    const callA = await waitForCall(BIZ_A.id);
    fireEvent.click(screen.getByTestId("switch-to-b"));
    const callB = await waitForCall(BIZ_B.id);

    await act(async () => { callB.resolve(dashboardFixture("B", BIZ_B.id)); });
    await flush();
    await waitFor(() => expect(screen.getByText("BUSINESS_B_OPERATIONS_ACTION")).toBeInTheDocument());

    await act(async () => { callA.reject(new Error("Request timed out")); });
    await flush();

    expect(screen.getByText("BUSINESS_B_OPERATIONS_ACTION")).toBeInTheDocument();
    expect(container.querySelector(".text-destructive")).toBeNull();
  });

  it("reload (remount) starts a fresh generation sequence with no leakage from the previous mount's unresolved requests", async () => {
    const { unmount } = renderPage();
    await waitForCall(BIZ_A.id);
    fireEvent.click(screen.getByTestId("switch-to-b"));
    const staleCallB = await waitForCall(BIZ_B.id);
    unmount();

    renderPage();
    const freshCallB = await waitForCall(BIZ_B.id, 1);
    await act(async () => { freshCallB.resolve(dashboardFixture("B-fresh", BIZ_B.id)); });
    await flush();
    await waitFor(() => expect(screen.getByText("BUSINESS_B-fresh_OPERATIONS_ACTION")).toBeInTheDocument());

    await act(async () => { staleCallB.resolve(dashboardFixture("B-stale-from-old-mount", BIZ_B.id)); });
    await flush();
    expect(screen.getByText("BUSINESS_B-fresh_OPERATIONS_ACTION")).toBeInTheDocument();
  });

  // UX-04B hostile-audit correction: this map omitted "cancelled" (see page.tsx) -- a hostile
  // audit found the original claim that Operations already had complete coverage was incorrect.
  it("Operations' action-status label map covers the shared domain's \"cancelled\" status", async () => {
    renderPage();
    const callA = await waitForCall(BIZ_A.id);
    await act(async () => {
      callA.resolve(dashboardFixture("A", BIZ_A.id, [{
        id: "action-cancelled",
        title: "Pause the SOP rollout",
        status: "cancelled",
        ownerRole: "owner",
        priorityScore: 1,
        expectedTimeframeDays: 3,
        description: "x",
        verificationMetric: "throughput",
        verificationMethod: "x",
      }]));
    });
    await flush();
    expect(await screen.findByText("Cancelled")).toBeInTheDocument();
  });

  // UX-04B hostile-audit addition: the OwnerLoadBand -> LOAD_BAND_LABEL translation was
  // implemented but never asserted by a real-component test. Drives the real workload form.
  it("the workload-save toast translates a raw OwnerLoadBand into its plain-language label, never the raw enum token", async () => {
    renderPage();
    const callA = await waitForCall(BIZ_A.id);
    await act(async () => { callA.resolve(dashboardFixture("A", BIZ_A.id)); });
    await flush();
    await waitFor(() => expect(screen.getByTestId("workload-form-toggle")).not.toBeDisabled());

    nextWorkloadResponse = { dailyLoadPct: 95, band: "BOTTLENECK_RISK" };
    fireEvent.click(screen.getByTestId("workload-form-toggle"));
    fireEvent.change(screen.getByTestId("workload-ownerMinutes"), { target: { value: "480" } });
    fireEvent.change(screen.getByTestId("workload-sustainableMinutes"), { target: { value: "240" } });
    fireEvent.click(screen.getByTestId("workload-submit"));

    // A successful workload save triggers addWorkload's own `await load(targetBusinessId)`,
    // which re-enters the whole-page loading skeleton until THIS second dashboard fetch
    // resolves -- resolve it so the page (and the workload-result toast set just before that
    // reload) renders again.
    const reloadCallA = await waitForCall(BIZ_A.id, 1);
    await act(async () => { reloadCallA.resolve(dashboardFixture("A-after-workload", BIZ_A.id)); });
    await flush();

    const result = await waitFor(() => screen.getByTestId("workload-result"));
    expect(result.textContent).toMatch(/Bottleneck risk/);
    expect(result.textContent).not.toMatch(/BOTTLENECK_RISK/);
  });

  // Stale MUTATION-INTENT race (distinct from the stale load()-RESPONSE races above): a
  // business-scoped mutation started for A can still be in flight when the owner switches to B.
  describe("stale mutation-intent race (runDiagnosis)", () => {
    it("a diagnosis mutation started for A that succeeds AFTER a switch to B must not reload or re-anchor A", async () => {
      renderPage();
      const callA = await waitForCall(BIZ_A.id);
      await act(async () => { callA.resolve(dashboardFixture("A", BIZ_A.id)); });
      await flush();
      await waitFor(() => expect(screen.getByText("BUSINESS_A_OPERATIONS_ACTION")).toBeInTheDocument());

      fireEvent.click(screen.getByText("Run operations diagnosis"));
      const diagA = await waitForDiagnosisCall(BIZ_A.id);

      fireEvent.click(screen.getByTestId("switch-to-b"));
      const callB = await waitForCall(BIZ_B.id);
      await act(async () => { callB.resolve(dashboardFixture("B", BIZ_B.id)); });
      await flush();
      await waitFor(() => expect(screen.getByText("BUSINESS_B_OPERATIONS_ACTION")).toBeInTheDocument());

      await act(async () => { diagA.resolve({ id: "diag-1" }); });
      await flush();

      expect(screen.getByText("BUSINESS_B_OPERATIONS_ACTION")).toBeInTheDocument();
      expect(screen.queryByText("BUSINESS_A_OPERATIONS_ACTION")).not.toBeInTheDocument();
      expect(dashboardCalls.filter((c) => c.businessId === BIZ_A.id)).toHaveLength(1);
    });

    it("a diagnosis mutation started for A that FAILS after a switch to B must not surface A's error on B", async () => {
      const { container } = renderPage();
      const callA = await waitForCall(BIZ_A.id);
      await act(async () => { callA.resolve(dashboardFixture("A", BIZ_A.id)); });
      await flush();
      await waitFor(() => expect(screen.getByText("BUSINESS_A_OPERATIONS_ACTION")).toBeInTheDocument());

      fireEvent.click(screen.getByText("Run operations diagnosis"));
      const diagA = await waitForDiagnosisCall(BIZ_A.id);

      fireEvent.click(screen.getByTestId("switch-to-b"));
      const callB = await waitForCall(BIZ_B.id);
      await act(async () => { callB.resolve(dashboardFixture("B", BIZ_B.id)); });
      await flush();
      await waitFor(() => expect(screen.getByText("BUSINESS_B_OPERATIONS_ACTION")).toBeInTheDocument());

      await act(async () => { diagA.reject(new Error("Request failed (500)")); });
      await flush();

      expect(screen.getByText("BUSINESS_B_OPERATIONS_ACTION")).toBeInTheDocument();
      expect(container.querySelector(".text-destructive")).toBeNull();
    });
  });
});

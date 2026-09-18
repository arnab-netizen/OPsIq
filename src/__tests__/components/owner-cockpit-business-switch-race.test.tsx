/**
 * Owner Cockpit (Home) — stale business-switch response race (P1-B, "HOME business-context leak").
 *
 * LIVE-PROVEN FAILURE (production): on /owner/cockpit, "Top Priority" and "Execution lifecycle"
 * showed ZZ-TEST-FIELD-SERVICE's state while a DIFFERENT business (Trinity Services, then
 * ZZ-TEST-SANDBOX) was actually active — even though the header and the dedicated Finance
 * diagnosis correctly scoped to the active business. This reproduced across three real
 * businesses in one workspace.
 *
 * ROOT CAUSE: `load(businessId)` in owner/cockpit/page.tsx had no request-generation guard. Every
 * call fires `Promise.all([now-view, recovery-status, public-signals])` and, on resolution,
 * unconditionally commits the result via `setBridge`/`setExecutionLifecycle`/`setFinanceTopPriority`
 * etc. If the active business changes while an OLDER load() for a DIFFERENT business is still in
 * flight, and that older request happens to resolve AFTER the newer one, its stale response
 * silently overwrites the correctly-rendered newer business's state — with no error and no visible
 * loading transition (the loading skeleton has already been dismissed by the newer, faster
 * request), while the header (driven directly by ActiveBusinessContext, not by this stale
 * response) stays correct throughout — exactly matching the live observation.
 *
 * This is a pure client-side async race. Server-side now-view scoping for
 * businessId+restrictExecutionToBusiness is already proven correct by real-Postgres tests (see
 * cockpit-business-scoping.db.test.ts's suppress=true A/B/C isolation tests and its own
 * CASH_PROFIT-attribution A/B tests, plus cockpit-finance-priority.db.test.ts's "returns ONLY that
 * business's action — never the other business's" test) — Workstream A2 of the forensic
 * remediation task confirmed no server-side fix was needed.
 *
 * FIX: `load()` now stamps a monotonically increasing generation number (a ref, not state, so
 * incrementing it never itself triggers a render) at the start of each call, and every state
 * commit (success, error, and the loading flag itself) is guarded by "is this still the latest
 * generation?" before applying. A stale response arriving late is a correctly-detected no-op.
 */
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, cleanup, waitFor, screen, fireEvent, act } from "@testing-library/react";
import OwnerCockpitPage from "@/app/(authenticated)/owner/cockpit/page";
import { ActiveBusinessProvider, useActiveBusiness } from "@/context/active-business-context";
import type { BridgedRouteView, ProcessExecutionBridgeView } from "@/components/owner/ProcessIntelligencePanel";
import type { OwnerExecutionLifecycleView, ExecutionLifecycleItem } from "@/services/owner-guidance/owner-now-view.service";
import type { CockpitFinancePriority } from "@/services/owner-guidance/cockpit-finance-priority.service";

const BIZ_A = { id: "11111111-1111-4111-8111-111111111111", name: "ZZ-TEST-FIELD-SERVICE" };
const BIZ_B = { id: "22222222-2222-4222-8222-222222222222", name: "Trinity Services" };

function ok(data: unknown): Response {
  return { ok: true, status: 200, json: async () => data } as Response;
}

function route(label: string): BridgedRouteView {
  return {
    taskKey: `pc:${label}`, sourceFamily: "PROCESS_CORRECTION", sourceFindingKey: `c-${label}`,
    executionRoute: "CREATE_OWNER_APPROVAL_TASK", actionOwner: "OWNER", approvalLevel: "OWNER_APPROVAL_REQUIRED",
    requiredEvidence: [], completionCriteria: "x", reassessmentTrigger: "x", riskIfIgnored: "x",
    ownerVisibleSummary: `BUSINESS_${label}_TOP_PRIORITY`, notActionableReason: null, evidenceRefs: [],
    severity: "HIGH", priorityRank: 1, status: "PROPOSED", canStart: true,
  };
}

function bridgeFor(label: string): ProcessExecutionBridgeView {
  const r = route(label);
  return { routes: [r], topRoute: r, summary: { total: 1, ownerApproval: 1, managerStaff: 0, dataTasks: 0, monitorOnly: 0 } };
}

function lifecycleItemFor(label: string): ExecutionLifecycleItem {
  return {
    taskId: `task-${label}`, taskKey: `lc:${label}`, sourceFamily: "CASH_PROFIT", status: "PROPOSED",
    ownerVisibleSummary: `BUSINESS_${label}_LIFECYCLE_ITEM`, severity: "HIGH", assignedRole: "owner",
    createdAt: "2026-01-01T00:00:00.000Z", dueAt: null, progressPct: null, blockerActive: false,
    outcomeId: null, verificationClassification: null, verificationClassificationLabel: null,
    expectedBenefit: null, baselineMetricName: null, baselineValue: null, targetValue: null,
    requiredEvidence: [], evidenceRefs: [], evidenceComplete: true, canAcknowledge: false, canStart: false,
    canRecordProgress: false, canRecordOutcome: false, canVerify: false,
  };
}

function lifecycleFor(label: string): OwnerExecutionLifecycleView {
  return {
    requiresDecision: [], inExecution: [lifecycleItemFor(label)], awaitingVerification: [],
    recentlyVerified: [], totalPendingVerification: 0,
  };
}

function financeFor(label: string, businessId: string): CockpitFinancePriority {
  return {
    businessId, businessName: label, cycleId: `cycle-${label}`, generatedAt: new Date().toISOString(),
    survivalState: "SAFE", overallHealthScore: 0.9,
    topAction: { id: `action-${label}`, title: `BUSINESS_${label}_FINANCE_ACTION`, description: "x", priorityScore: 1 },
  };
}

function nowViewFixture(label: string, businessId: string) {
  return {
    processExecution: bridgeFor(label),
    executionLifecycle: lifecycleFor(label),
    financeTopPriority: financeFor(label, businessId),
  };
}

/** Test-only harness so the test can drive a business switch exactly like a different owner page's
 *  selector would — this page renders no selector of its own by design (see its own doc comment). */
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
      <OwnerCockpitPage />
    </ActiveBusinessProvider>
  );
}

interface PendingCall { businessId: string; resolve: (data: unknown) => void; reject: (err: unknown) => void }
let nowViewCalls: PendingCall[];

function installFetchMock() {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: string | URL) => {
      const url = typeof input === "string" ? input : input.toString();
      if (url.includes("/api/owner/businesses")) {
        return ok({ businesses: [BIZ_A, BIZ_B] });
      }
      if (url.includes("/api/owner/now-view")) {
        const params = new URL(url, "https://example.com").searchParams;
        const businessId = params.get("businessId")!;
        return new Promise<Response>((resolve, reject) => {
          nowViewCalls.push({
            businessId,
            resolve: (data) => resolve(ok(data)),
            reject,
          });
        });
      }
      if (url.includes("/api/owner/recovery-status")) return ok({});
      if (url.includes("/api/owner/public-signals")) return ok({});
      if (url.includes("/api/owner/onboarding")) return ok({ found: false });
      if (url.includes("/api/owner/process-execution")) return ok({ tasks: [] });
      return ok({});
    })
  );
}

/** Flush the microtask queue enough times for a resolved/rejected fetch promise to propagate
 *  through `Promise.all` and the subsequent `setState` calls inside `load()`. */
async function flush() {
  await act(async () => {
    for (let i = 0; i < 8; i++) await Promise.resolve();
  });
}

/** Wait until the (0-indexed) Nth now-view call for a given business has been issued, and return
 *  its pending resolve/reject pair. */
async function waitForCall(businessId: string, occurrence = 0): Promise<PendingCall> {
  await waitFor(
    () => {
      const matches = nowViewCalls.filter((c) => c.businessId === businessId);
      expect(matches.length).toBeGreaterThan(occurrence);
    },
    { timeout: 3000 }
  );
  return nowViewCalls.filter((c) => c.businessId === businessId)[occurrence]!;
}

beforeEach(() => {
  nowViewCalls = [];
  installFetchMock();
  // ActiveBusinessContext persists the active business to sessionStorage/localStorage
  // (per-tab / cross-tab "last used" seed) — jsdom does not reset storage between tests within
  // the same file, so a previous test's setActiveBusinessId() call would otherwise leak into this
  // test's "initial" business resolution. Every test here must start from a clean, unresolved
  // preference so businesses[0] (BIZ_A) is deterministically the initial active business.
  window.sessionStorage.clear();
  window.localStorage.clear();
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("Owner Cockpit — stale business-switch response race (P1-B)", () => {
  it("a stale A response arriving AFTER a switch to B must never overwrite B's Top Priority / lifecycle / finance priority", async () => {
    renderPage();

    // Initial resolution (no stored preference, businesses[0]) is BIZ_A; its now-view request is
    // issued but held pending.
    const callA = await waitForCall(BIZ_A.id);

    // Switch to B before A resolves.
    fireEvent.click(screen.getByTestId("switch-to-b"));
    const callB = await waitForCall(BIZ_B.id);

    // B resolves first — the correct, current business.
    await act(async () => { callB.resolve(nowViewFixture("B", BIZ_B.id)); });
    await flush();
    await waitFor(() => expect(screen.getByTestId("cockpit-top-action-title")).toHaveTextContent("BUSINESS_B_TOP_PRIORITY"));
    expect(screen.getByText("BUSINESS_B_LIFECYCLE_ITEM")).toBeInTheDocument();
    expect(screen.getByTestId("cockpit-finance-priority-title")).toHaveTextContent("BUSINESS_B_FINANCE_ACTION");

    // The stale A response finally arrives.
    await act(async () => { callA.resolve(nowViewFixture("A", BIZ_A.id)); });
    await flush();

    // B must still be displayed everywhere — no A content leaks in.
    expect(screen.getByTestId("cockpit-top-action-title")).toHaveTextContent("BUSINESS_B_TOP_PRIORITY");
    expect(screen.getByText("BUSINESS_B_LIFECYCLE_ITEM")).toBeInTheDocument();
    expect(screen.getByTestId("cockpit-finance-priority-title")).toHaveTextContent("BUSINESS_B_FINANCE_ACTION");
    expect(screen.queryByText("BUSINESS_A_TOP_PRIORITY")).not.toBeInTheDocument();
    expect(screen.queryByText("BUSINESS_A_LIFECYCLE_ITEM")).not.toBeInTheDocument();
    expect(screen.queryByText("BUSINESS_A_FINANCE_ACTION")).not.toBeInTheDocument();
  });

  it("inverse timing: A resolves first, B resolves second (the ordinary case) — B must win", async () => {
    renderPage();
    const callA = await waitForCall(BIZ_A.id);
    fireEvent.click(screen.getByTestId("switch-to-b"));
    const callB = await waitForCall(BIZ_B.id);

    await act(async () => { callA.resolve(nowViewFixture("A", BIZ_A.id)); });
    await flush();
    await act(async () => { callB.resolve(nowViewFixture("B", BIZ_B.id)); });
    await flush();

    await waitFor(() => expect(screen.getByTestId("cockpit-top-action-title")).toHaveTextContent("BUSINESS_B_TOP_PRIORITY"));
    expect(screen.queryByText("BUSINESS_A_TOP_PRIORITY")).not.toBeInTheDocument();
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
    await act(async () => { callB.resolve(nowViewFixture("B", BIZ_B.id)); });
    await flush();
    await act(async () => { firstCallA.resolve(nowViewFixture("A-stale-first", BIZ_A.id)); });
    await flush();
    await act(async () => { secondCallA.resolve(nowViewFixture("A", BIZ_A.id)); });
    await flush();

    await waitFor(() => expect(screen.getByTestId("cockpit-top-action-title")).toHaveTextContent("BUSINESS_A_TOP_PRIORITY"));
    expect(screen.queryByText("BUSINESS_B_TOP_PRIORITY")).not.toBeInTheDocument();
    expect(screen.queryByText("BUSINESS_B_LIFECYCLE_ITEM")).not.toBeInTheDocument();
    expect(screen.queryByText("BUSINESS_A-stale-first_TOP_PRIORITY")).not.toBeInTheDocument();
  });

  it("a stale FAILED request from the old business must not overwrite (or error out) a successful newer business's render", async () => {
    renderPage();
    const callA = await waitForCall(BIZ_A.id);
    fireEvent.click(screen.getByTestId("switch-to-b"));
    const callB = await waitForCall(BIZ_B.id);

    // B (current) succeeds first.
    await act(async () => { callB.resolve(nowViewFixture("B", BIZ_B.id)); });
    await flush();
    await waitFor(() => expect(screen.getByTestId("cockpit-top-action-title")).toHaveTextContent("BUSINESS_B_TOP_PRIORITY"));

    // A's stale in-flight request (e.g. a timeout or network failure) rejects afterwards.
    await act(async () => { callA.reject(new Error("Request timed out after 10 seconds.")); });
    await flush();

    // The already-successful, current (B) render must survive untouched — no error screen, no
    // reversion to a loading state, no A content.
    expect(screen.getByTestId("cockpit-top-action-title")).toHaveTextContent("BUSINESS_B_TOP_PRIORITY");
    expect(screen.queryByText("Retry")).not.toBeInTheDocument();
  });

  it("reload (remount) starts a fresh generation sequence with no leakage from the previous mount's unresolved requests", async () => {
    const { unmount } = renderPage();
    await waitForCall(BIZ_A.id);
    fireEvent.click(screen.getByTestId("switch-to-b"));
    const staleCallB = await waitForCall(BIZ_B.id);
    // Never resolve either request — simulate navigating away (a reload) mid-flight, with B as
    // the last-switched-to (and therefore persisted — see ActiveBusinessContext's sessionStorage/
    // localStorage persistence) business.
    unmount();

    // Fresh mount ("reload"/remount): a real page reload keeps the SAME tab's sessionStorage
    // (and a brand-new tab would fall back to localStorage's "last used" seed either way), so the
    // freshly mounted instance correctly resolves back to B, not A — this is intended behavior,
    // not a bug (see ActiveBusinessContext's own doc comment on that persistence design). The
    // regression this proves is different: the OLD, unmounted instance's still-unresolved
    // requests (for BOTH A and B) must never leak into or corrupt the fresh instance's own,
    // independent render.
    renderPage();
    const freshCallB = await waitForCall(BIZ_B.id, 1);
    await act(async () => { freshCallB.resolve(nowViewFixture("B-fresh", BIZ_B.id)); });
    await flush();
    await waitFor(() => expect(screen.getByTestId("cockpit-top-action-title")).toHaveTextContent("BUSINESS_B-fresh_TOP_PRIORITY"));

    // The previous (unmounted) instance's still-pending request for B finally resolves late —
    // it must not overwrite the fresh instance's already-correct render.
    await act(async () => { staleCallB.resolve(nowViewFixture("B-stale-from-old-mount", BIZ_B.id)); });
    await flush();
    expect(screen.getByTestId("cockpit-top-action-title")).toHaveTextContent("BUSINESS_B-fresh_TOP_PRIORITY");
  });
});

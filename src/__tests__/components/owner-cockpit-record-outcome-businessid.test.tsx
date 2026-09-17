/**
 * Owner Cockpit (Home) — RECORD_OUTCOME / VERIFY_OUTCOME businessId regression proof.
 *
 * ROOT_CAUSE: the Owner Cockpit's client-side POST body for Phase 3 execution actions
 * (`onAction()` in `owner/cockpit/page.tsx`) never included `businessId`. `RECORD_OUTCOME`
 * requires `businessId` server-side (`applyProcessExecutionAction` in
 * process-execution-bridge.service.ts returns `MISSING_INPUT`/400 without one), so every owner
 * who clicked "Record outcome" on Home got a 400 and the Phase 3 lifecycle silently could not
 * close. This is the exact UI-level regression test that would have caught the original bug: it
 * drives the REAL cockpit page (not just the presentational component) through a real click +
 * confirm, and inspects the actual POST body sent to fetch().
 *
 * Fix: `onAction()` now attaches the shared `activeBusinessId` (from ActiveBusinessContext) to the
 * POST body specifically for RECORD_OUTCOME and VERIFY_OUTCOME -- and ONLY those two actions, since
 * the execution-lifecycle items these actions apply to are the ones now-view already scoped to
 * `activeBusinessId` (see buildExecutionLifecycle's businessId scoping); other actions (e.g.
 * ACKNOWLEDGE) reach tasks via a bare taskKey and must NOT get a businessId attached, or the
 * service's defense-in-depth business-isolation guard could reject a task belonging to a
 * different business than whichever one happens to be active.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, cleanup, waitFor, screen, fireEvent } from "@testing-library/react";
import OwnerCockpitPage from "@/app/(authenticated)/owner/cockpit/page";
import { ActiveBusinessProvider } from "@/context/active-business-context";
import type { OwnerExecutionLifecycleView, ExecutionLifecycleItem } from "@/services/owner-guidance/owner-now-view.service";

const BIZ = { id: "biz-active-1", name: "Acme Bakery", currency: "USD" };

function lifecycleItem(over: Partial<ExecutionLifecycleItem> = {}): ExecutionLifecycleItem {
  return {
    taskId: "task-uuid-1",
    taskKey: "task_default",
    sourceFamily: "PROCESS_CORRECTION",
    status: "PROPOSED",
    ownerVisibleSummary: "Improve cash flow",
    severity: "HIGH",
    assignedRole: "owner",
    createdAt: "2026-01-01T00:00:00.000Z",
    dueAt: null,
    progressPct: null,
    blockerActive: false,
    outcomeId: null,
    verificationClassification: null,
    verificationClassificationLabel: null,
    expectedBenefit: null,
    baselineMetricName: null,
    baselineValue: null,
    targetValue: null,
    requiredEvidence: [],
    evidenceRefs: [],
    evidenceComplete: true,
    canAcknowledge: false,
    canStart: false,
    canRecordProgress: false,
    canRecordOutcome: false,
    canVerify: false,
    ...over,
  };
}

function emptyLifecycle(): OwnerExecutionLifecycleView {
  return { requiresDecision: [], inExecution: [], awaitingVerification: [], recentlyVerified: [], totalPendingVerification: 0 };
}

const LIFECYCLE: OwnerExecutionLifecycleView = {
  ...emptyLifecycle(),
  requiresDecision: [lifecycleItem({ taskKey: "task_ack", status: "PROPOSED", canAcknowledge: true })],
  awaitingVerification: [
    lifecycleItem({ taskKey: "task_complete", status: "COMPLETED", canRecordOutcome: true }),
    lifecycleItem({ taskKey: "task_verify", status: "OUTCOME_RECORDED", canVerify: true }),
  ],
};

function renderPage() {
  return render(
    <ActiveBusinessProvider>
      <OwnerCockpitPage />
    </ActiveBusinessProvider>
  );
}

let postCalls: { url: string; body: Record<string, unknown> }[];

function installFetchMock() {
  postCalls = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: string | URL, init?: RequestInit) => {
      const url = typeof input === "string" ? input : input.toString();

      if (url.includes("/api/owner/businesses")) {
        return { ok: true, status: 200, json: async () => ({ businesses: [BIZ] }) } as Response;
      }
      if (url.includes("/api/owner/now-view")) {
        return { ok: true, status: 200, json: async () => ({ executionLifecycle: LIFECYCLE }) } as Response;
      }
      if (url.includes("/api/owner/recovery-status") || url.includes("/api/owner/public-signals")) {
        return { ok: true, status: 200, json: async () => ({}) } as Response;
      }
      if (url.includes("/api/owner/onboarding")) {
        return { ok: true, status: 200, json: async () => ({ found: false }) } as Response;
      }
      if (url.includes("/api/owner/process-execution")) {
        if (init?.method === "POST") {
          const body = JSON.parse(String(init.body ?? "{}")) as Record<string, unknown>;
          postCalls.push({ url, body });
          return { ok: true, status: 200, json: async () => ({ status: "OUTCOME_RECORDED" }) } as Response;
        }
        return { ok: true, status: 200, json: async () => ({ tasks: [] }) } as Response;
      }
      return { ok: true, status: 200, json: async () => ({}) } as Response;
    })
  );
}

beforeEach(() => installFetchMock());
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("Owner Cockpit — RECORD_OUTCOME / VERIFY_OUTCOME businessId wiring", () => {
  it("RECORD_OUTCOME's POST body includes businessId matching the currently active business", async () => {
    renderPage();
    await waitFor(() => expect(screen.getByTestId("cockpit-action-RECORD_OUTCOME-task_complete")).toBeInTheDocument());

    fireEvent.click(screen.getByTestId("cockpit-action-RECORD_OUTCOME-task_complete"));
    fireEvent.click(await screen.findByTestId("cockpit-phase3-confirm"));

    await waitFor(() => {
      const call = postCalls.find((c) => c.body.action === "RECORD_OUTCOME");
      expect(call).toBeDefined();
      expect(call!.body.businessId).toBe(BIZ.id);
      expect(call!.body.taskKey).toBe("task_complete");
    });
  });

  it("VERIFY_OUTCOME's POST body includes businessId matching the currently active business", async () => {
    renderPage();
    await waitFor(() => expect(screen.getByTestId("cockpit-action-VERIFY_OUTCOME-task_verify")).toBeInTheDocument());

    fireEvent.click(screen.getByTestId("cockpit-action-VERIFY_OUTCOME-task_verify"));
    fireEvent.click(await screen.findByTestId("cockpit-phase3-confirm"));

    await waitFor(() => {
      const call = postCalls.find((c) => c.body.action === "VERIFY_OUTCOME");
      expect(call).toBeDefined();
      expect(call!.body.businessId).toBe(BIZ.id);
      expect(call!.body.taskKey).toBe("task_verify");
    });
  });

  it("a non-Phase-3-outcome action (ACKNOWLEDGE) does NOT get businessId attached (scoped fix, not blanket)", async () => {
    renderPage();
    await waitFor(() => expect(screen.getByTestId("cockpit-action-ACKNOWLEDGE-task_ack")).toBeInTheDocument());

    fireEvent.click(screen.getByTestId("cockpit-action-ACKNOWLEDGE-task_ack"));

    await waitFor(() => {
      const call = postCalls.find((c) => c.body.action === "ACKNOWLEDGE");
      expect(call).toBeDefined();
      expect(call!.body.businessId).toBeUndefined();
    });
  });
});

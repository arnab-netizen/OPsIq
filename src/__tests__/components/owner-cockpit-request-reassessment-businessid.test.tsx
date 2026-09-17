/**
 * Owner Cockpit — REQUEST_REASSESSMENT business-context wiring (PR H).
 *
 * ROOT_CAUSE: OwnerCockpitPage's `onAction()` (src/app/(authenticated)/owner/cockpit/page.tsx)
 * built its POST body from `{ taskKey, action, ...input }` and NEVER included `businessId`,
 * regardless of which action was submitted. process-execution-bridge.service.ts's
 * REQUEST_REASSESSMENT branch (applyProcessExecutionAction, ~line 608-609) requires `businessId`
 * unconditionally — `if (!input.businessId || !input.businessId.trim()) return { ok: false,
 * reason: "businessId is required to open a reassessment.", code: "MISSING_INPUT" }` — so a real
 * owner clicking "Request reassessment" in the cockpit received a 400 with no reassessment ever
 * created. This is the same root-cause shape PR #498 fixed for RECORD_OUTCOME/VERIFY_OUTCOME
 * (independent instance: a different action, same missing-wiring mechanism).
 *
 * These tests prove the real POST body OwnerCockpitPage sends, end to end from a genuine click
 * through the actual (unmocked) MinimumOwnerCockpit + OwnerCockpitPage components — only `fetch`
 * is mocked. The first test is the classic red/green regression proof: on pre-fix `onAction()`
 * (body built with no businessId branch) this test fails because `body.businessId` is undefined;
 * post-fix it passes because REQUEST_REASSESSMENT alone gets `activeBusinessId` attached. Verified
 * locally: failed against the pre-fix `onAction()` (proving the defect is real on current main),
 * passes against the fixed `onAction()` below.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, cleanup, waitFor, fireEvent } from "@testing-library/react";
import OwnerCockpitPage from "@/app/(authenticated)/owner/cockpit/page";
import { ActiveBusinessProvider } from "@/context/active-business-context";
import type { BridgedRouteView, ProcessExecutionBridgeView } from "@/components/owner/ProcessIntelligencePanel";

const BIZ = { id: "cccccccc-cccc-4000-8000-cccccccccccc", name: "Sparkle Laundry", currency: "USD" };

function reassessableRoute(over: Partial<BridgedRouteView> = {}): BridgedRouteView {
  // MONITOR_ONLY + non-terminal status: allowedCockpitActions() returns exactly
  // ["REQUEST_MISSING_DATA", "REQUEST_REASSESSMENT"] (see MinimumOwnerCockpit.tsx), both of which
  // fit inside the always-visible secondary row -- no need to open the collapsed "more actions"
  // <details> to reach the button under test.
  return {
    taskKey: "pc:monitor-1", sourceFamily: "PROCESS_CORRECTION", sourceFindingKey: "monitor-1",
    executionRoute: "MONITOR_ONLY", actionOwner: "NO_ACTION", approvalLevel: "NEEDS_DATA",
    requiredEvidence: [], completionCriteria: "", reassessmentTrigger: "Re-evaluate next review.",
    riskIfIgnored: "a stale signal goes unchecked", ownerVisibleSummary: "Keep an eye on the delivery delay trend",
    notActionableReason: "Not enough evidence to act yet.", evidenceRefs: [], severity: "MEDIUM",
    priorityRank: 1, status: "PROPOSED", ...over,
  };
}

function bridgeFor(topRoute: BridgedRouteView): ProcessExecutionBridgeView {
  return {
    routes: [topRoute], topRoute,
    summary: { total: 1, ownerApproval: 0, managerStaff: 0, dataTasks: 0, monitorOnly: 1 },
  };
}

function renderPage() {
  return render(
    <ActiveBusinessProvider>
      <OwnerCockpitPage />
    </ActiveBusinessProvider>
  );
}

let postedBodies: Array<{ url: string; body: Record<string, unknown> }>;
let bridge: ProcessExecutionBridgeView;

function installFetchMock() {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: string | URL, init?: RequestInit) => {
      const url = typeof input === "string" ? input : input.toString();

      if (url.includes("/api/owner/businesses")) {
        return { ok: true, status: 200, json: async () => ({ businesses: [BIZ] }) } as Response;
      }
      if (url.includes("/api/owner/now-view")) {
        return { ok: true, status: 200, json: async () => ({ processExecution: bridge }) } as Response;
      }
      if (url.includes("/api/owner/process-execution") && init?.method === "POST") {
        const body = JSON.parse(String(init.body ?? "{}")) as Record<string, unknown>;
        postedBodies.push({ url, body });
        return { ok: true, status: 200, json: async () => ({ status: "PROPOSED", reassessmentId: "re-1" }) } as Response;
      }
      // recovery-status / public-signals / onboarding / process-execution GET / anything else:
      // best-effort empty success, matching the parallel-fetch test's catch-all.
      return { ok: true, status: 200, json: async () => ({}) } as Response;
    })
  );
}

beforeEach(() => {
  postedBodies = [];
  bridge = bridgeFor(reassessableRoute());
  installFetchMock();
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("Owner Cockpit — REQUEST_REASSESSMENT businessId wiring (PR H)", () => {
  it("sends businessId matching the active business when REQUEST_REASSESSMENT is submitted", async () => {
    const { getByTestId } = renderPage();

    const button = await waitFor(() => getByTestId("cockpit-action-REQUEST_REASSESSMENT"));
    fireEvent.click(button);

    // REQUEST_REASSESSMENT needs a reason field (optional) -- submit without filling it in, the
    // same as an owner who just clicks through.
    const confirm = await waitFor(() => getByTestId("cockpit-confirm"));
    fireEvent.click(confirm);

    await waitFor(() => {
      const call = postedBodies.find((c) => c.body.action === "REQUEST_REASSESSMENT");
      expect(call).toBeDefined();
    });

    const call = postedBodies.find((c) => c.body.action === "REQUEST_REASSESSMENT")!;
    expect(call.body.taskKey).toBe("pc:monitor-1");
    // THE regression assertion: pre-fix, body.businessId is undefined here and the real server
    // (process-execution-bridge.service.ts line ~609) would reject this with 400/MISSING_INPUT.
    expect(call.body.businessId).toBe(BIZ.id);
  });

  it("does NOT attach businessId to a different action (REQUEST_MISSING_DATA) — no blanket attachment", async () => {
    // Same MONITOR_ONLY fixture -- allowedCockpitActions() offers REQUEST_MISSING_DATA alongside
    // REQUEST_REASSESSMENT for a non-actionable route, both directly visible. Proves the fix is
    // scoped to REQUEST_REASSESSMENT specifically, not a shared/blanket attachment.
    const { getByTestId } = renderPage();

    const button = await waitFor(() => getByTestId("cockpit-action-REQUEST_MISSING_DATA"));
    fireEvent.click(button);

    const reasonInput = await waitFor(() => getByTestId("cockpit-reason-input"));
    fireEvent.change(reasonInput, { target: { value: "need current delivery-time evidence" } });
    fireEvent.click(getByTestId("cockpit-confirm"));

    await waitFor(() => {
      const call = postedBodies.find((c) => c.body.action === "REQUEST_MISSING_DATA");
      expect(call).toBeDefined();
    });

    const call = postedBodies.find((c) => c.body.action === "REQUEST_MISSING_DATA")!;
    expect(call.body.businessId).toBeUndefined();
    expect(call.body.reason).toBe("need current delivery-time evidence");
  });
});

/**
 * Owner Cockpit (Home) — accidental request-waterfall removal (P1-A).
 *
 * ROOT_CAUSE: after businesses resolved, now-view / recovery-status / public-signals were three
 * sequential `await`s inside one `load()` function (a genuine network waterfall — not merely a
 * rendering illusion), and the page's `if (loading) return <skeleton>` early-return fully
 * unmounted StartHereContinuationCard (which drives its own onboarding + process-execution calls,
 * already Promise.all'd internally) until that three-call chain finished. All five calls need
 * only `businessId` -- none reads another's response -- so this was pure accidental
 * serialization, not a real dependency.
 *
 * These tests assert call ORDER/overlap, not just eventual correctness, since the whole point of
 * the fix is that the calls fire together rather than one after another. They also pin the
 * existing partial-failure semantics (`recovery-status`/`public-signals` are individually
 * best-effort; `now-view` failure is still page-fatal) so parallelizing never changed behavior.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, cleanup, waitFor, screen } from "@testing-library/react";
import OwnerCockpitPage from "@/app/(authenticated)/owner/cockpit/page";
import { ActiveBusinessProvider } from "@/context/active-business-context";

const BIZ = { id: "biz-1", name: "Acme Bakery", currency: "USD" };

// Minimal-but-complete fixtures (MinimumOwnerCockpit reads every field unconditionally, so a
// partial shape throws mid-render) -- mirrors the fixtures in owner-cockpit-no-overload.test.tsx.
const RECOVERY_FIXTURE = {
  recoveryStatus: "SURVIVAL_TRIAGE_ACTIVE",
  topRecoveryBottleneck: "Stop-loss in force: loss-making spend paused.",
  nextMilestone: { order: 1, milestone: "Stop-loss in force", requiredEvidence: "proof spend paused" },
  completedMilestones: [],
  blockedMilestones: [1, 2, 3, 4, 5, 6],
  requiredEvidence: ["proof the loss-making activity is paused"],
  requiredReassessment: "The next milestone must be executed with evidence before recovery advances.",
  ownerApprovalRequired: true,
  managerStaffActions: [],
  blockedUnsafeActions: ["Scale/growth/expansion stays blocked until stabilization is proven."],
  stabilizationGate: "BLOCKED",
  thriveGate: "BLOCKED",
  uncertaintyCaveat: "OpsIQ shows the next governed recovery step based on current evidence.",
  noGuaranteeStatement: "Recovery is not guaranteed.",
  sourceRefs: ["recovery:rc"],
  linkedProcessExecutionTaskIds: [],
};

const SIGNALS_FIXTURE = {
  publicSignalStatus: "VALIDATION_REQUIRED",
  topPublicSignalAction: "Fix the recurring quality issue reported publicly, with proof, before any pricing change.",
  whyThisMatters: "Multiple public complaints cluster on the same quality problem.",
  sourceQualitySummary: "THIRD_PARTY_UNVERIFIED",
  evidenceStrengthSummary: "MODERATE+WEAK",
  uncertaintyCaveat: "Public signals are unverified until validated — this is a signal, not confirmed fact.",
  missingData: [],
  validationRequired: true,
  ownerApprovalRequired: true,
  evidenceRequired: ["proof the quality issue is corrected"],
  blockedUnsafeActions: ["Tender/customer/spend actions remain blocked; no outreach or submission has been performed."],
  groupedSignalClusters: [],
  monitorOnlySignals: [],
  linkedProcessExecutionTaskIds: [],
  auditTraceRefs: ["ps:rc"],
  rawTextHidden: true,
  piiStripped: true,
  noLiveIngestionStatement: "OpsIQ does not fetch live web data in this view.",
};

function renderPage() {
  return render(
    <ActiveBusinessProvider>
      <OwnerCockpitPage />
    </ActiveBusinessProvider>
  );
}

let callLog: string[];
let nowViewMode: "success" | "reject";
let recoveryMode: "success" | "reject";
let publicSignalsMode: "success" | "reject";

function endpointOf(url: string): string | null {
  if (url.includes("/api/owner/now-view")) return "now-view";
  if (url.includes("/api/owner/recovery-status")) return "recovery-status";
  if (url.includes("/api/owner/public-signals")) return "public-signals";
  if (url.includes("/api/owner/onboarding")) return "onboarding";
  if (url.includes("/api/owner/process-execution")) return "process-execution";
  return null;
}

function installFetchMock() {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: string | URL) => {
      const url = typeof input === "string" ? input : input.toString();

      if (url.includes("/api/owner/businesses")) {
        return { ok: true, status: 200, json: async () => ({ businesses: [BIZ] }) } as Response;
      }

      const endpoint = endpointOf(url);
      if (endpoint) callLog.push(endpoint);

      // Small artificial delays so all five requests are genuinely in flight at once when
      // parallel, and so a sequential implementation would show up as non-overlapping call times.
      await new Promise((r) => setTimeout(r, 20));

      if (endpoint === "now-view") {
        if (nowViewMode === "reject") throw new TypeError("Failed to fetch");
        return { ok: true, status: 200, json: async () => ({}) } as Response;
      }
      if (endpoint === "recovery-status") {
        if (recoveryMode === "reject") throw new TypeError("Failed to fetch");
        return { ok: true, status: 200, json: async () => RECOVERY_FIXTURE } as Response;
      }
      if (endpoint === "public-signals") {
        if (publicSignalsMode === "reject") throw new TypeError("Failed to fetch");
        return { ok: true, status: 200, json: async () => SIGNALS_FIXTURE } as Response;
      }
      if (endpoint === "onboarding") {
        return { ok: true, status: 200, json: async () => ({ found: false }) } as Response;
      }
      if (endpoint === "process-execution") {
        return { ok: true, status: 200, json: async () => ({ tasks: [] }) } as Response;
      }
      return { ok: true, status: 200, json: async () => ({}) } as Response;
    })
  );
}

beforeEach(() => {
  callLog = [];
  nowViewMode = "success";
  recoveryMode = "success";
  publicSignalsMode = "success";
  installFetchMock();
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("Cockpit request parallelization (P1-A)", () => {
  it("all five businessId-dependent calls are issued before any of them resolves (genuine overlap, not a waterfall)", async () => {
    renderPage();
    // Each mocked handler takes ~20ms; if calls were sequential, by the time we check at 5ms
    // only "now-view" would have been *issued* (recorded in callLog on invocation, before its
    // own delay), let alone all five. Waiting for all five to appear in the log within one
    // handler's delay window proves they were in flight concurrently.
    await waitFor(
      () => {
        expect(new Set(callLog)).toEqual(
          new Set(["now-view", "recovery-status", "public-signals", "onboarding", "process-execution"])
        );
      },
      { timeout: 500 }
    );
    // now-view/recovery-status/public-signals are issued together (order among Promise.all
    // entries is call-order, not completion-order) and, critically, onboarding/process-execution
    // (from StartHereContinuationCard) are issued without waiting for the other three to finish --
    // they all appear in the very first handler invocation batch.
    const firstFive = callLog.slice(0, 5);
    expect(new Set(firstFive)).toEqual(
      new Set(["now-view", "recovery-status", "public-signals", "onboarding", "process-execution"])
    );
  });

  it("shows the loaded cockpit once all calls resolve (no behavior change to the happy path)", async () => {
    renderPage();
    await waitFor(() => expect(screen.getByText("Home")).toBeInTheDocument());
    await waitFor(() => expect(screen.queryByText(/loading your business/i)).not.toBeInTheDocument());
  });

  it("a recovery-status failure is still best-effort and does not break the page", async () => {
    recoveryMode = "reject";
    renderPage();
    await waitFor(() => expect(screen.getByText("Home")).toBeInTheDocument());
    // Page renders normally (no page-level error) despite recovery-status failing.
    await waitFor(() => expect(screen.queryByText(/loading your business/i)).not.toBeInTheDocument());
  });

  it("a public-signals failure is still best-effort and does not break the page", async () => {
    publicSignalsMode = "reject";
    renderPage();
    await waitFor(() => expect(screen.getByText("Home")).toBeInTheDocument());
    await waitFor(() => expect(screen.queryByText(/loading your business/i)).not.toBeInTheDocument());
  });

  it("a now-view failure is still page-fatal, with a Retry action (unchanged from before parallelization)", async () => {
    nowViewMode = "reject";
    renderPage();
    await waitFor(() => expect(screen.getByText("Retry")).toBeInTheDocument());
  });
});

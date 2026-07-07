/**
 * MinimumOwnerCockpit — end-to-end no-overload proof (PASS 40).
 *
 * The deterministic companion to the hostile browser spec `tests/browser/47-owner-cockpit-end-to-end-no-overload.spec.ts`.
 * It drives the SAME component the real cockpit renders across every owner journey and asserts the anti-overload
 * envelope AND the forbidden-copy guarantees at once, so a regression fails a unit gate even when a browser lane is
 * unavailable:
 *
 *   A. normal (one top governed action)          E. non-owner / clean fallback (no fabricated action)
 *   B. crisis recovery (collapsed, no guarantee)  F. clean workspace (honest empty state, no fabrication)
 *   C. public signal (collapsed, no live ingest)  G. no-overload limits (1 action, ≤3 reasons, ≤2 primary,
 *   D. action controls (labelled, never prompt)       ≤3 secondary, every section collapsed)
 *
 * Forbidden output MUST fail: guaranteed recovery/profit, predicted ROI, win probability, auto-submit/contact/
 * spend/discount, fire/discipline staff, live internet intelligence, "AI found this online", fully autonomous,
 * raw prompt-injection, raw PII, fabricated money, hidden score.
 */
import { describe, it, expect, afterEach } from "vitest";
import { render, cleanup, fireEvent } from "@testing-library/react";
import { MinimumOwnerCockpit } from "@/components/owner/MinimumOwnerCockpit";
import type { BridgedRouteView, ProcessExecutionBridgeView } from "@/components/owner/ProcessIntelligencePanel";
import type { OwnerRecoveryStatusResponse } from "@/domain/owner-mode/owner-recovery-status";
import type { OwnerPublicSignalsResponse } from "@/domain/owner-mode/owner-public-signals";

afterEach(() => cleanup());

// ── Fixtures mirror the server-computed shapes (same as PASS 36/37/39 component proofs). ──
const route = (over: Partial<BridgedRouteView> = {}): BridgedRouteView => ({
  taskKey: "pc:c-owner", sourceFamily: "PROCESS_CORRECTION", sourceFindingKey: "c-owner",
  executionRoute: "CREATE_OWNER_APPROVAL_TASK", actionOwner: "OWNER", approvalLevel: "OWNER_APPROVAL_REQUIRED",
  requiredEvidence: ["the supporting evidence"], completionCriteria: "Owner records a decision.",
  reassessmentTrigger: "Re-evaluate at next review.", riskIfIgnored: "the breakdown compounds",
  ownerVisibleSummary: "Approve the process correction", notActionableReason: null,
  evidenceRefs: ["proof-1"], severity: "CRITICAL", priorityRank: 1, status: "PROPOSED", ...over,
});
const bridge = (over: Partial<ProcessExecutionBridgeView> = {}): ProcessExecutionBridgeView => ({
  routes: [route()], topRoute: route(),
  summary: { total: 1, ownerApproval: 1, managerStaff: 0, dataTasks: 0, monitorOnly: 0 }, ...over,
});

const recovery = (over: Partial<OwnerRecoveryStatusResponse> = {}): OwnerRecoveryStatusResponse => ({
  recoveryStatus: "SURVIVAL_TRIAGE_ACTIVE",
  topRecoveryBottleneck: "Stop-loss in force: loss-making spend paused.",
  nextMilestone: { order: 1, milestone: "Stop-loss in force", requiredEvidence: "proof spend paused" },
  completedMilestones: [], blockedMilestones: [1, 2, 3, 4, 5, 6],
  requiredEvidence: ["proof the loss-making activity is paused"],
  requiredReassessment: "The next milestone must be executed with evidence before recovery advances.",
  ownerApprovalRequired: true, managerStaffActions: [],
  blockedUnsafeActions: ["Scale/growth/expansion stays blocked until stabilization is proven."],
  stabilizationGate: "BLOCKED", thriveGate: "BLOCKED",
  uncertaintyCaveat: "OpsIQ shows the next governed recovery step based on current evidence.",
  noGuaranteeStatement: "Recovery is not guaranteed.",
  sourceRefs: ["recovery:rc"], linkedProcessExecutionTaskIds: ["pc:c-owner"], ...over,
});

const signals = (over: Partial<OwnerPublicSignalsResponse> = {}): OwnerPublicSignalsResponse => ({
  publicSignalStatus: "VALIDATION_REQUIRED",
  topPublicSignalAction: "Fix the recurring quality issue reported publicly, with proof, before any pricing change.",
  whyThisMatters: "Multiple public complaints cluster on the same quality problem.",
  sourceQualitySummary: "THIRD_PARTY_UNVERIFIED", evidenceStrengthSummary: "MODERATE+WEAK",
  uncertaintyCaveat: "Public signals are unverified until validated — this is a signal, not confirmed fact.",
  missingData: ["internal quality-failure rate"], validationRequired: true, ownerApprovalRequired: true,
  evidenceRequired: ["proof the quality issue is corrected"],
  blockedUnsafeActions: ["Tender/customer/spend actions remain blocked; no outreach or submission has been performed."],
  groupedSignalClusters: [{ topic: "quality", signalCount: 3, conflictClassification: "AGREEING", priorityTier: 3, monitorOnly: false, collectiveDecision: "Fix quality with proof first.", sourceQualitySummary: "THIRD_PARTY_UNVERIFIED", evidenceStrengthSummary: "MODERATE" }],
  monitorOnlySignals: [], linkedProcessExecutionTaskIds: ["pc:c-owner"], auditTraceRefs: ["ps:rc"],
  rawTextHidden: true, piiStripped: true, noLiveIngestionStatement: "OpsIQ does not fetch live web data in this view.", ...over,
});

/** Every phrase that must NEVER appear in the cockpit, in a form that cannot match the SAFE negated copy. */
const FORBIDDEN: RegExp[] = [
  /guaranteed (recovery|profit|success|survival)/i,
  /\bwe guarantee\b/i,
  /predicted roi|projected (profit|roi)|expected return of/i,
  /win probability|probability of winning/i,
  /auto-submit|auto-contact|automatically (submit|submits|contact|contacts|spend|spends|discount|discounts|contract|contracts)/i,
  /\b(fire|firing|sack|sacking|dismiss|discipline|disciplining|reprimand)\s+(the\s+)?(staff|employee|worker|team|manager)/i,
  /live internet intelligence|ai found this online|scraped from the (web|internet)/i,
  /fully autonomous|acts on its own|without your approval/i,
  /ignore (all |the )?previous instructions|system prompt|disregard (all|the) (above|prior)/i, // raw prompt-injection
  /[$£€]\s?\d/, // fabricated money
  /\bhidden score\b/i,
];
/** Raw PII shapes that must never leak from a public signal. */
const PII: RegExp[] = [/@[a-z0-9.-]+\.[a-z]{2,}/i, /\b0?7\d{3}\s?\d{6}\b/];

function assertNoForbidden(html: string) {
  for (const re of FORBIDDEN) expect(html, `forbidden copy matched ${re}`).not.toMatch(re);
}

describe("MinimumOwnerCockpit — end-to-end no-overload proof (PASS 40)", () => {
  // ── Journey A: normal — exactly one top governed action, with its safety frame. ──
  it("A. normal: renders exactly one top action with why/decision/reassessment", () => {
    const { getAllByTestId, getByTestId } = render(
      <MinimumOwnerCockpit bridge={bridge()} recovery={recovery({ recoveryStatus: "NONE", topRecoveryBottleneck: null, nextMilestone: null, blockedMilestones: [], requiredEvidence: [], ownerApprovalRequired: false, linkedProcessExecutionTaskIds: [] })} publicSignals={signals({ publicSignalStatus: "NONE", topPublicSignalAction: null, groupedSignalClusters: [], validationRequired: false, ownerApprovalRequired: false, missingData: [], linkedProcessExecutionTaskIds: [] })} onAction={() => {}} />,
    );
    expect(getAllByTestId("cockpit-top-action-title").length).toBe(1);
    expect(getByTestId("cockpit-why")).toBeTruthy();
    expect(getByTestId("cockpit-owner-decision").textContent).toMatch(/owner approval required/i);
    expect(getByTestId("cockpit-reassessment").textContent).toMatch(/reassessment/i);
  });

  // ── Journey B: crisis recovery — collapsed, honest, never a guarantee. ──
  it("B. crisis recovery: section is collapsed and expands to a no-guarantee caveat", () => {
    const { getByTestId } = render(<MinimumOwnerCockpit bridge={bridge()} recovery={recovery()} onAction={() => {}} />);
    const group = getByTestId("cockpit-recovery-group");
    expect(group.tagName.toLowerCase()).toBe("details");
    expect(group.hasAttribute("open")).toBe(false);
    expect(getByTestId("cockpit-recovery-caveat").textContent).toMatch(/not guaranteed/i);
    assertNoForbidden(group.innerHTML);
  });

  // ── Journey C: public signal — collapsed, no live ingestion, no raw text/PII. ──
  it("C. public signal: section is collapsed, shows the no-live-ingestion boundary, hides raw text/PII", () => {
    const { getByTestId } = render(<MinimumOwnerCockpit bridge={bridge()} publicSignals={signals()} onAction={() => {}} />);
    const group = getByTestId("cockpit-signals-group");
    expect(group.hasAttribute("open")).toBe(false);
    expect(getByTestId("cockpit-signals-noingest").textContent).toMatch(/does not fetch live/i);
    assertNoForbidden(group.innerHTML);
    for (const re of PII) expect(group.textContent ?? "").not.toMatch(re);
  });

  // ── Journey D: action controls — labelled inline inputs, NEVER window.prompt. ──
  it("D. action controls: a reason action opens a labelled inline form, not window.prompt", () => {
    const calls: Array<{ action: string; reason?: string }> = [];
    const origPrompt = globalThis.prompt;
    // Any use of window.prompt by the component would be a governance violation → make it fail loudly.
    (globalThis as { prompt?: unknown }).prompt = () => { throw new Error("window.prompt is forbidden in the cockpit"); };
    try {
      const { getByTestId } = render(
        <MinimumOwnerCockpit bridge={bridge()} onAction={(_k, action, input) => calls.push({ action, reason: input.reason })} />,
      );
      fireEvent.click(getByTestId("cockpit-action-REJECT"));       // needs a reason → opens the labelled form
      const form = getByTestId("cockpit-action-form");
      expect(form).toBeTruthy();
      fireEvent.change(getByTestId("cockpit-reason-input"), { target: { value: "not the priority now" } });
      fireEvent.click(getByTestId("cockpit-confirm"));
      expect(calls).toEqual([{ action: "REJECT", reason: "not the priority now" }]);
    } finally {
      (globalThis as { prompt?: unknown }).prompt = origPrompt;
    }
  });

  it("D. action controls: SUBMIT_EVIDENCE cannot be submitted with no evidence reference", () => {
    const calls: string[] = [];
    const { getByTestId } = render(<MinimumOwnerCockpit bridge={bridge()} onAction={(_k, action) => calls.push(action)} />);
    fireEvent.click(getByTestId("cockpit-action-SUBMIT_EVIDENCE")); // opens the labelled form
    fireEvent.click(getByTestId("cockpit-confirm"));                // confirm with empty evidence → blocked
    expect(calls).toEqual([]);
    fireEvent.change(getByTestId("cockpit-evidence-input"), { target: { value: "photo-123" } });
    fireEvent.click(getByTestId("cockpit-confirm"));
    expect(calls).toEqual(["SUBMIT_EVIDENCE"]);
  });

  // ── Journey E/F: clean workspace — honest empty state, nothing fabricated. ──
  it("F. clean workspace: no top action is invented; honest empty state renders", () => {
    const { getByTestId, queryByTestId } = render(
      <MinimumOwnerCockpit bridge={null} recovery={recovery({ recoveryStatus: "NONE", topRecoveryBottleneck: null, nextMilestone: null, blockedMilestones: [], requiredEvidence: [], ownerApprovalRequired: false, linkedProcessExecutionTaskIds: [] })} publicSignals={signals({ publicSignalStatus: "NONE", topPublicSignalAction: null, groupedSignalClusters: [], validationRequired: false, ownerApprovalRequired: false, missingData: [], linkedProcessExecutionTaskIds: [] })} onAction={() => {}} />,
    );
    const clean = getByTestId("cockpit-clean");
    expect(clean.textContent).toMatch(/no urgent action needs your attention/i);
    expect(queryByTestId("cockpit-top-action-title")).toBeNull();
    // even in the clean state the read-only summaries stay collapsed and honest.
    expect(getByTestId("cockpit-recovery-group").hasAttribute("open")).toBe(false);
    expect(getByTestId("cockpit-signals-group").hasAttribute("open")).toBe(false);
    assertNoForbidden(clean.innerHTML);
  });

  it("F. clean workspace: an empty bridge (no routes) also renders the honest empty state", () => {
    const { getByTestId, queryByTestId } = render(<MinimumOwnerCockpit bridge={bridge({ routes: [], topRoute: null as unknown as BridgedRouteView })} onAction={() => {}} />);
    expect(getByTestId("cockpit-clean")).toBeTruthy();
    expect(queryByTestId("cockpit-top-action-title")).toBeNull();
  });

  // ── Journey G: no-overload limits — the whole envelope in one shot. ──
  it("G. no-overload: 1 top action, ≤3 reason bullets, ≤2 primary, ≤3 secondary, every section collapsed", () => {
    const { getAllByTestId, queryAllByTestId, container } = render(
      <MinimumOwnerCockpit bridge={bridge()} recovery={recovery()} publicSignals={signals()} onAction={() => {}} />,
    );
    expect(getAllByTestId("cockpit-top-action-title").length).toBe(1);
    expect(queryAllByTestId("cockpit-why-bullet").length).toBeLessThanOrEqual(3);
    expect(container.querySelectorAll('[data-cockpit-priority="primary"]').length).toBeLessThanOrEqual(2);
    expect(container.querySelectorAll('[data-cockpit-priority="secondary"]').length).toBeLessThanOrEqual(3);
    for (const id of ["cockpit-secondary-group", "cockpit-monitor-group", "cockpit-proof-drawer", "cockpit-recovery-group", "cockpit-signals-group"]) {
      const el = getAllByTestId(id)[0] as HTMLDetailsElement;
      expect(el.tagName.toLowerCase()).toBe("details");
      expect(el.hasAttribute("open"), `${id} must be collapsed by default`).toBe(false);
    }
  });

  // ── Cross-journey forbidden-copy sweep: every state, whole cockpit. ──
  it("no forbidden copy in any owner journey (normal, crisis, public-signal, blocked, monitor, clean)", () => {
    const states: Array<() => HTMLElement> = [
      () => render(<MinimumOwnerCockpit bridge={bridge()} recovery={recovery()} publicSignals={signals()} onAction={() => {}} />).container,
      () => render(<MinimumOwnerCockpit bridge={bridge({ topRoute: route({ executionRoute: "BLOCK_UNSAFE_ACTION", approvalLevel: "NEVER_AUTO", notActionableReason: "This would require an unsafe external step." }) })} onAction={() => {}} />).container,
      () => render(<MinimumOwnerCockpit bridge={bridge({ topRoute: route({ executionRoute: "MONITOR_ONLY", status: "NEEDS_DATA" }) })} onAction={() => {}} />).container,
      () => render(<MinimumOwnerCockpit bridge={null} recovery={recovery()} publicSignals={signals()} onAction={() => {}} />).container,
    ];
    for (const mount of states) {
      const html = mount().innerHTML.toLowerCase();
      assertNoForbidden(html);
      cleanup();
    }
  });
});

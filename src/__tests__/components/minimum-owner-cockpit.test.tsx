/**
 * MinimumOwnerCockpit — jsdom component proof (PASS 36).
 *
 * Proves the canonical minimum owner cockpit meets the MINIMUM_OWNER_COCKPIT_SPEC: one top action, why-first,
 * evidence + approval + reassessment shown, blocked-unsafe surfaced, secondary/monitor/proof collapsed by
 * default, no raw signal/audit dump, no hidden score, no fabricated money/ROI/win-probability, no forbidden
 * copy, allowed actions present (forbidden ones absent), owner-only controls hidden without an action handler,
 * evidence required before submit-evidence, clean state fabricates nothing, frozen capabilities absent, and
 * the default payload stays within the cognitive-load limits.
 */
import { describe, it, expect, afterEach, vi } from "vitest";
import { render, cleanup, fireEvent } from "@testing-library/react";
import { MinimumOwnerCockpit } from "@/components/owner/MinimumOwnerCockpit";
import type { BridgedRouteView, ProcessExecutionBridgeView } from "@/components/owner/ProcessIntelligencePanel";

afterEach(() => cleanup());

const route = (over: Partial<BridgedRouteView> = {}): BridgedRouteView => ({
  taskKey: "pc:c-owner", sourceFamily: "PROCESS_CORRECTION", sourceFindingKey: "c-owner",
  executionRoute: "CREATE_OWNER_APPROVAL_TASK", actionOwner: "OWNER", approvalLevel: "OWNER_APPROVAL_REQUIRED",
  requiredEvidence: ["the supporting evidence for the owner decision"],
  completionCriteria: "The owner records an approve/decline decision with a note.",
  reassessmentTrigger: "Re-evaluate at the next owner review.", riskIfIgnored: "the quality breakdown compounds if left unattended",
  ownerVisibleSummary: "Approve the process correction for the pressing station",
  notActionableReason: null, evidenceRefs: ["proof-1", "event-2"], severity: "CRITICAL", priorityRank: 1, status: "PROPOSED", ...over,
});
const view = (over: Partial<ProcessExecutionBridgeView> = {}): ProcessExecutionBridgeView => ({
  routes: [route()], topRoute: route(),
  summary: { total: 1, ownerApproval: 1, managerStaff: 0, dataTasks: 0, monitorOnly: 0 }, ...over,
});
const noop = () => {};

describe("MinimumOwnerCockpit", () => {
  it("1. owner sees the top priority action", () => {
    const { getByTestId } = render(<MinimumOwnerCockpit bridge={view()} onAction={noop} />);
    expect(getByTestId("cockpit-top-action-title").textContent).toMatch(/approve the process correction/i);
  });

  it("2. owner sees why this is first (max 3 bullets)", () => {
    const { getByTestId, getAllByTestId } = render(<MinimumOwnerCockpit bridge={view()} onAction={noop} />);
    expect(getByTestId("cockpit-why").textContent).toMatch(/why this is first/i);
    expect(getAllByTestId("cockpit-why-bullet").length).toBeGreaterThan(0);
    expect(getAllByTestId("cockpit-why-bullet").length).toBeLessThanOrEqual(3);
  });

  it("3. owner sees the evidence requirement", () => {
    const { getByTestId } = render(<MinimumOwnerCockpit bridge={view()} onAction={noop} />);
    expect(getByTestId("cockpit-evidence").textContent).toMatch(/evidence required before completion/i);
  });

  it("4. owner sees the owner approval requirement", () => {
    const { getByTestId } = render(<MinimumOwnerCockpit bridge={view()} onAction={noop} />);
    expect(getByTestId("cockpit-owner-decision").textContent).toMatch(/owner approval required/i);
    expect(getByTestId("cockpit-cannot-automate").textContent).toMatch(/cannot be automated/i);
  });

  it("5. owner sees the blocked unsafe action", () => {
    const { getByTestId } = render(<MinimumOwnerCockpit bridge={view({ topRoute: route({ executionRoute: "BLOCK_UNSAFE_ACTION", approvalLevel: "NEVER_AUTO", notActionableReason: "tender auto-submit is never automated" }) })} onAction={noop} />);
    expect(getByTestId("cockpit-blocked-unsafe").textContent).toMatch(/no action is available because this would require an unsafe external step/i);
  });

  it("6. secondary actions are grouped and collapsed by default", () => {
    const { getByTestId } = render(<MinimumOwnerCockpit bridge={view()} onAction={noop} />);
    const group = getByTestId("cockpit-secondary-group");
    expect(group.tagName.toLowerCase()).toBe("details");
    expect(group.hasAttribute("open")).toBe(false);
  });

  it("7. monitor-only items are grouped and collapsed by default", () => {
    const { getByTestId } = render(<MinimumOwnerCockpit bridge={view()} onAction={noop} />);
    const group = getByTestId("cockpit-monitor-group");
    expect(group.tagName.toLowerCase()).toBe("details");
    expect(group.hasAttribute("open")).toBe(false);
  });

  it("8. proof / audit details are collapsed by default", () => {
    const { getByTestId } = render(<MinimumOwnerCockpit bridge={view()} onAction={noop} />);
    const drawer = getByTestId("cockpit-proof-drawer");
    expect(drawer.tagName.toLowerCase()).toBe("details");
    expect(drawer.hasAttribute("open")).toBe(false);
  });

  it("9. raw signals are not dumped by default", () => {
    // A route carrying many evidence refs must not render them all inline; the proof drawer caps at 8 and is collapsed.
    const many = Array.from({ length: 40 }, (_, i) => `sig-${i}`);
    const { container } = render(<MinimumOwnerCockpit bridge={view({ topRoute: route({ evidenceRefs: many }) })} onAction={noop} />);
    expect(container.innerHTML).not.toMatch(/sig-20/); // beyond the 8-ref cap → not rendered
  });

  it("10. raw audit logs are not dumped", () => {
    const { container } = render(<MinimumOwnerCockpit bridge={view()} onAction={noop} />);
    expect(container.innerHTML).not.toMatch(/audit log|auditEvent|AuditEvent/i);
  });

  it("11. no hidden score / tier is exposed", () => {
    const { container } = render(<MinimumOwnerCockpit bridge={view()} onAction={noop} />);
    expect(container.innerHTML).not.toMatch(/\bscore\b|\btier\b/i);
  });

  it("12. no fabricated money / ROI / win-probability appears", () => {
    const { container } = render(<MinimumOwnerCockpit bridge={view()} onAction={noop} />);
    const html = container.innerHTML;
    expect(html).not.toMatch(/[$£€]\s?\d/);
    expect(html).not.toMatch(/\broi\b|win probability|predicted roi/i);
    expect(html).not.toMatch(/\b\d+(\.\d+)?\s?%/);
  });

  it("13. no forbidden UI copy appears", () => {
    const { container } = render(<MinimumOwnerCockpit bridge={view()} onAction={noop} />);
    const html = container.innerHTML;
    expect(html).not.toMatch(/guaranteed (recovery|profit|success)/i);
    expect(html).not.toMatch(/ai will run this|auto-submit|auto-contact|auto-spend/i);
    expect(html).not.toMatch(/fire\/?discipline|discipline staff/i);
  });

  it("14. allowed action buttons appear for the owner", () => {
    const { getByTestId } = render(<MinimumOwnerCockpit bridge={view()} onAction={noop} />);
    expect(getByTestId("cockpit-action-APPROVE")).toBeTruthy();
    expect(getByTestId("cockpit-action-COMPLETE")).toBeTruthy();
  });

  it("15. forbidden / impossible actions do not appear (no APPROVE on a manager/staff task; no unsafe button)", () => {
    // A non-owner route offers DELEGATE, not APPROVE. A blocked-unsafe route offers no execute button.
    const mgr = render(<MinimumOwnerCockpit bridge={view({ topRoute: route({ approvalLevel: "MANAGER_APPROVAL_REQUIRED", actionOwner: "MANAGER", executionRoute: "CREATE_MANAGER_TASK" }) })} onAction={noop} />);
    expect(mgr.queryByTestId("cockpit-action-APPROVE")).toBeNull();
    cleanup();
    const blocked = render(<MinimumOwnerCockpit bridge={view({ topRoute: route({ executionRoute: "BLOCK_UNSAFE_ACTION", approvalLevel: "NEVER_AUTO", status: "PROPOSED" }) })} onAction={noop} />);
    expect(blocked.queryByTestId("cockpit-action-COMPLETE")).toBeNull();
    expect(blocked.queryByTestId("cockpit-action-START")).toBeNull();
  });

  it("16. without an action handler (non-owner / read-only), no owner action control renders", () => {
    const { queryByTestId } = render(<MinimumOwnerCockpit bridge={view()} />);
    expect(queryByTestId("cockpit-action-APPROVE")).toBeNull();
    expect(queryByTestId("cockpit-safe-actions")).toBeNull();
  });

  it("17. an evidence-required task cannot submit evidence without evidence", () => {
    const onAction = vi.fn();
    const { getByTestId } = render(<MinimumOwnerCockpit bridge={view()} onAction={onAction} />);
    fireEvent.click(getByTestId("cockpit-action-SUBMIT_EVIDENCE")); // opens the labelled form
    fireEvent.click(getByTestId("cockpit-confirm")); // confirm with empty evidence
    expect(onAction).not.toHaveBeenCalled();
    // With evidence entered, it submits.
    fireEvent.change(getByTestId("cockpit-evidence-input"), { target: { value: "photo-123" } });
    fireEvent.click(getByTestId("cockpit-confirm"));
    expect(onAction).toHaveBeenCalledWith("pc:c-owner", "SUBMIT_EVIDENCE", { evidenceRefs: ["photo-123"] });
  });

  // ── Regression: production live-defect — Complete + evidence UX/API contract mismatch ─────────
  // A real usability report: the owner typed evidence into the Complete form, got HTTP 400, then had to
  // separately use Submit evidence before Complete finally worked. These prove (a) the Complete form's
  // typed evidence really is included in the constructed onAction call (the exact shape POSTed to
  // /api/owner/process-execution) -- this is the test that would have caught a field never making it into
  // the request body -- and (b) the form now tells the owner up front how many distinct evidence items a
  // route needs and whether evidence already on file already satisfies it, instead of a same-page 400.
  it("19. COMPLETE: the owner's typed evidence is included in the onAction request payload (UI request-body regression)", () => {
    const onAction = vi.fn();
    const { getByTestId } = render(<MinimumOwnerCockpit bridge={view()} onAction={onAction} />);
    fireEvent.click(getByTestId("cockpit-action-COMPLETE")); // opens the labelled form
    fireEvent.change(getByTestId("cockpit-evidence-input"), { target: { value: "invoice-4471" } });
    fireEvent.click(getByTestId("cockpit-confirm"));
    expect(onAction).toHaveBeenCalledWith("pc:c-owner", "COMPLETE", { evidenceRefs: ["invoice-4471"] });
  });

  it("20. COMPLETE: a multi-item evidence route tells the owner how many distinct references it requires", () => {
    const twoItemRoute = route({
      requiredEvidence: ["the drafted SOP/checklist change", "evidence of adoption before it is marked done"],
      evidenceRefs: [],
    });
    const { getByTestId } = render(<MinimumOwnerCockpit bridge={view({ topRoute: twoItemRoute, routes: [twoItemRoute] })} onAction={vi.fn()} />);
    fireEvent.click(getByTestId("cockpit-action-COMPLETE"));
    expect(getByTestId("cockpit-evidence-required-hint").textContent).toMatch(/Requires 2 evidence item/);
  });

  it("21. COMPLETE: evidence already on file (e.g. from an earlier Submit evidence step) is recognised, and Complete succeeds without re-entering it", () => {
    const satisfiedRoute = route({
      requiredEvidence: ["the drafted SOP/checklist change", "evidence of adoption before it is marked done"],
      evidenceRefs: ["sop-draft-1", "adoption-proof-1"],
    });
    const onAction = vi.fn();
    const { getByTestId } = render(<MinimumOwnerCockpit bridge={view({ topRoute: satisfiedRoute, routes: [satisfiedRoute] })} onAction={onAction} />);
    fireEvent.click(getByTestId("cockpit-action-COMPLETE"));
    expect(getByTestId("cockpit-evidence-required-hint").textContent).toMatch(/already on file/i);
    fireEvent.click(getByTestId("cockpit-confirm")); // no new evidence typed -- prior evidence already satisfies it
    expect(onAction).toHaveBeenCalledWith("pc:c-owner", "COMPLETE", {});
  });

  it("18. a clean workspace (no bridged action) fabricates nothing", () => {
    const { getByTestId, queryByTestId } = render(<MinimumOwnerCockpit bridge={{ routes: [], topRoute: null, summary: { total: 0, ownerApproval: 0, managerStaff: 0, dataTasks: 0, monitorOnly: 0 } }} onAction={noop} />);
    expect(getByTestId("cockpit-clean").textContent).toMatch(/no urgent action/i);
    expect(queryByTestId("cockpit-top-action-title")).toBeNull();
  });

  // F3 — cockpit surfaces the Finance diagnosis's top action, without overwriting an urgent governed issue.
  const financePriority = {
    businessId: "biz-1", businessName: "Test Biz", cycleId: "cycle-1", generatedAt: "2026-06-30T00:00:00Z",
    survivalState: "WATCH", overallHealthScore: 60,
    topAction: { id: "act-1", title: "Fix your thin gross margin", description: "Raise price or cut cost of goods.", priorityScore: 90 },
  };

  it("18b. (F3) clean state (no governed route) surfaces the finance diagnosis's top action as primary", () => {
    const { getByTestId, queryByTestId } = render(
      <MinimumOwnerCockpit
        bridge={{ routes: [], topRoute: null, summary: { total: 0, ownerApproval: 0, managerStaff: 0, dataTasks: 0, monitorOnly: 0 } }}
        financeTopPriority={financePriority}
        onAction={noop}
      />,
    );
    expect(getByTestId("cockpit-finance-priority-primary").textContent).toMatch(/fix your thin gross margin/i);
    expect(queryByTestId("cockpit-finance-priority-secondary")).toBeNull();
  });

  it("18c. (F3) a real actionable governed route stays primary; the finance action still surfaces, but only as secondary", () => {
    const { getByTestId } = render(<MinimumOwnerCockpit bridge={view()} financeTopPriority={financePriority} onAction={noop} />);
    // The governed route keeps the primary "top priority" slot — untouched, never overwritten.
    expect(getByTestId("cockpit-top-action-title").textContent).toMatch(/approve the process correction/i);
    // The finance action is still visible, just as a secondary signal.
    expect(getByTestId("cockpit-finance-priority-secondary").textContent).toMatch(/fix your thin gross margin/i);
  });

  it("18d. (F3) with no finance diagnosis available, nothing finance-related renders (no fabrication)", () => {
    const { queryByTestId } = render(<MinimumOwnerCockpit bridge={view()} onAction={noop} />);
    expect(queryByTestId("cockpit-finance-priority-primary")).toBeNull();
    expect(queryByTestId("cockpit-finance-priority-secondary")).toBeNull();
  });

  // F6: zero-data owner-facing copy must not read as internal jargon ("Business Operating System —
  // 0 active objectives").
  it("18e. (F6) the goals section uses plain owner language for zero objectives, not internal jargon", () => {
    const bos = {
      totalActiveObjectives: 0,
      objectiveHealthCounts: { ON_TRACK: 0, AT_RISK: 0, BLOCKED: 0, CRITICAL: 0 },
      topObjectives: [], activePoolCount: 0, resourceUtilizationPct: null,
      latestArbitration: null, latestArbitrationOverride: null, topRisks: [],
      activeConstraints: [], activeConstraintCount: 0, kpiCount: 0, costAttributionCoverage: null,
    };
    const { getByTestId } = render(<MinimumOwnerCockpit bridge={view()} businessOperatingSystem={bos} onAction={noop} />);
    const section = getByTestId("cockpit-bos-section");
    expect(section.textContent).not.toMatch(/0 active objectives/i);
    expect(section.textContent).toMatch(/goals/i);
    expect(getByTestId("cockpit-bos-empty").textContent).not.toMatch(/business operating system/i);
  });

  it("19. frozen / not-built capabilities are not shown as available", () => {
    const { container } = render(<MinimumOwnerCockpit bridge={view()} onAction={noop} />);
    expect(container.innerHTML).not.toMatch(/billing|subscription|product hunt|connect your (bank|accounting|pos|crm)|local mode|shadow pilot/i);
  });

  it("20. the default payload stays within cognitive-load limits", () => {
    const { getAllByTestId, getByTestId, container } = render(<MinimumOwnerCockpit bridge={view()} onAction={noop} />);
    // exactly one top action
    expect(getAllByTestId("cockpit-top-action-title").length).toBe(1);
    // ≤3 why bullets
    expect(getAllByTestId("cockpit-why-bullet").length).toBeLessThanOrEqual(3);
    // ≤2 primary buttons and ≤3 visible secondary controls (rest behind "more")
    expect(container.querySelectorAll('[data-cockpit-priority="primary"]').length).toBeLessThanOrEqual(2);
    expect(container.querySelectorAll('[data-cockpit-priority="secondary"]').length).toBeLessThanOrEqual(3);
    // secondary/monitor/proof groups collapsed
    expect(getByTestId("cockpit-secondary-group").hasAttribute("open")).toBe(false);
    expect(getByTestId("cockpit-monitor-group").hasAttribute("open")).toBe(false);
    expect(getByTestId("cockpit-proof-drawer").hasAttribute("open")).toBe(false);
  });
});

// UX-06 Wave A1 (Section G7): GoalAttentionSignal.state must never reach the owner as
// a raw enum token (the previous render was `state.replace(/_/g, " ")`, e.g. "NO
// GROWTH" -- spaced but not humanized). Each of the 6 real states gets a plain-
// language label, and an unknown future value falls back to a safe, non-raw string.
const goalSignal = (over: Partial<import("@/services/owner-guidance/owner-now-view.service").GoalAttentionSignal> = {}) => ({
  state: "ON_TRACK" as const,
  goalTitle: "Grow monthly revenue",
  targetAmount: null,
  targetCurrency: null,
  targetDateIso: null,
  gapToClose: null,
  projectedMonthsToGoal: null,
  currentTrajectoryDateIso: null,
  requiredMonthlyImprovement: null,
  confidence: null,
  trajectoryMiss: null,
  assumptions: [],
  beginnerExplanation: "Revenue is tracking toward the goal.",
  ...over,
});

describe("MinimumOwnerCockpit — goal-state humanization (UX-06 Section G7)", () => {
  it("NO_GROWTH renders 'Not progressing', never the raw or spaced-raw token", () => {
    const { getByTestId } = render(
      <MinimumOwnerCockpit bridge={view()} onAction={noop} goalAttentionSignal={goalSignal({ state: "NO_GROWTH" })} />
    );
    expect(getByTestId("cockpit-goal-state").textContent).toBe("Not progressing");
    expect(getByTestId("cockpit-goal-state").textContent).not.toMatch(/NO_GROWTH|NO GROWTH/);
  });

  it("INSUFFICIENT_DATA renders 'Not enough information'", () => {
    const { getByTestId } = render(
      <MinimumOwnerCockpit bridge={view()} onAction={noop} goalAttentionSignal={goalSignal({ state: "INSUFFICIENT_DATA" })} />
    );
    expect(getByTestId("cockpit-goal-state").textContent).toBe("Not enough information");
  });

  it.each([
    ["NO_GOAL", "No goal set"],
    ["STALE", "Needs updating"],
    ["ON_TRACK", "On track"],
    ["AT_RISK", "At risk"],
  ] as const)("%s renders %s", (state, label) => {
    const { getByTestId } = render(
      <MinimumOwnerCockpit bridge={view()} onAction={noop} goalAttentionSignal={goalSignal({ state })} />
    );
    expect(getByTestId("cockpit-goal-state").textContent).toBe(label);
  });

  it("shows the goal's scope label (business or workspace) so a goal is never read as another business's", () => {
    const { getByTestId, rerender } = render(
      <MinimumOwnerCockpit bridge={view()} onAction={noop} goalAttentionSignal={goalSignal({ state: "ON_TRACK", goalScope: "business", scopeLabel: "Business goal · Trinity Services" })} />
    );
    expect(getByTestId("cockpit-goal-scope").textContent).toBe("Business goal · Trinity Services");
    expect(getByTestId("cockpit-goal-scope").getAttribute("data-cockpit-goal-scope")).toBe("business");
    rerender(
      <MinimumOwnerCockpit bridge={view()} onAction={noop} goalAttentionSignal={goalSignal({ state: "ON_TRACK", goalScope: "workspace", scopeLabel: "Workspace goal" })} />
    );
    expect(getByTestId("cockpit-goal-scope").textContent).toBe("Workspace goal");
  });

  it("the clean Home (no urgent action) still shows the selected business's goal and its scope", () => {
    const clean = { routes: [], topRoute: null, summary: { total: 0, ownerApproval: 0, managerStaff: 0, dataTasks: 0, monitorOnly: 0 } };
    const { getByTestId, rerender } = render(
      <MinimumOwnerCockpit bridge={clean} onAction={noop} goalAttentionSignal={goalSignal({ state: "ON_TRACK", goalScope: "business", scopeLabel: "Business goal · Alpha Laundry" })} />
    );
    expect(getByTestId("cockpit-clean").textContent).toMatch(/no urgent action/i);
    expect(getByTestId("cockpit-goal-scope").textContent).toBe("Business goal · Alpha Laundry");
    rerender(
      <MinimumOwnerCockpit bridge={clean} onAction={noop} goalAttentionSignal={goalSignal({ state: "NO_GOAL", goalScope: null, scopeLabel: "No goal set for Beta", beginnerExplanation: "No goal set for Beta. Add a goal to track your progress." })} />
    );
    expect(getByTestId("cockpit-goal-explanation").textContent).toMatch(/No goal set for Beta/);
  });

  it("with no goal for the selected business, names the business and shows no scope badge", () => {
    const { getByTestId, queryByTestId } = render(
      <MinimumOwnerCockpit
        bridge={view()}
        onAction={noop}
        goalAttentionSignal={goalSignal({ state: "NO_GOAL", goalScope: null, scopeLabel: "No goal set for Beta", beginnerExplanation: "No goal set for Beta. Add a goal to track your progress." })}
      />
    );
    expect(queryByTestId("cockpit-goal-scope")).toBeNull();
    expect(getByTestId("cockpit-goal-explanation").textContent).toMatch(/No goal set for Beta/);
  });

  it("an unrecognized future state falls back to a safe label, never the raw value", () => {
    const unknownSignal = goalSignal({ state: "SOME_FUTURE_STATE" as never });
    const { getByTestId } = render(
      <MinimumOwnerCockpit bridge={view()} onAction={noop} goalAttentionSignal={unknownSignal} />
    );
    expect(getByTestId("cockpit-goal-state").textContent).toBe("Goal status unavailable");
    expect(getByTestId("cockpit-goal-state").textContent).not.toMatch(/SOME_FUTURE_STATE/);
  });
});

"use client";

/**
 * MinimumOwnerCockpit (PASS 36) — the canonical minimum owner cockpit surface for the PROVEN governed
 * execution loop. Prop-driven; NO business logic and NO data fetching here. It renders the single top
 * bridged action the server already computed (from the process-execution bridge), in the 10-section
 * safety layout defined by docs/audits/2026-07-07-owner-ui-capability-exposure/MINIMUM_OWNER_COCKPIT_SPEC.md:
 *
 *   0. The canonical owner decision (OwnerDecisionCard) — always first, the ONE main target
 *   1. Governed work you can start (subordinate)   2. Why this matters   3. Required Owner Decision   4. Evidence Required
 *   5. Safe Actions          6. Blocked / Not Allowed 7. Next Reassessment
 *   8. Secondary Actions (collapsed) 9. Monitor-only (collapsed) 10. Proof / Audit (collapsed drawer)
 *
 * Anti-overload: exactly one top action by default; ≤3 reason bullets; ≤2 primary buttons; ≤3 secondary
 * controls; everything else collapsed. No raw signal dump, no raw audit log, no hidden score, no fabricated
 * money. Owner action inputs use labelled controls — never window.prompt(). The server re-checks every action.
 */

import { useEffect, useRef, useState } from "react";
import { formatDistanceToNow } from "date-fns";
import { Badge, Disclosure } from "@/ui/primitives";
import { allowedProcessTaskActions, approveActionLabel } from "@/domain/owner-mode/process-execution-bridge";
import type { BridgedRouteView, ProcessExecutionBridgeView } from "@/components/owner/ProcessIntelligencePanel";
import type { OwnerRecoveryStatusResponse } from "@/domain/owner-mode/owner-recovery-status";
import type { OwnerPublicSignalsResponse } from "@/domain/owner-mode/owner-public-signals";
import type { DerivedBusinessConditionSignals } from "@/services/business-condition/business-condition-profile.service";
import type { GoalAttentionSignal, PolicyAttentionSignal, EscalationAttentionItem, DoNotRepeatAnnotation, OwnerExecutionLifecycleView, ExecutionLifecycleItem, BusinessOperatingSystemView } from "@/services/owner-guidance/owner-now-view.service";
import type { ProfitLeakFinding } from "@/domain/owner-mode/profit-leak-radar";
import type { TrendAlert } from "@/domain/owner-mode/business-state-timeline";
import type { CurrentOwnerDecision } from "@/domain/owner-spine/owner-decision";
import { OwnerDecisionCard } from "@/components/owner/OwnerDecisionCard";
import { ownerImperativeContext, reconcileRecoveryBlocks, reconcileRecoveryGrowthGate } from "@/domain/owner-spine/owner-imperatives";

const APPROVAL_LABEL: Record<string, string> = {
  OWNER_APPROVAL_REQUIRED: "Owner approval required",
  NEVER_AUTO: "Owner only — cannot be automated",
  MANAGER_APPROVAL_REQUIRED: "Manager approval required",
  STAFF_LEVEL: "Staff-level action",
  OWNER: "Owner approval required", MANAGER: "Manager approval required", STAFF: "Staff-level action",
  // process-execution-bridge-expansion.ts's CREATE_MISSING_DATA_TASK/MONITOR_ONLY routes set
  // approvalLevel: "NEEDS_DATA" — missing from this map, it fell through to the `?? top.approvalLevel`
  // raw-string fallback below, rendering the literal enum value "NEEDS_DATA" as the badge text on
  // every brand-new/data-collection route. Same wording as the equivalent map in
  // ProcessIntelligencePanel.tsx, which already had this entry.
  NEEDS_DATA: "Needs data first",
};
const ROUTE_LABEL: Record<string, string> = {
  CREATE_CORRECTION_TASK: "Create correction task", CREATE_SOP_CHECKLIST_TASK: "Draft SOP/checklist change",
  CREATE_TRAINING_TASK: "Assign training", CREATE_REASSESSMENT_TASK: "Open reassessment",
  CREATE_EVIDENCE_REQUEST: "Request fresh proof", CREATE_OWNER_APPROVAL_TASK: "Owner approval",
  CREATE_MANAGER_TASK: "Manager task", CREATE_STAFF_TASK: "Staff task", CREATE_MISSING_DATA_TASK: "Collect missing data",
  BLOCK_UNSAFE_ACTION: "Blocked (unsafe)", MONITOR_ONLY: "Monitor only",
};
const ACTION_LABEL: Record<string, string> = {
  START: "Start", APPROVE: "Approve", DELEGATE: "Delegate", SUBMIT_EVIDENCE: "Submit evidence", COMPLETE: "Complete",
  REJECT: "Reject", MARK_BLOCKED: "Mark blocked", REQUEST_REASSESSMENT: "Request reassessment", REQUEST_MISSING_DATA: "Request missing data",
  // Phase 3 actions
  ACKNOWLEDGE: "Acknowledge", RECORD_PROGRESS: "Record progress", RECORD_OUTCOME: "Record outcome", VERIFY_OUTCOME: "Verify outcome",
};
const SEVERITY_VARIANT = (s: string): "destructive-accessible" | "warning-accessible" | "default-accessible" | "muted" =>
  s === "CRITICAL" || s === "HIGH" ? "destructive-accessible" : s === "MEDIUM" ? "warning-accessible" : "default-accessible";

// Plain-language severity labels -- the raw enum token ("HIGH", "critical", ...) must never reach
// an owner verbatim. Case-insensitive lookup because severity values arrive in different casings
// from different sources in this codebase (uppercase from owner-now-view.service.ts, lowercase
// from business-state-timeline.ts's TrendAlert).
const SEVERITY_LABEL: Record<string, string> = {
  CRITICAL: "Urgent",
  HIGH: "Important",
  MEDIUM: "Worth doing",
  LOW: "Minor",
};
function severityLabel(s: string): string {
  return SEVERITY_LABEL[s.toUpperCase()] ?? s;
}

const SEVERITY_RANK: Record<string, number> = { CRITICAL: 4, HIGH: 3, MEDIUM: 2, LOW: 1 };
function maxSeverity(items: readonly { severity: string }[]): string {
  return items.reduce((worst, item) => {
    const a = SEVERITY_RANK[worst.toUpperCase()] ?? 0;
    const b = SEVERITY_RANK[item.severity.toUpperCase()] ?? 0;
    return b > a ? item.severity : worst;
  }, items[0]?.severity ?? "LOW");
}

/** Relative-time display for owner-facing content — never a raw ISO timestamp (P0-F). */
function humanizeReported(iso: string): string {
  try {
    return formatDistanceToNow(new Date(iso), { addSuffix: true });
  } catch {
    return "recently";
  }
}

/**
 * Groups repeated, semantically-identical "Requires your decision" suggestions (P0-F) so the
 * owner sees one compact row with a count instead of N near-duplicate cards. The key is built
 * from two server-authoritative fields -- `sourceFamily` (the task's origin family, e.g.
 * "PROCESS_CORRECTION") and `ownerVisibleSummary` (template-generated text that is byte-identical
 * across true duplicates of the same correction type and distinct across genuinely different
 * suggestions) -- never from a raw title/display-string heuristic alone. A group of size 1 is
 * rendered exactly as an ungrouped item always was; only a real duplicate cluster (size > 1)
 * collapses into the compact form. Order is otherwise preserved (first-seen position, matching
 * the server's own priorityRank ordering).
 */
export interface DecisionItemGroup {
  key: string;
  items: ExecutionLifecycleItem[];
}
export function groupRequiresDecisionItems(items: readonly ExecutionLifecycleItem[]): DecisionItemGroup[] {
  const order: string[] = [];
  const byKey = new Map<string, ExecutionLifecycleItem[]>();
  for (const item of items) {
    const key = `${item.sourceFamily}::${item.ownerVisibleSummary}`;
    const list = byKey.get(key);
    if (list) {
      list.push(item);
    } else {
      byKey.set(key, [item]);
      order.push(key);
    }
  }
  return order.map((key) => ({ key, items: byKey.get(key)! }));
}

const POLICY_DECISION_LABEL: Record<string, string> = {
  BLOCK: "Blocked",
  WARN: "Warning",
  ALLOW: "Allowed",
};

/** Qualitative label for a 0-100 risk score, matching this file's own destructive/warning color thresholds. */
function riskScoreLabel(score: number): string {
  return score >= 50 ? "High risk" : score >= 25 ? "Watch" : "Low risk";
}

// Plain-language labels for BridgedRouteView.status, covering every value this file's own
// logic branches on (the `terminal` check below, and allowedCockpitActions' PROPOSED/NEEDS_DATA/
// BLOCKED/IN_PROGRESS checks) — used wherever status is shown as a predicate ("This task is
// {label}.", "Status: {label}") instead of the raw governed-engine enum value.
const STATUS_LABEL: Record<string, string> = {
  PROPOSED: "suggested",
  ACKNOWLEDGED: "acknowledged",
  NEEDS_DATA: "waiting on data",
  BLOCKED: "blocked",
  IN_PROGRESS: "in progress",
  COMPLETED: "complete",
  REJECTED: "rejected",
  OUTCOME_RECORDED: "recorded",
  OUTCOME_DISPUTED: "disputed",
  OUTCOME_VERIFIED: "verified",
};

const PRIMARY_ACTIONS = ["APPROVE", "COMPLETE", "START"] as const;

/** Interactive actions valid for a route, mirroring the server guardrails so the UI never OFFERS an
 *  impossible/unsafe transition. The server still re-checks every one. */
export function allowedCockpitActions(r: BridgedRouteView): string[] {
  return allowedProcessTaskActions(r);
}

export interface CockpitActionInput {
  evidenceRefs?: string[];
  reason?: string;
  delegateToRole?: "MANAGER" | "STAFF";
  // Phase 3 additions
  progressPct?: number | null;
  stage?: string | null;
  outcomeStatus?: string | null;
}

export interface MinimumOwnerCockpitProps {
  bridge: ProcessExecutionBridgeView | null;
  /** The governed "do NOT do now" list from the now-view (each {avoid}), for the Blocked / Not Allowed section. */
  actionsToAvoid?: string[];
  /** Avoid rules reconciled into the permitted scope of canonical steps (how to carry them out). */
  stepConditions?: string[];
  /** Read-only recovery status projection (PASS 37). Rendered as a collapsed low-load section. */
  recovery?: OwnerRecoveryStatusResponse | null;
  /** Read-only public-signal ("Outside signals") projection (PASS 39). Rendered as a collapsed low-load section. */
  publicSignals?: OwnerPublicSignalsResponse | null;
  /** Read-only derived business condition signals from the now-view. Rendered as a collapsed risk panel. */
  businessCondition?: DerivedBusinessConditionSignals | null;
  /** When true, the confidence score for the source data was capped — signals may be stale. */
  dataFreshnessWeak?: boolean | null;
  /** When provided, the cockpit becomes interactive; the server re-checks every action. */
  onAction?: (taskKey: string, action: string, input: CockpitActionInput) => void;
  busy?: boolean;
  /** Goal Attention Signal — 6-state owner goal DTO from the now-view (Phase 2). */
  goalAttentionSignal?: GoalAttentionSignal | null;
  /** Top profit leak finding from the now-view (Phase 2 Signal B). */
  topProfitLeak?: ProfitLeakFinding | null;
  /** Policy Attention Signal — triggered vs configured policy breakdown (Phase 2 Signal C). */
  policyAttentionSignal?: PolicyAttentionSignal | null;
  /** Trend alerts from the last two metric snapshots (Phase 2 Signal D). */
  trendAlerts?: TrendAlert[] | null;
  /** Do-not-repeat annotation for the top guidance action (Phase 2 Signal E). */
  doNotRepeatAnnotation?: DoNotRepeatAnnotation | null;
  /** Active escalations requiring owner acknowledgement (Phase 2 Signal G). */
  activeEscalations?: EscalationAttentionItem[] | null;
  /** Called when the owner acknowledges an escalation (Phase 2 Signal G). */
  onAcknowledgeEscalation?: (escalationId: string) => void;
  /** Called when the owner starts a process execution task (Phase 2 Signal F). */
  onStartWork?: (taskKey: string) => void;
  /** Phase 3 — execution lifecycle view from the Now View (4-group: requiresDecision / inExecution / awaitingVerification / recentlyVerified). */
  executionLifecycle?: OwnerExecutionLifecycleView | null;
  /** Phase 4 — Business Operating System summary (objectives, risks, resources, arbitration). */
  businessOperatingSystem?: BusinessOperatingSystemView | null;
  /** Phase 4 — BOS action: run-arbitration | override | resolve-constraint | accept-constraint. */
  onBosAction?: (action: string, payload: Record<string, unknown>) => Promise<void>;
  /**
   * The ONE canonical owner decision (owner-home service → Spine arbiter), delivered by the now-view
   * route as `ownerDecision`. It is ALWAYS the primary "Your main business target" slot. The governed
   * process-execution bridge's `topRoute` is execution work (Now View context) rendered beneath it —
   * it is never labelled as the owner's top priority, so the Cockpit can never elect a different
   * winner from Home or Priorities.
   */
  ownerDecision?: CurrentOwnerDecision | null;
  /** False only when the owner has no business yet; drives the "add your business" prompt. */
  hasBusiness?: boolean;
  /**
   * The currently active business (ActiveBusinessContext) — used ONLY to reset any open inline
   * action form (the top-priority action form and each execution-lifecycle item's Phase 3
   * RECORD_OUTCOME/VERIFY_OUTCOME/etc. form) when it changes, never to decide what to submit.
   *
   * Root cause this guards against: every inline form here is local component state
   * (`pending`/`reasonText`/`evidenceText`/... in this component, and the equivalent state in
   * `ExecutionLifecycleSection`) that is NOT bound to the business that was active when the form
   * was opened. `onAction`'s businessId (for RECORD_OUTCOME/VERIFY_OUTCOME — see the doc comment
   * atop cockpit/page.tsx) is read from the page's LIVE `activeBusinessId` at submit time via a
   * closure, not a value captured at form-open time. This page currently renders no business
   * selector of its own, so nothing today drives `activeBusinessId` to change while this
   * component stays mounted with a form open — but that is an accident of this page's layout, not
   * a guarantee, and every other owner page in this repo (Sales, Finance, Operations, ...) does
   * have one. Rather than thread a captured-at-open-time business id through every action's input
   * (which would only cover RECORD_OUTCOME/VERIFY_OUTCOME and leave every other pending form's
   * reason/evidence/delegate input silently stale against a switched business context), this
   * closes the whole class at once: any open inline form is discarded the instant the active
   * business changes, exactly like a modal closing when the context it was opened for goes away.
   * Never used to alter what gets sent for a submit that happens before that change.
   */
  activeBusinessId?: string | null;
}

const RECOVERY_STATUS_LABEL: Record<string, string> = {
  NONE: "No recovery in progress",
  SURVIVAL_TRIAGE_ACTIVE: "Survival triage active",
  RECOVERY_IN_PROGRESS: "Recovery in progress",
  STABILIZATION_NOT_PROVEN: "Stabilization not proven",
  STABILIZATION_PROVEN: "Stabilization proven",
  THRIVE_GATE_BLOCKED: "Growth blocked until stabilization",
  THRIVE_GATE_ELIGIBLE: "Growth eligible (owner-gated)",
  REGRESSED: "Recovery regressed — re-correct",
  RESTRUCTURE_REVIEW_REQUIRED: "Restructure review required",
  CONTROLLED_SHUTDOWN_REVIEW_REQUIRED: "Controlled shutdown review required",
  UNKNOWN_NEEDS_DATA: "Needs data",
};

const PUBLIC_SIGNAL_STATUS_LABEL: Record<string, string> = {
  NONE: "No outside signals",
  SIGNALS_PRESENT: "Outside signals present",
  VALIDATION_REQUIRED: "Signals — validation required",
  CONFLICTING_SIGNALS: "Conflicting outside signals",
  HIGH_RISK_PUBLIC_SIGNAL: "High-risk outside signal",
  MONITOR_ONLY: "Monitor only",
  UNKNOWN_NEEDS_DATA: "Needs data",
};

/** Read-only "Outside signals" — a concise, collapsed public-signal summary (PASS 39). NOT a second dashboard. */
function OutsideSignalsSection({ signals }: { signals: OwnerPublicSignalsResponse }) {
  const active = signals.publicSignalStatus !== "NONE";
  return (
    <details data-testid="cockpit-signals-group" style={{ borderTop: "1px solid var(--border)", paddingTop: 14, paddingBottom: 2 }}>
      <summary style={{ cursor: "pointer", fontSize: 13.5, fontWeight: 500, color: "var(--foreground)" }}>
        Outside signals
        <span style={{ fontWeight: 400, color: "var(--muted-foreground)" }}> — {PUBLIC_SIGNAL_STATUS_LABEL[signals.publicSignalStatus] ?? signals.publicSignalStatus}</span>
      </summary>
      <div style={{ marginTop: 8, display: "flex", flexDirection: "column", gap: 6, fontSize: 13 }}>
        {!active ? (
          <p style={{ margin: 0, color: "var(--muted-foreground)" }} data-testid="cockpit-signals-none">No outside signals for this workspace right now.</p>
        ) : (
          <>
            {signals.topPublicSignalAction && (
              <p style={{ margin: 0 }} data-testid="cockpit-signals-action"><strong>Signal follow-up:</strong> {signals.topPublicSignalAction}</p>
            )}
            <p style={{ margin: 0, color: "var(--muted-foreground)" }} data-testid="cockpit-signals-why">{signals.whyThisMatters}</p>
            <p style={{ margin: 0, color: "var(--muted-foreground)" }} data-testid="cockpit-signals-quality">
              Source quality: {signals.sourceQualitySummary} · Evidence: {signals.evidenceStrengthSummary}
            </p>
            {signals.missingData.length > 0 && (
              <p style={{ margin: 0, color: "var(--warning-text)" }} data-testid="cockpit-signals-missing">Missing data: {signals.missingData.slice(0, 3).join("; ")}</p>
            )}
            {signals.validationRequired && (
              <p style={{ margin: 0, color: "var(--warning-text)" }} data-testid="cockpit-signals-validation">Public signals are unverified until validated.</p>
            )}
            {signals.blockedUnsafeActions.length > 0 && (
              <p style={{ margin: 0, color: "var(--warning-text)" }} data-testid="cockpit-signals-blocked">Blocked: {signals.blockedUnsafeActions.slice(0, 2).join("; ")}</p>
            )}
            {signals.ownerApprovalRequired && (
              <p style={{ margin: 0, color: "var(--destructive)" }} data-testid="cockpit-signals-approval">Owner approval is required before material action.</p>
            )}
          </>
        )}
        <p style={{ margin: "2px 0 0", color: "var(--muted-foreground)", fontStyle: "italic" }} data-testid="cockpit-signals-noingest">{signals.noLiveIngestionStatement}</p>
        <p style={{ margin: 0, color: "var(--muted-foreground)", fontStyle: "italic" }} data-testid="cockpit-signals-caveat">{signals.uncertaintyCaveat}</p>
      </div>
    </details>
  );
}

const RISK_VARIANT = (level: string): "destructive-accessible" | "warning-accessible" | "default-accessible" | "muted-accessible" =>
  level === "CRITICAL" || level === "HIGH" ? "destructive-accessible"
  : level === "MEDIUM" ? "warning-accessible"
  : level === "LOW" || level === "HIGH" ? "default-accessible"
  : "muted-accessible";

const RISK_LEVEL_LABEL: Record<string, string> = {
  CRITICAL: "Critical", HIGH: "High", MEDIUM: "Medium", LOW: "Low",
  BLOCKED: "Blocked", HIGH_GROWTH: "Growth-ready", unknown: "—",
};

// UX-06 Wave A1 (Section G7): humanizes GoalAttentionSignal.state so the owner never
// sees a raw enum token (e.g. "NO_GROWTH"). Unknown/future values fall back to a
// neutral, safe label rather than rendering the raw value.
const GOAL_STATE_LABEL: Record<string, string> = {
  NO_GOAL: "No goal set",
  INSUFFICIENT_DATA: "Not enough information",
  STALE: "Needs updating",
  ON_TRACK: "On track",
  AT_RISK: "At risk",
  NO_GROWTH: "Not progressing",
};
const GOAL_STATE_FALLBACK = "Goal status unavailable";

const CONDITION_FIELD_LABEL: Record<keyof DerivedBusinessConditionSignals, string> = {
  cashPressureLevel: "Cash pressure",
  marginPressureLevel: "Margin pressure",
  clientConcentrationRisk: "Client concentration",
  ownerDependencyRisk: "Owner dependency",
  keyPersonDependencyRisk: "Key-person dependency",
  processMaturityLevel: "Process maturity",
  managementMaturityLevel: "Management maturity",
  executionCapacityLevel: "Execution capacity",
  moralFragilityLevel: "Morale fragility",
  resilienceLevel: "Resilience",
  growthReadinessLevel: "Growth readiness",
};

const CONDITION_FIELD_ORDER: (keyof DerivedBusinessConditionSignals)[] = [
  "cashPressureLevel", "marginPressureLevel", "resilienceLevel", "growthReadinessLevel",
  "ownerDependencyRisk", "keyPersonDependencyRisk", "clientConcentrationRisk",
  "executionCapacityLevel", "processMaturityLevel", "managementMaturityLevel", "moralFragilityLevel",
];

const VERIFICATION_CLASS_LABEL: Record<string, string> = {
  SUCCESS: "Verified: Success",
  PARTIAL_SUCCESS: "Verified: Partial success",
  NO_MEASURABLE_IMPACT: "Verified: No measurable impact",
  FAILURE: "Verified: Failure",
  NEGATIVE_IMPACT: "Verified: Negative impact",
  INCONCLUSIVE: "Verified: Inconclusive",
  OBSERVATION_WINDOW_OPEN: "Observation window open",
  INSUFFICIENT_EVIDENCE: "Insufficient evidence",
};

const VERIFICATION_CLASS_VARIANT = (c: string): "destructive-accessible" | "warning-accessible" | "default-accessible" | "muted-accessible" =>
  c === "SUCCESS" ? "default-accessible"
  : c === "FAILURE" || c === "NEGATIVE_IMPACT" ? "destructive-accessible"
  : c === "PARTIAL_SUCCESS" ? "warning-accessible"
  : "muted-accessible";

const OUTCOME_STATUS_OPTIONS: { value: string; label: string }[] = [
  { value: "worked", label: "Worked" },
  { value: "partially_worked", label: "Partially worked" },
  { value: "did_not_work", label: "Did not work" },
  { value: "made_worse", label: "Made things worse" },
  { value: "not_measurable", label: "Not measurable" },
  { value: "too_early_to_judge", label: "Too early to judge" },
  { value: "invalid_test", label: "Invalid test" },
  { value: "executed_differently", label: "Executed differently" },
  { value: "external_event_interference", label: "External event interference" },
];

/** Phase 3 — execution lifecycle section (collapsed by default). Renders 4 sub-groups server-driven by
 *  can* booleans. No business logic: eligibility is server-computed in buildExecutionLifecycle. */
function ExecutionLifecycleSection({
  lifecycle,
  onAction,
  busy = false,
  activeBusinessId = null,
}: {
  lifecycle: OwnerExecutionLifecycleView;
  onAction?: (taskKey: string, action: string, input: CockpitActionInput) => void;
  busy?: boolean;
  activeBusinessId?: string | null;
}) {
  const [pending, setPending] = useState<{ taskKey: string; action: string } | null>(null);
  const [progressPct, setProgressPct] = useState("");
  const [stage, setStage] = useState("");
  const [outcomeStatus, setOutcomeStatus] = useState("worked");
  const [reason, setReason] = useState("");

  const resetForm = () => { setPending(null); setProgressPct(""); setStage(""); setOutcomeStatus("worked"); setReason(""); };

  // Discard any open Phase 3 form (RECORD_OUTCOME/VERIFY_OUTCOME/RECORD_PROGRESS) the instant the
  // active business SWITCHES (not the initial mount-time settling from null to the first resolved
  // business) — see `activeBusinessId`'s doc comment on MinimumOwnerCockpitProps. Without this,
  // `onAction`'s businessId for RECORD_OUTCOME/VERIFY_OUTCOME (cockpit/page.tsx) would be read
  // from whatever business is active at Confirm-click time, not the one the owner was looking at
  // when they opened this form, if a submit ever raced a business switch. This is reacting to an
  // external context change (ActiveBusinessContext), not deriving state from props/state already
  // available during render.
  //
  // ROOT CAUSE (found via integrated CI, PR #502): `activeBusinessId` starts `null` and resolves
  // asynchronously to the real id shortly after mount (ActiveBusinessProvider's own businesses
  // fetch). A plain `useEffect(..., [activeBusinessId])` fires on that null -> real-id transition
  // too, not just on a genuine switch between two real businesses -- so a form opened in the brief
  // window between the click and that first resolution could be wiped out before Confirm, even
  // though the business never actually "switched". `prevBusinessIdRef` distinguishes a genuine
  // switch (previous ref value was already a real, different id) from the initial settle (previous
  // ref value was null) and only resets on the former.
  const prevBusinessIdRef = useRef(activeBusinessId);
  useEffect(() => {
    const previous = prevBusinessIdRef.current;
    prevBusinessIdRef.current = activeBusinessId;
    if (previous !== null && previous !== activeBusinessId) {
      setPending(null); setProgressPct(""); setStage(""); setOutcomeStatus("worked"); setReason("");
    }
  }, [activeBusinessId]);

  const submitPhase3 = (taskKey: string, action: string) => {
    if (!onAction) return;
    const input: CockpitActionInput = {};
    if (action === "RECORD_PROGRESS") {
      const pct = parseInt(progressPct, 10);
      if (!isNaN(pct)) input.progressPct = pct;
      if (stage.trim()) input.stage = stage.trim();
      if (reason.trim()) input.reason = reason.trim();
    } else if (action === "RECORD_OUTCOME") {
      input.outcomeStatus = outcomeStatus;
      if (reason.trim()) input.reason = reason.trim();
    } else if (action === "VERIFY_OUTCOME") {
      if (reason.trim()) input.reason = reason.trim();
    }
    onAction(taskKey, action, input);
    resetForm();
  };

  const clickPhase3 = (taskKey: string, action: string) => {
    if (!onAction) return;
    if (action === "ACKNOWLEDGE") { onAction(taskKey, action, {}); return; }
    resetForm();
    setPending({ taskKey, action });
  };

  const renderItem = (item: ExecutionLifecycleItem, i: number, groupPrefix: string) => (
    <li key={item.taskKey} data-testid={`${groupPrefix}-${i}`}
      style={{ fontSize: 13, display: "flex", flexDirection: "column", gap: 6, paddingBottom: 8, borderBottom: "1px solid var(--border)" }}>
      <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
        <Badge variant={SEVERITY_VARIANT(item.severity)}>{severityLabel(item.severity)}</Badge>
        <span style={{ fontWeight: 600 }}>{item.ownerVisibleSummary}</span>
        <span style={{ color: "var(--muted-foreground)", fontSize: 12 }}>{STATUS_LABEL[item.status] ?? item.status.toLowerCase().replace(/_/g, " ")}</span>
        <span data-testid={`cockpit-reported-${item.taskKey}`} style={{ color: "var(--muted-foreground)", fontSize: 12 }}>
          Reported {humanizeReported(item.createdAt)}
        </span>
      </div>
      {item.verificationClassification && (
        <span data-testid={`cockpit-verification-classification-${item.taskKey}`}>
          <Badge variant={VERIFICATION_CLASS_VARIANT(item.verificationClassification)}>
            {VERIFICATION_CLASS_LABEL[item.verificationClassification] ?? item.verificationClassification}
          </Badge>
        </span>
      )}
      {item.progressPct !== null && (
        <span style={{ fontSize: 12, color: "var(--muted-foreground)" }}>Progress: {item.progressPct}%{item.blockerActive ? " — Blocked" : ""}</span>
      )}
      {item.expectedBenefit && (
        <span style={{ fontSize: 12, color: "var(--muted-foreground)" }}>Expected benefit: {item.expectedBenefit}</span>
      )}
      {!item.evidenceComplete && item.requiredEvidence.length > 0 && (
        <span style={{ fontSize: 12, color: "var(--warning-text)" }}>Evidence needed: {item.requiredEvidence.join("; ")}</span>
      )}
      {onAction && (
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
          {item.canAcknowledge && (
            <button type="button" data-testid={`cockpit-action-ACKNOWLEDGE-${item.taskKey}`} disabled={busy}
              aria-label={`Acknowledge: ${item.ownerVisibleSummary}`}
              onClick={() => clickPhase3(item.taskKey, "ACKNOWLEDGE")}
              style={{ fontSize: 12, padding: "4px 10px", borderRadius: 6, border: "1px solid #0369a1", background: "#0369a1", color: "#fff", cursor: busy ? "default" : "pointer" }}>
              Acknowledge
            </button>
          )}
          {item.canRecordProgress && (
            <button type="button" data-testid={`cockpit-action-RECORD_PROGRESS-${item.taskKey}`} disabled={busy}
              aria-label={`Record progress: ${item.ownerVisibleSummary}`}
              onClick={() => clickPhase3(item.taskKey, "RECORD_PROGRESS")}
              style={{ fontSize: 12, padding: "4px 10px", borderRadius: 6, border: "1px solid var(--border)", background: "var(--card)", color: "var(--foreground)", cursor: busy ? "default" : "pointer" }}>
              Record progress
            </button>
          )}
          {item.canRecordOutcome && (
            <button type="button" data-testid={`cockpit-action-RECORD_OUTCOME-${item.taskKey}`} disabled={busy}
              aria-label={`Record outcome: ${item.ownerVisibleSummary}`}
              onClick={() => clickPhase3(item.taskKey, "RECORD_OUTCOME")}
              style={{ fontSize: 12, padding: "4px 10px", borderRadius: 6, border: "1px solid #111827", background: "#111827", color: "#fff", cursor: busy ? "default" : "pointer" }}>
              Record outcome
            </button>
          )}
          {item.canVerify && (
            <button type="button" data-testid={`cockpit-action-VERIFY_OUTCOME-${item.taskKey}`} disabled={busy}
              aria-label={`Verify outcome: ${item.ownerVisibleSummary}`}
              onClick={() => clickPhase3(item.taskKey, "VERIFY_OUTCOME")}
              style={{ fontSize: 12, padding: "4px 10px", borderRadius: 6, border: "1px solid #16a34a", background: "#16a34a", color: "#fff", cursor: busy ? "default" : "pointer" }}>
              Verify outcome
            </button>
          )}
        </div>
      )}
      {pending?.taskKey === item.taskKey && (
        <div data-testid="cockpit-phase3-action-form" style={{ border: "1px solid var(--border)", background: "var(--card)", borderRadius: 8, padding: 10, display: "flex", flexDirection: "column", gap: 6 }}>
          <span style={{ fontSize: 12, fontWeight: 600 }}>{ACTION_LABEL[pending.action] ?? pending.action}</span>
          {pending.action === "RECORD_PROGRESS" && (
            <>
              <label style={{ fontSize: 12, color: "var(--muted-foreground)" }}>
                Progress % (0–100, optional)
                <input type="number" min={0} max={100} value={progressPct}
                  onChange={(e) => setProgressPct(e.target.value)} data-testid="cockpit-progress-pct-input"
                  style={{ display: "block", width: "100%", marginTop: 4, padding: "4px 8px", border: "1px solid var(--border)", borderRadius: 4, fontSize: 12, background: "var(--background)", color: "var(--foreground)" }} />
              </label>
              <label style={{ fontSize: 12, color: "var(--muted-foreground)" }}>
                Stage label (optional)
                <input type="text" value={stage}
                  onChange={(e) => setStage(e.target.value)} data-testid="cockpit-stage-input"
                  style={{ display: "block", width: "100%", marginTop: 4, padding: "4px 8px", border: "1px solid var(--border)", borderRadius: 4, fontSize: 12, background: "var(--background)", color: "var(--foreground)" }} />
              </label>
              <label style={{ fontSize: 12, color: "var(--muted-foreground)" }}>
                Note (optional)
                <input type="text" value={reason}
                  onChange={(e) => setReason(e.target.value)} data-testid="cockpit-reason-input"
                  style={{ display: "block", width: "100%", marginTop: 4, padding: "4px 8px", border: "1px solid var(--border)", borderRadius: 4, fontSize: 12, background: "var(--background)", color: "var(--foreground)" }} />
              </label>
            </>
          )}
          {pending.action === "RECORD_OUTCOME" && (
            <>
              <label style={{ fontSize: 12, color: "var(--muted-foreground)" }}>
                Outcome
                <select value={outcomeStatus} onChange={(e) => setOutcomeStatus(e.target.value)}
                  data-testid="cockpit-outcome-status-select"
                  style={{ display: "block", marginTop: 4, padding: "4px 8px", border: "1px solid var(--border)", borderRadius: 4, fontSize: 12, background: "var(--background)", color: "var(--foreground)" }}>
                  {OUTCOME_STATUS_OPTIONS.map((o) => (
                    <option key={o.value} value={o.value}>{o.label}</option>
                  ))}
                </select>
              </label>
              <label style={{ fontSize: 12, color: "var(--muted-foreground)" }}>
                Outcome notes (optional)
                <input type="text" value={reason}
                  onChange={(e) => setReason(e.target.value)} data-testid="cockpit-reason-input"
                  style={{ display: "block", width: "100%", marginTop: 4, padding: "4px 8px", border: "1px solid var(--border)", borderRadius: 4, fontSize: 12, background: "var(--background)", color: "var(--foreground)" }} />
              </label>
            </>
          )}
          {pending.action === "VERIFY_OUTCOME" && (
            <label style={{ fontSize: 12, color: "var(--muted-foreground)" }}>
              Verification notes (optional)
              <input type="text" value={reason}
                onChange={(e) => setReason(e.target.value)} data-testid="cockpit-reason-input"
                style={{ display: "block", width: "100%", marginTop: 4, padding: "4px 8px", border: "1px solid var(--border)", borderRadius: 4, fontSize: 12, background: "var(--background)", color: "var(--foreground)" }} />
            </label>
          )}
          <div style={{ display: "flex", gap: 6 }}>
            <button type="button" disabled={busy} data-testid="cockpit-phase3-confirm"
              onClick={() => submitPhase3(item.taskKey, pending.action)}
              style={{ fontSize: 12, padding: "4px 10px", borderRadius: 4, border: "1px solid #111827", background: "#111827", color: "#fff", cursor: busy ? "default" : "pointer" }}>
              Confirm
            </button>
            <button type="button" data-testid="cockpit-phase3-cancel" onClick={resetForm}
              style={{ fontSize: 12, padding: "4px 10px", borderRadius: 4, border: "1px solid var(--border)", background: "var(--card)", color: "var(--foreground)", cursor: "pointer" }}>
              Cancel
            </button>
          </div>
        </div>
      )}
    </li>
  );

  // P0-F: a compact row for a cluster of repeated, semantically-identical suggestions (see
  // groupRequiresDecisionItems) -- one line with a severity badge, the shared summary text, a
  // count, and a relative "reported" time, with every underlying item still individually
  // reachable (and individually actionable) via the nested, collapsed detail list. No bulk/
  // destructive action is offered here; each item keeps its own action controls unchanged.
  const renderDecisionGroup = (group: DecisionItemGroup, i: number) => {
    const first = group.items[0];
    const earliestReported = group.items.reduce(
      (min, item) => (item.createdAt < min ? item.createdAt : min),
      first.createdAt
    );
    return (
      <li key={group.key} data-testid={`cockpit-requires-decision-group-${i}`}
        style={{ fontSize: 13, paddingBottom: 8, borderBottom: "1px solid var(--border)" }}>
        <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
          <span data-testid={`cockpit-decision-group-severity-${i}`}>
            <Badge variant={SEVERITY_VARIANT(maxSeverity(group.items))}>{severityLabel(maxSeverity(group.items))}</Badge>
          </span>
          <span style={{ fontWeight: 600 }}>{first.ownerVisibleSummary}</span>
          <span data-testid={`cockpit-decision-group-count-${i}`} style={{ fontSize: 12, padding: "1px 6px", borderRadius: 10, background: "var(--muted)", color: "var(--muted-foreground)" }}>
            {group.items.length} suggestions
          </span>
          <span style={{ color: "var(--muted-foreground)", fontSize: 12 }}>Reported {humanizeReported(earliestReported)}</span>
        </div>
        <details style={{ marginTop: 6 }}>
          <summary style={{ cursor: "pointer", fontSize: 12, color: "var(--primary-text)" }}>
            Show all {group.items.length}
          </summary>
          <ul style={{ margin: "6px 0 0", paddingLeft: 0, listStyle: "none", display: "flex", flexDirection: "column", gap: 6 }}>
            {group.items.map((item, j) => renderItem(item, j, `cockpit-requires-decision-group-${i}-item`))}
          </ul>
        </details>
      </li>
    );
  };

  const total = lifecycle.requiresDecision.length + lifecycle.inExecution.length + lifecycle.awaitingVerification.length;

  return (
    <details data-testid="cockpit-execution-lifecycle" open={total > 0} style={{ borderTop: "1px solid var(--border)", paddingTop: 14, paddingBottom: 2 }}>
      <summary style={{ cursor: "pointer", fontSize: 13.5, fontWeight: 500, color: "var(--foreground)" }}>
        Execution lifecycle{total > 0 ? ` (${total} active)` : ""}
        {lifecycle.totalPendingVerification > 0 && (
          <span style={{ marginLeft: 8, fontSize: 12, padding: "1px 6px", borderRadius: 10, background: "#fef3c7", color: "#92400e" }}>
            {lifecycle.totalPendingVerification} awaiting verification
          </span>
        )}
      </summary>
      <div style={{ marginTop: 8, display: "flex", flexDirection: "column", gap: 10 }}>
        <details data-testid="cockpit-requires-decision-group" open={lifecycle.requiresDecision.length > 0}
          style={{ borderLeft: "3px solid #fef3c7", paddingLeft: 8 }}>
          <summary style={{ cursor: "pointer", fontSize: 13, fontWeight: 600, color: "var(--warning-text)" }}>
            Requires your decision ({lifecycle.requiresDecision.length})
          </summary>
          {lifecycle.requiresDecision.length === 0
            ? <p style={{ margin: "6px 0 0", fontSize: 12, color: "var(--muted-foreground)" }}>No tasks awaiting your decision.</p>
            : <ul style={{ margin: "6px 0 0", paddingLeft: 0, listStyle: "none", display: "flex", flexDirection: "column", gap: 6 }}>
                {groupRequiresDecisionItems(lifecycle.requiresDecision).map((group, i) =>
                  group.items.length === 1
                    ? renderItem(group.items[0], i, "cockpit-requires-decision")
                    : renderDecisionGroup(group, i)
                )}
              </ul>}
        </details>
        <details data-testid="cockpit-in-execution-group" open={lifecycle.inExecution.length > 0}
          style={{ borderLeft: "3px solid #dbeafe", paddingLeft: 8 }}>
          <summary style={{ cursor: "pointer", fontSize: 13, fontWeight: 600, color: "var(--primary-text)" }}>
            In execution ({lifecycle.inExecution.length})
          </summary>
          {lifecycle.inExecution.length === 0
            ? <p style={{ margin: "6px 0 0", fontSize: 12, color: "var(--muted-foreground)" }}>No tasks currently in execution.</p>
            : <ul style={{ margin: "6px 0 0", paddingLeft: 0, listStyle: "none", display: "flex", flexDirection: "column", gap: 6 }}>
                {lifecycle.inExecution.map((item, i) => renderItem(item, i, "cockpit-in-execution"))}
              </ul>}
        </details>
        <details data-testid="cockpit-awaiting-verification-group" open={lifecycle.awaitingVerification.length > 0}
          style={{ borderLeft: "3px solid #fde68a", paddingLeft: 8 }}>
          <summary style={{ cursor: "pointer", fontSize: 13, fontWeight: 600, color: "var(--warning-text)" }}>
            Awaiting verification ({lifecycle.awaitingVerification.length})
          </summary>
          {lifecycle.awaitingVerification.length === 0
            ? <p style={{ margin: "6px 0 0", fontSize: 12, color: "var(--muted-foreground)" }}>No tasks awaiting verification.</p>
            : <ul style={{ margin: "6px 0 0", paddingLeft: 0, listStyle: "none", display: "flex", flexDirection: "column", gap: 6 }}>
                {lifecycle.awaitingVerification.map((item, i) => renderItem(item, i, "cockpit-awaiting-verification"))}
              </ul>}
        </details>
        <details data-testid="cockpit-recently-verified-group"
          style={{ borderLeft: "3px solid #d1fae5", paddingLeft: 8 }}>
          <summary style={{ cursor: "pointer", fontSize: 13, fontWeight: 600, color: "var(--success-text)" }}>
            Recently verified ({lifecycle.recentlyVerified.length})
          </summary>
          {lifecycle.recentlyVerified.length === 0
            ? <p style={{ margin: "6px 0 0", fontSize: 12, color: "var(--muted-foreground)" }}>No recently verified outcomes.</p>
            : <ul style={{ margin: "6px 0 0", paddingLeft: 0, listStyle: "none", display: "flex", flexDirection: "column", gap: 6 }}>
                {lifecycle.recentlyVerified.map((item, i) => renderItem(item, i, "cockpit-recently-verified"))}
              </ul>}
        </details>
      </div>
    </details>
  );
}

const PORTFOLIO_DECISION_LABEL: Record<string, string> = {
  EXECUTE_NOW: "SYSTEM RECOMMENDATION",
  DELAY: "SYSTEM: DELAY",
  CANCEL: "SYSTEM: CANCEL",
  MERGE: "SYSTEM: MERGE",
  SPLIT: "SYSTEM: SPLIT",
  ESCALATE: "BINDING CONSTRAINT",
};
const PORTFOLIO_DECISION_COLOR: Record<string, string> = {
  EXECUTE_NOW: "var(--success-text)", DELAY: "var(--warning-text)", CANCEL: "var(--destructive)",
  MERGE: "var(--primary-text)", SPLIT: "var(--primary-text)", ESCALATE: "var(--destructive)",
};

function BusinessOperatingSystemSection({
  bos,
  onBosAction,
  busy,
}: {
  bos: BusinessOperatingSystemView;
  onBosAction?: (action: string, payload: Record<string, unknown>) => Promise<void>;
  busy?: boolean;
}) {
  const [overrideOpen, setOverrideOpen] = useState(false);
  const [overrideDecision, setOverrideDecision] = useState("EXECUTE_NOW");
  const [overrideRationale, setOverrideRationale] = useState("");
  const [overrideSubmitting, setOverrideSubmitting] = useState(false);

  const healthColor = (h: string) => h === "ON_TRACK" ? "#16a34a" : h === "AT_RISK" ? "#b45309" : h === "BLOCKED" ? "#dc2626" : "#6b7280";

  const handleRunArbitration = async () => {
    if (!onBosAction) return;
    await onBosAction("run-arbitration", {});
  };

  const handleSubmitOverride = async () => {
    if (!onBosAction || !bos.latestArbitration) return;
    if (overrideRationale.trim().length < 10) return;
    setOverrideSubmitting(true);
    try {
      await onBosAction("override", {
        overriddenRecordId: bos.latestArbitration.winnerObjectiveId ?? "",
        overrideRationale: overrideRationale.trim(),
        decision: overrideDecision,
      });
      setOverrideOpen(false);
      setOverrideRationale("");
    } finally {
      setOverrideSubmitting(false);
    }
  };

  const handleConstraintAction = async (constraintId: string, action: "RESOLVE" | "ACCEPT") => {
    if (!onBosAction) return;
    await onBosAction("constraint", { recordId: constraintId, action });
  };

  return (
    <details open={bos.totalActiveObjectives > 0} data-testid="cockpit-bos-section" style={{ borderTop: "1px solid var(--border)", paddingTop: 14, paddingBottom: 2 }}>
      <summary style={{ cursor: "pointer", fontSize: 13.5, fontWeight: 500, color: "var(--foreground)" }}>
        Goals &amp; objectives
        <span style={{ fontWeight: 400, color: "var(--muted-foreground)" }}>
          {" "}
          — {bos.totalActiveObjectives > 0
            ? `${bos.totalActiveObjectives} active objective${bos.totalActiveObjectives !== 1 ? "s" : ""}`
            : "no objectives set yet"}
        </span>
      </summary>
      <div style={{ marginTop: 8, display: "flex", flexDirection: "column", gap: 8, fontSize: 13 }}>
        {/* Health counts */}
        <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }} data-testid="cockpit-bos-health-counts">
          {bos.objectiveHealthCounts.ON_TRACK > 0 && <span style={{ color: "var(--success-text)" }}>{bos.objectiveHealthCounts.ON_TRACK} on track</span>}
          {bos.objectiveHealthCounts.AT_RISK > 0 && <span style={{ color: "var(--warning-text)" }}>{bos.objectiveHealthCounts.AT_RISK} at risk</span>}
          {bos.objectiveHealthCounts.BLOCKED > 0 && <span style={{ color: "var(--destructive)" }}>{bos.objectiveHealthCounts.BLOCKED} blocked</span>}
          {bos.objectiveHealthCounts.CRITICAL > 0 && <span style={{ color: "var(--destructive)", fontWeight: 600 }}>{bos.objectiveHealthCounts.CRITICAL} critical</span>}
        </div>

        {/* Run Arbitration */}
        {onBosAction && (
          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <button
              data-testid="cockpit-bos-run-arbitration"
              onClick={() => void handleRunArbitration()}
              disabled={busy || overrideSubmitting}
              style={{ fontSize: 12, padding: "4px 10px", borderRadius: 4, border: "1px solid var(--border)", cursor: "pointer", background: "var(--card)", color: "var(--foreground)" }}
            >
              Run arbitration
            </button>
            {bos.latestArbitration && (
              <span style={{ fontSize: 11, color: "var(--muted-foreground)" }}>
                Last: {new Date(bos.latestArbitration.arbitratedAt).toLocaleDateString()}
                {bos.latestArbitration.dominantConstraint ? ` · ${bos.latestArbitration.dominantConstraint}` : ""}
              </span>
            )}
          </div>
        )}
        {!onBosAction && bos.latestArbitration && (
          <p style={{ margin: 0, fontSize: 12, color: "var(--muted-foreground)" }} data-testid="cockpit-bos-arbitration">
            Last arbitration: {new Date(bos.latestArbitration.arbitratedAt).toLocaleDateString()}
            {bos.latestArbitration.dominantConstraint ? ` · Dominant constraint: ${bos.latestArbitration.dominantConstraint}` : ""}
          </p>
        )}

        {/* Top objectives with portfolio decisions */}
        {bos.topObjectives.length > 0 && (
          <ul style={{ margin: 0, paddingLeft: 0, listStyle: "none", display: "flex", flexDirection: "column", gap: 6 }}>
            {bos.topObjectives.map((o) => (
              <li key={o.objectiveId} data-testid={`cockpit-bos-objective-${o.objectiveId}`} style={{ display: "flex", flexDirection: "column", gap: 2 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <span style={{ width: 8, height: 8, borderRadius: "50%", background: healthColor(o.health), flexShrink: 0, display: "inline-block" }} />
                  <span style={{ flex: 1 }}>{o.title}</span>
                  <span style={{ color: "var(--muted-foreground)", fontSize: 12 }}>{o.objectiveType}</span>
                  {o.candidateType === "EXTERNAL_OPPORTUNITY" && (
                    <Badge variant="default-accessible" data-testid={`cockpit-bos-candidate-type-${o.objectiveId}`}>External</Badge>
                  )}
                </div>
                {o.portfolioDecision && (
                  <div style={{ display: "flex", gap: 6, paddingLeft: 16 }}>
                    <span
                      data-testid={`cockpit-bos-portfolio-decision-${o.objectiveId}`}
                      style={{ fontSize: 11, color: PORTFOLIO_DECISION_COLOR[o.portfolioDecision] ?? "var(--muted-foreground)", fontWeight: 600 }}
                    >
                      {o.hasOverride ? "OWNER OVERRIDE" : (PORTFOLIO_DECISION_LABEL[o.portfolioDecision] ?? o.portfolioDecision)}
                    </span>
                    {o.portfolioRationale && (
                      <span
                        data-testid={`cockpit-bos-portfolio-rationale-${o.objectiveId}`}
                        style={{ fontSize: 11, color: "var(--muted-foreground)" }}
                      >
                        — {o.portfolioRationale}
                      </span>
                    )}
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}

        {/* System summary row */}
        <div style={{ display: "flex", gap: 16, flexWrap: "wrap", color: "var(--muted-foreground)", fontSize: 12 }}>
          <span data-testid="cockpit-bos-pools">{bos.activePoolCount} resource pool{bos.activePoolCount !== 1 ? "s" : ""}{bos.resourceUtilizationPct !== null ? ` · ${bos.resourceUtilizationPct}% utilized` : ""}</span>
          <span data-testid="cockpit-bos-constraints">{bos.activeConstraintCount} active constraint{bos.activeConstraintCount !== 1 ? "s" : ""}</span>
          <span data-testid="cockpit-bos-kpis">{bos.kpiCount} KPI{bos.kpiCount !== 1 ? "s" : ""} tracked</span>
          {bos.costAttributionCoverage !== null && <span data-testid="cockpit-bos-attribution">{bos.costAttributionCoverage}% cost attributed</span>}
        </div>

        {/* Active constraints with resolve/accept */}
        {bos.activeConstraints && bos.activeConstraints.length > 0 && (
          <div data-testid="cockpit-bos-constraint-list">
            <strong style={{ fontSize: 12 }}>Binding constraints:</strong>
            <ul style={{ margin: "4px 0 0", paddingLeft: 0, listStyle: "none", display: "flex", flexDirection: "column", gap: 4 }}>
              {bos.activeConstraints.map((c) => (
                <li key={c.constraintId} data-testid={`cockpit-bos-constraint-${c.constraintId}`} style={{ fontSize: 12, display: "flex", alignItems: "center", gap: 6 }}>
                  <Badge variant="warning-accessible" data-testid={`cockpit-bos-constraint-badge-${c.constraintId}`}>BINDING CONSTRAINT</Badge>
                  <span style={{ flex: 1 }}>{c.title}</span>
                  {onBosAction && (
                    <>
                      <button
                        data-testid={`cockpit-bos-resolve-constraint-${c.constraintId}`}
                        onClick={() => void handleConstraintAction(c.constraintId, "RESOLVE")}
                        disabled={busy}
                        style={{ fontSize: 11, padding: "2px 6px", borderRadius: 3, border: "1px solid var(--border)", cursor: "pointer", background: "var(--card)", color: "var(--foreground)" }}
                      >
                        Resolve
                      </button>
                      <button
                        data-testid={`cockpit-bos-accept-constraint-${c.constraintId}`}
                        onClick={() => void handleConstraintAction(c.constraintId, "ACCEPT")}
                        disabled={busy}
                        style={{ fontSize: 11, padding: "2px 6px", borderRadius: 3, border: "1px solid var(--border)", cursor: "pointer", background: "var(--card)", color: "var(--foreground)" }}
                      >
                        Accept
                      </button>
                    </>
                  )}
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* Top risks */}
        {bos.topRisks.length > 0 && (
          <div data-testid="cockpit-bos-risks">
            <strong style={{ fontSize: 12 }}>Top risks:</strong>
            <ul style={{ margin: "4px 0 0", paddingLeft: 0, listStyle: "none", display: "flex", flexDirection: "column", gap: 2 }}>
              {bos.topRisks.map((r) => (
                <li key={r.riskId} data-testid={`cockpit-bos-risk-${r.riskId}`} style={{ fontSize: 12, color: "var(--muted-foreground)" }}>
                  <Badge variant={r.severity >= 50 ? "destructive-accessible" : r.severity >= 25 ? "warning-accessible" : "muted-accessible"}>
                    {riskScoreLabel(r.severity)}
                  </Badge>
                  {" "}{r.title}
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* Override indicator (system rec stays visible alongside) */}
        {bos.latestArbitrationOverride && (
          <div
            data-testid="cockpit-bos-override-indicator"
            style={{ fontSize: 12, color: "#92400e", background: "#fef3c7", border: "1px solid #fde68a", borderRadius: 4, padding: "4px 8px" }}
          >
            <strong>OWNER OVERRIDE:</strong> {bos.latestArbitrationOverride.decision}
            {" — "}{bos.latestArbitrationOverride.overrideRationale}
          </div>
        )}

        {/* Override form */}
        {onBosAction && bos.latestArbitration && (
          <div>
            {!overrideOpen ? (
              <button
                data-testid="cockpit-bos-override-open"
                onClick={() => setOverrideOpen(true)}
                style={{ fontSize: 12, padding: "4px 10px", borderRadius: 4, border: "1px solid var(--warning)", color: "var(--warning-text)", cursor: "pointer", background: "transparent" }}
              >
                Record owner override
              </button>
            ) : (
              <div data-testid="cockpit-bos-override-form" style={{ display: "flex", flexDirection: "column", gap: 6, border: "1px solid var(--border)", background: "var(--card)", borderRadius: 6, padding: 10 }}>
                <label style={{ fontSize: 12, fontWeight: 600 }}>
                  Decision
                  <select
                    data-testid="cockpit-bos-override-decision"
                    value={overrideDecision}
                    onChange={(e) => setOverrideDecision(e.target.value)}
                    style={{ marginLeft: 8, fontSize: 12 }}
                  >
                    <option value="EXECUTE_NOW">Execute now</option>
                    <option value="DELAY">Delay</option>
                    <option value="CANCEL">Cancel</option>
                    <option value="MERGE">Merge</option>
                    <option value="SPLIT">Split</option>
                    <option value="ESCALATE">Escalate</option>
                  </select>
                </label>
                <label style={{ fontSize: 12, fontWeight: 600 }}>
                  Rationale (required, min 10 chars)
                  <textarea
                    data-testid="cockpit-bos-override-rationale"
                    value={overrideRationale}
                    onChange={(e) => setOverrideRationale(e.target.value)}
                    rows={3}
                    style={{ display: "block", width: "100%", marginTop: 4, fontSize: 12, fontFamily: "inherit", padding: 6, borderRadius: 4, border: "1px solid var(--border)", resize: "vertical", background: "var(--background)", color: "var(--foreground)" }}
                    placeholder="Why are you overriding the system recommendation?"
                  />
                </label>
                <div style={{ display: "flex", gap: 8 }}>
                  <button
                    data-testid="cockpit-bos-override-submit"
                    onClick={() => void handleSubmitOverride()}
                    disabled={overrideSubmitting || overrideRationale.trim().length < 10}
                    style={{ fontSize: 12, padding: "4px 10px", borderRadius: 4, border: "none", background: "#b45309", color: "#fff", cursor: "pointer" }}
                  >
                    {overrideSubmitting ? "Saving…" : "Submit override"}
                  </button>
                  <button
                    data-testid="cockpit-bos-override-cancel"
                    onClick={() => { setOverrideOpen(false); setOverrideRationale(""); }}
                    style={{ fontSize: 12, padding: "4px 10px", borderRadius: 4, border: "1px solid var(--border)", cursor: "pointer", background: "transparent", color: "var(--foreground)" }}
                  >
                    Cancel
                  </button>
                </div>
              </div>
            )}
          </div>
        )}

        {bos.totalActiveObjectives === 0 && (
          <p style={{ margin: 0, color: "var(--muted-foreground)" }} data-testid="cockpit-bos-empty">You haven&apos;t set any goals yet. Add one to see progress and risk here.</p>
        )}
      </div>
    </details>
  );
}

function BusinessConditionSection({ condition, dataFreshnessWeak }: { condition: DerivedBusinessConditionSignals; dataFreshnessWeak?: boolean | null }) {
  const knownFields = CONDITION_FIELD_ORDER.filter((k) => condition[k] !== "unknown");
  const unknownCount = CONDITION_FIELD_ORDER.length - knownFields.length;
  const worstLevel = CONDITION_FIELD_ORDER
    .map((k) => condition[k])
    .reduce<string>((worst, level) => {
      const rank: Record<string, number> = { CRITICAL: 4, BLOCKED: 3, HIGH: 3, MEDIUM: 2, LOW: 1, unknown: 0 };
      return (rank[level] ?? 0) > (rank[worst] ?? 0) ? level : worst;
    }, "LOW");

  return (
    <details data-testid="cockpit-business-condition-group" style={{ borderTop: "1px solid var(--border)", paddingTop: 14, paddingBottom: 2 }}>
      <summary style={{ cursor: "pointer", fontSize: 13.5, fontWeight: 500, color: "var(--foreground)" }}>
        Business condition
        <span style={{ fontWeight: 400, color: "var(--muted-foreground)" }}> — highest risk: {RISK_LEVEL_LABEL[worstLevel] ?? worstLevel}</span>
      </summary>
      <div style={{ marginTop: 8, display: "flex", flexDirection: "column", gap: 4, fontSize: 13 }}>
        {knownFields.length === 0 ? (
          <p style={{ margin: 0, color: "var(--muted-foreground)" }} data-testid="cockpit-condition-nodata">No business condition data available yet — add cashflow and workload records to enable this panel.</p>
        ) : (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))", gap: "4px 12px" }}>
            {knownFields.map((k) => (
              <span key={k} style={{ display: "flex", gap: 6, alignItems: "center" }} data-testid={`cockpit-condition-${k}`}>
                <Badge variant={RISK_VARIANT(condition[k])}>{RISK_LEVEL_LABEL[condition[k]] ?? condition[k]}</Badge>
                <span style={{ color: "var(--muted-foreground)" }}>{CONDITION_FIELD_LABEL[k]}</span>
              </span>
            ))}
          </div>
        )}
        {unknownCount > 0 && (
          <p style={{ margin: "4px 0 0", fontSize: 12, color: "var(--muted-foreground)" }} data-testid="cockpit-condition-missing">
            {unknownCount} dimension{unknownCount > 1 ? "s" : ""} need more data to assess.
          </p>
        )}
        {dataFreshnessWeak && (
          <p style={{ margin: "4px 0 0", fontSize: 12, color: "var(--warning-text)", fontStyle: "italic" }} data-testid="cockpit-condition-stale">
            Data confidence is low — some signals may be stale. Update cashflow and workload records for a fresh assessment.
          </p>
        )}
      </div>
    </details>
  );
}

/** Read-only recovery status — a concise, collapsed summary (PASS 37). NOT a second cockpit. */
function RecoverySection({ recovery, ownerDecision }: { recovery: OwnerRecoveryStatusResponse; ownerDecision: CurrentOwnerDecision | null }) {
  const inProgress = recovery.recoveryStatus !== "NONE";
  // Recovery's growth constraints pass through the shared reconciler: they constrain GROW work only and
  // become conditions on a canonical growth step, never a veto of the main target or a supporting step.
  const imperativeCtx = ownerImperativeContext(ownerDecision);
  const recoveryBlocks = reconcileRecoveryBlocks(recovery.blockedUnsafeActions, imperativeCtx);
  const statusLabel = RECOVERY_STATUS_LABEL[recovery.recoveryStatus] ?? recovery.recoveryStatus;
  const recoveryStatusLabel = recovery.recoveryStatus === "THRIVE_GATE_BLOCKED" ? reconcileRecoveryGrowthGate(statusLabel, imperativeCtx) : statusLabel;
  return (
    <details data-testid="cockpit-recovery-group" style={{ borderTop: "1px solid var(--border)", paddingTop: 14, paddingBottom: 2 }}>
      <summary style={{ cursor: "pointer", fontSize: 13.5, fontWeight: 500, color: "var(--foreground)" }}>
        Recovery status
        <span style={{ fontWeight: 400, color: "var(--muted-foreground)" }}> — {recoveryStatusLabel}</span>
      </summary>
      <div style={{ marginTop: 8, display: "flex", flexDirection: "column", gap: 6, fontSize: 13 }}>
        {!inProgress ? (
          <p style={{ margin: 0, color: "var(--muted-foreground)" }} data-testid="cockpit-recovery-none">No recovery is in progress right now.</p>
        ) : (
          <>
            <div data-testid="cockpit-recovery-state" style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
              <Badge variant="muted-accessible">{recoveryStatusLabel}</Badge>
              <span data-testid="cockpit-recovery-stabilization">Stabilization: {recovery.stabilizationGate}</span>
              <span data-testid="cockpit-recovery-thrive">Growth gate: {reconcileRecoveryGrowthGate(recovery.thriveGate, imperativeCtx, recovery.thriveGate === "BLOCKED")}</span>
            </div>
            {recovery.topRecoveryBottleneck && (
              <p style={{ margin: 0 }} data-testid="cockpit-recovery-bottleneck"><strong>Recovery follow-up:</strong> {recovery.topRecoveryBottleneck}</p>
            )}
            {recovery.requiredEvidence.length > 0 && (
              <p style={{ margin: 0, color: "var(--muted-foreground)" }} data-testid="cockpit-recovery-evidence">Evidence required: {recovery.requiredEvidence.slice(0, 3).join("; ")}</p>
            )}
            <p style={{ margin: 0, color: "var(--muted-foreground)" }} data-testid="cockpit-recovery-reassessment">{recovery.requiredReassessment}</p>
            {recoveryBlocks.blocked.length > 0 && (
              <p style={{ margin: 0, color: "var(--warning-text)" }} data-testid="cockpit-recovery-blocked">Blocked: {recoveryBlocks.blocked.slice(0, 2).join("; ")}</p>
            )}
            {recoveryBlocks.conditions.length > 0 && (
              <p style={{ margin: 0 }} data-testid="cockpit-recovery-conditions">How to run your next steps: {recoveryBlocks.conditions.join(" ")}</p>
            )}
            {recovery.ownerApprovalRequired && (
              <p style={{ margin: 0, color: "var(--destructive)" }} data-testid="cockpit-recovery-approval">This action requires owner approval.</p>
            )}
            {recovery.linkedProcessExecutionTaskIds.length > 0 && (
              <p style={{ margin: 0, color: "var(--muted-foreground)" }} data-testid="cockpit-recovery-linked">{recovery.linkedProcessExecutionTaskIds.length} linked governed task(s) — find them under &ldquo;Governed work you can start&rdquo;.</p>
            )}
          </>
        )}
        <p style={{ margin: "2px 0 0", color: "var(--muted-foreground)", fontStyle: "italic" }} data-testid="cockpit-recovery-caveat">{recovery.noGuaranteeStatement} {recovery.uncertaintyCaveat}</p>
      </div>
    </details>
  );
}

/**
 * Goal Attention Signal (Phase 2 Signal A). One component for both Home layouts: the selected
 * business's goal (or its explicit "No goal set for <business>" / "Workspace goal" state) must be
 * visible whether or not a governed top action exists — the clean state is the normal Home for a
 * business with no urgent action, and hiding the goal there hid it from most owners.
 */
function GoalAttentionSection({ signal }: { signal: GoalAttentionSignal }) {
  return (
    <div data-testid="cockpit-goal-section" className="flex flex-col gap-1">
      <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
        <span className="text-sm font-medium text-foreground">Goal</span>
        <span data-testid="cockpit-goal-state" data-cockpit-goal-state={signal.state} style={{ fontSize: 12, padding: "2px 8px", borderRadius: 4, background: signal.state === "AT_RISK" || signal.state === "NO_GROWTH" ? "#fef2f2" : signal.state === "ON_TRACK" ? "#f0fdf4" : "#fafafa", color: signal.state === "AT_RISK" || signal.state === "NO_GROWTH" ? "#b91c1c" : signal.state === "ON_TRACK" ? "#15803d" : "#6b7280" }}>
          {GOAL_STATE_LABEL[signal.state] ?? GOAL_STATE_FALLBACK}
        </span>
        {signal.goalTitle && <span style={{ fontSize: 13, color: "var(--muted-foreground)" }}>{signal.goalTitle}</span>}
      </div>
      {signal.goalScope && signal.scopeLabel && (
        <p data-testid="cockpit-goal-scope" data-cockpit-goal-scope={signal.goalScope} className="m-0 text-xs font-medium text-muted-foreground">
          {signal.scopeLabel}
        </p>
      )}
      {signal.gapToClose !== null && (
        <p data-testid="cockpit-goal-gap" style={{ margin: 0, fontSize: 13, color: "var(--muted-foreground)" }}>
          Gap to close: {signal.targetCurrency ?? ""} {signal.gapToClose.toLocaleString()}
        </p>
      )}
      <p data-testid="cockpit-goal-explanation" style={{ margin: 0, fontSize: 13, color: "var(--muted-foreground)", fontStyle: "italic" }}>{signal.beginnerExplanation}</p>
    </div>
  );
}

export function MinimumOwnerCockpit({ bridge, actionsToAvoid = [], stepConditions = [], recovery = null, publicSignals = null, businessCondition = null, dataFreshnessWeak = null, onAction, busy = false, goalAttentionSignal = null, topProfitLeak = null, policyAttentionSignal = null, trendAlerts = undefined, doNotRepeatAnnotation = null, activeEscalations = undefined, onAcknowledgeEscalation, onStartWork, executionLifecycle = null, businessOperatingSystem = null, onBosAction, ownerDecision = null, hasBusiness = true, activeBusinessId = null }: MinimumOwnerCockpitProps) {
  const top = bridge?.topRoute ?? null;
  const [pending, setPending] = useState<string | null>(null);
  const [evidenceText, setEvidenceText] = useState("");
  const [reasonText, setReasonText] = useState("");
  const [delegateRole, setDelegateRole] = useState<"MANAGER" | "STAFF">("MANAGER");

  // Discard the top-priority action's own open inline form (REJECT/MARK_BLOCKED/SUBMIT_EVIDENCE/
  // DELEGATE/...) the instant the active business SWITCHES (not the initial mount-time settling
  // from null to the first resolved business) — see `activeBusinessId`'s doc comment on
  // MinimumOwnerCockpitProps. These actions never send a businessId (write path resolves by
  // taskKey alone), but leaving a stale evidence/reason/delegate form open across a business
  // switch is the same "submitting against a context the owner no longer sees" hazard. This is
  // reacting to an external context change, not deriving state from render-available props/state.
  //
  // Same root cause and fix as ExecutionLifecycleSection's identical effect above (found via
  // integrated CI, PR #502): `activeBusinessId` starts `null` and resolves asynchronously shortly
  // after mount, so a plain `[activeBusinessId]`-keyed effect fires on that settling transition
  // too, not just a genuine switch — `prevBusinessIdRef` distinguishes the two.
  const prevBusinessIdRef = useRef(activeBusinessId);
  useEffect(() => {
    const previous = prevBusinessIdRef.current;
    prevBusinessIdRef.current = activeBusinessId;
    if (previous !== null && previous !== activeBusinessId) {
      setPending(null); setEvidenceText(""); setReasonText(""); setDelegateRole("MANAGER");
    }
  }, [activeBusinessId]);

  // The canonical owner decision always owns the primary slot (see `ownerDecision`'s doc comment).
  const decisionCard = ownerDecision ? <OwnerDecisionCard decision={ownerDecision} /> : null;

  // ── Clean state: no governed process-execution route. The primary slot is the canonical owner
  // decision; nothing is fabricated when there is none. ──
  if (!top) {
    return (
      <section data-testid="cockpit-clean" className="flex flex-col gap-3 rounded-md border border-border bg-card p-5">
        {decisionCard ?? (
          <div>
            <strong className="text-base font-semibold text-foreground">No urgent action needs your attention right now.</strong>
            <p className="mt-1.5 text-sm text-muted-foreground">
              OpsIQ has nothing that requires an owner decision at the moment. This stays empty until a real
              action is ready — nothing is invented to fill the space.
            </p>
            {/* Phase 7's no-data-state contract ("what OpsIQ needs, why, and one clear next action")
                — a lay owner landing here with no business data yet previously had no path forward
                except finding "My Business" in the sidebar themselves. */}
            {!hasBusiness && (
              <p className="mt-3 text-sm text-muted-foreground">
                Haven&rsquo;t added your business yet? <a href="/owner/data" className="text-[var(--primary-text)] underline">Add your business information</a> to get your first result.
              </p>
            )}
          </div>
        )}
        {executionLifecycle && <ExecutionLifecycleSection lifecycle={executionLifecycle} onAction={onAction} busy={busy} activeBusinessId={activeBusinessId} />}
        {goalAttentionSignal && <GoalAttentionSection signal={goalAttentionSignal} />}
        {businessOperatingSystem && <BusinessOperatingSystemSection bos={businessOperatingSystem} onBosAction={onBosAction} busy={busy} />}
        {recovery && <RecoverySection recovery={recovery} ownerDecision={ownerDecision} />}
        {publicSignals && <OutsideSignalsSection signals={publicSignals} />}
      </section>
    );
  }

  const isOwner = top.approvalLevel === "OWNER_APPROVAL_REQUIRED" || top.approvalLevel === "NEVER_AUTO";
  const isBlockedUnsafe = top.executionRoute === "BLOCK_UNSAFE_ACTION";
  const isMonitorOnly = top.executionRoute === "MONITOR_ONLY";
  const allowed = allowedCockpitActions(top);
  const primary = allowed.filter((a) => (PRIMARY_ACTIONS as readonly string[]).includes(a)).slice(0, 2);
  const secondary = allowed.filter((a) => !primary.includes(a));
  const secondaryVisible = secondary.slice(0, 3);
  const secondaryMore = secondary.slice(3);

  // ── Presentation hierarchy only (F/PASS-40 governance unchanged: same actions, same counts, same
  // data-cockpit-priority markers the no-overload test asserts on) -- pick the ONE action that most
  // deserves to be the visually dominant "next step" so it doesn't compete with everything else in
  // an undifferentiated row of equal-weight buttons. Start Work (a dedicated, separately-governed
  // action) outranks the generic primary list when both are available, since starting the work is
  // the literal first step; otherwise the first primary-classed action takes the dominant slot and
  // every other offered action -- remaining primary actions included -- renders at the same, lighter
  // visual weight below it.
  const dominantIsStartWork = Boolean(top.canStart && onStartWork);
  const dominantPrimaryAction = !dominantIsStartWork ? primary[0] : undefined;
  const demotedPrimary = dominantPrimaryAction ? primary.slice(1) : primary;

  // Reason bullets: at most 3 plain-language reasons. Never a raw dump.
  const whyBullets = [top.riskIfIgnored].filter(Boolean).slice(0, 3);

  const rest = (bridge?.routes ?? []).filter((r) => r.taskKey !== top.taskKey);
  const secondaryRoutes = rest.filter((r) => r.executionRoute !== "MONITOR_ONLY" && r.executionRoute !== "BLOCK_UNSAFE_ACTION");
  const monitorRoutes = rest.filter((r) => r.executionRoute === "MONITOR_ONLY");

  const needsEvidence = (a: string) => a === "SUBMIT_EVIDENCE" || a === "COMPLETE";
  const needsReason = (a: string) => a === "REJECT" || a === "MARK_BLOCKED" || a === "REQUEST_REASSESSMENT" || a === "REQUEST_MISSING_DATA";
  const isDelegate = (a: string) => a === "DELEGATE";

  const submit = (action: string) => {
    if (!onAction) return;
    const input: CockpitActionInput = {};
    if (needsEvidence(action)) {
      const refs = evidenceText.split(",").map((s) => s.trim()).filter(Boolean);
      if (action === "SUBMIT_EVIDENCE" && refs.length === 0) return; // evidence is required to submit evidence
      if (refs.length > 0) input.evidenceRefs = refs;
    }
    if (needsReason(action) && reasonText.trim()) input.reason = reasonText.trim();
    if (isDelegate(action)) input.delegateToRole = delegateRole;
    onAction(top.taskKey, action, input);
    setPending(null); setEvidenceText(""); setReasonText("");
  };

  const clickAction = (action: string) => {
    if (!onAction) return;
    // Actions needing input open a labelled inline form; simple actions submit immediately.
    if (needsEvidence(action) || needsReason(action) || isDelegate(action)) setPending(action);
    else submit(action);
  };

  const terminal = top.status === "COMPLETED" || top.status === "REJECTED" || top.status === "OUTCOME_RECORDED" || top.status === "OUTCOME_DISPUTED" || top.status === "OUTCOME_VERIFIED";

  return (
    <section data-testid="owner-cockpit" data-execution-route={top.executionRoute}
      className="flex max-w-2xl flex-col gap-3.5">
      {decisionCard}

      {/* 1. Governed work (subordinate to the decision above) — an editorial "briefing" treatment (a thin accent rule + open
          layout) rather than a boxed admin-panel card, per the premium-redesign visual pass.
          Every value rendered here (top.severity, top.ownerVisibleSummary, whyBullets) is
          unchanged from before; only the surrounding markup/classNames changed. */}
      {/* Governed work is SUBORDINATE to the canonical decision above: it is never styled as the
          main target (smaller title, neutral rule) and, without a canonical decision, it is not
          presented as the business's overall priority. */}
      <div data-testid="cockpit-top-action" className="flex flex-col gap-4 border-l-2 border-border pl-5 py-1">
        <div className="flex flex-wrap items-center gap-2.5">
          <span className="text-xs font-semibold uppercase tracking-[0.08em] text-muted-foreground">Governed work you can start</span>
          <Badge variant={SEVERITY_VARIANT(top.severity)}>{severityLabel(top.severity)}</Badge>
        </div>
        {!ownerDecision && (
          <p data-testid="cockpit-no-canonical-decision" className="m-0 text-sm text-muted-foreground">
            OpsIQ has not named a main business target yet, so this is work you can start — not your overall priority.
          </p>
        )}
        <strong data-testid="cockpit-top-action-title" className="text-base font-semibold leading-snug text-foreground">{top.ownerVisibleSummary}</strong>

        {/* 2. Why This Is First — stays visible; it's the one thing a lay owner needs up front. */}
        <div data-testid="cockpit-why">
          <span className="text-sm font-medium text-foreground">Why this matters</span>
          <ul className="mt-1.5 list-disc space-y-1 pl-[18px]">
            {whyBullets.map((b, i) => (
              <li key={i} data-testid="cockpit-why-bullet" className="text-[0.9375rem] leading-relaxed text-muted-foreground">{b}</li>
            ))}
          </ul>
        </div>

        {/* 5. Safe Actions. Presentation only, per the F/PASS-40 no-overload envelope: one visually
            dominant recommended action (never fabricated -- it's just the first of the actions the
            server already allowed), everything else at one uniform, lighter weight underneath so it
            never competes with it for attention. */}
        {onAction && !terminal && (dominantIsStartWork || dominantPrimaryAction || demotedPrimary.length > 0 || secondaryVisible.length > 0) && (
          <div data-testid="cockpit-safe-actions" className="flex flex-col gap-3">
            {(dominantIsStartWork || dominantPrimaryAction) && (
              <div className="flex flex-col gap-1.5">
                <span className="text-sm font-medium text-foreground">Next step for this work</span>
                {dominantIsStartWork ? (
                  <button
                    type="button"
                    data-testid={`cockpit-start-work-${top.taskKey}`}
                    disabled={busy}
                    onClick={() => onStartWork!(top.taskKey)}
                    className="inline-flex h-11 w-fit items-center justify-center rounded-md bg-primary px-5 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90 disabled:cursor-default disabled:opacity-50"
                  >
                    Start Work
                  </button>
                ) : (
                  <button type="button" data-testid={`cockpit-action-${dominantPrimaryAction}`} data-cockpit-priority="primary" disabled={busy}
                    onClick={() => clickAction(dominantPrimaryAction!)}
                    className="inline-flex h-11 w-fit items-center justify-center rounded-md bg-primary px-5 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90 disabled:cursor-default disabled:opacity-50">
                    {dominantPrimaryAction! === "APPROVE" ? approveActionLabel(top.status) : ACTION_LABEL[dominantPrimaryAction!] ?? dominantPrimaryAction}
                  </button>
                )}
              </div>
            )}
            {(demotedPrimary.length > 0 || secondaryVisible.length > 0) && (
              <div className="flex flex-col gap-1.5">
                {(dominantIsStartWork || dominantPrimaryAction) && (
                  <span className="text-xs text-muted-foreground">Other options</span>
                )}
                <div className="flex flex-wrap gap-2">
                  {demotedPrimary.map((a) => (
                    <button key={a} type="button" data-testid={`cockpit-action-${a}`} data-cockpit-priority="primary" disabled={busy}
                      onClick={() => clickAction(a)}
                      className="inline-flex h-9 items-center justify-center rounded-md border border-border bg-background px-3.5 text-sm font-medium text-foreground transition-colors hover:bg-muted disabled:cursor-default disabled:opacity-50">
                      {a === "APPROVE" ? approveActionLabel(top.status) : ACTION_LABEL[a] ?? a}
                    </button>
                  ))}
                  {secondaryVisible.map((a) => (
                    <button key={a} type="button" data-testid={`cockpit-action-${a}`} data-cockpit-priority="secondary" disabled={busy}
                      onClick={() => clickAction(a)}
                      className="inline-flex h-9 items-center justify-center rounded-md border border-border bg-background px-3.5 text-sm font-medium text-foreground transition-colors hover:bg-muted disabled:cursor-default disabled:opacity-50">
                      {a === "APPROVE" ? approveActionLabel(top.status) : ACTION_LABEL[a] ?? a}
                    </button>
                  ))}
                </div>
              </div>
            )}
            {secondaryMore.length > 0 && (
              <details data-testid="cockpit-more-actions">
                <summary className="cursor-pointer text-xs text-muted-foreground">{secondaryMore.length} more action(s)</summary>
                <div className="mt-2 flex flex-wrap gap-2">
                  {secondaryMore.map((a) => (
                    <button key={a} type="button" data-testid={`cockpit-action-${a}`} disabled={busy}
                      onClick={() => clickAction(a)}
                      className="inline-flex h-9 items-center justify-center rounded-md border border-border bg-background px-3.5 text-sm font-medium text-foreground transition-colors hover:bg-muted disabled:cursor-default disabled:opacity-50">
                      {a === "APPROVE" ? approveActionLabel(top.status) : ACTION_LABEL[a] ?? a}
                    </button>
                  ))}
                </div>
              </details>
            )}
            {/* Labelled inline input — replaces window.prompt(). */}
            {pending && (
              <div data-testid="cockpit-action-form" style={{ border: "1px solid var(--border)", background: "var(--card)", borderRadius: 8, padding: 12, display: "flex", flexDirection: "column", gap: 8 }}>
                <span style={{ fontSize: 13, fontWeight: 600 }}>{ACTION_LABEL[pending] ?? pending}</span>
                {needsEvidence(pending) && (
                  <label style={{ fontSize: 12, color: "var(--muted-foreground)" }}>
                    Evidence reference(s), comma-separated{pending === "SUBMIT_EVIDENCE" ? " (required)" : ""}
                    {/* Makes the count-of-evidence requirement visible before the owner submits, instead of a
                        confusing 400 after Confirm. Some routes (e.g. an SOP/checklist change) require more than
                        one distinct evidence item -- one per line below -- and evidence already on file (from an
                        earlier Submit evidence step) counts toward that total, so completing here never requires
                        re-entering it. */}
                    {pending === "COMPLETE" && (() => {
                      const requiredCount = top.requiredEvidence.length > 0 ? top.requiredEvidence.length : 1;
                      const already = top.evidenceRefs.length;
                      const remaining = Math.max(0, requiredCount - already);
                      return (
                        <span data-testid="cockpit-evidence-required-hint" style={{ display: "block", fontWeight: 400, marginTop: 2 }}>
                          {already > 0
                            ? remaining > 0
                              ? `${already} evidence item(s) already on file. Add at least ${remaining} more to complete: ${top.requiredEvidence.slice(already).join("; ") || "additional evidence the action was carried out"}.`
                              : `${already} evidence item(s) already on file — that already satisfies completion; you don't need to add more here.`
                            : `Requires ${requiredCount} evidence item(s) — one entry per requirement: ${top.requiredEvidence.join("; ") || "evidence the action was carried out"}.`}
                        </span>
                      );
                    })()}
                    <input data-testid="cockpit-evidence-input" value={evidenceText} onChange={(e) => setEvidenceText(e.target.value)}
                      style={{ display: "block", width: "100%", marginTop: 4, padding: "6px 8px", border: "1px solid var(--border)", borderRadius: 6, fontSize: 13, background: "var(--background)", color: "var(--foreground)" }} />
                  </label>
                )}
                {needsReason(pending) && (
                  <label style={{ fontSize: 12, color: "var(--muted-foreground)" }}>
                    Reason (optional)
                    <input data-testid="cockpit-reason-input" value={reasonText} onChange={(e) => setReasonText(e.target.value)}
                      style={{ display: "block", width: "100%", marginTop: 4, padding: "6px 8px", border: "1px solid var(--border)", borderRadius: 6, fontSize: 13, background: "var(--background)", color: "var(--foreground)" }} />
                  </label>
                )}
                {isDelegate(pending) && (
                  <label style={{ fontSize: 12, color: "var(--muted-foreground)" }}>
                    Delegate to
                    <select data-testid="cockpit-delegate-select" value={delegateRole} onChange={(e) => setDelegateRole(e.target.value as "MANAGER" | "STAFF")}
                      style={{ display: "block", marginTop: 4, padding: "6px 8px", border: "1px solid var(--border)", borderRadius: 6, fontSize: 13, background: "var(--background)", color: "var(--foreground)" }}>
                      <option value="MANAGER">Manager</option>
                      <option value="STAFF">Staff</option>
                    </select>
                  </label>
                )}
                <div className="flex gap-2">
                  <button type="button" data-testid="cockpit-confirm" disabled={busy} onClick={() => submit(pending)}
                    className="inline-flex h-9 items-center justify-center rounded-md bg-primary px-3.5 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:cursor-default disabled:opacity-50">Confirm</button>
                  <button type="button" data-testid="cockpit-cancel" onClick={() => setPending(null)}
                    className="inline-flex h-9 items-center justify-center rounded-md border border-border bg-card px-3.5 text-sm font-medium text-foreground transition-colors hover:bg-muted">Cancel</button>
                </div>
              </div>
            )}
          </div>
        )}
        {terminal && <p data-testid="cockpit-terminal" style={{ fontSize: 12, color: "var(--success-text)" }}>This task is {STATUS_LABEL[top.status] ?? top.status.toLowerCase()}.</p>}

        {/* Start Work (canStart=true tasks, Phase 2 Signal F) now renders inside "5. Safe Actions"
            above as the dominant recommended button when onAction is provided. When onAction is
            absent (a read-only render) there is no action-buttons block above to hold it, so it
            still needs its own slot here -- same button, same testid, same handler. */}
        {!onAction && top.canStart && onStartWork && (
          <div>
            <button
              type="button"
              data-testid={`cockpit-start-work-${top.taskKey}`}
              disabled={busy}
              onClick={() => onStartWork(top.taskKey)}
              className="inline-flex h-9 items-center justify-center rounded-md bg-primary px-3.5 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:cursor-default disabled:opacity-50"
            >
              Start Work
            </button>
          </div>
        )}

        {/* 3/4/7. Required Owner Decision, Evidence Required, Next Reassessment — the governance
            mechanics behind the plain-language summary and actions above. Progressively disclosed
            per the redesign's "show the answer, then the mechanism" principle: a lay owner reads
            the summary and acts; the underlying evidence/approval/reassessment contract is one
            click away for whoever wants it, not competing with the primary read. */}
        <Disclosure summary="Why this is required, and what happens next">
          <div className="flex flex-col gap-3">
            <div data-testid="cockpit-owner-decision" className="flex flex-wrap items-center gap-2">
              <span className="text-sm font-medium text-foreground">Required owner decision:</span>
              <Badge variant={isOwner ? "destructive-accessible" : "default-accessible"}>{APPROVAL_LABEL[top.approvalLevel] ?? top.approvalLevel}</Badge>
              {isOwner && <span data-testid="cockpit-cannot-automate" className="text-xs text-destructive">This cannot be automated.</span>}
            </div>

            {!isBlockedUnsafe && !isMonitorOnly && (
              <div data-testid="cockpit-evidence" className="text-sm">
                <span className="font-medium text-foreground">Evidence required before completion.</span>{" "}
                <span className="text-muted-foreground">{top.requiredEvidence.length ? top.requiredEvidence.join("; ") : "—"}</span>
              </div>
            )}

            <div data-testid="cockpit-reassessment" className="text-sm text-muted-foreground">
              <span className="font-medium text-muted-foreground">Completion will trigger reassessment.</span>{" "}
              {top.reassessmentTrigger}
            </div>
          </div>
        </Disclosure>

        {stepConditions.length > 0 && (
          <div data-testid="cockpit-step-conditions" className="border-t border-border pt-2.5">
            <span className="text-sm font-medium text-foreground">How to carry out your next steps</span>
            <ul className="mt-1 list-disc space-y-0.5 pl-[18px]">
              {stepConditions.slice(0, 3).map((c, i) => (
                <li key={i} style={{ fontSize: 13 }}>{c}</li>
              ))}
            </ul>
          </div>
        )}

        {/* 6. Blocked / Not Allowed */}
        <div data-testid="cockpit-blocked" className="border-t border-border pt-2.5">
          <span className="text-sm font-medium text-foreground">Blocked / not allowed</span>
          {isBlockedUnsafe ? (
            <p data-testid="cockpit-blocked-unsafe" style={{ margin: "4px 0 0", fontSize: 13, color: "var(--warning-text)" }}>
              No action is available because this would require an unsafe external step.
              {top.notActionableReason ? ` ${top.notActionableReason}` : ""}
            </p>
          ) : isMonitorOnly ? (
            <p data-testid="cockpit-monitor-note" className="mt-1 text-sm text-muted-foreground">
              This is monitor-only because no safe action is needed.
              {top.notActionableReason ? ` ${top.notActionableReason}` : ""}
            </p>
          ) : actionsToAvoid.length > 0 ? (
            <ul className="mt-1 list-disc space-y-0.5 pl-[18px]">
              {actionsToAvoid.slice(0, 3).map((a, i) => (
                <li key={i} data-testid="cockpit-avoid" style={{ fontSize: 13, color: "var(--warning-text)" }}>{a}</li>
              ))}
            </ul>
          ) : (
            <p className="mt-1 text-sm text-muted-foreground">
              OpsIQ never takes an external action for you. It won&apos;t contact customers, submit tenders,
              spend, discount, or contract on its own.
            </p>
          )}
        </div>
      </div>

      {/* 8. Secondary Actions (collapsed) */}
      <details data-testid="cockpit-secondary-group" style={{ borderTop: "1px solid var(--border)", paddingTop: 14, paddingBottom: 2 }}>
        <summary style={{ cursor: "pointer", fontSize: 13.5, fontWeight: 500, color: "var(--foreground)" }}>
          Other actions{secondaryRoutes.length ? ` (${secondaryRoutes.length})` : ""}
        </summary>
        {secondaryRoutes.length === 0 ? (
          <p style={{ margin: "8px 0 0", fontSize: 13, color: "var(--muted-foreground)" }}>No other governed actions right now.</p>
        ) : (
          <ul style={{ margin: "8px 0 0", paddingLeft: 0, listStyle: "none", display: "flex", flexDirection: "column", gap: 6 }}>
            {secondaryRoutes.slice(0, 3).map((r) => (
              <li key={r.taskKey} data-testid="cockpit-secondary-item" style={{ fontSize: 13, display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                <Badge variant="muted-accessible">{ROUTE_LABEL[r.executionRoute] ?? r.executionRoute}</Badge>
                <span>{r.ownerVisibleSummary}</span>
              </li>
            ))}
            {secondaryRoutes.length > 3 && <li style={{ fontSize: 12, color: "var(--muted-foreground)" }}>+{secondaryRoutes.length - 3} more</li>}
          </ul>
        )}
      </details>

      {/* 9. Monitor-only (collapsed) */}
      <details data-testid="cockpit-monitor-group" style={{ borderTop: "1px solid var(--border)", paddingTop: 14, paddingBottom: 2 }}>
        <summary style={{ cursor: "pointer", fontSize: 13.5, fontWeight: 500, color: "var(--foreground)" }}>
          Monitor only{monitorRoutes.length ? ` (${monitorRoutes.length})` : ""}
        </summary>
        {monitorRoutes.length === 0 ? (
          <p style={{ margin: "8px 0 0", fontSize: 13, color: "var(--muted-foreground)" }}>Nothing to monitor right now.</p>
        ) : (
          <ul style={{ margin: "8px 0 0", paddingLeft: 0, listStyle: "none", display: "flex", flexDirection: "column", gap: 6 }}>
            {monitorRoutes.slice(0, 3).map((r) => (
              <li key={r.taskKey} data-testid="cockpit-monitor-item" style={{ fontSize: 13, color: "var(--muted-foreground)" }}>{r.ownerVisibleSummary}</li>
            ))}
            {monitorRoutes.length > 3 && <li style={{ fontSize: 12, color: "var(--muted-foreground)" }}>+{monitorRoutes.length - 3} more</li>}
          </ul>
        )}
      </details>


      {/*
        Also worth knowing — Goal / Profit leak / Operating policies / Trend alerts / Do-not-repeat /
        Escalations (Phase 2 Signals A-G) used to each render as their own full-width bold-headed,
        border-divided section — six competing "modules" stacked under the one real priority above.
        Every one of these can carry real, currently-true content the owner must be able to see
        without an extra click (tests/browser/46-owner-cockpit.spec.ts specs 8-11 assert
        toBeVisible() on each, not just DOM presence), so none of it is hidden behind a closed
        <details> here — only compacted into one shared, quietly-labelled strip instead of six.
        Same data, same conditions, same testids; only the surrounding chrome changed.
      */}
      {/* Trend alerts and Escalations always render below (no conditional guard in the original
          markup either), so this wrapper is unconditional too. */}
      <div className="border-t border-border pt-3.5 flex flex-col gap-3">
        <span className="text-xs font-semibold uppercase tracking-[0.08em] text-muted-foreground">Also worth knowing</span>

          {/* Goal Attention Signal — Phase 2 Signal A */}
          {goalAttentionSignal && <GoalAttentionSection signal={goalAttentionSignal} />}

          {/* Profit Leak — Phase 2 Signal B. identifyProfitLeaks() (domain/owner-mode/profit-leak-radar.ts)
              always returns a non-null topLeak, falling back to a leakType: "DATA_INSUFFICIENT"
              placeholder when no real leak condition fired -- so `topProfitLeak` alone is truthy in
              both cases and cannot be used to decide whether a leak was actually detected. The
              heading and the "Area" line (a real business area is meaningless for the placeholder,
              whose domain is the literal string "data") are gated on the same leakType check
              business-control-slo.ts already uses for this exact distinction; the impact figure and
              ownerExplanation continue to render exactly as before for every case. */}
          {topProfitLeak && (
            <div data-testid="cockpit-profit-leak-section" className="flex flex-col gap-1">
              <span className="text-sm font-medium text-foreground">
                {topProfitLeak.leakType === "DATA_INSUFFICIENT" ? "No profit leak detected yet" : "Profit leak detected"}
              </span>
              <div style={{ fontSize: 13, display: "flex", flexDirection: "column", gap: 2 }}>
                {topProfitLeak.leakType !== "DATA_INSUFFICIENT" && (
                  <span data-testid="cockpit-profit-leak-area" style={{ color: "var(--muted-foreground)" }}>Area: {topProfitLeak.domain}</span>
                )}
                {topProfitLeak.estimatedImpact.rangeLow !== undefined && (
                  <span data-testid="cockpit-profit-leak-impact" style={{ color: "var(--destructive)" }}>
                    Estimated impact: {topProfitLeak.estimatedImpact.rangeLow.toLocaleString()}
                    {topProfitLeak.estimatedImpact.rangeHigh !== undefined ? ` – ${topProfitLeak.estimatedImpact.rangeHigh.toLocaleString()}` : ""}
                  </span>
                )}
                {topProfitLeak.ownerExplanation && (
                  <span style={{ color: "var(--muted-foreground)", fontStyle: "italic" }}>{topProfitLeak.ownerExplanation}</span>
                )}
              </div>
            </div>
          )}

          {/* Policy Attention Signal — Phase 2 Signal C */}
          {policyAttentionSignal && (
            <div data-testid="cockpit-policy-section" className="flex flex-col gap-1">
              <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                <span className="text-sm font-medium text-foreground">Operating policies</span>
                <span data-testid="cockpit-policy-triggered-blocks" style={{ fontSize: 12, color: policyAttentionSignal.triggeredBlockCount > 0 ? "var(--destructive)" : "var(--muted-foreground)", fontWeight: policyAttentionSignal.triggeredBlockCount > 0 ? 600 : 400 }}>
                  {policyAttentionSignal.triggeredBlockCount} blocked
                </span>
                <span data-testid="cockpit-policy-triggered-warnings" style={{ fontSize: 12, color: policyAttentionSignal.triggeredWarningCount > 0 ? "var(--warning-text)" : "var(--muted-foreground)" }}>
                  {policyAttentionSignal.triggeredWarningCount} warning{policyAttentionSignal.triggeredWarningCount !== 1 ? "s" : ""}
                </span>
              </div>
              <ul style={{ margin: 0, paddingLeft: 0, listStyle: "none", display: "flex", flexDirection: "column", gap: 4 }}>
                {policyAttentionSignal.details.map((d, i) => (
                  <li key={d.policyKey} data-testid={`cockpit-policy-detail-${i}`} style={{ fontSize: 13, display: "flex", gap: 8, alignItems: "center" }}>
                    <Badge variant={d.decision === "BLOCK" ? "destructive-accessible" : d.decision === "WARN" ? "warning-accessible" : "muted-accessible"}>
                      {POLICY_DECISION_LABEL[d.decision] ?? d.decision}
                    </Badge>
                    <span style={{ color: "var(--muted-foreground)" }}>{d.label}</span>
                    {d.hasActiveOverride && <span style={{ color: "var(--muted-foreground)", fontSize: 12 }}>(override active)</span>}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Trend Alerts — Phase 2 Signal D */}
          <div data-testid="cockpit-trend-alerts-section" className="flex flex-col gap-1">
            <span className="text-sm font-medium text-foreground">Trend alerts</span>
            {trendAlerts === null || trendAlerts === undefined ? (
              <p data-testid="cockpit-trend-alerts-state" data-cockpit-trend-alerts-state="INSUFFICIENT_DATA" style={{ margin: 0, fontSize: 13, color: "var(--muted-foreground)" }}>
                Not enough metric history yet for trend alerts. Record at least two periods.
              </p>
            ) : trendAlerts.length === 0 ? (
              <p style={{ margin: 0, fontSize: 13, color: "var(--success-text)" }}>No trend alerts — metrics moving in a healthy direction.</p>
            ) : (
              <ul style={{ margin: 0, paddingLeft: 0, listStyle: "none", display: "flex", flexDirection: "column", gap: 6 }}>
                {trendAlerts.map((alert, i) => (
                  <li key={alert.alertType} data-testid={`cockpit-trend-alert-${i}`} style={{ fontSize: 13, display: "flex", gap: 8, alignItems: "flex-start", flexWrap: "wrap" }}>
                    <Badge data-testid={`cockpit-trend-alert-${i}-severity`} variant={alert.severity === "critical" ? "destructive-accessible" : "warning-accessible"}>
                      {severityLabel(alert.severity)}
                    </Badge>
                    <span style={{ color: "var(--muted-foreground)" }}>{alert.description}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>

          {/* Do-Not-Repeat Annotation — Phase 2 Signal E. Its own hardcoded amber box (background,
              border, text colors) is a deliberate, separately-locked-in "bucket 3, self-consistent"
              exception (visual-system-p0-contrast-regression.test.ts / -semantic-color-closure.test.ts)
              from an earlier design pass -- left untouched here; only its position moved into this
              shared strip. */}
          {doNotRepeatAnnotation?.blocked && (
            <div data-testid="cockpit-dnr-section" style={{ border: "1px solid #fef3c7", borderRadius: 8, padding: "10px 14px", background: "#fffbeb" }}>
              <span style={{ fontSize: 14, fontWeight: 600, color: "#92400e" }}>{doNotRepeatAnnotation.holdsBackTarget || doNotRepeatAnnotation.issueStaysOpen ? "Do not repeat" : "Earlier result in this area"}</span>
              {doNotRepeatAnnotation.areaOnly && !doNotRepeatAnnotation.holdsBackTarget && (
                <p data-testid="cockpit-dnr-area-history" style={{ margin: "4px 0 0", fontSize: 12, color: "#92400e" }}>
                  This is history from the same area, not a verdict on your main target. Do not repeat the approach that failed.
                </p>
              )}
              {(doNotRepeatAnnotation.holdsBackTarget || doNotRepeatAnnotation.issueStaysOpen) && (
                <p data-testid="cockpit-dnr-holds" style={{ margin: "4px 0 0", fontSize: 12, color: "#92400e" }}>
                  {doNotRepeatAnnotation.issueStaysOpen
                    ? "This rule holds back repeating the earlier step, not the problem: the problem is still open, so respond to it another way or record what has changed."
                    : doNotRepeatAnnotation.areaOnly
                      ? "This rule holds back new growth steps in this area until you record what has changed."
                      : "This rule holds back repeating this step until you record what has changed."}{" "}
                  <a href={doNotRepeatAnnotation.ruleId ? `#dnr-rule-${doNotRepeatAnnotation.ruleId}` : "#do-not-repeat-rules"} style={{ textDecoration: "underline" }}>Do-not-repeat rules</a>
                </p>
              )}
              <p data-testid="cockpit-dnr-prior-action" style={{ margin: "6px 0 0", fontSize: 13, color: "#374151" }}>
                {doNotRepeatAnnotation.priorActionSummary}
              </p>
              <p data-testid="cockpit-dnr-reason" style={{ margin: "4px 0 0", fontSize: 13, color: "#92400e" }}>
                {doNotRepeatAnnotation.blockedReason}
              </p>
              {doNotRepeatAnnotation.legacyMatch && (
                <p style={{ margin: "4px 0 0", fontSize: 11, color: "#6b7280", fontStyle: "italic" }}>Matched by area scope (informational).</p>
              )}
            </div>
          )}

          {/* Active Escalations — Phase 2 Signal G */}
          <div data-testid="cockpit-escalations-section" className="flex flex-col gap-1">
            <span className="text-sm font-medium text-foreground">Escalations</span>
            {activeEscalations === null || activeEscalations === undefined ? (
              <p style={{ margin: 0, fontSize: 13, color: "var(--muted-foreground)" }}>Escalation data unavailable.</p>
            ) : activeEscalations.length === 0 ? (
              <p data-testid="cockpit-escalations-state" data-cockpit-escalations-state="NONE" style={{ margin: 0, fontSize: 13, color: "var(--success-text)" }}>No open escalations.</p>
            ) : (
              <ul style={{ margin: 0, paddingLeft: 0, listStyle: "none", display: "flex", flexDirection: "column", gap: 8 }}>
                {activeEscalations.map((esc) => (
                  <li key={esc.id} data-testid={`cockpit-escalation-${esc.id}`} style={{ fontSize: 13, display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                    <Badge variant={esc.severity === "CRITICAL" ? "destructive-accessible" : "warning-accessible"}>{severityLabel(esc.severity)}</Badge>
                    <span style={{ color: "var(--muted-foreground)", flex: 1 }}>{esc.title}</span>
                    {onAcknowledgeEscalation && (
                      <button
                        type="button"
                        data-testid={`cockpit-escalation-ack-${esc.id}`}
                        onClick={() => onAcknowledgeEscalation(esc.id)}
                        style={{ fontSize: 12, padding: "4px 10px", borderRadius: 4, border: "1px solid var(--border)", background: "var(--card)", color: "var(--foreground)", cursor: "pointer" }}
                      >
                        Acknowledge
                      </button>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </div>
      </div>

      {/* Recovery status — read-only, collapsed low-load summary (PASS 37). */}
      {recovery && <RecoverySection recovery={recovery} ownerDecision={ownerDecision} />}

      {/* Outside signals — read-only, collapsed low-load public-signal summary (PASS 39). */}
      {publicSignals && <OutsideSignalsSection signals={publicSignals} />}

      {/* Business condition — read-only, derived risk-dimension panel (Phase 1 Reality Engine). */}
      {businessCondition && <BusinessConditionSection condition={businessCondition} dataFreshnessWeak={dataFreshnessWeak} />}

      {/* Phase 3 — Execution lifecycle (collapsed by default). Server-computed can* booleans drive visibility. */}
      {executionLifecycle && <ExecutionLifecycleSection lifecycle={executionLifecycle} onAction={onAction} busy={busy} activeBusinessId={activeBusinessId} />}

      {/* Phase 4 — Business Operating System summary (collapsed, read-only). */}
      {businessOperatingSystem && <BusinessOperatingSystemSection bos={businessOperatingSystem} />}

      {/* 10. Proof / Audit details (collapsed drawer) */}
      <details data-testid="cockpit-proof-drawer" style={{ borderTop: "1px solid var(--border)", paddingTop: 14, paddingBottom: 2 }}>
        <summary style={{ cursor: "pointer", fontSize: 13.5, fontWeight: 500, color: "var(--foreground)" }}>View proof &amp; details</summary>
        <div style={{ marginTop: 8, fontSize: 12, color: "var(--muted-foreground)", display: "flex", flexDirection: "column", gap: 6 }}>
          <span><strong>Done when:</strong> {top.completionCriteria}</span>
          {top.evidenceRefs.length > 0
            ? <span data-testid="cockpit-proof-refs" style={{ wordBreak: "break-all" }}>Evidence: {top.evidenceRefs.slice(0, 8).join(", ")}</span>
            : <span data-testid="cockpit-proof-none">No evidence submitted yet.</span>}
          <span>Status: {STATUS_LABEL[top.status] ?? top.status}</span>
        </div>
      </details>
    </section>
  );
}

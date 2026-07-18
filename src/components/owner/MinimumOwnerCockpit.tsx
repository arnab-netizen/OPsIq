"use client";

/**
 * MinimumOwnerCockpit (PASS 36) — the canonical minimum owner cockpit surface for the PROVEN governed
 * execution loop. Prop-driven; NO business logic and NO data fetching here. It renders the single top
 * bridged action the server already computed (from the process-execution bridge), in the 10-section
 * safety layout defined by docs/audits/2026-07-07-owner-ui-capability-exposure/MINIMUM_OWNER_COCKPIT_SPEC.md:
 *
 *   1. Top Priority Action   2. Why This Is First   3. Required Owner Decision   4. Evidence Required
 *   5. Safe Actions          6. Blocked / Not Allowed 7. Next Reassessment
 *   8. Secondary Actions (collapsed) 9. Monitor-only (collapsed) 10. Proof / Audit (collapsed drawer)
 *
 * Anti-overload: exactly one top action by default; ≤3 reason bullets; ≤2 primary buttons; ≤3 secondary
 * controls; everything else collapsed. No raw signal dump, no raw audit log, no hidden score, no fabricated
 * money. Owner action inputs use labelled controls — never window.prompt(). The server re-checks every action.
 */

import { useState } from "react";
import { Badge } from "@/ui/primitives";
import type { BridgedRouteView, ProcessExecutionBridgeView } from "@/components/owner/ProcessIntelligencePanel";
import type { OwnerRecoveryStatusResponse } from "@/domain/owner-mode/owner-recovery-status";
import type { OwnerPublicSignalsResponse } from "@/domain/owner-mode/owner-public-signals";
import type { DerivedBusinessConditionSignals } from "@/services/business-condition/business-condition-profile.service";
import type { GoalAttentionSignal, PolicyAttentionSignal, EscalationAttentionItem, DoNotRepeatAnnotation, OwnerExecutionLifecycleView, ExecutionLifecycleItem } from "@/services/owner-guidance/owner-now-view.service";
import type { ProfitLeakFinding } from "@/domain/owner-mode/profit-leak-radar";
import type { TrendAlert } from "@/domain/owner-mode/business-state-timeline";

const APPROVAL_LABEL: Record<string, string> = {
  OWNER_APPROVAL_REQUIRED: "Owner approval required",
  NEVER_AUTO: "Owner only — cannot be automated",
  MANAGER_APPROVAL_REQUIRED: "Manager approval required",
  STAFF_LEVEL: "Staff-level action",
  OWNER: "Owner approval required", MANAGER: "Manager approval required", STAFF: "Staff-level action",
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
const SEVERITY_VARIANT = (s: string): "destructive" | "warning" | "default" | "muted" =>
  s === "CRITICAL" || s === "HIGH" ? "destructive" : s === "MEDIUM" ? "warning" : "default";

const PRIMARY_ACTIONS = ["APPROVE", "COMPLETE", "START"] as const;

/** Interactive actions valid for a route, mirroring the server guardrails so the UI never OFFERS an
 *  impossible/unsafe transition. The server still re-checks every one. */
export function allowedCockpitActions(r: BridgedRouteView): string[] {
  const terminal = r.status === "COMPLETED" || r.status === "REJECTED";
  const nonActionable = r.executionRoute === "MONITOR_ONLY" || r.executionRoute === "BLOCK_UNSAFE_ACTION";
  const ownerOnly = r.approvalLevel === "OWNER_APPROVAL_REQUIRED" || r.approvalLevel === "NEVER_AUTO";
  if (nonActionable) return terminal ? [] : ["REQUEST_MISSING_DATA", "REQUEST_REASSESSMENT"];
  if (terminal) return ["REQUEST_REASSESSMENT"];
  const out: string[] = [];
  if (["PROPOSED", "NEEDS_DATA", "BLOCKED"].includes(r.status)) out.push("START");
  if (ownerOnly && ["PROPOSED", "IN_PROGRESS"].includes(r.status)) out.push("APPROVE");
  if (!ownerOnly && ["PROPOSED", "IN_PROGRESS"].includes(r.status)) out.push("DELEGATE");
  out.push("SUBMIT_EVIDENCE", "COMPLETE", "REJECT");
  if (r.status !== "BLOCKED") out.push("MARK_BLOCKED");
  out.push("REQUEST_REASSESSMENT");
  return out;
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
    <details data-testid="cockpit-signals-group" style={{ border: "1px solid #e5e7eb", borderRadius: 8, padding: "10px 14px" }}>
      <summary style={{ cursor: "pointer", fontSize: 14, fontWeight: 600 }}>
        Outside signals
        <span style={{ fontWeight: 400, color: "#6b7280" }}> — {PUBLIC_SIGNAL_STATUS_LABEL[signals.publicSignalStatus] ?? signals.publicSignalStatus}</span>
      </summary>
      <div style={{ marginTop: 8, display: "flex", flexDirection: "column", gap: 6, fontSize: 13 }}>
        {!active ? (
          <p style={{ margin: 0, color: "#6b7280" }} data-testid="cockpit-signals-none">No outside signals for this workspace right now.</p>
        ) : (
          <>
            {signals.topPublicSignalAction && (
              <p style={{ margin: 0 }} data-testid="cockpit-signals-action"><strong>Next step:</strong> {signals.topPublicSignalAction}</p>
            )}
            <p style={{ margin: 0, color: "#374151" }} data-testid="cockpit-signals-why">{signals.whyThisMatters}</p>
            <p style={{ margin: 0, color: "#6b7280" }} data-testid="cockpit-signals-quality">
              Source quality: {signals.sourceQualitySummary} · Evidence: {signals.evidenceStrengthSummary}
            </p>
            {signals.missingData.length > 0 && (
              <p style={{ margin: 0, color: "#b45309" }} data-testid="cockpit-signals-missing">Missing data: {signals.missingData.slice(0, 3).join("; ")}</p>
            )}
            {signals.validationRequired && (
              <p style={{ margin: 0, color: "#b45309" }} data-testid="cockpit-signals-validation">Public signals are unverified until validated.</p>
            )}
            {signals.blockedUnsafeActions.length > 0 && (
              <p style={{ margin: 0, color: "#b45309" }} data-testid="cockpit-signals-blocked">Blocked: {signals.blockedUnsafeActions.slice(0, 2).join("; ")}</p>
            )}
            {signals.ownerApprovalRequired && (
              <p style={{ margin: 0, color: "#b91c1c" }} data-testid="cockpit-signals-approval">Owner approval is required before material action.</p>
            )}
          </>
        )}
        <p style={{ margin: "2px 0 0", color: "#6b7280", fontStyle: "italic" }} data-testid="cockpit-signals-noingest">{signals.noLiveIngestionStatement}</p>
        <p style={{ margin: 0, color: "#6b7280", fontStyle: "italic" }} data-testid="cockpit-signals-caveat">{signals.uncertaintyCaveat}</p>
      </div>
    </details>
  );
}

const RISK_VARIANT = (level: string): "destructive" | "warning" | "default" | "muted" =>
  level === "CRITICAL" || level === "HIGH" ? "destructive"
  : level === "MEDIUM" ? "warning"
  : level === "LOW" || level === "HIGH" ? "default"
  : "muted";

const RISK_LEVEL_LABEL: Record<string, string> = {
  CRITICAL: "Critical", HIGH: "High", MEDIUM: "Medium", LOW: "Low",
  BLOCKED: "Blocked", HIGH_GROWTH: "Growth-ready", unknown: "—",
};

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

const VERIFICATION_CLASS_VARIANT = (c: string): "destructive" | "warning" | "default" | "muted" =>
  c === "SUCCESS" ? "default"
  : c === "FAILURE" || c === "NEGATIVE_IMPACT" ? "destructive"
  : c === "PARTIAL_SUCCESS" ? "warning"
  : "muted";

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
}: {
  lifecycle: OwnerExecutionLifecycleView;
  onAction?: (taskKey: string, action: string, input: CockpitActionInput) => void;
  busy?: boolean;
}) {
  const [pending, setPending] = useState<{ taskKey: string; action: string } | null>(null);
  const [progressPct, setProgressPct] = useState("");
  const [stage, setStage] = useState("");
  const [outcomeStatus, setOutcomeStatus] = useState("worked");
  const [reason, setReason] = useState("");

  const resetForm = () => { setPending(null); setProgressPct(""); setStage(""); setOutcomeStatus("worked"); setReason(""); };

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
      style={{ fontSize: 13, display: "flex", flexDirection: "column", gap: 6, paddingBottom: 8, borderBottom: "1px solid #f3f4f6" }}>
      <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
        <Badge variant={SEVERITY_VARIANT(item.severity)}>{item.severity}</Badge>
        <span style={{ fontWeight: 600 }}>{item.ownerVisibleSummary}</span>
        <span style={{ color: "#6b7280", fontSize: 12 }}>{item.status}</span>
      </div>
      {item.verificationClassification && (
        <span data-testid={`cockpit-verification-classification-${item.taskKey}`}>
          <Badge variant={VERIFICATION_CLASS_VARIANT(item.verificationClassification)}>
            {VERIFICATION_CLASS_LABEL[item.verificationClassification] ?? item.verificationClassification}
          </Badge>
        </span>
      )}
      {item.progressPct !== null && (
        <span style={{ fontSize: 12, color: "#6b7280" }}>Progress: {item.progressPct}%{item.blockerActive ? " — Blocked" : ""}</span>
      )}
      {item.expectedBenefit && (
        <span style={{ fontSize: 12, color: "#374151" }}>Expected benefit: {item.expectedBenefit}</span>
      )}
      {!item.evidenceComplete && item.requiredEvidence.length > 0 && (
        <span style={{ fontSize: 12, color: "#b45309" }}>Evidence needed: {item.requiredEvidence.join("; ")}</span>
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
              style={{ fontSize: 12, padding: "4px 10px", borderRadius: 6, border: "1px solid #d1d5db", background: "#fff", cursor: busy ? "default" : "pointer" }}>
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
        <div data-testid="cockpit-phase3-action-form" style={{ border: "1px solid #e5e7eb", borderRadius: 8, padding: 10, display: "flex", flexDirection: "column", gap: 6 }}>
          <span style={{ fontSize: 12, fontWeight: 600 }}>{ACTION_LABEL[pending.action] ?? pending.action}</span>
          {pending.action === "RECORD_PROGRESS" && (
            <>
              <label style={{ fontSize: 12, color: "#374151" }}>
                Progress % (0–100, optional)
                <input type="number" min={0} max={100} value={progressPct}
                  onChange={(e) => setProgressPct(e.target.value)} data-testid="cockpit-progress-pct-input"
                  style={{ display: "block", width: "100%", marginTop: 4, padding: "4px 8px", border: "1px solid #d1d5db", borderRadius: 4, fontSize: 12 }} />
              </label>
              <label style={{ fontSize: 12, color: "#374151" }}>
                Stage label (optional)
                <input type="text" value={stage}
                  onChange={(e) => setStage(e.target.value)} data-testid="cockpit-stage-input"
                  style={{ display: "block", width: "100%", marginTop: 4, padding: "4px 8px", border: "1px solid #d1d5db", borderRadius: 4, fontSize: 12 }} />
              </label>
              <label style={{ fontSize: 12, color: "#374151" }}>
                Note (optional)
                <input type="text" value={reason}
                  onChange={(e) => setReason(e.target.value)} data-testid="cockpit-reason-input"
                  style={{ display: "block", width: "100%", marginTop: 4, padding: "4px 8px", border: "1px solid #d1d5db", borderRadius: 4, fontSize: 12 }} />
              </label>
            </>
          )}
          {pending.action === "RECORD_OUTCOME" && (
            <>
              <label style={{ fontSize: 12, color: "#374151" }}>
                Outcome
                <select value={outcomeStatus} onChange={(e) => setOutcomeStatus(e.target.value)}
                  data-testid="cockpit-outcome-status-select"
                  style={{ display: "block", marginTop: 4, padding: "4px 8px", border: "1px solid #d1d5db", borderRadius: 4, fontSize: 12 }}>
                  {OUTCOME_STATUS_OPTIONS.map((o) => (
                    <option key={o.value} value={o.value}>{o.label}</option>
                  ))}
                </select>
              </label>
              <label style={{ fontSize: 12, color: "#374151" }}>
                Outcome notes (optional)
                <input type="text" value={reason}
                  onChange={(e) => setReason(e.target.value)} data-testid="cockpit-reason-input"
                  style={{ display: "block", width: "100%", marginTop: 4, padding: "4px 8px", border: "1px solid #d1d5db", borderRadius: 4, fontSize: 12 }} />
              </label>
            </>
          )}
          {pending.action === "VERIFY_OUTCOME" && (
            <label style={{ fontSize: 12, color: "#374151" }}>
              Verification notes (optional)
              <input type="text" value={reason}
                onChange={(e) => setReason(e.target.value)} data-testid="cockpit-reason-input"
                style={{ display: "block", width: "100%", marginTop: 4, padding: "4px 8px", border: "1px solid #d1d5db", borderRadius: 4, fontSize: 12 }} />
            </label>
          )}
          <div style={{ display: "flex", gap: 6 }}>
            <button type="button" disabled={busy} data-testid="cockpit-phase3-confirm"
              onClick={() => submitPhase3(item.taskKey, pending.action)}
              style={{ fontSize: 12, padding: "4px 10px", borderRadius: 4, border: "1px solid #111827", background: "#111827", color: "#fff", cursor: busy ? "default" : "pointer" }}>
              Confirm
            </button>
            <button type="button" data-testid="cockpit-phase3-cancel" onClick={resetForm}
              style={{ fontSize: 12, padding: "4px 10px", borderRadius: 4, border: "1px solid #d1d5db", background: "#fff", cursor: "pointer" }}>
              Cancel
            </button>
          </div>
        </div>
      )}
    </li>
  );

  const total = lifecycle.requiresDecision.length + lifecycle.inExecution.length + lifecycle.awaitingVerification.length;

  return (
    <details data-testid="cockpit-execution-lifecycle" style={{ border: "1px solid #e5e7eb", borderRadius: 8, padding: "10px 14px" }}>
      <summary style={{ cursor: "pointer", fontSize: 14, fontWeight: 600 }}>
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
          <summary style={{ cursor: "pointer", fontSize: 13, fontWeight: 600, color: "#92400e" }}>
            Requires your decision ({lifecycle.requiresDecision.length})
          </summary>
          {lifecycle.requiresDecision.length === 0
            ? <p style={{ margin: "6px 0 0", fontSize: 12, color: "#6b7280" }}>No tasks awaiting your decision.</p>
            : <ul style={{ margin: "6px 0 0", paddingLeft: 0, listStyle: "none", display: "flex", flexDirection: "column", gap: 6 }}>
                {lifecycle.requiresDecision.map((item, i) => renderItem(item, i, "cockpit-requires-decision"))}
              </ul>}
        </details>
        <details data-testid="cockpit-in-execution-group" open={lifecycle.inExecution.length > 0}
          style={{ borderLeft: "3px solid #dbeafe", paddingLeft: 8 }}>
          <summary style={{ cursor: "pointer", fontSize: 13, fontWeight: 600, color: "#1d4ed8" }}>
            In execution ({lifecycle.inExecution.length})
          </summary>
          {lifecycle.inExecution.length === 0
            ? <p style={{ margin: "6px 0 0", fontSize: 12, color: "#6b7280" }}>No tasks currently in execution.</p>
            : <ul style={{ margin: "6px 0 0", paddingLeft: 0, listStyle: "none", display: "flex", flexDirection: "column", gap: 6 }}>
                {lifecycle.inExecution.map((item, i) => renderItem(item, i, "cockpit-in-execution"))}
              </ul>}
        </details>
        <details data-testid="cockpit-awaiting-verification-group" open={lifecycle.awaitingVerification.length > 0}
          style={{ borderLeft: "3px solid #fde68a", paddingLeft: 8 }}>
          <summary style={{ cursor: "pointer", fontSize: 13, fontWeight: 600, color: "#b45309" }}>
            Awaiting verification ({lifecycle.awaitingVerification.length})
          </summary>
          {lifecycle.awaitingVerification.length === 0
            ? <p style={{ margin: "6px 0 0", fontSize: 12, color: "#6b7280" }}>No tasks awaiting verification.</p>
            : <ul style={{ margin: "6px 0 0", paddingLeft: 0, listStyle: "none", display: "flex", flexDirection: "column", gap: 6 }}>
                {lifecycle.awaitingVerification.map((item, i) => renderItem(item, i, "cockpit-awaiting-verification"))}
              </ul>}
        </details>
        <details data-testid="cockpit-recently-verified-group"
          style={{ borderLeft: "3px solid #d1fae5", paddingLeft: 8 }}>
          <summary style={{ cursor: "pointer", fontSize: 13, fontWeight: 600, color: "#15803d" }}>
            Recently verified ({lifecycle.recentlyVerified.length})
          </summary>
          {lifecycle.recentlyVerified.length === 0
            ? <p style={{ margin: "6px 0 0", fontSize: 12, color: "#6b7280" }}>No recently verified outcomes.</p>
            : <ul style={{ margin: "6px 0 0", paddingLeft: 0, listStyle: "none", display: "flex", flexDirection: "column", gap: 6 }}>
                {lifecycle.recentlyVerified.map((item, i) => renderItem(item, i, "cockpit-recently-verified"))}
              </ul>}
        </details>
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
    <details data-testid="cockpit-business-condition-group" style={{ border: "1px solid #e5e7eb", borderRadius: 8, padding: "10px 14px" }}>
      <summary style={{ cursor: "pointer", fontSize: 14, fontWeight: 600 }}>
        Business condition
        <span style={{ fontWeight: 400, color: "#6b7280" }}> — highest risk: {RISK_LEVEL_LABEL[worstLevel] ?? worstLevel}</span>
      </summary>
      <div style={{ marginTop: 8, display: "flex", flexDirection: "column", gap: 4, fontSize: 13 }}>
        {knownFields.length === 0 ? (
          <p style={{ margin: 0, color: "#6b7280" }} data-testid="cockpit-condition-nodata">No business condition data available yet — add cashflow and workload records to enable this panel.</p>
        ) : (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))", gap: "4px 12px" }}>
            {knownFields.map((k) => (
              <span key={k} style={{ display: "flex", gap: 6, alignItems: "center" }} data-testid={`cockpit-condition-${k}`}>
                <Badge variant={RISK_VARIANT(condition[k])}>{RISK_LEVEL_LABEL[condition[k]] ?? condition[k]}</Badge>
                <span style={{ color: "#374151" }}>{CONDITION_FIELD_LABEL[k]}</span>
              </span>
            ))}
          </div>
        )}
        {unknownCount > 0 && (
          <p style={{ margin: "4px 0 0", fontSize: 12, color: "#6b7280" }} data-testid="cockpit-condition-missing">
            {unknownCount} dimension{unknownCount > 1 ? "s" : ""} need more data to assess.
          </p>
        )}
        {dataFreshnessWeak && (
          <p style={{ margin: "4px 0 0", fontSize: 12, color: "#b45309", fontStyle: "italic" }} data-testid="cockpit-condition-stale">
            Data confidence is low — some signals may be stale. Update cashflow and workload records for a fresh assessment.
          </p>
        )}
      </div>
    </details>
  );
}

/** Read-only recovery status — a concise, collapsed summary (PASS 37). NOT a second cockpit. */
function RecoverySection({ recovery }: { recovery: OwnerRecoveryStatusResponse }) {
  const inProgress = recovery.recoveryStatus !== "NONE";
  return (
    <details data-testid="cockpit-recovery-group" style={{ border: "1px solid #e5e7eb", borderRadius: 8, padding: "10px 14px" }}>
      <summary style={{ cursor: "pointer", fontSize: 14, fontWeight: 600 }}>
        Recovery status
        <span style={{ fontWeight: 400, color: "#6b7280" }}> — {RECOVERY_STATUS_LABEL[recovery.recoveryStatus] ?? recovery.recoveryStatus}</span>
      </summary>
      <div style={{ marginTop: 8, display: "flex", flexDirection: "column", gap: 6, fontSize: 13 }}>
        {!inProgress ? (
          <p style={{ margin: 0, color: "#6b7280" }} data-testid="cockpit-recovery-none">No recovery is in progress right now.</p>
        ) : (
          <>
            <div data-testid="cockpit-recovery-state" style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
              <Badge variant="muted">{RECOVERY_STATUS_LABEL[recovery.recoveryStatus] ?? recovery.recoveryStatus}</Badge>
              <span data-testid="cockpit-recovery-stabilization">Stabilization: {recovery.stabilizationGate}</span>
              <span data-testid="cockpit-recovery-thrive">Growth gate: {recovery.thriveGate}</span>
            </div>
            {recovery.topRecoveryBottleneck && (
              <p style={{ margin: 0 }} data-testid="cockpit-recovery-bottleneck"><strong>Next step:</strong> {recovery.topRecoveryBottleneck}</p>
            )}
            {recovery.requiredEvidence.length > 0 && (
              <p style={{ margin: 0, color: "#6b7280" }} data-testid="cockpit-recovery-evidence">Evidence required: {recovery.requiredEvidence.slice(0, 3).join("; ")}</p>
            )}
            <p style={{ margin: 0, color: "#6b7280" }} data-testid="cockpit-recovery-reassessment">{recovery.requiredReassessment}</p>
            {recovery.blockedUnsafeActions.length > 0 && (
              <p style={{ margin: 0, color: "#b45309" }} data-testid="cockpit-recovery-blocked">Blocked: {recovery.blockedUnsafeActions.slice(0, 2).join("; ")}</p>
            )}
            {recovery.ownerApprovalRequired && (
              <p style={{ margin: 0, color: "#b91c1c" }} data-testid="cockpit-recovery-approval">This action requires owner approval.</p>
            )}
            {recovery.linkedProcessExecutionTaskIds.length > 0 && (
              <p style={{ margin: 0, color: "#6b7280" }} data-testid="cockpit-recovery-linked">{recovery.linkedProcessExecutionTaskIds.length} linked governed task(s) — act on them in your top action above.</p>
            )}
          </>
        )}
        <p style={{ margin: "2px 0 0", color: "#6b7280", fontStyle: "italic" }} data-testid="cockpit-recovery-caveat">{recovery.noGuaranteeStatement} {recovery.uncertaintyCaveat}</p>
      </div>
    </details>
  );
}

export function MinimumOwnerCockpit({ bridge, actionsToAvoid = [], recovery = null, publicSignals = null, businessCondition = null, dataFreshnessWeak = null, onAction, busy = false, goalAttentionSignal = null, topProfitLeak = null, policyAttentionSignal = null, trendAlerts = undefined, doNotRepeatAnnotation = null, activeEscalations = undefined, onAcknowledgeEscalation, onStartWork, executionLifecycle = null }: MinimumOwnerCockpitProps) {
  const top = bridge?.topRoute ?? null;
  const [pending, setPending] = useState<string | null>(null);
  const [evidenceText, setEvidenceText] = useState("");
  const [reasonText, setReasonText] = useState("");
  const [delegateRole, setDelegateRole] = useState<"MANAGER" | "STAFF">("MANAGER");

  // ── Clean state: no fabricated top action. ──
  if (!top) {
    return (
      <section data-testid="cockpit-clean" style={{ border: "1px solid #e5e7eb", borderRadius: 10, padding: 20, display: "flex", flexDirection: "column", gap: 12 }}>
        <div>
          <strong>No urgent action needs your attention right now.</strong>
          <p style={{ margin: "6px 0 0", color: "#6b7280", fontSize: 13 }}>
            OpsIQ has nothing that requires an owner decision at the moment. This view stays empty until a
            governed action is ready — nothing is invented to fill the space.
          </p>
        </div>
        {executionLifecycle && <ExecutionLifecycleSection lifecycle={executionLifecycle} onAction={onAction} busy={busy} />}
        {recovery && <RecoverySection recovery={recovery} />}
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

  const terminal = top.status === "COMPLETED" || top.status === "REJECTED";

  return (
    <section data-testid="owner-cockpit" data-execution-route={top.executionRoute}
      style={{ display: "flex", flexDirection: "column", gap: 14, maxWidth: 720 }}>

      {/* 1. Top Priority Action */}
      <div data-testid="cockpit-top-action" style={{ border: "1px solid #e5e7eb", borderRadius: 10, padding: 18, display: "flex", flexDirection: "column", gap: 10 }}>
        <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
          <span style={{ fontSize: 12, color: "#6b7280", textTransform: "uppercase", letterSpacing: 0.4 }}>Your top priority now</span>
          <Badge variant={SEVERITY_VARIANT(top.severity)}>{top.severity}</Badge>
        </div>
        <strong data-testid="cockpit-top-action-title" style={{ fontSize: 17 }}>{top.ownerVisibleSummary}</strong>

        {/* 2. Why This Is First */}
        <div data-testid="cockpit-why">
          <span style={{ fontSize: 13, fontWeight: 600 }}>Why this is first</span>
          <ul style={{ margin: "4px 0 0", paddingLeft: 18 }}>
            {whyBullets.map((b, i) => (
              <li key={i} data-testid="cockpit-why-bullet" style={{ fontSize: 13, color: "#374151" }}>{b}</li>
            ))}
          </ul>
        </div>

        {/* 3. Required Owner Decision */}
        <div data-testid="cockpit-owner-decision" style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
          <span style={{ fontSize: 13, fontWeight: 600 }}>Required owner decision:</span>
          <Badge variant={isOwner ? "destructive" : "default"}>{APPROVAL_LABEL[top.approvalLevel] ?? top.approvalLevel}</Badge>
          {isOwner && <span data-testid="cockpit-cannot-automate" style={{ fontSize: 12, color: "#b91c1c" }}>This cannot be automated.</span>}
        </div>

        {/* 4. Evidence Required */}
        {!isBlockedUnsafe && !isMonitorOnly && (
          <div data-testid="cockpit-evidence" style={{ fontSize: 13 }}>
            <span style={{ fontWeight: 600 }}>Evidence required before completion.</span>{" "}
            <span style={{ color: "#6b7280" }}>{top.requiredEvidence.length ? top.requiredEvidence.join("; ") : "—"}</span>
          </div>
        )}

        {/* 7. Next Reassessment */}
        <div data-testid="cockpit-reassessment" style={{ fontSize: 13, color: "#6b7280" }}>
          <span style={{ fontWeight: 600, color: "#374151" }}>Completion will trigger reassessment.</span>{" "}
          {top.reassessmentTrigger}
        </div>

        {/* 5. Safe Actions */}
        {onAction && !terminal && (primary.length > 0 || secondaryVisible.length > 0) && (
          <div data-testid="cockpit-safe-actions" style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            <span style={{ fontSize: 13, fontWeight: 600 }}>What you can safely do</span>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              {primary.map((a) => (
                <button key={a} type="button" data-testid={`cockpit-action-${a}`} data-cockpit-priority="primary" disabled={busy}
                  onClick={() => clickAction(a)}
                  style={{ fontSize: 13, padding: "6px 14px", borderRadius: 6, border: "1px solid #111827", background: "#111827", color: "#fff", cursor: busy ? "default" : "pointer" }}>
                  {ACTION_LABEL[a] ?? a}
                </button>
              ))}
              {secondaryVisible.map((a) => (
                <button key={a} type="button" data-testid={`cockpit-action-${a}`} data-cockpit-priority="secondary" disabled={busy}
                  onClick={() => clickAction(a)}
                  style={{ fontSize: 13, padding: "6px 12px", borderRadius: 6, border: "1px solid #d1d5db", background: "#fff", color: "#111827", cursor: busy ? "default" : "pointer" }}>
                  {ACTION_LABEL[a] ?? a}
                </button>
              ))}
            </div>
            {secondaryMore.length > 0 && (
              <details data-testid="cockpit-more-actions">
                <summary style={{ cursor: "pointer", fontSize: 12, color: "#6b7280" }}>{secondaryMore.length} more action(s)</summary>
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 8 }}>
                  {secondaryMore.map((a) => (
                    <button key={a} type="button" data-testid={`cockpit-action-${a}`} disabled={busy}
                      onClick={() => clickAction(a)}
                      style={{ fontSize: 13, padding: "6px 12px", borderRadius: 6, border: "1px solid #d1d5db", background: "#fff", color: "#111827", cursor: busy ? "default" : "pointer" }}>
                      {ACTION_LABEL[a] ?? a}
                    </button>
                  ))}
                </div>
              </details>
            )}
            {/* Labelled inline input — replaces window.prompt(). */}
            {pending && (
              <div data-testid="cockpit-action-form" style={{ border: "1px solid #e5e7eb", borderRadius: 8, padding: 12, display: "flex", flexDirection: "column", gap: 8 }}>
                <span style={{ fontSize: 13, fontWeight: 600 }}>{ACTION_LABEL[pending] ?? pending}</span>
                {needsEvidence(pending) && (
                  <label style={{ fontSize: 12, color: "#374151" }}>
                    Evidence reference(s), comma-separated{pending === "SUBMIT_EVIDENCE" ? " (required)" : ""}
                    <input data-testid="cockpit-evidence-input" value={evidenceText} onChange={(e) => setEvidenceText(e.target.value)}
                      style={{ display: "block", width: "100%", marginTop: 4, padding: "6px 8px", border: "1px solid #d1d5db", borderRadius: 6, fontSize: 13 }} />
                  </label>
                )}
                {needsReason(pending) && (
                  <label style={{ fontSize: 12, color: "#374151" }}>
                    Reason (optional)
                    <input data-testid="cockpit-reason-input" value={reasonText} onChange={(e) => setReasonText(e.target.value)}
                      style={{ display: "block", width: "100%", marginTop: 4, padding: "6px 8px", border: "1px solid #d1d5db", borderRadius: 6, fontSize: 13 }} />
                  </label>
                )}
                {isDelegate(pending) && (
                  <label style={{ fontSize: 12, color: "#374151" }}>
                    Delegate to
                    <select data-testid="cockpit-delegate-select" value={delegateRole} onChange={(e) => setDelegateRole(e.target.value as "MANAGER" | "STAFF")}
                      style={{ display: "block", marginTop: 4, padding: "6px 8px", border: "1px solid #d1d5db", borderRadius: 6, fontSize: 13 }}>
                      <option value="MANAGER">Manager</option>
                      <option value="STAFF">Staff</option>
                    </select>
                  </label>
                )}
                <div style={{ display: "flex", gap: 8 }}>
                  <button type="button" data-testid="cockpit-confirm" disabled={busy} onClick={() => submit(pending)}
                    style={{ fontSize: 13, padding: "6px 14px", borderRadius: 6, border: "1px solid #111827", background: "#111827", color: "#fff", cursor: busy ? "default" : "pointer" }}>Confirm</button>
                  <button type="button" data-testid="cockpit-cancel" onClick={() => setPending(null)}
                    style={{ fontSize: 13, padding: "6px 14px", borderRadius: 6, border: "1px solid #d1d5db", background: "#fff", cursor: "pointer" }}>Cancel</button>
                </div>
              </div>
            )}
          </div>
        )}
        {terminal && <p data-testid="cockpit-terminal" style={{ margin: 0, fontSize: 12, color: "#16a34a" }}>This task is {top.status.toLowerCase()}.</p>}

        {/* Start Work — dedicated button for canStart=true tasks (Phase 2 Signal F) */}
        {top.canStart && onStartWork && (
          <div style={{ marginTop: 4 }}>
            <button
              type="button"
              data-testid={`cockpit-start-work-${top.taskKey}`}
              disabled={busy}
              onClick={() => onStartWork(top.taskKey)}
              style={{ fontSize: 13, padding: "6px 14px", borderRadius: 6, border: "1px solid #0369a1", background: "#0369a1", color: "#fff", cursor: busy ? "default" : "pointer" }}
            >
              Start Work
            </button>
          </div>
        )}

        {/* 6. Blocked / Not Allowed */}
        <div data-testid="cockpit-blocked" style={{ borderTop: "1px solid #f3f4f6", paddingTop: 10 }}>
          <span style={{ fontSize: 13, fontWeight: 600 }}>Blocked / not allowed</span>
          {isBlockedUnsafe ? (
            <p data-testid="cockpit-blocked-unsafe" style={{ margin: "4px 0 0", fontSize: 13, color: "#b45309" }}>
              No action is available because this would require an unsafe external step.
              {top.notActionableReason ? ` ${top.notActionableReason}` : ""}
            </p>
          ) : isMonitorOnly ? (
            <p data-testid="cockpit-monitor-note" style={{ margin: "4px 0 0", fontSize: 13, color: "#6b7280" }}>
              This is monitor-only because no safe action is needed.
              {top.notActionableReason ? ` ${top.notActionableReason}` : ""}
            </p>
          ) : actionsToAvoid.length > 0 ? (
            <ul style={{ margin: "4px 0 0", paddingLeft: 18 }}>
              {actionsToAvoid.slice(0, 3).map((a, i) => (
                <li key={i} data-testid="cockpit-avoid" style={{ fontSize: 13, color: "#b45309" }}>{a}</li>
              ))}
            </ul>
          ) : (
            <p style={{ margin: "4px 0 0", fontSize: 13, color: "#6b7280" }}>
              OpsIQ never takes an external action for you. It won&apos;t contact customers, submit tenders,
              spend, discount, or contract on its own.
            </p>
          )}
        </div>
      </div>

      {/* 8. Secondary Actions (collapsed) */}
      <details data-testid="cockpit-secondary-group" style={{ border: "1px solid #e5e7eb", borderRadius: 8, padding: "10px 14px" }}>
        <summary style={{ cursor: "pointer", fontSize: 14, fontWeight: 600 }}>
          Other actions{secondaryRoutes.length ? ` (${secondaryRoutes.length})` : ""}
        </summary>
        {secondaryRoutes.length === 0 ? (
          <p style={{ margin: "8px 0 0", fontSize: 13, color: "#6b7280" }}>No other governed actions right now.</p>
        ) : (
          <ul style={{ margin: "8px 0 0", paddingLeft: 0, listStyle: "none", display: "flex", flexDirection: "column", gap: 6 }}>
            {secondaryRoutes.slice(0, 3).map((r) => (
              <li key={r.taskKey} data-testid="cockpit-secondary-item" style={{ fontSize: 13, display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                <Badge variant="muted">{ROUTE_LABEL[r.executionRoute] ?? r.executionRoute}</Badge>
                <span>{r.ownerVisibleSummary}</span>
              </li>
            ))}
            {secondaryRoutes.length > 3 && <li style={{ fontSize: 12, color: "#6b7280" }}>+{secondaryRoutes.length - 3} more</li>}
          </ul>
        )}
      </details>

      {/* 9. Monitor-only (collapsed) */}
      <details data-testid="cockpit-monitor-group" style={{ border: "1px solid #e5e7eb", borderRadius: 8, padding: "10px 14px" }}>
        <summary style={{ cursor: "pointer", fontSize: 14, fontWeight: 600 }}>
          Monitor only{monitorRoutes.length ? ` (${monitorRoutes.length})` : ""}
        </summary>
        {monitorRoutes.length === 0 ? (
          <p style={{ margin: "8px 0 0", fontSize: 13, color: "#6b7280" }}>Nothing to monitor right now.</p>
        ) : (
          <ul style={{ margin: "8px 0 0", paddingLeft: 0, listStyle: "none", display: "flex", flexDirection: "column", gap: 6 }}>
            {monitorRoutes.slice(0, 3).map((r) => (
              <li key={r.taskKey} data-testid="cockpit-monitor-item" style={{ fontSize: 13, color: "#6b7280" }}>{r.ownerVisibleSummary}</li>
            ))}
            {monitorRoutes.length > 3 && <li style={{ fontSize: 12, color: "#6b7280" }}>+{monitorRoutes.length - 3} more</li>}
          </ul>
        )}
      </details>

      {/* Goal Attention Signal — Phase 2 Signal A */}
      {goalAttentionSignal && (
        <div data-testid="cockpit-goal-section" style={{ border: "1px solid #e5e7eb", borderRadius: 8, padding: "10px 14px" }}>
          <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
            <span style={{ fontSize: 14, fontWeight: 600 }}>Goal</span>
            <span data-testid="cockpit-goal-state" data-cockpit-goal-state={goalAttentionSignal.state} style={{ fontSize: 12, padding: "2px 8px", borderRadius: 4, background: goalAttentionSignal.state === "AT_RISK" || goalAttentionSignal.state === "NO_GROWTH" ? "#fef2f2" : goalAttentionSignal.state === "ON_TRACK" ? "#f0fdf4" : "#fafafa", color: goalAttentionSignal.state === "AT_RISK" || goalAttentionSignal.state === "NO_GROWTH" ? "#b91c1c" : goalAttentionSignal.state === "ON_TRACK" ? "#15803d" : "#6b7280" }}>
              {goalAttentionSignal.state.replace(/_/g, " ")}
            </span>
            {goalAttentionSignal.goalTitle && <span style={{ fontSize: 13, color: "#374151" }}>{goalAttentionSignal.goalTitle}</span>}
          </div>
          {goalAttentionSignal.gapToClose !== null && (
            <p data-testid="cockpit-goal-gap" style={{ margin: "6px 0 0", fontSize: 13, color: "#374151" }}>
              Gap to close: {goalAttentionSignal.targetCurrency ?? ""} {goalAttentionSignal.gapToClose.toLocaleString()}
            </p>
          )}
          <p data-testid="cockpit-goal-explanation" style={{ margin: "4px 0 0", fontSize: 13, color: "#6b7280", fontStyle: "italic" }}>{goalAttentionSignal.beginnerExplanation}</p>
        </div>
      )}

      {/* Profit Leak — Phase 2 Signal B */}
      {topProfitLeak && (
        <div data-testid="cockpit-profit-leak-section" style={{ border: "1px solid #e5e7eb", borderRadius: 8, padding: "10px 14px" }}>
          <span style={{ fontSize: 14, fontWeight: 600 }}>Profit leak detected</span>
          <div style={{ marginTop: 6, fontSize: 13, display: "flex", flexDirection: "column", gap: 4 }}>
            <span data-testid="cockpit-profit-leak-area" style={{ color: "#374151" }}>Area: {topProfitLeak.domain}</span>
            {topProfitLeak.estimatedImpact.rangeLow !== undefined && (
              <span data-testid="cockpit-profit-leak-impact" style={{ color: "#b91c1c" }}>
                Estimated impact: {topProfitLeak.estimatedImpact.rangeLow.toLocaleString()}
                {topProfitLeak.estimatedImpact.rangeHigh !== undefined ? ` – ${topProfitLeak.estimatedImpact.rangeHigh.toLocaleString()}` : ""}
              </span>
            )}
            {topProfitLeak.ownerExplanation && (
              <span style={{ color: "#6b7280", fontStyle: "italic" }}>{topProfitLeak.ownerExplanation}</span>
            )}
          </div>
        </div>
      )}

      {/* Policy Attention Signal — Phase 2 Signal C */}
      {policyAttentionSignal && (
        <div data-testid="cockpit-policy-section" style={{ border: "1px solid #e5e7eb", borderRadius: 8, padding: "10px 14px" }}>
          <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
            <span style={{ fontSize: 14, fontWeight: 600 }}>Operating policies</span>
            <span data-testid="cockpit-policy-triggered-blocks" style={{ fontSize: 12, color: policyAttentionSignal.triggeredBlockCount > 0 ? "#b91c1c" : "#6b7280", fontWeight: policyAttentionSignal.triggeredBlockCount > 0 ? 600 : 400 }}>
              {policyAttentionSignal.triggeredBlockCount} blocked
            </span>
            <span data-testid="cockpit-policy-triggered-warnings" style={{ fontSize: 12, color: policyAttentionSignal.triggeredWarningCount > 0 ? "#b45309" : "#6b7280" }}>
              {policyAttentionSignal.triggeredWarningCount} warning{policyAttentionSignal.triggeredWarningCount !== 1 ? "s" : ""}
            </span>
          </div>
          <ul style={{ margin: "6px 0 0", paddingLeft: 0, listStyle: "none", display: "flex", flexDirection: "column", gap: 4 }}>
            {policyAttentionSignal.details.map((d, i) => (
              <li key={d.policyKey} data-testid={`cockpit-policy-detail-${i}`} style={{ fontSize: 13, display: "flex", gap: 8, alignItems: "center" }}>
                <Badge variant={d.decision === "BLOCK" ? "destructive" : d.decision === "WARN" ? "warning" : "muted"}>{d.decision}</Badge>
                <span style={{ color: "#374151" }}>{d.label}</span>
                {d.hasActiveOverride && <span style={{ color: "#6b7280", fontSize: 12 }}>(override active)</span>}
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Trend Alerts — Phase 2 Signal D */}
      <div data-testid="cockpit-trend-alerts-section" style={{ border: "1px solid #e5e7eb", borderRadius: 8, padding: "10px 14px" }}>
        <span style={{ fontSize: 14, fontWeight: 600 }}>Trend alerts</span>
        {trendAlerts === null || trendAlerts === undefined ? (
          <p data-testid="cockpit-trend-alerts-state" data-cockpit-trend-alerts-state="INSUFFICIENT_DATA" style={{ margin: "6px 0 0", fontSize: 13, color: "#6b7280" }}>
            Not enough metric history yet for trend alerts. Record at least two periods.
          </p>
        ) : trendAlerts.length === 0 ? (
          <p style={{ margin: "6px 0 0", fontSize: 13, color: "#16a34a" }}>No trend alerts — metrics moving in a healthy direction.</p>
        ) : (
          <ul style={{ margin: "6px 0 0", paddingLeft: 0, listStyle: "none", display: "flex", flexDirection: "column", gap: 6 }}>
            {trendAlerts.map((alert, i) => (
              <li key={alert.alertType} data-testid={`cockpit-trend-alert-${i}`} style={{ fontSize: 13, display: "flex", gap: 8, alignItems: "flex-start", flexWrap: "wrap" }}>
                <Badge data-testid={`cockpit-trend-alert-${i}-severity`} variant={alert.severity === "critical" ? "destructive" : "warning"}>
                  {alert.severity}
                </Badge>
                <span style={{ color: "#374151" }}>{alert.description}</span>
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* Do-Not-Repeat Annotation — Phase 2 Signal E */}
      {doNotRepeatAnnotation?.blocked && (
        <div data-testid="cockpit-dnr-section" style={{ border: "1px solid #fef3c7", borderRadius: 8, padding: "10px 14px", background: "#fffbeb" }}>
          <span style={{ fontSize: 14, fontWeight: 600, color: "#92400e" }}>Do not repeat</span>
          <p data-testid="cockpit-dnr-prior-action" style={{ margin: "6px 0 0", fontSize: 13, color: "#374151" }}>
            {doNotRepeatAnnotation.priorActionSummary}
          </p>
          <p data-testid="cockpit-dnr-reason" style={{ margin: "4px 0 0", fontSize: 13, color: "#92400e" }}>
            {doNotRepeatAnnotation.blockedReason}
          </p>
          {doNotRepeatAnnotation.changedContextCondition && (
            <p style={{ margin: "4px 0 0", fontSize: 12, color: "#6b7280", fontStyle: "italic" }}>
              Allowed if: {doNotRepeatAnnotation.changedContextCondition}
            </p>
          )}
          {doNotRepeatAnnotation.legacyMatch && (
            <p style={{ margin: "4px 0 0", fontSize: 11, color: "#6b7280", fontStyle: "italic" }}>Matched by area scope (informational).</p>
          )}
        </div>
      )}

      {/* Active Escalations — Phase 2 Signal G */}
      <div data-testid="cockpit-escalations-section" style={{ border: "1px solid #e5e7eb", borderRadius: 8, padding: "10px 14px" }}>
        <span style={{ fontSize: 14, fontWeight: 600 }}>Escalations</span>
        {activeEscalations === null || activeEscalations === undefined ? (
          <p style={{ margin: "6px 0 0", fontSize: 13, color: "#6b7280" }}>Escalation data unavailable.</p>
        ) : activeEscalations.length === 0 ? (
          <p data-testid="cockpit-escalations-state" data-cockpit-escalations-state="NONE" style={{ margin: "6px 0 0", fontSize: 13, color: "#16a34a" }}>No open escalations.</p>
        ) : (
          <ul style={{ margin: "6px 0 0", paddingLeft: 0, listStyle: "none", display: "flex", flexDirection: "column", gap: 8 }}>
            {activeEscalations.map((esc) => (
              <li key={esc.id} data-testid={`cockpit-escalation-${esc.id}`} style={{ fontSize: 13, display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                <Badge variant={esc.severity === "CRITICAL" ? "destructive" : "warning"}>{esc.severity}</Badge>
                <span style={{ color: "#374151", flex: 1 }}>{esc.title}</span>
                {onAcknowledgeEscalation && (
                  <button
                    type="button"
                    data-testid={`cockpit-escalation-ack-${esc.id}`}
                    onClick={() => onAcknowledgeEscalation(esc.id)}
                    style={{ fontSize: 12, padding: "4px 10px", borderRadius: 4, border: "1px solid #d1d5db", background: "#fff", cursor: "pointer" }}
                  >
                    Acknowledge
                  </button>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* Recovery status — read-only, collapsed low-load summary (PASS 37). */}
      {recovery && <RecoverySection recovery={recovery} />}

      {/* Outside signals — read-only, collapsed low-load public-signal summary (PASS 39). */}
      {publicSignals && <OutsideSignalsSection signals={publicSignals} />}

      {/* Business condition — read-only, derived risk-dimension panel (Phase 1 Reality Engine). */}
      {businessCondition && <BusinessConditionSection condition={businessCondition} dataFreshnessWeak={dataFreshnessWeak} />}

      {/* Phase 3 — Execution lifecycle (collapsed by default). Server-computed can* booleans drive visibility. */}
      {executionLifecycle && <ExecutionLifecycleSection lifecycle={executionLifecycle} onAction={onAction} busy={busy} />}

      {/* 10. Proof / Audit details (collapsed drawer) */}
      <details data-testid="cockpit-proof-drawer" style={{ border: "1px solid #e5e7eb", borderRadius: 8, padding: "10px 14px" }}>
        <summary style={{ cursor: "pointer", fontSize: 14, fontWeight: 600 }}>View proof &amp; details</summary>
        <div style={{ marginTop: 8, fontSize: 12, color: "#6b7280", display: "flex", flexDirection: "column", gap: 6 }}>
          <span><strong>Done when:</strong> {top.completionCriteria}</span>
          {top.evidenceRefs.length > 0
            ? <span data-testid="cockpit-proof-refs" style={{ wordBreak: "break-all" }}>Evidence: {top.evidenceRefs.slice(0, 8).join(", ")}</span>
            : <span data-testid="cockpit-proof-none">No evidence submitted yet.</span>}
          <span>Status: {top.status}</span>
        </div>
      </details>
    </section>
  );
}

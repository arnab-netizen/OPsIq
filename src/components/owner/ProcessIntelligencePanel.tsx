"use client";

/**
 * ProcessIntelligencePanel — the owner-facing surface for Process Intelligence v1 (prop-driven; no
 * business logic here). It renders the single top process breakdown the server already computed: the
 * plain-language finding, the affected stage, severity + confidence, concise evidence counts + a few
 * representative refs (never a raw dump), the related profit leak / constraint / SLO, why OpsIQ thinks
 * the stage is breaking, the one recommended correction, and whether owner/manager approval is required.
 * DATA_INSUFFICIENT renders honestly. No fraud/negligence wording; no hidden staff score.
 */

import type { ReactNode } from "react";
import { Badge } from "@/ui/primitives";

// ── Executive Cockpit layout (progressive disclosure, anti-overload, mobile-friendly) ──────────────────

/**
 * CockpitGroup — a labelled, collapsible group of secondary panels. Closed by default so the owner sees
 * only the single primary focus first and opts into detail (progressive disclosure). Presentational only:
 * no business logic, no data fetching. Mobile-friendly (full-width, wraps, no horizontal overflow).
 */
export function CockpitGroup({
  title, subtitle, testid, defaultOpen = false, children,
}: { title: string; subtitle?: string; testid: string; defaultOpen?: boolean; children: ReactNode }) {
  return (
    <details data-testid={testid} open={defaultOpen}
      style={{ border: "1px solid #e5e7eb", borderRadius: 8, padding: "10px 14px", width: "100%", boxSizing: "border-box" }}>
      <summary data-testid={`${testid}-summary`} style={{ cursor: "pointer", fontSize: 15, fontWeight: 600 }}>
        {title}
        {subtitle ? <span style={{ display: "block", fontSize: 12, fontWeight: 400, color: "#6b7280", marginTop: 2 }}>{subtitle}</span> : null}
      </summary>
      <div style={{ display: "flex", flexDirection: "column", gap: 12, marginTop: 12, minWidth: 0 }}>{children}</div>
    </details>
  );
}

/** A small in-group label so each panel keeps its context inside a collapsed group. */
export function CockpitSubsection({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section style={{ display: "flex", flexDirection: "column", gap: 8, minWidth: 0 }}>
      <h3 style={{ margin: 0, fontSize: 14 }}>{title}</h3>
      {children}
    </section>
  );
}

export interface ProcessFindingView {
  findingType: string;
  severity: string;
  confidence: string;
  affectedStage: string;
  affectedActorId: string | null;
  affectedManagerId: string | null;
  supportingProofIds: string[];
  supportingOperationalEventIds: string[];
  supportingEscalationIds: string[];
  supportingAdjudicationIds: string[];
  relatedProfitLeak: string | null;
  relatedConstraint: string | null;
  relatedSLO: string | null;
  ownerExplanation: string;
  recommendedCorrectiveAction: string;
  expectedImpactType: string;
  requiredApprovalLevel: string;
  missingData: string[];
}

export interface ProcessIntelligenceView {
  topFinding: ProcessFindingView | null;
  findings: ProcessFindingView[];
}

export interface ProcessCorrectionView {
  correctionId: string;
  sourceFindingType: string;
  correctionType: string;
  title: string;
  instruction: string;
  affectedStage: string;
  targetActorId: string | null;
  targetManagerId: string | null;
  severity: string;
  priorityRank: number;
  requiredApprovalLevel: string;
  requiresOwnerApproval: boolean;
  autoExecutable: boolean;
  status: string;
}

export interface ProcessCorrectionsView {
  corrections: ProcessCorrectionView[];
  topCorrection: ProcessCorrectionView | null;
}

const CORRECTION_TYPE_LABEL: Record<string, string> = {
  REQUIRE_FRESH_PROOF: "Require fresh proof",
  UPDATE_CHECKLIST: "Update checklist",
  REVIEW_PROCESS_STEP: "Review process step",
  ASSIGN_TRAINING_REVIEW: "Assign training review",
  ESCALATE_TO_MANAGER: "Escalate to manager",
  ESCALATE_TO_OWNER: "Escalate to owner",
  RESOLVE_OPERATIONAL_EVENT: "Resolve operational event",
  COLLECT_MISSING_DATA: "Collect missing data",
  NO_ACTION_DATA_INSUFFICIENT: "No action — data insufficient",
};

const TITLE: Record<string, string> = {
  REWORK_LOOP: "Rework loop — work redone repeatedly",
  QUALITY_FAILURE_LOOP: "Quality failure loop — complaints on accepted work",
  DELIVERY_HANDOFF_DELAY: "Delivery hand-off delay",
  REVIEW_BOTTLENECK: "Proof-review bottleneck",
  OWNER_APPROVAL_BOTTLENECK: "Owner-approval bottleneck",
  PROOF_QUALITY_BREAKDOWN: "Proof quality breakdown",
  ESCALATION_RESPONSE_BREAKDOWN: "Escalation response breakdown",
  STAFF_TRAINING_GAP: "Staff training gap",
  MANAGER_REVIEW_GAP: "Manager review gap",
  DATA_INSUFFICIENT: "Not enough linked data yet",
};

const STAGE_LABEL: Record<string, string> = {
  INTAKE: "Intake", WORK_EXECUTION: "Work execution", PROOF_SUBMISSION: "Proof submission",
  PROOF_REVIEW: "Proof review", MANAGER_REVIEW: "Manager review", OWNER_APPROVAL: "Owner approval",
  DELIVERY: "Delivery", ESCALATION_RESPONSE: "Escalation response", NONE: "—",
};

const APPROVAL_LABEL: Record<string, string> = { OWNER: "Owner approval required", MANAGER: "Manager approval required", STAFF: "Staff-level action" };

const SEVERITY_VARIANT = (s: string): "destructive" | "warning" | "default" | "muted" =>
  s === "CRITICAL" || s === "HIGH" ? "destructive" : s === "MEDIUM" ? "warning" : "default";

export function ProcessIntelligencePanel({ data }: { data: ProcessIntelligenceView | null }) {
  const top = data?.topFinding ?? null;

  if (!top) {
    return (
      <div data-testid="process-intelligence-empty" style={{ padding: 16, color: "#6b7280" }}>
        No process signal yet — OpsIQ has nothing to show until proof, review, escalation, and
        complaint/rework activity accumulates.
      </div>
    );
  }

  if (top.findingType === "DATA_INSUFFICIENT") {
    return (
      <div data-testid="process-intelligence-data-insufficient" style={{ border: "1px solid #e5e7eb", borderRadius: 8, padding: 16 }}>
        <strong>Not enough linked data yet</strong>
        <p style={{ margin: "6px 0 0", color: "#6b7280" }}>{top.ownerExplanation}</p>
        {top.missingData.length > 0 && (
          <p style={{ margin: "6px 0 0", fontSize: 13, color: "#b45309" }} data-testid="pi-missing-data">
            Needed: {top.missingData.join("; ")}
          </p>
        )}
      </div>
    );
  }

  const evidenceCount = top.supportingProofIds.length + top.supportingOperationalEventIds.length + top.supportingEscalationIds.length;
  const refs = [...top.supportingProofIds, ...top.supportingOperationalEventIds, ...top.supportingEscalationIds].slice(0, 5);

  return (
    <article data-testid="process-intelligence-panel" data-finding-type={top.findingType}
      style={{ border: "1px solid #e5e7eb", borderRadius: 8, padding: 16, display: "flex", flexDirection: "column", gap: 10 }}>
      <header style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
        <strong data-testid="pi-title">{TITLE[top.findingType] ?? "Process breakdown"}</strong>
        <Badge variant={SEVERITY_VARIANT(top.severity)}>{top.severity}</Badge>
        <Badge variant="muted">Confidence: {top.confidence}</Badge>
        <span data-testid="pi-stage"><Badge variant="outline">Stage: {STAGE_LABEL[top.affectedStage] ?? top.affectedStage}</Badge></span>
      </header>

      <p style={{ margin: 0 }} data-testid="pi-why">{top.ownerExplanation}</p>

      <div style={{ fontSize: 13, color: "#374151" }}>
        <span data-testid="pi-evidence-count">Evidence: {evidenceCount} item(s)</span>
        {refs.length > 0 && <span data-testid="pi-evidence-refs"> · Refs: {refs.join(", ")}</span>}
        {top.affectedManagerId && <span> · Manager: {top.affectedManagerId}</span>}
        {top.affectedActorId && <span> · Person: {top.affectedActorId}</span>}
      </div>

      <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
        {top.relatedProfitLeak && <span data-testid="pi-profit-leak"><Badge variant="warning">Profit leak: {top.relatedProfitLeak}</Badge></span>}
        {top.relatedConstraint && <span data-testid="pi-constraint"><Badge variant="default">Constraint: {top.relatedConstraint}</Badge></span>}
        {top.relatedSLO && <span data-testid="pi-slo"><Badge variant="muted">SLO: {top.relatedSLO}</Badge></span>}
      </div>

      <p style={{ margin: 0 }} data-testid="pi-correction"><strong>Recommended fix:</strong> {top.recommendedCorrectiveAction}</p>

      <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
        <span data-testid="pi-approval">
          <Badge variant={top.requiredApprovalLevel === "OWNER" ? "destructive" : "default"}>
            {APPROVAL_LABEL[top.requiredApprovalLevel] ?? top.requiredApprovalLevel}
          </Badge>
        </span>
        <span style={{ fontSize: 12, color: "#6b7280" }}>Impact type: {top.expectedImpactType}</span>
      </div>

      {top.missingData.length > 0 && (
        <p style={{ margin: 0, fontSize: 13, color: "#b45309" }} data-testid="pi-missing-data">Missing data: {top.missingData.join("; ")}</p>
      )}

      <p style={{ margin: 0, fontSize: 12, color: "#6b7280" }}>
        This is a process signal, not an accusation. Owner review is required before any personnel action.
      </p>
    </article>
  );
}

/**
 * ProcessCorrectionsPanel — the proposed, trackable corrections routed from the process breakdowns.
 * Prop-driven; no business logic (the routing is server-side). Each correction shows the action, the
 * stage, the required approval, and — for owner-gated corrections — an explicit "owner approval required"
 * marker. Nothing here is auto-approved; every real correction is a proposal awaiting a human.
 */
export function ProcessCorrectionsPanel({ data }: { data: ProcessCorrectionsView | null }) {
  const list = data?.corrections ?? [];
  if (list.length === 0) {
    return (
      <div data-testid="process-corrections-empty" style={{ padding: 16, color: "#6b7280" }}>
        No corrections proposed yet — corrections appear once a process breakdown is established.
      </div>
    );
  }
  return (
    <section data-testid="process-corrections-panel" style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      <strong data-testid="pc-title">Recommended corrections</strong>
      <ol data-testid="pc-list" style={{ margin: 0, padding: 0, listStyle: "none", display: "flex", flexDirection: "column", gap: 8 }}>
        {list.map((c) => (
          <li key={c.correctionId} data-testid="pc-item" data-correction-type={c.correctionType}
            style={{ border: "1px solid #e5e7eb", borderRadius: 8, padding: 12, display: "flex", flexDirection: "column", gap: 6 }}>
            <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
              <span style={{ fontSize: 12, color: "#6b7280" }}>#{c.priorityRank}</span>
              <strong data-testid="pc-item-title">{c.title}</strong>
              <span data-testid="pc-item-type"><Badge variant="default">{CORRECTION_TYPE_LABEL[c.correctionType] ?? c.correctionType}</Badge></span>
              <Badge variant={SEVERITY_VARIANT(c.severity)}>{c.severity}</Badge>
              <span data-testid="pc-item-status"><Badge variant="muted">{c.status}</Badge></span>
            </div>
            <p style={{ margin: 0, fontSize: 13 }} data-testid="pc-item-instruction">{c.instruction}</p>
            <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap", fontSize: 12 }}>
              <span data-testid="pc-item-approval">
                <Badge variant={c.requiresOwnerApproval ? "destructive" : "default"}>
                  {APPROVAL_LABEL[c.requiredApprovalLevel] ?? c.requiredApprovalLevel}
                </Badge>
              </span>
              <span style={{ color: "#6b7280" }}>Stage: {STAGE_LABEL[c.affectedStage] ?? c.affectedStage}</span>
              {c.targetManagerId && <span style={{ color: "#6b7280" }}>· Manager: {c.targetManagerId}</span>}
              {c.targetActorId && <span style={{ color: "#6b7280" }}>· Person: {c.targetActorId}</span>}
            </div>
          </li>
        ))}
      </ol>
      <p style={{ margin: 0, fontSize: 12, color: "#6b7280" }}>
        Corrections are proposals. Owner-gated corrections require owner approval before any action; nothing
        here is applied automatically.
      </p>
    </section>
  );
}

export interface SopChecklistCorrectionView {
  sourceCorrectionKey: string;
  correctionType: string;
  affectedStage: string;
  sopArea: string;
  proposedChangeTitle: string;
  proposedChangeBody: string;
  reason: string;
  supportingProofIds: string[];
  supportingOperationalEventIds: string[];
  supportingEscalationIds: string[];
  approvalLevel: string;
  ownerApprovalRequired: boolean;
  managerApprovalRequired: boolean;
  successMetric: string;
  reviewAfterDays: number;
  status: string;
  missingData: string[];
}

export interface SopChecklistCorrectionsView {
  drafts: SopChecklistCorrectionView[];
  topDraft: SopChecklistCorrectionView | null;
}

const SOP_AREA_LABEL: Record<string, string> = {
  PRESSING_WASH_CHECKLIST: "Pressing/wash checklist",
  ACCEPTANCE_QUALITY_CHECKLIST: "Acceptance/quality checklist",
  PROOF_REQUIREMENT_CHECKLIST: "Proof-requirement checklist",
  DELIVERY_HANDOFF_CHECKLIST: "Delivery hand-off checklist",
  REVIEW_PROCESS_STEP: "Process-step review",
  DATA_CAPTURE_CHECKLIST: "Data-capture checklist",
  TRAINING_HANDOFF: "Training handoff",
  NONE: "—",
};

/**
 * SopChecklistCorrectionsPanel — governed DRAFT SOP/checklist changes routed from the corrections.
 * Prop-driven; no business logic (drafting is server-side). Each draft shows the proposed change, the
 * SOP/checklist area, the reason, evidence, required approval, the success metric, and the review cadence.
 * Nothing is APPROVED or auto-applied here; drafts await owner/manager approval.
 */
export function SopChecklistCorrectionsPanel({ data }: { data: SopChecklistCorrectionsView | null }) {
  const list = data?.drafts ?? [];
  if (list.length === 0) {
    return (
      <div data-testid="sop-corrections-empty" style={{ padding: 16, color: "#6b7280" }}>
        No SOP/checklist changes proposed yet — drafts appear once a correction implies a checklist or
        process-step change.
      </div>
    );
  }
  return (
    <section data-testid="sop-corrections-panel" style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      <strong data-testid="sop-title">Proposed SOP / checklist changes</strong>
      <ol data-testid="sop-list" style={{ margin: 0, padding: 0, listStyle: "none", display: "flex", flexDirection: "column", gap: 8 }}>
        {list.map((d) => {
          const evidenceCount = d.supportingProofIds.length + d.supportingOperationalEventIds.length + d.supportingEscalationIds.length;
          return (
            <li key={d.sourceCorrectionKey} data-testid="sop-item" data-sop-area={d.sopArea}
              style={{ border: "1px solid #e5e7eb", borderRadius: 8, padding: 12, display: "flex", flexDirection: "column", gap: 6 }}>
              <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                <strong data-testid="sop-item-title">{d.proposedChangeTitle}</strong>
                <span data-testid="sop-item-area"><Badge variant="default">{SOP_AREA_LABEL[d.sopArea] ?? d.sopArea}</Badge></span>
                <span data-testid="sop-item-status"><Badge variant={d.status === "NEEDS_DATA" ? "warning" : "muted"}>{d.status}</Badge></span>
              </div>
              <p style={{ margin: 0, fontSize: 13 }} data-testid="sop-item-body">{d.proposedChangeBody}</p>
              <p style={{ margin: 0, fontSize: 12, color: "#374151" }} data-testid="sop-item-reason">Why: {d.reason}</p>
              <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap", fontSize: 12 }}>
                <span data-testid="sop-item-approval">
                  <Badge variant={d.ownerApprovalRequired ? "destructive" : "default"}>
                    {APPROVAL_LABEL[d.approvalLevel] ?? d.approvalLevel}
                  </Badge>
                </span>
                <span style={{ color: "#6b7280" }} data-testid="sop-item-evidence">Evidence: {evidenceCount} item(s)</span>
                <span style={{ color: "#6b7280" }} data-testid="sop-item-metric">Success: {d.successMetric}</span>
                <span style={{ color: "#6b7280" }}>Review in {d.reviewAfterDays}d</span>
              </div>
              {d.missingData.length > 0 && (
                <p style={{ margin: 0, fontSize: 12, color: "#b45309" }} data-testid="sop-item-missing">Missing data: {d.missingData.join("; ")}</p>
              )}
            </li>
          );
        })}
      </ol>
      <p style={{ margin: 0, fontSize: 12, color: "#6b7280" }}>
        These are draft changes. Owner/manager approval is required before any SOP or checklist change is
        adopted; nothing here is applied automatically.
      </p>
    </section>
  );
}

export interface TrainingAssignmentView {
  sourceProcessFindingKey: string;
  sourceCorrectionKey: string | null;
  trainingType: string;
  assignedToUserId: string | null;
  assignedRole: string | null;
  assignedByRole: string;
  approvalLevel: string;
  reason: string;
  supportingProofIds: string[];
  supportingOperationalEventIds: string[];
  supportingEscalationIds: string[];
  relatedSopChecklistCorrectionKey: string | null;
  successMetric: string;
  reviewAfterDays: number;
  status: string;
  ownerVisibleExplanation: string;
}

export interface TrainingAssignmentsView {
  assignments: TrainingAssignmentView[];
  topAssignment: TrainingAssignmentView | null;
}

const TRAINING_TYPE_LABEL: Record<string, string> = {
  PROOF_QUALITY_REVIEW: "Proof quality review",
  PROCESS_STEP_RETRAINING: "Process-step retraining",
  MANAGER_REVIEW_QUALITY: "Manager review quality",
  ESCALATION_RESPONSE_REVIEW: "Escalation response review",
  DELIVERY_HANDOFF_REVIEW: "Delivery hand-off review",
  CHECKLIST_CHANGE_BRIEFING: "Checklist change briefing",
  DATA_COLLECTION_BRIEFING: "Data collection briefing",
};

/**
 * TrainingAssignmentsPanel — governed, evidence-backed training/review recommendations routed from the
 * process breakdowns. Prop-driven; no business logic (routing is server-side). Each recommendation shows
 * the training type, who it is for (real user or role — never fabricated), the reason, evidence, any
 * linked SOP change, the required approval, the success metric, and the review cadence. Nothing is
 * assigned automatically; these are proposals — coaching/review only, never discipline.
 */
export function TrainingAssignmentsPanel({ data }: { data: TrainingAssignmentsView | null }) {
  const list = data?.assignments ?? [];
  if (list.length === 0) {
    return (
      <div data-testid="training-assignments-empty" style={{ padding: 16, color: "#6b7280" }}>
        No training recommendations yet — recommendations appear once a process breakdown implies coaching
        or a review.
      </div>
    );
  }
  return (
    <section data-testid="training-assignments-panel" style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      <strong data-testid="ta-title">Training &amp; review recommendations</strong>
      <ol data-testid="ta-list" style={{ margin: 0, padding: 0, listStyle: "none", display: "flex", flexDirection: "column", gap: 8 }}>
        {list.map((t, i) => {
          const evidenceCount = t.supportingProofIds.length + t.supportingOperationalEventIds.length + t.supportingEscalationIds.length;
          const who = t.assignedToUserId ? `Person: ${t.assignedToUserId}` : t.assignedRole ? `Team: ${t.assignedRole}` : "Unassigned";
          return (
            <li key={`${t.sourceProcessFindingKey}:${t.trainingType}:${i}`} data-testid="ta-item" data-training-type={t.trainingType}
              style={{ border: "1px solid #e5e7eb", borderRadius: 8, padding: 12, display: "flex", flexDirection: "column", gap: 6 }}>
              <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                <span data-testid="ta-item-type"><Badge variant="default">{TRAINING_TYPE_LABEL[t.trainingType] ?? t.trainingType}</Badge></span>
                <span data-testid="ta-item-status"><Badge variant={t.status === "NEEDS_DATA" ? "warning" : "muted"}>{t.status}</Badge></span>
                <span style={{ fontSize: 12, color: "#6b7280" }} data-testid="ta-item-who">{who}</span>
              </div>
              <p style={{ margin: 0, fontSize: 13 }} data-testid="ta-item-explanation">{t.ownerVisibleExplanation}</p>
              <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap", fontSize: 12 }}>
                <span data-testid="ta-item-approval">
                  <Badge variant={t.approvalLevel === "OWNER" ? "destructive" : "default"}>
                    {APPROVAL_LABEL[t.approvalLevel] ?? t.approvalLevel}
                  </Badge>
                </span>
                <span style={{ color: "#6b7280" }} data-testid="ta-item-evidence">Evidence: {evidenceCount} item(s)</span>
                <span style={{ color: "#6b7280" }} data-testid="ta-item-metric">Success: {t.successMetric}</span>
                <span style={{ color: "#6b7280" }}>Review in {t.reviewAfterDays}d</span>
                {t.relatedSopChecklistCorrectionKey && <span style={{ color: "#6b7280" }} data-testid="ta-item-sop">Linked SOP change</span>}
              </div>
            </li>
          );
        })}
      </ol>
      <p style={{ margin: 0, fontSize: 12, color: "#6b7280" }}>
        These are proposed reviews and coaching, not disciplinary actions. Owner/manager approval is
        required before any training is assigned; nothing here is assigned automatically.
      </p>
    </section>
  );
}

export interface EffectivenessEvaluationView {
  sourceCorrectionKey: string;
  sourceTrainingKey: string | null;
  sourceProcessFindingKey: string;
  evaluationType: string;
  targetedProblemType: string;
  baselineMetricValue: number | null;
  currentMetricValue: number | null;
  direction: string;
  confidence: string;
  ownerVisibleSummary: string;
  recommendedNextAction: string;
  approvalLevel: string;
  missingData: string[];
}

export interface EffectivenessView {
  evaluations: EffectivenessEvaluationView[];
  topEvaluation: EffectivenessEvaluationView | null;
}

const DIRECTION_LABEL: Record<string, string> = {
  IMPROVED: "Improved", WORSENED: "Worsened", UNCHANGED: "Unchanged", INSUFFICIENT_DATA: "Not enough data yet",
};
const NEXT_ACTION_LABEL: Record<string, string> = {
  KEEP: "Keep", MODIFY: "Modify", ESCALATE: "Escalate", RETRAIN: "Retrain",
  COLLECT_MORE_DATA: "Collect more data", DISMISS_AS_INEFFECTIVE: "Dismiss as ineffective",
};
const DIRECTION_VARIANT = (d: string): "destructive" | "warning" | "default" | "muted" =>
  d === "WORSENED" ? "destructive" : d === "UNCHANGED" ? "warning" : d === "IMPROVED" ? "default" : "muted";

/**
 * EffectivenessPanel — did the corrections/training work? Prop-driven; no business logic (the before/after
 * comparison is server-side over persisted snapshots). Each evaluation shows the targeted problem, the
 * baseline vs current metric, the direction, the recommended next action, and the required approval;
 * INSUFFICIENT_DATA is shown honestly. No fabricated improvement, no financial impact, no hidden score.
 */
export function EffectivenessPanel({ data }: { data: EffectivenessView | null }) {
  const list = data?.evaluations ?? [];
  if (list.length === 0) {
    return (
      <div data-testid="effectiveness-empty" style={{ padding: 16, color: "#6b7280" }}>
        No effectiveness checks yet — these appear once a correction has a prior measurement to compare
        against.
      </div>
    );
  }
  return (
    <section data-testid="effectiveness-panel" style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      <strong data-testid="eff-title">Did the fixes work?</strong>
      <ol data-testid="eff-list" style={{ margin: 0, padding: 0, listStyle: "none", display: "flex", flexDirection: "column", gap: 8 }}>
        {list.map((e, i) => (
          <li key={`${e.sourceCorrectionKey}:${i}`} data-testid="eff-item" data-direction={e.direction}
            style={{ border: "1px solid #e5e7eb", borderRadius: 8, padding: 12, display: "flex", flexDirection: "column", gap: 6 }}>
            <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
              <strong data-testid="eff-item-problem">{e.targetedProblemType.replace(/_/g, " ")}</strong>
              <span data-testid="eff-item-direction"><Badge variant={DIRECTION_VARIANT(e.direction)}>{DIRECTION_LABEL[e.direction] ?? e.direction}</Badge></span>
              {e.baselineMetricValue !== null && e.currentMetricValue !== null && (
                <span data-testid="eff-item-metric" style={{ fontSize: 12, color: "#6b7280" }}>{e.baselineMetricValue} → {e.currentMetricValue}</span>
              )}
            </div>
            <p style={{ margin: 0, fontSize: 13 }} data-testid="eff-item-summary">{e.ownerVisibleSummary}</p>
            <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap", fontSize: 12 }}>
              <span data-testid="eff-item-next"><Badge variant="default">Next: {NEXT_ACTION_LABEL[e.recommendedNextAction] ?? e.recommendedNextAction}</Badge></span>
              <span data-testid="eff-item-approval">
                <Badge variant={e.approvalLevel === "OWNER" ? "destructive" : "default"}>{APPROVAL_LABEL[e.approvalLevel] ?? e.approvalLevel}</Badge>
              </span>
              {e.missingData.length > 0 && <span style={{ color: "#b45309" }} data-testid="eff-item-missing">Missing: {e.missingData.join("; ")}</span>}
            </div>
          </li>
        ))}
      </ol>
      <p style={{ margin: 0, fontSize: 12, color: "#6b7280" }}>
        Effectiveness compares the problem before and after the correction. It never claims an improvement
        without a prior measurement, and it never estimates a money figure.
      </p>
    </section>
  );
}

export interface OwnerWorkloadFindingView {
  workloadType: string;
  severity: string;
  burdenCount: number;
  estimatedOwnerTouches: number | null;
  supportingProofIds: string[];
  supportingAdjudicationIds: string[];
  supportingOperationalEventIds: string[];
  supportingEscalationIds: string[];
  supportingCorrectionKeys: string[];
  supportingTrainingKeys: string[];
  relatedProcessFinding: string | null;
  relatedSLO: string | null;
  ownerVisibleExplanation: string;
  recommendedReductionAction: string;
  approvalLevel: string;
  riskGuardrail: string;
  missingData: string[];
}

export interface OwnerWorkloadReductionView {
  findings: OwnerWorkloadFindingView[];
  topFinding: OwnerWorkloadFindingView | null;
}

const WORKLOAD_TYPE_LABEL: Record<string, string> = {
  REPEATED_OWNER_ADJUDICATION: "Repeated owner adjudication",
  OWNER_REVIEW_BURDEN: "Owner review burden",
  OWNER_APPROVAL_BOTTLENECK: "Owner approval bottleneck",
  LOW_RISK_OWNER_INTERRUPT: "Low-risk owner interruption",
  RECURRING_COMPLAINT_ESCALATION: "Recurring complaint escalation",
  MANAGER_ESCALATION_OVERUSE: "Manager over-escalation",
  MISSING_DATA_BURDEN: "Missing-data burden",
  CORRECTION_APPROVAL_BACKLOG: "Correction approval backlog",
  TRAINING_DELEGATION_OPPORTUNITY: "Training delegation opportunity",
};
const REDUCTION_LABEL: Record<string, string> = {
  DELEGATE_TO_MANAGER: "Delegate to manager", CONVERT_TO_POLICY: "Convert to policy",
  AUTO_COLLAPSE_DUPLICATES: "Auto-collapse duplicates", REQUIRE_BETTER_PROOF_UPFRONT: "Require better proof upfront",
  ASSIGN_TRAINING: "Assign training", UPDATE_CHECKLIST: "Update checklist",
  COLLECT_MISSING_DATA: "Collect missing data", KEEP_OWNER_APPROVAL: "Keep owner approval",
};

/**
 * OwnerWorkloadReductionPanel — Executive Cockpit standard: the single top avoidable owner burden by
 * default (owner action first, business impact second, evidence collapsed). Prop-driven; no business
 * logic. High-risk items show KEEP_OWNER_APPROVAL and are never presented as auto-reducible. No hidden
 * score, no fabricated time saving, no disciplinary language.
 */
export function OwnerWorkloadReductionPanel({ data }: { data: OwnerWorkloadReductionView | null }) {
  const top = data?.topFinding ?? null;
  if (!top) {
    return (
      <div data-testid="owner-workload-empty" style={{ padding: 16, color: "#6b7280" }}>
        No avoidable owner burden detected — nothing to delegate or automate right now.
      </div>
    );
  }
  const evidence = [...top.supportingAdjudicationIds, ...top.supportingCorrectionKeys, ...top.supportingProofIds, ...top.supportingOperationalEventIds, ...top.supportingEscalationIds, ...top.supportingTrainingKeys];
  const rest = (data?.findings ?? []).slice(1);
  return (
    <section data-testid="owner-workload-panel" data-workload-type={top.workloadType}
      style={{ border: "1px solid #e5e7eb", borderRadius: 8, padding: 16, display: "flex", flexDirection: "column", gap: 10 }}>
      <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
        <strong data-testid="owr-type">{WORKLOAD_TYPE_LABEL[top.workloadType] ?? top.workloadType}</strong>
        <Badge variant={SEVERITY_VARIANT(top.severity)}>{top.severity}</Badge>
        {top.estimatedOwnerTouches !== null && <span data-testid="owr-touches" style={{ fontSize: 12, color: "#6b7280" }}>~{top.estimatedOwnerTouches} owner touches</span>}
      </div>
      {/* Owner action first. */}
      <p style={{ margin: 0 }} data-testid="owr-action"><strong>Do this:</strong> {REDUCTION_LABEL[top.recommendedReductionAction] ?? top.recommendedReductionAction}</p>
      {/* Business impact / explanation second. */}
      <p style={{ margin: 0, fontSize: 13 }} data-testid="owr-explanation">{top.ownerVisibleExplanation}</p>
      <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap", fontSize: 12 }}>
        <span data-testid="owr-approval"><Badge variant={top.approvalLevel === "OWNER" ? "destructive" : "default"}>{APPROVAL_LABEL[top.approvalLevel] ?? top.approvalLevel}</Badge></span>
        <span data-testid="owr-guardrail" style={{ color: "#6b7280" }}>{top.riskGuardrail}</span>
      </div>
      {/* Evidence collapsed by default (cockpit standard — no owner overload). */}
      {evidence.length > 0 && (
        <details data-testid="owr-evidence">
          <summary style={{ cursor: "pointer", fontSize: 12, color: "#6b7280" }}>Evidence ({evidence.length})</summary>
          <p style={{ margin: "6px 0 0", fontSize: 12, color: "#6b7280", wordBreak: "break-all" }}>{evidence.slice(0, 8).join(", ")}</p>
        </details>
      )}
      {top.missingData.length > 0 && (
        <p style={{ margin: 0, fontSize: 12, color: "#b45309" }} data-testid="owr-missing">Missing data: {top.missingData.join("; ")}</p>
      )}
      {rest.length > 0 && (
        <details data-testid="owr-more">
          <summary style={{ cursor: "pointer", fontSize: 12, color: "#6b7280" }}>{rest.length} more workload item(s)</summary>
        </details>
      )}
    </section>
  );
}

// ── Approval Threshold / Auto-Action Policy ────────────────────────────────────────────────────────────

export interface ApprovalPolicyDecisionView {
  actionKey: string;
  actionType: string;
  title: string;
  riskCategory: string;
  impactLevel: string;
  confidence: string;
  approvalDecision: string;
  requiredApprovalLevel: string;
  autoExecutable: boolean;
  blocked: boolean;
  rationale: string;
  riskGuardrail: string;
  capabilityGap: boolean;
  missingCapabilityType: string | null;
  systemCapabilityRecommendation: string | null;
  supportingEvidenceIds: string[];
  missingData: string[];
}

export interface ApprovalPolicySummaryView {
  autoAllowed: number;
  managerRequired: number;
  ownerRequired: number;
  neverAuto: number;
  needsData: number;
}

export interface ApprovalPolicyView {
  decisions: ApprovalPolicyDecisionView[];
  topDecision: ApprovalPolicyDecisionView | null;
  summary: ApprovalPolicySummaryView;
  capabilityRecommendations: string[];
}

const DECISION_LABEL: Record<string, string> = {
  AUTO_ALLOWED: "Auto-allowed",
  MANAGER_APPROVAL_REQUIRED: "Manager approval required",
  OWNER_APPROVAL_REQUIRED: "Owner approval required",
  NEVER_AUTO: "Never auto-executed — owner only",
  NEEDS_DATA: "Needs data first",
};
const DECISION_VARIANT = (d: string): "destructive" | "warning" | "default" | "muted" =>
  d === "NEVER_AUTO" || d === "OWNER_APPROVAL_REQUIRED" ? "destructive" : d === "NEEDS_DATA" ? "warning" : d === "MANAGER_APPROVAL_REQUIRED" ? "default" : "muted";

/**
 * ApprovalPolicyPanel — Executive Cockpit standard for the auto-action policy: the single most-restrictive
 * action decision by default (what OpsIQ may/may not do without approval), the required approval, the risk
 * guardrail, any capability OpsIQ would have to build before it could ever safely automate, evidence
 * collapsed, and the remaining decisions behind a summary. Prop-driven; no business logic. No fabricated
 * money, no disciplinary language, no hidden score.
 */
export function ApprovalPolicyPanel({ data }: { data: ApprovalPolicyView | null }) {
  const top = data?.topDecision ?? null;
  if (!top) {
    return (
      <div data-testid="approval-policy-empty" style={{ padding: 16, color: "#6b7280" }}>
        No pending actions to govern — nothing is awaiting an approval decision right now.
      </div>
    );
  }
  const s = data!.summary;
  const rest = (data?.decisions ?? []).slice(1);
  return (
    <section data-testid="approval-policy-panel" data-approval-decision={top.approvalDecision}
      style={{ border: "1px solid #e5e7eb", borderRadius: 8, padding: 16, display: "flex", flexDirection: "column", gap: 10 }}>
      <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
        <strong data-testid="app-action">{top.title}</strong>
        <span data-testid="app-decision"><Badge variant={DECISION_VARIANT(top.approvalDecision)}>{DECISION_LABEL[top.approvalDecision] ?? top.approvalDecision}</Badge></span>
      </div>
      {/* Approval / who acts, first. */}
      <p style={{ margin: 0, fontSize: 13 }} data-testid="app-rationale">{top.rationale}</p>
      <span data-testid="app-guardrail" style={{ fontSize: 12, color: "#6b7280" }}>{top.riskGuardrail}</span>
      {/* Capability gap — what OpsIQ would have to build before it could ever safely automate this. */}
      {top.capabilityGap && top.systemCapabilityRecommendation && (
        <p style={{ margin: 0, fontSize: 12, color: "#b45309" }} data-testid="app-capability">
          <strong>Capability gap:</strong> {top.systemCapabilityRecommendation}
        </p>
      )}
      {top.supportingEvidenceIds.length > 0 && (
        <details data-testid="app-evidence">
          <summary style={{ cursor: "pointer", fontSize: 12, color: "#6b7280" }}>Evidence ({top.supportingEvidenceIds.length})</summary>
          <p style={{ margin: "6px 0 0", fontSize: 12, color: "#6b7280", wordBreak: "break-all" }}>{top.supportingEvidenceIds.slice(0, 8).join(", ")}</p>
        </details>
      )}
      {top.missingData.length > 0 && (
        <p style={{ margin: 0, fontSize: 12, color: "#b45309" }} data-testid="app-missing">Missing data: {top.missingData.join("; ")}</p>
      )}
      <span data-testid="app-summary" style={{ fontSize: 12, color: "#6b7280" }}>
        {s.autoAllowed} auto · {s.managerRequired} manager · {s.ownerRequired} owner · {s.neverAuto} never-auto · {s.needsData} needs-data
      </span>
      {rest.length > 0 && (
        <details data-testid="app-more">
          <summary style={{ cursor: "pointer", fontSize: 12, color: "#6b7280" }}>{rest.length} more action decision(s)</summary>
        </details>
      )}
    </section>
  );
}

// ── OpsIQ Capability Gap Detector ──────────────────────────────────────────────────────────────────────

export interface CapabilityRecommendationView {
  capabilityType: string;
  title: string;
  severity: string;
  problemStatement: string;
  recommendedCapability: string;
  ownerBenefit: string;
  unlocksAutomation: boolean;
  unlockedActionTypes: string[];
  governanceGuardrail: string;
  signalCount: number;
  evidenceRefs: string[];
  blocksToday: string[];
  missingData: string[];
  estimatedComplexity: string;
  priorityRank: number;
}

export interface CapabilityGapSummaryView {
  total: number;
  critical: number;
  high: number;
  unlocksAutomation: number;
}

export interface CapabilityGapView {
  recommendations: CapabilityRecommendationView[];
  topRecommendation: CapabilityRecommendationView | null;
  summary: CapabilityGapSummaryView;
}

/**
 * CapabilityGapPanel — Executive Cockpit standard for the system feature recommendations: the single
 * highest-priority capability OpsIQ should build by default (what it can't do today, the capability, the
 * owner benefit, the governance guardrail), what it would unlock, evidence/blocks collapsed, a summary
 * counts line, and the rest behind a summary. Prop-driven; no business logic. Every item is a recommendation,
 * never auto-built; no fabricated money, no disciplinary label, no hidden score.
 */
export function CapabilityGapPanel({ data }: { data: CapabilityGapView | null }) {
  const top = data?.topRecommendation ?? null;
  if (!top) {
    return (
      <div data-testid="capability-gap-empty" style={{ padding: 16, color: "#6b7280" }}>
        No capability gap detected — OpsIQ has what it needs for the current signals.
      </div>
    );
  }
  const s = data!.summary;
  const rest = (data?.recommendations ?? []).slice(1);
  const evidence = [...top.evidenceRefs, ...top.blocksToday];
  return (
    <section data-testid="capability-gap-panel" data-capability-type={top.capabilityType}
      style={{ border: "1px solid #e5e7eb", borderRadius: 8, padding: 16, display: "flex", flexDirection: "column", gap: 10 }}>
      <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
        <strong data-testid="cap-title">Build: {top.title}</strong>
        <Badge variant={SEVERITY_VARIANT(top.severity)}>{top.severity}</Badge>
        <span data-testid="cap-complexity" style={{ fontSize: 12, color: "#6b7280" }}>{top.estimatedComplexity} build</span>
      </div>
      {/* What OpsIQ can't do today, then the capability, then the owner benefit. */}
      <p style={{ margin: 0, fontSize: 13 }} data-testid="cap-problem">{top.problemStatement}</p>
      <p style={{ margin: 0 }} data-testid="cap-capability"><strong>Recommendation:</strong> {top.recommendedCapability}</p>
      <p style={{ margin: 0, fontSize: 13 }} data-testid="cap-benefit">{top.ownerBenefit}</p>
      {top.unlocksAutomation && top.unlockedActionTypes.length > 0 && (
        <span data-testid="cap-unlocks" style={{ fontSize: 12, color: "#047857" }}>Would let OpsIQ safely assist with: {top.unlockedActionTypes.join(", ")}</span>
      )}
      <span data-testid="cap-guardrail" style={{ fontSize: 12, color: "#6b7280" }}>{top.governanceGuardrail}</span>
      {evidence.length > 0 && (
        <details data-testid="cap-evidence">
          <summary style={{ cursor: "pointer", fontSize: 12, color: "#6b7280" }}>Why ({top.signalCount} signal{top.signalCount === 1 ? "" : "s"})</summary>
          <p style={{ margin: "6px 0 0", fontSize: 12, color: "#6b7280", wordBreak: "break-all" }}>{evidence.slice(0, 8).join("; ")}</p>
        </details>
      )}
      <span data-testid="cap-summary" style={{ fontSize: 12, color: "#6b7280" }}>
        {s.total} capability gap(s) · {s.critical} critical · {s.high} high · {s.unlocksAutomation} unlock automation
      </span>
      {rest.length > 0 && (
        <details data-testid="cap-more">
          <summary style={{ cursor: "pointer", fontSize: 12, color: "#6b7280" }}>{rest.length} more capability recommendation(s)</summary>
        </details>
      )}
    </section>
  );
}

// ── Cash / Profit Protection ───────────────────────────────────────────────────────────────────────────

export interface CashProfitSignalView {
  signalType: string;
  category: string;
  severity: string;
  title: string;
  ownerExplanation: string;
  protectiveAction: string;
  approvalLevel: string;
  requiresOwnerReview: boolean;
  riskGuardrail: string;
  observedCount: number;
  metricType: string | null;
  metricValue: number | null;
  metricThreshold: number | null;
  thresholdBreached: boolean;
  supportingProofIds: string[];
  supportingOperationalEventIds: string[];
  supportingFinancialSnapshotIds: string[];
  missingData: string[];
}

export interface CashProfitSummaryView {
  total: number;
  critical: number;
  high: number;
  ownerReviewRequired: number;
}

export interface CashProfitProtectionView {
  signals: CashProfitSignalView[];
  topSignal: CashProfitSignalView | null;
  summary: CashProfitSummaryView;
}

const PROTECTIVE_ACTION_LABEL: Record<string, string> = {
  REVIEW_PRICING: "Review pricing", TIGHTEN_DISCOUNT_POLICY: "Tighten discount policy", REPRICE_B2B_CONTRACT: "Reprice the B2B contract at renewal",
  REDUCE_REWORK_AT_SOURCE: "Fix the rework at its source", REVIEW_DELIVERY_COST: "Review delivery cost", REBALANCE_STAFFING: "Rebalance staffing",
  PROTECT_CASH_RUNWAY: "Protect cash runway", CHASE_RECEIVABLES: "Chase overdue receivables", CAPTURE_UNIT_ECONOMICS: "Capture per-job economics",
  COLLECT_FINANCIAL_DATA: "Collect the missing financial data",
};
const METRIC_LABEL: Record<string, string> = {
  CASH_RUNWAY_DAYS: "days of runway", NET_MARGIN_PCT: "% net margin", BELOW_COST_JOB_COUNT: "below-cost jobs",
  DISCOUNTED_JOB_COUNT: "discounted jobs", REWORK_EVENT_COUNT: "rework events", DELIVERY_COST_EVENT_COUNT: "high delivery-cost jobs",
  SLOW_JOB_COUNT: "slower-than-norm jobs", UNDERPRICED_B2B_COUNT: "under-priced B2B accounts", OVERDUE_RECEIVABLE_COUNT: "overdue receivables",
};

/**
 * CashProfitPanel — Executive Cockpit standard for cash/profit protection: the single most severe risk by
 * default (the protective action first, the plain-language explanation, a REAL metric value if available,
 * the owner-review marker and guardrail), evidence collapsed, a summary counts line, and the rest behind a
 * summary. Prop-driven; no business logic. No fabricated money figure, no disciplinary label, no hidden score.
 */
export function CashProfitPanel({ data }: { data: CashProfitProtectionView | null }) {
  const top = data?.topSignal ?? null;
  if (!top) {
    return (
      <div data-testid="cash-profit-empty" style={{ padding: 16, color: "#6b7280" }}>
        No cash or profit risk detected — nothing needs protecting right now.
      </div>
    );
  }
  const s = data!.summary;
  const rest = (data?.signals ?? []).slice(1);
  const evidence = [...top.supportingFinancialSnapshotIds, ...top.supportingProofIds, ...top.supportingOperationalEventIds];
  return (
    <section data-testid="cash-profit-panel" data-signal-type={top.signalType}
      style={{ border: "1px solid #e5e7eb", borderRadius: 8, padding: 16, display: "flex", flexDirection: "column", gap: 10, minWidth: 0 }}>
      <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
        <strong data-testid="cp-title">{top.title}</strong>
        <Badge variant={SEVERITY_VARIANT(top.severity)}>{top.severity}</Badge>
        {top.metricValue !== null && top.metricType ? (
          <span data-testid="cp-metric" style={{ fontSize: 12, color: "#6b7280" }}>{top.metricValue} {METRIC_LABEL[top.metricType] ?? ""}</span>
        ) : null}
      </div>
      {/* Protective action first. */}
      <p style={{ margin: 0 }} data-testid="cp-action"><strong>Protect it:</strong> {PROTECTIVE_ACTION_LABEL[top.protectiveAction] ?? top.protectiveAction}</p>
      <p style={{ margin: 0, fontSize: 13 }} data-testid="cp-explanation">{top.ownerExplanation}</p>
      <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap", fontSize: 12 }}>
        <span data-testid="cp-approval"><Badge variant={top.requiresOwnerReview ? "destructive" : "default"}>{top.requiresOwnerReview ? "Owner review required" : APPROVAL_LABEL[top.approvalLevel] ?? top.approvalLevel}</Badge></span>
        <span data-testid="cp-guardrail" style={{ color: "#6b7280" }}>{top.riskGuardrail}</span>
      </div>
      {evidence.length > 0 && (
        <details data-testid="cp-evidence">
          <summary style={{ cursor: "pointer", fontSize: 12, color: "#6b7280" }}>Evidence ({evidence.length})</summary>
          <p style={{ margin: "6px 0 0", fontSize: 12, color: "#6b7280", wordBreak: "break-all" }}>{evidence.slice(0, 8).join(", ")}</p>
        </details>
      )}
      {top.missingData.length > 0 && (
        <p style={{ margin: 0, fontSize: 12, color: "#b45309" }} data-testid="cp-missing">Missing data: {top.missingData.join("; ")}</p>
      )}
      <span data-testid="cp-summary" style={{ fontSize: 12, color: "#6b7280" }}>
        {s.total} risk(s) · {s.critical} critical · {s.high} high · {s.ownerReviewRequired} need owner review
      </span>
      {rest.length > 0 && (
        <details data-testid="cp-more">
          <summary style={{ cursor: "pointer", fontSize: 12, color: "#6b7280" }}>{rest.length} more cash/profit risk(s)</summary>
        </details>
      )}
    </section>
  );
}

// ── External Opportunity Intelligence ──────────────────────────────────────────────────────────────────

export interface OpportunityCandidateView {
  opportunityType: string;
  signalSourceType: string;
  sourceEvidenceSummary: string;
  sourceRefs: string[];
  customerPainPoint: string;
  targetCustomerSegment: string;
  expectedValueHypothesis: string;
  confidence: string;
  missingData: string[];
  cashRisk: string;
  ownerWorkloadRisk: string;
  legalOrComplianceRisk: string;
  validationRequired: boolean;
  recommendedNextStep: string;
  approvalLevel: string;
  relatedCapabilityGap: string | null;
  systemCapabilityRecommendation: string | null;
  riskIfIgnored: string;
}

export interface TenderCandidateView {
  signalSourceType: string;
  opportunityTitle: string;
  targetBuyer: string;
  eligibility: string;
  emdExposure: string;
  paymentDelayRisk: string;
  workingCapitalRequirement: string;
  compliance: string;
  capacityFit: string;
  unitEconomics: string;
  bidDeadlineDays: number | null;
  tenderDecision: string;
  readyToBid: boolean;
  ownerApprovalRequired: boolean;
  missingData: string[];
  ownerVisibleExplanation: string;
}

export interface ExternalOpportunitySummaryView {
  rawSignals: number;
  duplicatesCollapsed: number;
  irrelevantOrParked: number;
  needsData: number;
  candidates: number;
  tenderCandidates: number;
  ownerReviewRequired: number;
}

export interface ExternalOpportunityView {
  candidates: OpportunityCandidateView[];
  topCandidate: OpportunityCandidateView | null;
  tenderCandidates: TenderCandidateView[];
  topTenderCandidate: TenderCandidateView | null;
  summary: ExternalOpportunitySummaryView;
}

const NEXT_STEP_LABEL: Record<string, string> = {
  VALIDATE_CHEAPLY: "Validate cheaply", OWNER_REVIEW: "Owner review", NEEDS_CAPABILITY: "Needs a capability first",
  COLLECT_DATA: "Collect more data", COLLECT_COST_DATA: "Collect cost data", COLLECT_ELIGIBILITY_DATA: "Collect eligibility data",
  PREPARE_BID_DRAFT: "Prepare an owner-reviewed draft", PARK: "Park for now", REJECT: "Reject",
};
const TENDER_DECISION_LABEL: Record<string, string> = {
  REJECT_UNFIT: "Reject — unfit", PARK: "Park", COLLECT_ELIGIBILITY_DATA: "Collect eligibility data",
  COLLECT_COST_DATA: "Collect cost data", OWNER_REVIEW_REQUIRED: "Owner review required",
  VALIDATE_CHEAPLY: "Validate cheaply", PREPARE_BID_DRAFT: "Prepare draft for owner (no auto-submit)",
  DO_NOT_BID: "Do not bid", NEEDS_CAPABILITY: "Needs a capability first",
};
const OPP_TYPE_LABEL: Record<string, string> = {
  NEW_SERVICE: "New service", B2B_OFFER: "B2B offer", PRICING_TEST: "Pricing test", CUSTOMER_SEGMENT: "New customer segment",
  RETENTION_CAMPAIGN: "Customer retention", LOCAL_PARTNERSHIP: "Local partnership", OPERATIONS_ADJACENCY: "Operations adjacency",
  MARKETING_CHANNEL: "Marketing channel", SUPPLIER_ADVANTAGE: "Supplier advantage", TENDER_BID: "Tender / procurement", OTHER: "Opportunity",
};

/**
 * OpportunityPanel — Executive Cockpit standard for external opportunity intelligence: the single top
 * MATERIAL opportunity candidate by default (recommended next step first — always validate/review, never
 * scale), plus a tender/procurement candidate only when materially relevant (which is never auto-submitted).
 * Evidence collapsed; ingested/deduped/parked signals are summarised, never dumped. No fabricated market
 * data, no profit guarantee, no hidden score.
 */
export function OpportunityPanel({ data }: { data: ExternalOpportunityView | null }) {
  const top = data?.topCandidate ?? null;
  const tender = data?.topTenderCandidate ?? null;
  if (!top && !tender) {
    return (
      <div data-testid="opportunity-empty" style={{ padding: 16, color: "#6b7280" }}>
        No validated opportunity candidate yet — OpsIQ ingests signals broadly but surfaces one only when there is evidence worth testing.
      </div>
    );
  }
  const s = data!.summary;
  return (
    <section data-testid="opportunity-panel" data-next-step={top?.recommendedNextStep ?? "NONE"}
      style={{ border: "1px solid #e5e7eb", borderRadius: 8, padding: 16, display: "flex", flexDirection: "column", gap: 10, minWidth: 0 }}>
      {top && (
        <>
          <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
            <strong data-testid="opp-title">{OPP_TYPE_LABEL[top.opportunityType] ?? top.opportunityType}</strong>
            <Badge variant={top.recommendedNextStep === "OWNER_REVIEW" ? "destructive" : top.recommendedNextStep === "VALIDATE_CHEAPLY" ? "default" : "warning"}>{NEXT_STEP_LABEL[top.recommendedNextStep] ?? top.recommendedNextStep}</Badge>
            <span data-testid="opp-confidence" style={{ fontSize: 12, color: "#6b7280" }}>{top.confidence} confidence</span>
          </div>
          <p style={{ margin: 0, fontSize: 13 }} data-testid="opp-why">{top.expectedValueHypothesis}</p>
          <p style={{ margin: 0, fontSize: 12, color: "#6b7280" }} data-testid="opp-segment">For: {top.targetCustomerSegment} · Pain: {top.customerPainPoint}</p>
          <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap", fontSize: 12 }}>
            <span data-testid="opp-cashrisk">Cash risk: {top.cashRisk}</span>
            <span data-testid="opp-workloadrisk">Owner-workload risk: {top.ownerWorkloadRisk}</span>
            <span data-testid="opp-validation">{top.validationRequired ? "Validation required before any scale" : ""}</span>
          </div>
          <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap", fontSize: 12 }}>
            <span data-testid="opp-approval"><Badge variant={top.approvalLevel === "OWNER" ? "destructive" : "default"}>{APPROVAL_LABEL[top.approvalLevel] ?? top.approvalLevel}</Badge></span>
            {top.relatedCapabilityGap ? <span data-testid="opp-capgap" style={{ color: "#b45309" }}>Needs capability: {top.relatedCapabilityGap}</span> : null}
          </div>
          {top.sourceRefs.length > 0 && (
            <details data-testid="opp-evidence">
              <summary style={{ cursor: "pointer", fontSize: 12, color: "#6b7280" }}>Evidence ({top.sourceRefs.length})</summary>
              <p style={{ margin: "6px 0 0", fontSize: 12, color: "#6b7280", wordBreak: "break-all" }}>{top.sourceEvidenceSummary} — {top.sourceRefs.slice(0, 8).join(", ")}</p>
            </details>
          )}
          {top.missingData.length > 0 && (
            <p style={{ margin: 0, fontSize: 12, color: "#b45309" }} data-testid="opp-missing">Missing data: {top.missingData.join("; ")}</p>
          )}
        </>
      )}
      {/* Tender / procurement candidate — surfaced only when materially relevant; never auto-submitted. */}
      {tender && (
        <div data-testid="tender-block" data-tender-decision={tender.tenderDecision} style={{ borderTop: "1px dashed #e5e7eb", paddingTop: 10, display: "flex", flexDirection: "column", gap: 6 }}>
          <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
            <strong style={{ fontSize: 13 }} data-testid="tender-title">Tender / procurement: {tender.opportunityTitle}</strong>
            <Badge variant={tender.tenderDecision === "PREPARE_BID_DRAFT" ? "default" : "destructive"}>{TENDER_DECISION_LABEL[tender.tenderDecision] ?? tender.tenderDecision}</Badge>
          </div>
          <p style={{ margin: 0, fontSize: 12, color: "#6b7280" }} data-testid="tender-explanation">{tender.ownerVisibleExplanation}</p>
          <span style={{ fontSize: 12, color: "#6b7280" }} data-testid="tender-risk">Eligibility: {tender.eligibility} · EMD: {tender.emdExposure} · Payment-delay: {tender.paymentDelayRisk} · Working-capital: {tender.workingCapitalRequirement} · Capacity: {tender.capacityFit}</span>
          <span style={{ fontSize: 12, color: "#b45309" }} data-testid="tender-guardrail">OpsIQ never submits or bids automatically — owner approval is required. {tender.readyToBid ? "A draft may be prepared." : "Not ready to bid."}</span>
        </div>
      )}
      <span data-testid="opp-summary" style={{ fontSize: 12, color: "#6b7280" }}>
        {s.rawSignals} signal(s) ingested · {s.duplicatesCollapsed} deduped · {s.needsData} need data · {s.irrelevantOrParked} parked/rejected · {s.candidates} candidate(s) · {s.tenderCandidates} tender(s)
      </span>
    </section>
  );
}

// ── Opportunity Validation Experiment Engine (depth pass) ──────────────────────────────────────────────

export interface ValidationExperimentView {
  experimentType: string;
  opportunityType: string;
  hypothesis: string;
  riskiestAssumption: string;
  method: string;
  successThreshold: string;
  failureThreshold: string;
  stopLossRule: string;
  costCap: number | null;
  ownerTimeCapMinutes: number;
  durationDays: number;
  sampleSizeTarget: number;
  dataToCollect: string[];
  requiresOwnerApproval: boolean;
  approvalLevel: string;
  cheaperAlternativeConsidered: string;
  doNotScaleNote: string;
  confidence: string;
}

export interface DeferredValidationView {
  opportunityType: string;
  reason: string;
  ownerVisibleExplanation: string;
}

export interface ValidationSummaryView {
  candidatesConsidered: number;
  experimentsDesigned: number;
  deferred: number;
  dataCollectionOnly: number;
  ownerApprovalRequired: number;
}

export interface OpportunityValidationView {
  experiments: ValidationExperimentView[];
  topExperiment: ValidationExperimentView | null;
  deferred: DeferredValidationView[];
  summary: ValidationSummaryView;
}

const EXPERIMENT_TYPE_LABEL: Record<string, string> = {
  CUSTOMER_INTEREST_TEST: "Customer-interest test", B2B_OUTREACH_TEST: "B2B outreach test",
  PRICING_TEST: "Controlled pricing test", LANDING_OR_FORM_TEST: "Simple form / landing test",
  WHATSAPP_OR_CALL_SCRIPT_TEST: "Direct message/call test", MANUAL_SURVEY: "Manual survey",
  SMALL_BATCH_TRIAL: "Small batch trial", PARTNERSHIP_TEST: "Partnership conversation test",
  DATA_COLLECTION_ONLY: "Collect data first (no spend)",
};

/**
 * ValidationPanel — Executive Cockpit standard for the Opportunity Validation Experiment Engine: the single
 * next experiment to run (cheapest bounded probe of the riskiest assumption) with its success/failure
 * thresholds, hard cost/time/sample caps and stop-loss, an explicit "not permission to scale" note, and an
 * owner-approval flag where material. Deferred candidates are summarised, never dumped. No fabricated money.
 */
export function ValidationPanel({ data }: { data: OpportunityValidationView | null }) {
  const top = data?.topExperiment ?? null;
  if (!top) {
    return (
      <div data-testid="validation-empty" style={{ padding: 16, color: "#6b7280" }}>
        No validation experiment to run yet — an experiment is designed only once there is a candidate worth testing.
      </div>
    );
  }
  const s = data!.summary;
  return (
    <section data-testid="validation-panel" data-experiment-type={top.experimentType}
      style={{ border: "1px solid #e5e7eb", borderRadius: 8, padding: 16, display: "flex", flexDirection: "column", gap: 10, minWidth: 0 }}>
      <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
        <strong data-testid="val-title">{EXPERIMENT_TYPE_LABEL[top.experimentType] ?? top.experimentType}</strong>
        <span data-testid="val-approval-badge"><Badge variant={top.requiresOwnerApproval ? "destructive" : "default"}>{top.requiresOwnerApproval ? "Owner approval required" : "Manager can run"}</Badge></span>
        <span data-testid="val-confidence" style={{ fontSize: 12, color: "#6b7280" }}>{top.confidence} confidence</span>
      </div>
      <p style={{ margin: 0, fontSize: 13 }} data-testid="val-hypothesis">Test: {top.hypothesis}</p>
      <p style={{ margin: 0, fontSize: 12, color: "#6b7280" }} data-testid="val-method">{top.method}</p>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", fontSize: 12 }}>
        <span data-testid="val-success" style={{ color: "#15803d" }}>Pass if: {top.successThreshold}</span>
        <span data-testid="val-failure" style={{ color: "#b91c1c" }}>Fail if: {top.failureThreshold}</span>
      </div>
      <span data-testid="val-caps" style={{ fontSize: 12, color: "#6b7280" }}>
        Caps: ≤{top.ownerTimeCapMinutes} min owner time · {top.durationDays} day(s) · ~{top.sampleSizeTarget} sample{top.costCap != null ? ` · spend ≤ ${top.costCap}` : " · no spend"}
      </span>
      <span data-testid="val-stoploss" style={{ fontSize: 12, color: "#b45309" }}>Stop-loss: {top.stopLossRule}</span>
      <span data-testid="val-noscale" style={{ fontSize: 12, color: "#6b7280" }}>{top.doNotScaleNote}</span>
      <details data-testid="val-detail">
        <summary style={{ cursor: "pointer", fontSize: 12, color: "#6b7280" }}>Why this experiment</summary>
        <p style={{ margin: "6px 0 0", fontSize: 12, color: "#6b7280" }}>Riskiest assumption: {top.riskiestAssumption}</p>
        <p style={{ margin: "6px 0 0", fontSize: 12, color: "#6b7280" }}>{top.cheaperAlternativeConsidered}</p>
        {top.dataToCollect.length > 0 && <p style={{ margin: "6px 0 0", fontSize: 12, color: "#6b7280" }}>Data to collect: {top.dataToCollect.join("; ")}</p>}
      </details>
      <span data-testid="val-summary" style={{ fontSize: 12, color: "#6b7280" }}>
        {s.candidatesConsidered} candidate(s) · {s.experimentsDesigned} experiment(s) designed · {s.dataCollectionOnly} data-first · {s.deferred} deferred · {s.ownerApprovalRequired} need owner approval
      </span>
    </section>
  );
}

// ── Opportunity Portfolio / Capital Allocation (depth pass) ────────────────────────────────────────────

export interface PortfolioItemView {
  opportunityType: string;
  signalSourceType: string;
  title: string;
  targetCustomerSegment: string;
  portfolioDecision: string;
  validationStatus: string;
  confidence: string;
  cashRisk: string;
  capitalAtRiskBand: string;
  expectedReturnBand: string;
  requiresOwnerApproval: boolean;
  approvalLevel: string;
  scaleBlockedReason: string | null;
  recommendedAction: string;
  riskIfIgnored: string;
  supportingRefs: string[];
}

export interface PortfolioSummaryView {
  itemsConsidered: number;
  validateFirst: number;
  ownerReviewRequired: number;
  parkedOrRejected: number;
  killed: number;
  scaleCandidates: number;
  doNow: number;
}

export interface OpportunityPortfolioView {
  items: PortfolioItemView[];
  topItem: PortfolioItemView | null;
  capitalDisciplineNote: string;
  summary: PortfolioSummaryView;
}

const PORTFOLIO_DECISION_LABEL: Record<string, string> = {
  DO_NOW: "Do now (small scale)", SCALE_CANDIDATE: "Scale candidate — owner approval",
  VALIDATE_CHEAPLY: "Validate cheaply first", NEEDS_DATA: "Collect data first",
  OWNER_REVIEW_REQUIRED: "Owner review required", PARK: "Park", REJECT: "Reject", KILL: "Stop — validation failed",
};

/**
 * PortfolioPanel — Executive Cockpit standard for the Opportunity Portfolio / Capital Allocation engine: the
 * single top portfolio decision (what to do with capital next), the validation status that gates it, why
 * scaling is or isn't unblocked, qualitative capital-at-risk + expected-return bands (never fabricated money),
 * and an always-present capital-discipline note (capital follows proof). Deferred detail collapsed; a summary,
 * never a raw dump. No profit guarantee, no reckless scale, no hidden score.
 */
export function PortfolioPanel({ data }: { data: OpportunityPortfolioView | null }) {
  const top = data?.topItem ?? null;
  if (!top) {
    return (
      <div data-testid="portfolio-empty" style={{ padding: 16, color: "#6b7280" }}>
        No opportunity in the portfolio yet — capital is allocated only once there is a candidate worth deciding on.
      </div>
    );
  }
  const s = data!.summary;
  const scalable = top.scaleBlockedReason === null;
  return (
    <section data-testid="portfolio-panel" data-decision={top.portfolioDecision}
      style={{ border: "1px solid #e5e7eb", borderRadius: 8, padding: 16, display: "flex", flexDirection: "column", gap: 10, minWidth: 0 }}>
      <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
        <strong data-testid="port-title">{PORTFOLIO_DECISION_LABEL[top.portfolioDecision] ?? top.portfolioDecision}</strong>
        <span data-testid="port-approval-badge"><Badge variant={top.requiresOwnerApproval ? "destructive" : "default"}>{top.requiresOwnerApproval ? "Owner approval required" : "Manager can act"}</Badge></span>
        <span data-testid="port-validation" style={{ fontSize: 12, color: "#6b7280" }}>Validation: {top.validationStatus}</span>
      </div>
      <p style={{ margin: 0, fontSize: 13 }} data-testid="port-action">{top.recommendedAction}</p>
      <p style={{ margin: 0, fontSize: 12, color: "#6b7280" }} data-testid="port-what">{top.title} · for {top.targetCustomerSegment}</p>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", fontSize: 12, color: "#6b7280" }}>
        <span data-testid="port-capital">Capital at risk: {top.capitalAtRiskBand}</span>
        <span data-testid="port-return">Expected return: {top.expectedReturnBand}</span>
        <span data-testid="port-confidence">{top.confidence} confidence</span>
      </div>
      {scalable
        ? <span data-testid="port-scale" style={{ fontSize: 12, color: "#15803d" }}>Scaling is unblocked — validation has passed.</span>
        : <span data-testid="port-scale" style={{ fontSize: 12, color: "#b45309" }}>Scaling blocked: {top.scaleBlockedReason}</span>}
      <span data-testid="port-discipline" style={{ fontSize: 12, color: "#6b7280" }}>{data!.capitalDisciplineNote}</span>
      <span data-testid="port-summary" style={{ fontSize: 12, color: "#6b7280" }}>
        {s.itemsConsidered} opportunity(ies) · {s.doNow} do-now · {s.scaleCandidates} scale · {s.validateFirst} validate/collect · {s.ownerReviewRequired} owner review · {s.parkedOrRejected} parked/rejected · {s.killed} stopped
      </span>
    </section>
  );
}

// ── Opportunity Operating Layer (structured intake, hostile-hardened) ──────────────────────────────────

export interface TenderReadinessView {
  eligibilityStatus: string;
  missingDocuments: string[];
  emdOrSecurityRisk: string;
  paymentDelayRisk: string;
  complianceRisk: string;
  deadlineUrgency: string;
  bidDecision: string;
  submissionAllowed: boolean;
}
export interface PrepChecklistView {
  checklistType: string;
  blockingItems: string[];
  managerCollectableItems: string[];
  staffCollectableItems: string[];
  opsIqDraftableItems: string[];
  nextChecklistAction: string;
}
export interface OperatingOpportunityView {
  rawSignalType: string;
  opportunityTitle: string;
  targetCustomerSegment: string;
  sourceQuality: string;
  evidenceStrength: string;
  businessFit: string;
  capacityFit: string;
  executionReadiness: string;
  freshness: string;
  isTender: boolean;
  tenderReadiness: TenderReadinessView | null;
  winReadiness: string;
  winReadinessReasons: string[];
  proofPackRequirements: string[];
  prepChecklist: PrepChecklistView | null;
  negativeReasons: string[];
  nextActionOwner: string;
  recommendedNextStep: string;
  opportunityQuality: string;
  validationRequired: boolean;
  ownerVisibleSummary: string;
}
export interface OpportunityClusterView {
  clusterTheme: string;
  sourceSignalCount: number;
  duplicateCount: number;
  ownerVisibleSummary: string;
}
export interface OpportunityOperatingSummaryView {
  rawSignals: number;
  clusters: number;
  candidates: number;
  tenderCandidates: number;
  parkedOrRejected: number;
  needsData: number;
  ownerReviewRequired: number;
  expiredOrStale: number;
}
export interface OpportunityOperatingView {
  opportunities: OperatingOpportunityView[];
  topOpportunity: OperatingOpportunityView | null;
  clusters: OpportunityClusterView[];
  topCluster: OpportunityClusterView | null;
  capabilityRecommendations: string[];
  summary: OpportunityOperatingSummaryView;
}

const NEXT_OWNER_LABEL: Record<string, string> = {
  OWNER: "Owner decides", MANAGER: "Manager collects", STAFF: "Staff collects", OPSIQ_DRAFT: "OpsIQ drafts",
  EXTERNAL_ADVISOR: "External advisor", NO_ACTION: "No action",
};

/**
 * OpportunityOperatingPanel — Executive Cockpit surface for the structured-intake opportunity operating
 * layer: the single top opportunity (or cluster) with its transparent quality band, business/capacity fit,
 * tender bid/no-bid state (never auto-submittable), win-readiness, negative reasons, a delegated prep
 * checklist, and the next-action owner. Similar signals collapse into one cluster (no raw spam). No hidden
 * score, no win %, no profit guarantee, no scale-before-validation.
 */
export function OpportunityOperatingPanel({ data }: { data: OpportunityOperatingView | null }) {
  const top = data?.topOpportunity ?? null;
  if (!top) {
    return (
      <div data-testid="operating-empty" style={{ padding: 16, color: "#6b7280" }}>
        No structured opportunity signals yet — submit one and OpsIQ classifies, screens, and prioritises it.
      </div>
    );
  }
  const s = data!.summary;
  const t = top.tenderReadiness;
  return (
    <section data-testid="operating-panel" data-quality={top.opportunityQuality} data-next-owner={top.nextActionOwner}
      style={{ border: "1px solid #e5e7eb", borderRadius: 8, padding: 16, display: "flex", flexDirection: "column", gap: 10, minWidth: 0 }}>
      <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
        <strong data-testid="op-title">{top.opportunityTitle}</strong>
        <Badge variant={top.opportunityQuality === "HIGH" ? "default" : top.opportunityQuality === "LOW" ? "destructive" : "warning"}>{top.opportunityQuality} quality</Badge>
        <span data-testid="op-next-owner"><Badge variant={top.nextActionOwner === "OWNER" ? "destructive" : "default"}>{NEXT_OWNER_LABEL[top.nextActionOwner] ?? top.nextActionOwner}</Badge></span>
      </div>
      <p style={{ margin: 0, fontSize: 12, color: "#6b7280" }} data-testid="op-fit">
        Business fit: {top.businessFit} · Capacity: {top.capacityFit} · Evidence: {top.evidenceStrength} ({top.sourceQuality}) · Readiness: {top.executionReadiness} · Freshness: {top.freshness}
      </p>
      <p style={{ margin: 0, fontSize: 13 }} data-testid="op-step">Next: {top.recommendedNextStep.replace(/_/g, " ").toLowerCase()} · Win-readiness: {top.winReadiness}</p>
      {top.negativeReasons.length > 0 && (
        <p style={{ margin: 0, fontSize: 12, color: "#b45309" }} data-testid="op-negatives">Watch: {top.negativeReasons.slice(0, 5).join(", ")}</p>
      )}
      {t && (
        <div data-testid="op-tender" data-bid-decision={t.bidDecision} style={{ borderTop: "1px dashed #e5e7eb", paddingTop: 8, fontSize: 12, color: "#6b7280", display: "flex", flexDirection: "column", gap: 4 }}>
          <span>Tender: eligibility {t.eligibilityStatus} · EMD {t.emdOrSecurityRisk} · payment-delay {t.paymentDelayRisk} · compliance {t.complianceRisk} · deadline {t.deadlineUrgency}</span>
          <span data-testid="op-tender-guardrail" style={{ color: "#b45309" }}>OpsIQ never submits or bids automatically — owner approval is required. {t.submissionAllowed ? "" : "Not submittable."}</span>
        </div>
      )}
      {top.prepChecklist && (
        <details data-testid="op-checklist">
          <summary style={{ cursor: "pointer", fontSize: 12, color: "#6b7280" }}>Prep checklist ({top.prepChecklist.checklistType})</summary>
          <p style={{ margin: "6px 0 0", fontSize: 12, color: "#6b7280" }}>Next: {top.prepChecklist.nextChecklistAction}</p>
          {top.prepChecklist.blockingItems.length > 0 && <p style={{ margin: "4px 0 0", fontSize: 12, color: "#b45309" }}>Blocking: {top.prepChecklist.blockingItems.join(", ")}</p>}
          {top.proofPackRequirements.length > 0 && <p style={{ margin: "4px 0 0", fontSize: 12, color: "#6b7280" }}>Proof pack: {top.proofPackRequirements.join(", ")}</p>}
        </details>
      )}
      <span data-testid="op-validation" style={{ fontSize: 12, color: "#6b7280" }}>{top.validationRequired ? "Validation required before any scale." : ""}</span>
      {data!.topCluster && data!.topCluster.sourceSignalCount > 1 && (
        <span data-testid="op-cluster" style={{ fontSize: 12, color: "#6b7280" }}>{data!.topCluster.ownerVisibleSummary} ({data!.topCluster.duplicateCount} duplicate(s) collapsed)</span>
      )}
      <span data-testid="op-summary" style={{ fontSize: 12, color: "#6b7280" }}>
        {s.rawSignals} signal(s) · {s.clusters} cluster(s) · {s.candidates} candidate(s) · {s.tenderCandidates} tender(s) · {s.needsData} need data · {s.parkedOrRejected} parked/rejected · {s.expiredOrStale} expired/stale
      </span>
    </section>
  );
}

// ── Validation Outcome Persistence (PASS 11) ──────────────────────────────────────────────────────────

export interface ValidationOutcomeView {
  opportunityKey: string;
  experimentKey: string;
  status: string;
  result: string;
  validationStatus: string;
  nextRecommendedDecision: string;
  approvalLevel: string;
  stopLossTriggered: boolean;
  ownerVisibleSummary: string;
  recordedAt: string;
}

const OUTCOME_DECISION_LABEL: Record<string, string> = {
  KILL: "Stop it", PARK: "Park", MODIFY: "Modify & retry", RETEST: "Retest", SCALE_CANDIDATE: "Scale candidate — owner approval", NEEDS_DATA: "Collect data",
};

/**
 * ValidationOutcomePanel — Executive Cockpit surface for recorded validation outcomes: the top opportunity's
 * real result, whether scale/kill/park is allowed and why, the next decision, and the approval level. Scale
 * is only ever a candidate (owner-approved), never automatic; a failed/stop-loss result is a stop. No fake
 * revenue/conversion/profit; no hidden score.
 */
export function ValidationOutcomePanel({ data }: { data: ValidationOutcomeView[] | null }) {
  const top = data && data.length > 0 ? data[0] : null;
  if (!top) {
    return (
      <div data-testid="outcome-empty" style={{ padding: 16, color: "#6b7280" }}>
        No validation outcome recorded yet — until a test's real result is recorded, the portfolio cannot scale or kill.
      </div>
    );
  }
  return (
    <section data-testid="outcome-panel" data-result={top.result} data-next-decision={top.nextRecommendedDecision}
      style={{ border: "1px solid #e5e7eb", borderRadius: 8, padding: 16, display: "flex", flexDirection: "column", gap: 8, minWidth: 0 }}>
      <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
        <strong data-testid="outcome-result">Result: {top.result}</strong>
        <Badge variant={top.nextRecommendedDecision === "KILL" ? "destructive" : top.nextRecommendedDecision === "SCALE_CANDIDATE" ? "default" : "warning"}>{OUTCOME_DECISION_LABEL[top.nextRecommendedDecision] ?? top.nextRecommendedDecision}</Badge>
        <span data-testid="outcome-approval"><Badge variant={top.approvalLevel === "OWNER" ? "destructive" : "default"}>{top.approvalLevel === "OWNER" ? "Owner approval" : "Manager"}</Badge></span>
      </div>
      <p style={{ margin: 0, fontSize: 13 }} data-testid="outcome-summary">{top.ownerVisibleSummary}</p>
      <span data-testid="outcome-gate" style={{ fontSize: 12, color: top.result === "PASSED" && top.nextRecommendedDecision === "SCALE_CANDIDATE" ? "#15803d" : "#b45309" }}>
        {top.result === "PASSED" && top.nextRecommendedDecision === "SCALE_CANDIDATE"
          ? "Scaling is unblocked — validation passed with evidence; owner approves the scale."
          : top.nextRecommendedDecision === "KILL"
            ? "Scaling is off the table — this result stops the opportunity."
            : "Scaling stays blocked — no passed-with-evidence result yet."}
      </span>
      {top.stopLossTriggered && <span data-testid="outcome-stoploss" style={{ fontSize: 12, color: "#b91c1c" }}>Stop-loss was triggered.</span>}
    </section>
  );
}

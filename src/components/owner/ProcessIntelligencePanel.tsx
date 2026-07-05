"use client";

/**
 * ProcessIntelligencePanel — the owner-facing surface for Process Intelligence v1 (prop-driven; no
 * business logic here). It renders the single top process breakdown the server already computed: the
 * plain-language finding, the affected stage, severity + confidence, concise evidence counts + a few
 * representative refs (never a raw dump), the related profit leak / constraint / SLO, why OpsIQ thinks
 * the stage is breaking, the one recommended correction, and whether owner/manager approval is required.
 * DATA_INSUFFICIENT renders honestly. No fraud/negligence wording; no hidden staff score.
 */

import { Badge } from "@/ui/primitives";

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

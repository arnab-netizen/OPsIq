/**
 * Process Intelligence v1 (depth pass).
 *
 * Answers "WHERE is the business process actually breaking?" over the trusted event/proof/risk/timing/
 * adjudication chain OpsIQ already computes — not a process-mining platform. It consumes the Owner Now
 * View's already-derived, already-adjudication-suppressed signals (top gaming signal, top credibility
 * concern, timing evidence, reused-hash findings, complaint/rework + operational-event health, proof
 * counts, profit leak, constraint, SLOs, owner workload) and surfaces the single highest-value process
 * breakdown with its evidence, a specific correction, and the required approval level.
 *
 * PURE + deterministic. Conservative: only a small set of high-value failure types; when the source
 * evidence is absent it returns DATA_INSUFFICIENT with the exact missing data — it never fabricates a
 * financial impact, never emits a fraud/negligence label, and never holds a hidden staff score. Because
 * it consumes the POST-suppression top signals, a cleared/dismissed proof-risk finding cannot drive an
 * active process failure; a confirmed / require-fresh finding stays active and may contribute.
 */

export type ProcessFindingType =
  | "REWORK_LOOP"
  | "QUALITY_FAILURE_LOOP"
  | "DELIVERY_HANDOFF_DELAY"
  | "REVIEW_BOTTLENECK"
  | "OWNER_APPROVAL_BOTTLENECK"
  | "PROOF_QUALITY_BREAKDOWN"
  | "ESCALATION_RESPONSE_BREAKDOWN"
  | "STAFF_TRAINING_GAP"
  | "MANAGER_REVIEW_GAP"
  | "DATA_INSUFFICIENT";

export type ProcessStage =
  | "INTAKE" | "WORK_EXECUTION" | "PROOF_SUBMISSION" | "PROOF_REVIEW"
  | "MANAGER_REVIEW" | "OWNER_APPROVAL" | "DELIVERY" | "ESCALATION_RESPONSE" | "NONE";

export type ProcessSeverity = "CRITICAL" | "HIGH" | "MEDIUM" | "LOW";
export type ProcessConfidence = "HIGH" | "MEDIUM" | "LOW" | "NEEDS_DATA";
/** Impact is a TYPE, never a fabricated amount. */
export type ExpectedImpactType =
  | "CASH_DELAY" | "REWORK_COST" | "COMPLAINT_RISK" | "OWNER_TIME" | "QUALITY_RISK" | "TRUST_RISK" | "NONE";
export type ApprovalLevel = "OWNER" | "MANAGER" | "STAFF";

export interface ProcessFinding {
  workspaceId: string;
  findingType: ProcessFindingType;
  severity: ProcessSeverity;
  confidence: ProcessConfidence;
  affectedStage: ProcessStage;
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
  expectedImpactType: ExpectedImpactType;
  requiredApprovalLevel: ApprovalLevel;
  missingData: string[];
  evaluatedAt: string;
}

export interface ProcessIntelligenceAnalysis {
  topFinding: ProcessFinding | null;
  findings: ProcessFinding[];
  evaluatedAt: string;
}

/** The Now-View-derived inputs Process Intelligence consumes (a read model — nothing re-queried). */
export interface ProcessIntelligenceInput {
  workspaceId: string;
  /** Post-suppression top gaming signal (null when cleared) — carries signalType, actorId, severity, supportingProofIds. */
  topGamingSignal?: {
    signalType: string; actorId: string | null; actorRole: string | null; severity: string;
    supportingProofIds?: string[]; ownerExplanation?: string;
  } | null;
  /** Post-suppression top credibility concern. */
  topCredibilityConcern?: {
    signalType: string; entityId: string | null; entityType?: string | null; severity: string; supportingProofIds?: string[];
  } | null;
  /** Timing-evidence signals (fast-completion / ignores-escalation). */
  timingEvidence?: {
    fastCompletion?: { status: string; actorId: string | null; severity: string; supportingProofIds?: string[] } | null;
    escalationTiming?: { status: string; actorId: string | null; severity: string; supportingProofIds?: string[] } | null;
  } | null;
  /** Reused-hash per-submitter reuse. */
  reusedProofFindings?: { submitterReuse?: Array<{ actorId: string; count: number; proofIds: string[] }> } | null;
  /** Complaint/rework + operational-event health. */
  complaintRework?: {
    submitterComplaints?: Array<{ actorId: string; count: number }>;
    submitterReworks?: Array<{ actorId: string; count: number }>;
    aggregates?: { complaintLinkedCount: number; reworkLinkedCount: number; qualityCount: number; deliveryCount: number };
    eventHealth?: {
      activeCount: number; overdueCount: number; overdueSevereCount: number;
      events?: Array<{ eventId: string; eventType: string; category: string; active: boolean; overdue: boolean }>;
    };
  } | null;
  /** Governed adjudications (for supportingAdjudicationIds; confirmed/require-fresh keep a finding active). */
  proofRiskAdjudications?: Array<{ id: string; sourceType: string; sourceRef: string; status: string; outcome: string }> | null;
  /** Proof review-queue pressure. */
  weakProofCount?: number | null;
  overdueReviewCount?: number | null;
  /** Owner workload. */
  ownerBottleneckItems?: number | null;
  /** Context links. */
  topProfitLeakType?: string | null;
  topConstraintType?: string | null;
  evaluatedAt: string; // ISO
}

const SEVERITY_RANK: Record<ProcessSeverity, number> = { CRITICAL: 0, HIGH: 1, MEDIUM: 2, LOW: 3 };
const REWORK_THRESHOLD = 2;
const COMPLAINT_THRESHOLD = 2;
const WEAK_QUEUE_THRESHOLD = 3;
const OWNER_BOTTLENECK_THRESHOLD = 3;

/** Collect the ids of governed adjudications that keep a finding active (confirm / require-fresh). */
function activeAdjudicationIds(input: ProcessIntelligenceInput, sourceRef: string | null): string[] {
  if (!sourceRef) return [];
  const KEEP = new Set(["CONFIRM_SUSPICIOUS_PATTERN", "REQUIRE_FRESH_PROOF", "ESCALATE_FOR_OWNER_REVIEW", "ESCALATE_FOR_TRAINING"]);
  return (input.proofRiskAdjudications ?? [])
    .filter((a) => a.sourceRef === sourceRef && KEEP.has(a.outcome))
    .map((a) => a.id);
}

/** Build the process-intelligence findings. Pure + deterministic. */
export function buildProcessIntelligence(input: ProcessIntelligenceInput): ProcessIntelligenceAnalysis {
  const at = input.evaluatedAt;
  const ws = input.workspaceId;
  const out: ProcessFinding[] = [];
  const base = (f: Omit<ProcessFinding, "workspaceId" | "evaluatedAt">): void => {
    out.push({ ...f, workspaceId: ws, evaluatedAt: at });
  };
  const activeEventIds = (predicate: (e: { category: string; eventType: string; active: boolean; overdue: boolean }) => boolean): string[] =>
    (input.complaintRework?.eventHealth?.events ?? []).filter((e) => e.active && predicate(e)).map((e) => e.eventId);

  const gaming = input.topGamingSignal ?? null;
  const cred = input.topCredibilityConcern ?? null;
  const agg = input.complaintRework?.aggregates;
  const health = input.complaintRework?.eventHealth;

  // 1. REWORK_LOOP — active rework linked to accepted proof (work redone repeatedly).
  if (agg && agg.reworkLinkedCount >= REWORK_THRESHOLD) {
    const worst = (input.complaintRework?.submitterReworks ?? []).slice().sort((a, b) => b.count - a.count)[0] ?? null;
    base({
      findingType: "REWORK_LOOP", severity: agg.reworkLinkedCount >= 4 ? "HIGH" : "MEDIUM", confidence: "HIGH",
      affectedStage: "WORK_EXECUTION", affectedActorId: worst?.actorId ?? null, affectedManagerId: null,
      supportingProofIds: [], supportingOperationalEventIds: activeEventIds((e) => e.eventType === "REWORK"),
      supportingEscalationIds: [], supportingAdjudicationIds: [],
      relatedProfitLeak: input.topProfitLeakType === "REWORK_REDO_COST" ? "REWORK_REDO_COST" : null,
      relatedConstraint: input.topConstraintType === "QUALITY" ? "QUALITY" : null, relatedSLO: "OPERATIONAL_EVENT_RESOLUTION",
      ownerExplanation: "The same work is being redone repeatedly after it was accepted — a rework loop that ties up capacity and delays completion.",
      recommendedCorrectiveAction: "Review the pressing/wash step that keeps failing; require a fresh, checked proof before re-accepting, and coach the operator on the standard.",
      expectedImpactType: "REWORK_COST", requiredApprovalLevel: "MANAGER", missingData: [],
    });
  }

  // 2. QUALITY_FAILURE_LOOP — repeated quality complaints after accepted work.
  if (agg && (agg.complaintLinkedCount >= COMPLAINT_THRESHOLD || agg.qualityCount >= COMPLAINT_THRESHOLD)) {
    const worst = (input.complaintRework?.submitterComplaints ?? []).slice().sort((a, b) => b.count - a.count)[0] ?? null;
    base({
      findingType: "QUALITY_FAILURE_LOOP", severity: agg.complaintLinkedCount >= 5 ? "HIGH" : "MEDIUM", confidence: "HIGH",
      affectedStage: "PROOF_REVIEW", affectedActorId: worst?.actorId ?? null, affectedManagerId: null,
      supportingProofIds: [], supportingOperationalEventIds: activeEventIds((e) => e.category === "quality" || e.eventType === "COMPLAINT"),
      supportingEscalationIds: [], supportingAdjudicationIds: [],
      relatedProfitLeak: input.topProfitLeakType === "COMPLAINT_REVENUE_RISK" ? "COMPLAINT_REVENUE_RISK" : null,
      relatedConstraint: input.topConstraintType === "QUALITY" ? "QUALITY" : null, relatedSLO: "OPERATIONAL_EVENT_RESOLUTION",
      ownerExplanation: "Customers keep complaining about quality on work that was signed off — the quality gate is passing work it should not.",
      recommendedCorrectiveAction: "Tighten the acceptance checklist for this job type and re-check the reviewer's recent approvals before the next batch.",
      expectedImpactType: "COMPLAINT_RISK", requiredApprovalLevel: "OWNER", missingData: [],
    });
  }

  // 3. DELIVERY_HANDOFF_DELAY — active delivery/late-service operational events.
  if (agg && agg.deliveryCount >= 1 && health && health.overdueCount >= 1) {
    base({
      findingType: "DELIVERY_HANDOFF_DELAY", severity: health.overdueSevereCount >= 1 ? "HIGH" : "MEDIUM", confidence: "MEDIUM",
      affectedStage: "DELIVERY", affectedActorId: null, affectedManagerId: null,
      supportingProofIds: [], supportingOperationalEventIds: activeEventIds((e) => e.category === "delivery"),
      supportingEscalationIds: [], supportingAdjudicationIds: [],
      relatedProfitLeak: null, relatedConstraint: input.topConstraintType === "DELIVERY" ? "DELIVERY" : null,
      relatedSLO: "OPERATIONAL_EVENT_RESOLUTION",
      ownerExplanation: "Delivery/collection hand-offs are running late and piling up unresolved — orders are stuck between stages.",
      recommendedCorrectiveAction: "Clear the overdue delivery events today and set a same-day hand-off cutoff between the counter and the delivery run.",
      expectedImpactType: "CASH_DELAY", requiredApprovalLevel: "MANAGER", missingData: [],
    });
  }

  // 4. REVIEW_BOTTLENECK — proof review queue backing up (weak/overdue reviews).
  const weak = input.weakProofCount ?? 0;
  const overdueReview = input.overdueReviewCount ?? 0;
  if (weak >= WEAK_QUEUE_THRESHOLD || overdueReview >= WEAK_QUEUE_THRESHOLD) {
    base({
      findingType: "REVIEW_BOTTLENECK", severity: overdueReview >= 6 ? "HIGH" : "MEDIUM", confidence: "HIGH",
      affectedStage: "PROOF_REVIEW", affectedActorId: null, affectedManagerId: null,
      supportingProofIds: [], supportingOperationalEventIds: [], supportingEscalationIds: [], supportingAdjudicationIds: [],
      relatedProfitLeak: input.topProfitLeakType === "WEAK_PROOF_REWORK_RISK" ? "WEAK_PROOF_REWORK_RISK" : null,
      relatedConstraint: input.topConstraintType === "QUALITY" ? "QUALITY" : null, relatedSLO: "PROOF_OUTCOME_INTEGRITY",
      ownerExplanation: "Proof reviews are piling up (weak or overdue), so completed work is stuck waiting to be verified.",
      recommendedCorrectiveAction: "Clear the overdue review queue; add a second reviewer for peak hours or a same-day review cutoff.",
      expectedImpactType: "CASH_DELAY", requiredApprovalLevel: "MANAGER", missingData: [],
    });
  }

  // 5. OWNER_APPROVAL_BOTTLENECK — owner is the queue (too many items need the owner).
  const ownerItems = input.ownerBottleneckItems ?? 0;
  const ownerBurdenSignal = gaming?.signalType === "OWNER_REVIEW_BURDEN_CREATED_BY_STAFF" ? gaming : null;
  if (ownerItems >= OWNER_BOTTLENECK_THRESHOLD || ownerBurdenSignal) {
    base({
      findingType: "OWNER_APPROVAL_BOTTLENECK", severity: ownerItems >= 8 ? "HIGH" : "MEDIUM", confidence: "MEDIUM",
      affectedStage: "OWNER_APPROVAL", affectedActorId: ownerBurdenSignal?.actorId ?? null, affectedManagerId: null,
      supportingProofIds: ownerBurdenSignal?.supportingProofIds ?? [], supportingOperationalEventIds: [],
      supportingEscalationIds: [], supportingAdjudicationIds: activeAdjudicationIds(input, ownerBurdenSignal ? `${ownerBurdenSignal.signalType}:${ownerBurdenSignal.actorId}` : null),
      relatedProfitLeak: input.topProfitLeakType === "OWNER_BOTTLENECK_COST" ? "OWNER_BOTTLENECK_COST" : null,
      relatedConstraint: input.topConstraintType === "OWNER" ? "OWNER" : null, relatedSLO: "OWNER_WORKLOAD_BURDEN",
      ownerExplanation: "Too much is waiting on the owner to review or approve — the owner has become the bottleneck holding up the flow.",
      recommendedCorrectiveAction: "Delegate low-risk proof review to a trusted manager and fix the one operator generating the most review load.",
      expectedImpactType: "OWNER_TIME", requiredApprovalLevel: "OWNER", missingData: [],
    });
  }

  // 6. PROOF_QUALITY_BREAKDOWN — repeated weak/reused proof from staff (evidence quality is failing).
  const reused = (input.reusedProofFindings?.submitterReuse ?? []).slice().sort((a, b) => b.count - a.count)[0] ?? null;
  const weakProofSignal = gaming && ["REPEATED_WEAK_PROOF", "REUSED_PROOF_PATTERN", "SUSPECTED_FAKE_OR_REUSED_PROOF_PATTERN"].includes(gaming.signalType) ? gaming : null;
  const fast = input.timingEvidence?.fastCompletion;
  const fastActive = fast && (fast.status === "FAST_COMPLETION_WARNING" || fast.status === "SUSPICIOUS_FAST_COMPLETION_PATTERN") ? fast : null;
  if (weakProofSignal || (reused && reused.count >= REWORK_THRESHOLD) || fastActive) {
    const src = weakProofSignal ?? null;
    base({
      findingType: "PROOF_QUALITY_BREAKDOWN", severity: src?.severity === "CRITICAL" ? "CRITICAL" : "HIGH", confidence: "HIGH",
      affectedStage: fastActive ? "WORK_EXECUTION" : "PROOF_SUBMISSION",
      affectedActorId: src?.actorId ?? reused?.actorId ?? fastActive?.actorId ?? null, affectedManagerId: null,
      supportingProofIds: src?.supportingProofIds ?? reused?.proofIds ?? fastActive?.supportingProofIds ?? [],
      supportingOperationalEventIds: [], supportingEscalationIds: [],
      supportingAdjudicationIds: activeAdjudicationIds(input, src ? `${src.signalType}:${src.actorId}` : null),
      relatedProfitLeak: input.topProfitLeakType === "WEAK_PROOF_REWORK_RISK" ? "WEAK_PROOF_REWORK_RISK" : null,
      relatedConstraint: input.topConstraintType === "STAFF" ? "STAFF" : null, relatedSLO: "ANTI_GAMING_RISK",
      ownerExplanation: "The proof coming in for this operator is repeatedly weak, reused, or implausibly fast — the evidence of completion cannot be trusted. This is a process/coaching issue, not an accusation.",
      recommendedCorrectiveAction: "Require a fresh, job-specific proof per task from this operator and coach them on the acceptable proof standard before assigning new work.",
      expectedImpactType: "QUALITY_RISK", requiredApprovalLevel: "MANAGER", missingData: [],
    });
  }

  // 7. ESCALATION_RESPONSE_BREAKDOWN — a manager is not responding to escalations in time.
  const esc = input.timingEvidence?.escalationTiming;
  const escActive = esc && (esc.status === "ESCALATION_ACK_OVERDUE" || esc.status === "ESCALATION_RESOLUTION_OVERDUE" || esc.status === "MANAGER_IGNORES_ESCALATION_PATTERN") ? esc : null;
  if (escActive) {
    base({
      findingType: "ESCALATION_RESPONSE_BREAKDOWN", severity: escActive.status === "MANAGER_IGNORES_ESCALATION_PATTERN" ? "HIGH" : "MEDIUM", confidence: "MEDIUM",
      affectedStage: "ESCALATION_RESPONSE", affectedActorId: null, affectedManagerId: escActive.actorId,
      supportingProofIds: [], supportingOperationalEventIds: [], supportingEscalationIds: escActive.supportingProofIds ?? [],
      supportingAdjudicationIds: [],
      relatedProfitLeak: null, relatedConstraint: input.topConstraintType === "MANAGER" ? "MANAGER" : null, relatedSLO: "ANTI_GAMING_RISK",
      ownerExplanation: "Escalations are reaching this manager but not being acknowledged in time — staff blockers are waiting on a response.",
      recommendedCorrectiveAction: "Reassign the overdue escalations now and set a hard acknowledgement deadline; review escalation handling with the manager.",
      expectedImpactType: "TRUST_RISK", requiredApprovalLevel: "OWNER", missingData: [],
    });
  }

  // 8. STAFF_TRAINING_GAP — repeated rejected / wrong-insufficient proof (a training issue).
  const trainSignal = gaming && ["REPEATED_REJECTED_PROOF", "WRONG_OR_INSUFFICIENT_PROOF_PATTERN"].includes(gaming.signalType) ? gaming : null;
  if (trainSignal) {
    base({
      findingType: "STAFF_TRAINING_GAP", severity: "MEDIUM", confidence: "HIGH",
      affectedStage: "PROOF_SUBMISSION", affectedActorId: trainSignal.actorId, affectedManagerId: null,
      supportingProofIds: trainSignal.supportingProofIds ?? [], supportingOperationalEventIds: [], supportingEscalationIds: [],
      supportingAdjudicationIds: activeAdjudicationIds(input, `${trainSignal.signalType}:${trainSignal.actorId}`),
      relatedProfitLeak: null, relatedConstraint: input.topConstraintType === "STAFF" ? "STAFF" : null, relatedSLO: "ANTI_GAMING_RISK",
      ownerExplanation: "This operator's proof keeps getting rejected or ruled insufficient — a training/standard gap, not a discipline issue.",
      recommendedCorrectiveAction: "Show the operator exactly what an acceptable proof looks like and pair them with a lead until proof passes first time.",
      expectedImpactType: "QUALITY_RISK", requiredApprovalLevel: "MANAGER", missingData: [],
    });
  }

  // 9. MANAGER_REVIEW_GAP — a reviewer is rubber-stamping or letting suspicious proof through.
  const mgrSignal = gaming && ["MANAGER_RUBBER_STAMP", "REVIEW_QUALITY_CONCERN", "MANAGER_ACCEPTED_SUSPICIOUS_PROOF"].includes(gaming.signalType) ? gaming : null;
  const credReview = cred?.signalType === "REVIEW_QUALITY_CONCERN" ? cred : null;
  if (mgrSignal || credReview) {
    const src = mgrSignal;
    base({
      findingType: "MANAGER_REVIEW_GAP", severity: "HIGH", confidence: "MEDIUM",
      affectedStage: "MANAGER_REVIEW", affectedActorId: null, affectedManagerId: src?.actorId ?? credReview?.entityId ?? null,
      supportingProofIds: src?.supportingProofIds ?? credReview?.supportingProofIds ?? [],
      supportingOperationalEventIds: [], supportingEscalationIds: [],
      supportingAdjudicationIds: activeAdjudicationIds(input, src ? `${src.signalType}:${src.actorId}` : null),
      relatedProfitLeak: null, relatedConstraint: input.topConstraintType === "MANAGER" ? "MANAGER" : null, relatedSLO: "EVIDENCE_CREDIBILITY_RISK",
      ownerExplanation: "A reviewer is approving weak or suspicious proof — the review gate is not catching problems before they reach the customer.",
      recommendedCorrectiveAction: "Spot-audit this reviewer's recent approvals, require a written reason per acceptance, and add a second review for high-risk jobs.",
      expectedImpactType: "QUALITY_RISK", requiredApprovalLevel: "OWNER", missingData: [],
    });
  }

  // 10. DATA_INSUFFICIENT — nothing above crossed threshold with real evidence.
  if (out.length === 0) {
    const missing: string[] = [];
    if (!input.complaintRework) missing.push("no complaint/rework or operational-event data");
    if (!gaming || gaming.signalType === "DATA_INSUFFICIENT") missing.push("no unusual approval pattern found yet");
    if ((input.weakProofCount ?? 0) === 0) missing.push("no backlog of proof waiting on review");
    base({
      findingType: "DATA_INSUFFICIENT", severity: "LOW", confidence: "NEEDS_DATA",
      affectedStage: "NONE", affectedActorId: null, affectedManagerId: null,
      supportingProofIds: [], supportingOperationalEventIds: [], supportingEscalationIds: [], supportingAdjudicationIds: [],
      relatedProfitLeak: null, relatedConstraint: null, relatedSLO: null,
      ownerExplanation: "No process breakdown is established yet — not enough linked events/signals to point to a failing stage.",
      recommendedCorrectiveAction: "Keep recording proofs, reviews, escalations, and complaint/rework events; OpsIQ's picture of your operations gets clearer as you add more.",
      expectedImpactType: "NONE", requiredApprovalLevel: "MANAGER",
      missingData: missing.length ? missing : ["insufficient linked process evidence"],
    });
  }

  // Highest severity first (CRITICAL → LOW); DATA_INSUFFICIENT always sorts last.
  out.sort((a, b) => {
    if (a.findingType === "DATA_INSUFFICIENT") return 1;
    if (b.findingType === "DATA_INSUFFICIENT") return -1;
    return SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity];
  });

  return { topFinding: out[0] ?? null, findings: out, evaluatedAt: at };
}

/**
 * Evidence Credibility Graph (depth pass).
 *
 * Answers: "Which proof, staff, manager/reviewer, task type, or process can the owner
 * trust — and why?" It tracks proof/review reliability across events and surfaces the single
 * highest credibility concern (not a flood), with reason codes and the events that prove it.
 *
 * PURE and deterministic. Consumes proof-event aggregates (per submitter / reviewer / proof
 * type + workspace item counts) computed from the real Proof table. NOT a hidden punitive
 * score: every finding carries transparent reason codes + evidence references; any numeric
 * score is secondary and explained. Thresholds require repetition — one weak proof is not an
 * "unreliable submitter". Where a linkage is not persisted (complaint/rework/outcome ↔ proof),
 * the type is supported but reported as missing-source, never fabricated.
 */

import type { ConstraintType } from "@/domain/owner-mode/constraint-engine";
import type { ProfitLeakType } from "@/domain/owner-mode/profit-leak-radar";
import type { GamingSignalType } from "@/domain/owner-mode/anti-gaming-analytics";

export type CredibilityEntityType =
  | "PROOF_ITEM" | "PROOF_TYPE" | "TASK" | "TASK_CATEGORY" | "SUBMITTER" | "REVIEWER"
  | "PROCESS" | "CLIENT" | "REVIEWER_SUBMITTER_PAIR" | "WORKSPACE";

export type CredibilitySignalType =
  | "STRONG_ACCEPTED_PROOF" | "WEAK_PROOF_NEEDS_REVIEW" | "REJECTED_PROOF" | "REUSED_PROOF"
  | "STALE_PROOF" | "TAMPER_SUSPECTED_PROOF" | "ACCEPTED_PROOF_WITH_BAD_OUTCOME"
  | "ACCEPTED_PROOF_WITH_COMPLAINT" | "ACCEPTED_PROOF_WITH_REWORK" | "REVIEWER_ACCEPTED_WEAK_PROOF"
  | "SELF_REVIEW_BLOCKED_OR_ATTEMPTED" | "REPEATED_OWNER_REVIEW_BURDEN" | "RELIABLE_SUBMITTER_PATTERN"
  | "UNRELIABLE_SUBMITTER_PATTERN" | "REVIEW_QUALITY_CONCERN" | "DATA_INSUFFICIENT";

export type CredibilitySeverity = "CRITICAL" | "HIGH" | "MEDIUM" | "LOW" | "POSITIVE";
export type CredibilityConfidence = "HIGH" | "MEDIUM" | "LOW" | "NEEDS_DATA";

export interface SubmitterCredStats {
  actorId: string;
  role?: string | null;
  total: number;
  accepted: number;
  weakOrReviewNeeded: number;
  rejected: number;
  reused: number;
  stale: number;
  /** Supporting proof IDs for the unreliable-submitter basis (weak + rejected + reused). */
  unreliableProofIds?: string[];
  weakProofIds?: string[];
}
export interface ReviewerCredStats {
  reviewerId: string;
  role?: string | null;
  accepted: number;
  acceptedWeak: number;
  selfReviewCount: number;
  /** Supporting proof IDs (for fair adjudication). */
  acceptedWeakProofIds?: string[];
  selfReviewProofIds?: string[];
}
export interface ProofTypeCredStats {
  proofType: string;
  total: number;
  accepted: number;
  weakOrRejected: number;
  /** Supporting proof IDs of the weak/rejected proofs of this type. */
  weakOrRejectedProofIds?: string[];
}
export interface WorkspaceItemCounts {
  weak: number;
  rejected: number;
  reused: number;
  stale: number;
  tamperSuspected: number;
}

export interface CredibilityInput {
  workspaceId: string;
  submitters: SubmitterCredStats[];
  reviewers: ReviewerCredStats[];
  proofTypes: ProofTypeCredStats[];
  itemCounts: WorkspaceItemCounts;
  currentConstraint?: ConstraintType | null;
  topProfitLeakType?: ProfitLeakType | null;
  topGamingSignalType?: GamingSignalType | null;
  /**
   * Real proof→outcome contradictions (accepted proof later DISPUTED/OVERRIDDEN), per submitter,
   * from the Proof↔Outcome Linkage. When present, a submitter whose accepted proof was reversed
   * is no longer "reliable" and raises an ACCEPTED_PROOF_WITH_BAD_OUTCOME concern.
   */
  submitterContradictions?: Array<{ actorId: string; contradictedCount: number }>;
  /** Workspace total of accepted-then-contradicted proofs (for the workspace-level concern). */
  contradictedProofCount?: number;
  /** Real complaint/rework events linked to a submitter's accepted proof (per-event model). */
  submitterComplaints?: Array<{ actorId: string; count: number }>;
  submitterReworks?: Array<{ actorId: string; count: number }>;
  /**
   * Deterministic reused-hash reuse per submitter (from the dedicated reused-hash precheck) — a
   * proof artifact reused across different jobs. When present it drives an attributed REUSED_PROOF
   * concern (supersedes the coarse workspace duplicate-flag count, which is not per-operator).
   */
  submitterReusedHash?: Array<{ actorId: string; count: number; proofIds: string[] }>;
  /** Sources not yet persisted (complaint/rework/outcome ↔ proof linkage). */
  missingSources?: string[];
  evaluatedAt: string;
}

export interface CredibilityFinding {
  workspaceId: string;
  entityType: CredibilityEntityType;
  entityId: string | null;
  entityLabel: string | null;
  signalType: CredibilitySignalType;
  severity: CredibilitySeverity;
  confidence: CredibilityConfidence;
  reasonCodes: string[];
  evidence: string[];
  patternCount: number;
  missingData: string[];
  ownerExplanation: string;
  businessImpact: string;
  relatedGamingSignal: GamingSignalType | null;
  relatedProfitLeak: ProfitLeakType | null;
  relatedConstraint: ConstraintType | null;
  recommendedResponse: string;
  ownerActionRequired: boolean;
  managerActionSufficient: boolean;
  reassessmentTrigger: string | null;
  /**
   * The proof IDs backing this concern, when known — used to suppress it after an owner adjudication
   * clears exactly those proofs (a new supporting proof re-surfaces it). Absent when the concern has
   * no per-proof evidence (then it is never suppressed — fail visible).
   */
  supportingProofIds?: string[];
  /** COMPLETE (proof IDs identify the basis) / PARTIAL / BLOCKED_BY_DATA (no proof-level source). */
  sourceCompleteness?: "COMPLETE" | "PARTIAL" | "BLOCKED_BY_DATA";
  /** Secondary, explained — never the primary output. */
  credibilityScore: number;
  evaluatedAt: string;
}

export interface CredibilityGraphAnalysis {
  topConcern: CredibilityFinding | null;
  findings: CredibilityFinding[];
  evaluatedAt: string;
}

// Concern thresholds — repetition required; one event is not a pattern.
const WEAK_THRESHOLD = 3;
const REJECTED_THRESHOLD = 2;
const REUSED_THRESHOLD = 2;
const STALE_THRESHOLD = 2;
const UNRELIABLE_THRESHOLD = 4; // combined weak+rejected+reused
const RELIABLE_MIN_ACCEPTED = 4;
const REVIEW_BURDEN_THRESHOLD = 3;
const RUBBER_STAMP_THRESHOLD = 2;

const SEVERITY_WEIGHT: Record<CredibilitySeverity, number> = { CRITICAL: 1000, HIGH: 100, MEDIUM: 10, LOW: 1, POSITIVE: 0 };
const TYPE_PRIORITY: Record<CredibilitySignalType, number> = {
  SELF_REVIEW_BLOCKED_OR_ATTEMPTED: 16, TAMPER_SUSPECTED_PROOF: 15, REVIEWER_ACCEPTED_WEAK_PROOF: 14,
  REVIEW_QUALITY_CONCERN: 13, UNRELIABLE_SUBMITTER_PATTERN: 12, REUSED_PROOF: 11,
  ACCEPTED_PROOF_WITH_BAD_OUTCOME: 10, ACCEPTED_PROOF_WITH_COMPLAINT: 9, ACCEPTED_PROOF_WITH_REWORK: 8,
  REJECTED_PROOF: 7, STALE_PROOF: 6, WEAK_PROOF_NEEDS_REVIEW: 5, REPEATED_OWNER_REVIEW_BURDEN: 4,
  RELIABLE_SUBMITTER_PATTERN: 2, STRONG_ACCEPTED_PROOF: 1, DATA_INSUFFICIENT: 0,
};

function credScore(sev: CredibilitySeverity, type: CredibilitySignalType, count: number): number {
  return SEVERITY_WEIGHT[sev] + TYPE_PRIORITY[type] + Math.min(count, 20);
}

export function buildEvidenceCredibility(input: CredibilityInput): CredibilityGraphAnalysis {
  const at = input.evaluatedAt;
  const ws = input.workspaceId;
  const out: CredibilityFinding[] = [];
  const push = (f: Omit<CredibilityFinding, "workspaceId" | "evaluatedAt" | "credibilityScore">): void => {
    out.push({ ...f, workspaceId: ws, evaluatedAt: at, credibilityScore: credScore(f.severity, f.signalType, f.patternCount) });
  };
  // Attach a per-proof evidence list so a concern can be fairly adjudicated. COMPLETE when the
  // proof-level source is present (and suppressible); BLOCKED_BY_DATA otherwise (fail-visible).
  const withEvidence = (ids: string[] | undefined): Pick<CredibilityFinding, "supportingProofIds" | "sourceCompleteness" | "missingData"> =>
    ids && ids.length > 0
      ? { supportingProofIds: ids.slice(0, 50), sourceCompleteness: "COMPLETE", missingData: [] }
      : { supportingProofIds: undefined, sourceCompleteness: "BLOCKED_BY_DATA", missingData: ["no persisted proof-level source for this concern — cannot be adjudication-suppressed yet"] };

  // ── Reviewer credibility ───────────────────────────────────────────────────
  for (const r of input.reviewers) {
    if (r.selfReviewCount >= 1) {
      push({
        entityType: "REVIEWER", entityId: r.reviewerId, entityLabel: r.role ?? "reviewer",
        signalType: "SELF_REVIEW_BLOCKED_OR_ATTEMPTED", severity: "HIGH", confidence: "HIGH",
        reasonCodes: ["SELF_REVIEW"], evidence: [`${r.selfReviewCount} proof(s) reviewed by their own submitter`, ...((r.selfReviewProofIds ?? []).length ? [`proof refs: ${(r.selfReviewProofIds ?? []).slice(0, 10).join(", ")}`] : [])], patternCount: r.selfReviewCount, ...withEvidence(r.selfReviewProofIds),
        ownerExplanation: "A reviewer signed off on work they submitted themselves — this proof cannot be trusted as independently verified.",
        businessImpact: "Self-reviewed proof is not real verification; bad work can be certified as done.",
        relatedGamingSignal: "SELF_REVIEW_ATTEMPT", relatedProfitLeak: null,
        relatedConstraint: input.currentConstraint === "MANAGER" ? "MANAGER" : null,
        recommendedResponse: "Void the self-reviewed proof, assign an independent reviewer, and audit the affected items.",
        ownerActionRequired: true, managerActionSufficient: false,
        reassessmentTrigger: "Re-check outcomes of the self-reviewed items; open reassessment if any were relied upon.",
      });
    }
    if (r.acceptedWeak >= RUBBER_STAMP_THRESHOLD) {
      push({
        entityType: "REVIEWER", entityId: r.reviewerId, entityLabel: r.role ?? "manager",
        signalType: "REVIEW_QUALITY_CONCERN", severity: "HIGH", confidence: "MEDIUM",
        reasonCodes: ["ACCEPTED_WEAK_OR_DUPLICATE_PROOF"], evidence: [`${r.acceptedWeak} weak/duplicate proof(s) accepted by this reviewer`, ...((r.acceptedWeakProofIds ?? []).length ? [`proof refs: ${(r.acceptedWeakProofIds ?? []).slice(0, 10).join(", ")}`] : [])], patternCount: r.acceptedWeak, ...withEvidence(r.acceptedWeakProofIds),
        ownerExplanation: "This reviewer's acceptances are low-credibility — they are approving weak or reused proof.",
        businessImpact: "Low review quality lets unreliable work pass, driving rework and complaints.",
        relatedGamingSignal: "MANAGER_RUBBER_STAMP",
        relatedProfitLeak: input.topProfitLeakType && ["REWORK_REDO_COST", "COMPLAINT_REVENUE_RISK", "WEAK_PROOF_REWORK_RISK"].includes(input.topProfitLeakType) ? input.topProfitLeakType : null,
        relatedConstraint: input.currentConstraint === "QUALITY" || input.currentConstraint === "MANAGER" ? input.currentConstraint : null,
        recommendedResponse: "Require a written reason per acceptance and spot-audit this reviewer's recent approvals.",
        ownerActionRequired: true, managerActionSufficient: false,
        reassessmentTrigger: "Re-open outcome checks on this reviewer's accepted items.",
      });
    }
  }

  // ── Proof→outcome contradiction (accepted proof later reversed) — strongest trust signal ──
  const contradictionBySubmitter = new Map<string, number>(
    (input.submitterContradictions ?? []).map((c) => [c.actorId, c.contradictedCount])
  );
  let attributedContradictions = 0;
  for (const c of input.submitterContradictions ?? []) {
    if (c.contradictedCount < 1) continue;
    attributedContradictions += c.contradictedCount;
    push({
      entityType: "SUBMITTER", entityId: c.actorId, entityLabel: "staff",
      signalType: "ACCEPTED_PROOF_WITH_BAD_OUTCOME", severity: c.contradictedCount >= 2 ? "HIGH" : "MEDIUM", confidence: "HIGH",
      reasonCodes: ["ACCEPTED_PROOF_LATER_CONTRADICTED"],
      evidence: [`${c.contradictedCount} of this operator's accepted proof(s) were later disputed/overridden`], patternCount: c.contradictedCount, missingData: [],
      ownerExplanation: "This operator had accepted proof that was later reversed — their sign-offs cannot be taken at face value.",
      businessImpact: "Proof that is accepted then reversed means bad work was certified as done and only caught later.",
      relatedGamingSignal: null, relatedProfitLeak: input.topProfitLeakType && ["REWORK_REDO_COST", "COMPLAINT_REVENUE_RISK", "WEAK_PROOF_REWORK_RISK"].includes(input.topProfitLeakType) ? input.topProfitLeakType : null,
      relatedConstraint: input.currentConstraint === "QUALITY" || input.currentConstraint === "STAFF" ? input.currentConstraint : null,
      recommendedResponse: "Re-verify this operator's other recent accepted proof and require independent review before sign-off.",
      ownerActionRequired: true, managerActionSufficient: false,
      reassessmentTrigger: "Re-open outcome checks on this operator's accepted items.",
    });
  }
  // ── Accepted proof followed by a linked complaint/rework event (per-event model). ──
  for (const c of input.submitterComplaints ?? []) {
    if (c.count < 1) continue;
    push({
      entityType: "SUBMITTER", entityId: c.actorId, entityLabel: "staff",
      signalType: "ACCEPTED_PROOF_WITH_COMPLAINT", severity: c.count >= 2 ? "HIGH" : "MEDIUM", confidence: "HIGH",
      reasonCodes: ["ACCEPTED_PROOF_LINKED_TO_COMPLAINT"],
      evidence: [`${c.count} complaint event(s) linked to this operator's accepted proof`], patternCount: c.count, missingData: [],
      ownerExplanation: "A customer complained about work this operator's accepted proof signed off — the acceptance did not hold up.",
      businessImpact: "Complaints after accepted proof mean bad work reached the customer and risks revenue/relationship.",
      relatedGamingSignal: null, relatedProfitLeak: input.topProfitLeakType === "COMPLAINT_REVENUE_RISK" ? "COMPLAINT_REVENUE_RISK" : null,
      relatedConstraint: input.currentConstraint === "QUALITY" ? "QUALITY" : null,
      recommendedResponse: "Run customer recovery and re-verify this operator's recent accepted work.",
      ownerActionRequired: true, managerActionSufficient: false,
      reassessmentTrigger: "Re-open outcome checks on this operator's complaint-linked items.",
    });
  }
  for (const r of input.submitterReworks ?? []) {
    if (r.count < 1) continue;
    push({
      entityType: "SUBMITTER", entityId: r.actorId, entityLabel: "staff",
      signalType: "ACCEPTED_PROOF_WITH_REWORK", severity: r.count >= 2 ? "HIGH" : "MEDIUM", confidence: "HIGH",
      reasonCodes: ["ACCEPTED_PROOF_LINKED_TO_REWORK"],
      evidence: [`${r.count} rework event(s) linked to this operator's accepted proof`], patternCount: r.count, missingData: [],
      ownerExplanation: "Work this operator's accepted proof signed off had to be redone — the acceptance did not hold up.",
      businessImpact: "Rework after accepted proof is cost of poor quality that the sign-off should have caught.",
      relatedGamingSignal: null, relatedProfitLeak: input.topProfitLeakType && ["REWORK_REDO_COST", "WEAK_PROOF_REWORK_RISK"].includes(input.topProfitLeakType) ? input.topProfitLeakType : null,
      relatedConstraint: input.currentConstraint === "QUALITY" || input.currentConstraint === "STAFF" ? input.currentConstraint : null,
      recommendedResponse: "Fix the SOP/proof behind the redo and re-verify this operator's recent accepted work.",
      ownerActionRequired: false, managerActionSufficient: true,
      reassessmentTrigger: "Re-open outcome checks on this operator's rework-linked items.",
    });
  }

  const unattributedContradictions = Math.max(0, (input.contradictedProofCount ?? 0) - attributedContradictions);
  if (unattributedContradictions >= 1) {
    push({
      entityType: "WORKSPACE", entityId: null, entityLabel: "workspace",
      signalType: "ACCEPTED_PROOF_WITH_BAD_OUTCOME", severity: "HIGH", confidence: "MEDIUM",
      reasonCodes: ["ACCEPTED_PROOF_LATER_CONTRADICTED"],
      evidence: [`${unattributedContradictions} accepted proof(s) in the workspace were later disputed/overridden`], patternCount: unattributedContradictions, missingData: [],
      ownerExplanation: "Accepted proof was later reversed — earlier sign-offs in the workspace could not be trusted.",
      businessImpact: "Accepted-then-reversed proof means bad work was certified and only caught later.",
      relatedGamingSignal: null, relatedProfitLeak: null, relatedConstraint: input.currentConstraint === "QUALITY" ? "QUALITY" : null,
      recommendedResponse: "Re-verify the reversed items and tighten who can accept proof.",
      ownerActionRequired: true, managerActionSufficient: false,
      reassessmentTrigger: "Re-open outcome checks on the reversed items.",
    });
  }

  // ── Submitter credibility ──────────────────────────────────────────────────
  for (const s of input.submitters) {
    const unreliableCount = s.weakOrReviewNeeded + s.rejected + s.reused;
    const contradicted = contradictionBySubmitter.get(s.actorId) ?? 0;
    if (unreliableCount >= UNRELIABLE_THRESHOLD) {
      push({
        entityType: "SUBMITTER", entityId: s.actorId, entityLabel: s.role ?? "staff",
        signalType: "UNRELIABLE_SUBMITTER_PATTERN", severity: unreliableCount >= 8 ? "HIGH" : "MEDIUM", confidence: "HIGH",
        reasonCodes: ["REPEATED_WEAK_REJECTED_OR_REUSED_PROOF"],
        evidence: [`${s.weakOrReviewNeeded} weak, ${s.rejected} rejected, ${s.reused} reused of ${s.total} proofs`, ...((s.unreliableProofIds ?? []).length ? [`proof refs: ${(s.unreliableProofIds ?? []).slice(0, 10).join(", ")}`] : [])], patternCount: unreliableCount, ...withEvidence(s.unreliableProofIds),
        ownerExplanation: "This operator's proof is repeatedly weak/rejected/reused — their completions cannot be taken at face value yet.",
        businessImpact: "Low-credibility proof predicts rework, complaints, and wasted review time.",
        relatedGamingSignal: s.reused >= REUSED_THRESHOLD ? "REUSED_PROOF_PATTERN" : "REPEATED_WEAK_PROOF",
        relatedProfitLeak: input.topProfitLeakType && ["WEAK_PROOF_REWORK_RISK", "STAFF_PRODUCTIVITY_DROP", "REWORK_REDO_COST"].includes(input.topProfitLeakType) ? input.topProfitLeakType : null,
        relatedConstraint: input.currentConstraint === "STAFF" || input.currentConstraint === "QUALITY" ? input.currentConstraint : null,
        recommendedResponse: "Require a job-specific proof checklist from this operator and verify before assigning new work; coach first.",
        ownerActionRequired: false, managerActionSufficient: true,
        reassessmentTrigger: "Re-evaluate this operator's credibility after coaching.",
      });
    } else if (s.accepted >= RELIABLE_MIN_ACCEPTED && s.weakOrReviewNeeded === 0 && s.rejected === 0 && s.reused === 0 && contradicted === 0) {
      // RELIABLE requires no contradiction: a submitter whose accepted proof was later reversed
      // is handled above (ACCEPTED_PROOF_WITH_BAD_OUTCOME) and never reaches this branch.
      const outcomeChecked = input.submitterContradictions !== undefined;
      push({
        entityType: "SUBMITTER", entityId: s.actorId, entityLabel: s.role ?? "staff",
        signalType: "RELIABLE_SUBMITTER_PATTERN", severity: "POSITIVE", confidence: outcomeChecked ? "HIGH" : "MEDIUM",
        reasonCodes: [outcomeChecked ? "REPEATED_ACCEPTED_NO_CONTRADICTION_CHECKED" : "REPEATED_ACCEPTED_NO_CONTRADICTION"],
        evidence: [`${s.accepted} accepted proofs, 0 weak/rejected/reused${outcomeChecked ? ", 0 later contradicted" : ""}`], patternCount: s.accepted,
        missingData: outcomeChecked ? ["per-proof complaint linkage (still period-aggregate only)"] : ["complaint/rework/outcome ↔ proof linkage (to confirm no downstream contradiction)"],
        ownerExplanation: outcomeChecked
          ? "This operator's proof is consistently accepted, never weak/reused, and none was later reversed — reliable (contradiction now tracked; per-proof complaints still not)."
          : "This operator's proof is consistently accepted with no weak/reused history — reliable on proof (downstream outcome contradiction is not yet tracked).",
        businessImpact: "A reliable submitter needs less review — safe to trust and delegate more.",
        relatedGamingSignal: null, relatedProfitLeak: null, relatedConstraint: null,
        recommendedResponse: "Trust and consider lighter review for this operator; keep monitoring as outcome linkage becomes available.",
        ownerActionRequired: false, managerActionSufficient: true,
        reassessmentTrigger: null,
      });
    }
    if (s.weakOrReviewNeeded >= REVIEW_BURDEN_THRESHOLD) {
      push({
        entityType: "SUBMITTER", entityId: s.actorId, entityLabel: s.role ?? "staff",
        signalType: "REPEATED_OWNER_REVIEW_BURDEN", severity: "MEDIUM", confidence: "HIGH",
        reasonCodes: ["STAFF_DRIVEN_REVIEW_LOAD"], evidence: [`${s.weakOrReviewNeeded} of this operator's proofs need human review`, ...((s.weakProofIds ?? []).length ? [`proof refs: ${(s.weakProofIds ?? []).slice(0, 10).join(", ")}`] : [])], patternCount: s.weakOrReviewNeeded, ...withEvidence(s.weakProofIds),
        ownerExplanation: "This operator generates most of the review load through low-credibility proof.",
        businessImpact: "Concentrated review burden is an owner-workload leak — fixing this operator frees the most owner time.",
        relatedGamingSignal: "OWNER_REVIEW_BURDEN_CREATED_BY_STAFF", relatedProfitLeak: "OWNER_BOTTLENECK_COST",
        relatedConstraint: input.currentConstraint === "OWNER" ? "OWNER" : null,
        recommendedResponse: "Fix this operator's proof quality first — biggest single reduction in review load.",
        ownerActionRequired: false, managerActionSufficient: true, reassessmentTrigger: null,
      });
    }
  }

  // ── Deterministic reused-hash concern (attributed to the submitter) ──────────
  for (const s of input.submitterReusedHash ?? []) {
    if (s.count < 1) continue;
    push({
      entityType: "SUBMITTER", entityId: s.actorId, entityLabel: "staff",
      signalType: "REUSED_PROOF", severity: s.count >= 2 ? "HIGH" : "MEDIUM", confidence: "HIGH",
      reasonCodes: ["EXACT_REUSED_HASH", "REUSED_ACROSS_DIFFERENT_TASKS"],
      evidence: [`${s.count} of this operator's proof(s) reuse an artifact across different jobs`, ...(s.proofIds.length ? [`proof refs: ${s.proofIds.slice(0, 10).join(", ")}`] : [])],
      patternCount: s.count, missingData: [], supportingProofIds: s.proofIds, sourceCompleteness: "COMPLETE",
      ownerExplanation: "This operator reused the same proof artifact across different jobs — some completions may be backed by old evidence. This needs review, not an accusation.",
      businessImpact: "Reused proof hides undone work until a complaint surfaces.",
      relatedGamingSignal: "REUSED_PROOF_PATTERN", relatedProfitLeak: null,
      relatedConstraint: input.currentConstraint === "STAFF" ? "STAFF" : null,
      recommendedResponse: "Require a fresh, job-specific proof per task; re-verify the reused jobs.",
      ownerActionRequired: false, managerActionSufficient: true,
      reassessmentTrigger: "Re-verify jobs backed by reused proof.",
    });
  }

  // ── Proof-type credibility ─────────────────────────────────────────────────
  for (const pt of input.proofTypes) {
    if (pt.total >= 4 && pt.weakOrRejected / pt.total >= 0.5) {
      push({
        entityType: "PROOF_TYPE", entityId: pt.proofType, entityLabel: pt.proofType,
        signalType: "WEAK_PROOF_NEEDS_REVIEW", severity: "MEDIUM", confidence: "MEDIUM",
        reasonCodes: ["PROOF_TYPE_LOW_ACCEPTANCE"], evidence: [`${pt.weakOrRejected}/${pt.total} of "${pt.proofType}" proofs are weak/rejected`, ...((pt.weakOrRejectedProofIds ?? []).length ? [`proof refs: ${(pt.weakOrRejectedProofIds ?? []).slice(0, 10).join(", ")}`] : [])], patternCount: pt.weakOrRejected, ...withEvidence(pt.weakOrRejectedProofIds),
        ownerExplanation: `The "${pt.proofType}" proof type is unreliable — it repeatedly fails review, so the requirement or capture method may be wrong.`,
        businessImpact: "An unreliable proof type wastes review time and hides true completion status.",
        relatedGamingSignal: null, relatedProfitLeak: null,
        relatedConstraint: input.currentConstraint === "QUALITY" ? "QUALITY" : null,
        recommendedResponse: `Tighten or replace the "${pt.proofType}" requirement (clearer capture instructions or a stronger proof type).`,
        ownerActionRequired: false, managerActionSufficient: true,
        reassessmentTrigger: "Re-evaluate this proof type after the requirement change.",
      });
    }
  }

  // ── Workspace-level item concerns (only if no stronger entity concern) ──────
  const ic = input.itemCounts;
  // The deterministic per-submitter reused-hash concern (above) supersedes the coarse workspace
  // duplicate-flag count; emit the workspace-level concern only when that source is absent.
  if (!input.submitterReusedHash && ic.reused >= REUSED_THRESHOLD) {
    push({
      entityType: "WORKSPACE", entityId: null, entityLabel: "workspace",
      signalType: "REUSED_PROOF", severity: "MEDIUM", confidence: "HIGH",
      reasonCodes: ["DUPLICATE_FILE_HASH"], evidence: [`${ic.reused} reused (duplicate-flagged) proof(s)`], patternCount: ic.reused, missingData: [],
      ownerExplanation: "Reused proof exists in the workspace — some completions may be faked with old evidence.",
      businessImpact: "Reused proof hides undone work until a complaint surfaces.",
      relatedGamingSignal: "REUSED_PROOF_PATTERN", relatedProfitLeak: null, relatedConstraint: null,
      recommendedResponse: "Require a fresh, job-specific proof per task; re-verify the affected jobs.",
      ownerActionRequired: false, managerActionSufficient: true, reassessmentTrigger: "Re-verify jobs backed by reused proof.",
    });
  }
  if (ic.stale >= STALE_THRESHOLD) {
    push({
      entityType: "WORKSPACE", entityId: null, entityLabel: "workspace",
      signalType: "STALE_PROOF", severity: "LOW", confidence: "MEDIUM",
      reasonCodes: ["PROOF_OUTSIDE_FRESHNESS_WINDOW"], evidence: [`${ic.stale} accepted proof(s) outside the freshness window`], patternCount: ic.stale, missingData: [],
      ownerExplanation: "Some accepted proof is stale — it may no longer reflect current reality.",
      businessImpact: "Stale proof can mask a lapsed condition (e.g. a machine no longer clean).",
      relatedGamingSignal: null, relatedProfitLeak: null, relatedConstraint: null,
      recommendedResponse: "Re-verify the stale items if the underlying work still matters.",
      ownerActionRequired: false, managerActionSufficient: true, reassessmentTrigger: "Re-check the stale items.",
    });
  }
  if (ic.tamperSuspected >= 1) {
    push({
      entityType: "WORKSPACE", entityId: null, entityLabel: "workspace",
      signalType: "TAMPER_SUSPECTED_PROOF", severity: "HIGH", confidence: "MEDIUM",
      reasonCodes: ["TAMPER_INDICATOR"], evidence: [`${ic.tamperSuspected} tamper-suspected proof(s)`], patternCount: ic.tamperSuspected, missingData: [],
      ownerExplanation: "Tamper-suspected proof was detected — the evidence may be forged.",
      businessImpact: "Forged proof is the highest-risk credibility failure.",
      relatedGamingSignal: "PAYLOAD_TAMPER_ATTEMPT", relatedProfitLeak: null, relatedConstraint: null,
      recommendedResponse: "Reject the tamper-suspected proof, require a fresh verified artifact, and review the operator.",
      ownerActionRequired: true, managerActionSufficient: false, reassessmentTrigger: "Audit the operator's other recent proof.",
    });
  }

  // ── DATA_INSUFFICIENT ──────────────────────────────────────────────────────
  if (out.length === 0) {
    const missing = input.missingSources && input.missingSources.length > 0
      ? input.missingSources
      : ["more proof/review events to establish credibility patterns"];
    push({
      entityType: "WORKSPACE", entityId: null, entityLabel: "workspace",
      signalType: "DATA_INSUFFICIENT", severity: "LOW", confidence: "NEEDS_DATA",
      reasonCodes: ["NO_CREDIBILITY_PATTERN_ABOVE_THRESHOLD"], evidence: ["no credibility concern crosses the threshold"], patternCount: 0, missingData: missing,
      ownerExplanation: "No credibility concern is established yet — not enough proof/review history.",
      businessImpact: "None identified; keep collecting proof/review events.",
      relatedGamingSignal: null, relatedProfitLeak: null, relatedConstraint: null,
      recommendedResponse: `Provide/accumulate: ${missing.join("; ")}.`,
      ownerActionRequired: false, managerActionSufficient: true,
      reassessmentTrigger: "Re-evaluate as more proof/review events accumulate.",
    });
  }

  // Rank concerns first (POSITIVE reliable patterns sink to the bottom via severity weight 0).
  out.sort((a, b) => b.credibilityScore - a.credibilityScore);
  return { topConcern: out[0] ?? null, findings: out, evaluatedAt: at };
}

// ── Aggregation from raw proof rows ──────────────────────────────────────────

export interface CredibilityProofRow {
  /** Proof id — optional here (unused by credibility aggregation), used by the anti-gaming join. */
  id?: string;
  submittedByUserId: string | null;
  reviewedByUserId: string | null;
  proofType: string;
  status: string;
  duplicateFlagged: boolean;
  /** Persisted deterministic tamper signal (Proof.tamperSuspected). */
  tamperSuspected?: boolean;
  createdAt: Date;
  reviewedAt: Date | null;
}

const WEAK_STATUSES = new Set(["NEEDS_HUMAN_REVIEW", "AI_PRECHECK_FAILED"]);
const STALE_AGE_MS = 30 * 24 * 60 * 60 * 1000;

/** Turn raw proof rows into the per-entity credibility aggregates. Pure. */
export function aggregateCredibility(rows: CredibilityProofRow[], nowMs: number): Omit<CredibilityInput, "workspaceId" | "evaluatedAt"> {
  const subs = new Map<string, SubmitterCredStats>();
  const revs = new Map<string, ReviewerCredStats>();
  const types = new Map<string, ProofTypeCredStats>();
  const itemCounts: WorkspaceItemCounts = { weak: 0, rejected: 0, reused: 0, stale: 0, tamperSuspected: 0 };

  for (const p of rows) {
    const isWeak = WEAK_STATUSES.has(p.status);
    const isRejected = p.status === "REJECTED";
    const isAccepted = p.status === "ACCEPTED";
    const isStale = isAccepted && p.reviewedAt != null && nowMs - p.reviewedAt.getTime() > STALE_AGE_MS;

    if (isWeak) itemCounts.weak++;
    if (isRejected) itemCounts.rejected++;
    if (p.duplicateFlagged) itemCounts.reused++;
    if (isStale) itemCounts.stale++;
    if (p.tamperSuspected) itemCounts.tamperSuspected++;

    const isUnreliable = isWeak || isRejected || p.duplicateFlagged;
    if (p.submittedByUserId) {
      const s = subs.get(p.submittedByUserId) ?? { actorId: p.submittedByUserId, total: 0, accepted: 0, weakOrReviewNeeded: 0, rejected: 0, reused: 0, stale: 0, unreliableProofIds: [], weakProofIds: [] };
      s.total++;
      if (isAccepted) s.accepted++;
      if (isWeak) { s.weakOrReviewNeeded++; if (p.id) s.weakProofIds!.push(p.id); }
      if (isRejected) s.rejected++;
      if (p.duplicateFlagged) s.reused++;
      if (isStale) s.stale++;
      if (isUnreliable && p.id) s.unreliableProofIds!.push(p.id);
      subs.set(p.submittedByUserId, s);
    }
    if (p.reviewedByUserId) {
      const r = revs.get(p.reviewedByUserId) ?? { reviewerId: p.reviewedByUserId, accepted: 0, acceptedWeak: 0, selfReviewCount: 0, acceptedWeakProofIds: [], selfReviewProofIds: [] };
      if (isAccepted) { r.accepted++; if (p.duplicateFlagged) { r.acceptedWeak++; if (p.id) r.acceptedWeakProofIds!.push(p.id); } }
      if (p.submittedByUserId && p.submittedByUserId === p.reviewedByUserId) { r.selfReviewCount++; if (p.id) r.selfReviewProofIds!.push(p.id); }
      revs.set(p.reviewedByUserId, r);
    }
    const t = types.get(p.proofType) ?? { proofType: p.proofType, total: 0, accepted: 0, weakOrRejected: 0, weakOrRejectedProofIds: [] };
    t.total++;
    if (isAccepted) t.accepted++;
    if (isWeak || isRejected) { t.weakOrRejected++; if (p.id) t.weakOrRejectedProofIds!.push(p.id); }
    types.set(p.proofType, t);
  }

  return { submitters: [...subs.values()], reviewers: [...revs.values()], proofTypes: [...types.values()], itemCounts };
}

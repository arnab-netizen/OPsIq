/**
 * Cross-Event Anti-Gaming Analytics (depth pass).
 *
 * Answers: "Is staff / manager / operator behaviour making the business unreliable, fake,
 * delayed, or unprofitable?" — across MANY events, not one proof. It surfaces the single
 * highest-risk pattern (not a flood), with reason codes, event evidence, an owner-visible
 * explanation, and a specific response.
 *
 * PURE and deterministic. It consumes per-actor event AGGREGATES computed from the real
 * Proof/audit tables (weak/rejected/duplicate/overdue counts by submitter; accepted/
 * self-review/accepted-weak counts by reviewer). It is NOT a hidden punishment score:
 * every signal carries transparent reason codes + the events that prove it. A single weak
 * event is never a "pattern" — thresholds require repetition. Where a source is not
 * persisted (e.g. complaint↔proof linkage), the type is supported but reported as
 * missing-source rather than fabricated.
 */

import type { ConstraintType } from "@/domain/owner-mode/constraint-engine";
import type { ProfitLeakType } from "@/domain/owner-mode/profit-leak-radar";
import type { CredibilitySignalType } from "@/domain/owner-mode/evidence-credibility-graph";

export type GamingSignalType =
  | "REPEATED_WEAK_PROOF" | "REPEATED_REJECTED_PROOF" | "REUSED_PROOF_PATTERN" | "MISSING_PROOF_PATTERN"
  | "SUSPICIOUS_FAST_COMPLETION" | "LATE_COMPLETION_PATTERN" | "PROOF_FLOOD_LOW_QUALITY"
  | "SELF_REVIEW_ATTEMPT" | "MANAGER_RUBBER_STAMP" | "MANAGER_IGNORES_ESCALATION"
  | "COMPLAINT_AFTER_ACCEPTED_PROOF" | "REWORK_AFTER_ACCEPTED_PROOF" | "PAYLOAD_TAMPER_ATTEMPT"
  | "CROSS_WORKSPACE_TAMPER_ATTEMPT" | "OWNER_REVIEW_BURDEN_CREATED_BY_STAFF"
  | "STAFF_PATTERN_LINKED_TO_PROFIT_LEAK"
  // Fake / reused / suspicious proof-DISPUTE-derived behaviour patterns (conservative — no fraud label).
  | "SUSPECTED_FAKE_OR_REUSED_PROOF_PATTERN" | "TAMPER_SUSPECTED_PROOF_PATTERN"
  | "WRONG_OR_INSUFFICIENT_PROOF_PATTERN" | "MANAGER_ACCEPTED_SUSPICIOUS_PROOF" | "REVIEW_QUALITY_CONCERN"
  | "DATA_INSUFFICIENT";

export type GamingSeverity = "CRITICAL" | "HIGH" | "MEDIUM" | "LOW";
export type GamingConfidence = "HIGH" | "MEDIUM" | "LOW" | "NEEDS_DATA";

export interface ActorProofStats {
  actorId: string;
  role?: string | null;
  totalProofs: number;
  /** NEEDS_HUMAN_REVIEW + AI_PRECHECK_FAILED — weak/unverified. */
  weakOrReviewNeeded: number;
  rejected: number;
  duplicateFlagged: number;
  /** Old + still-pending (overdue) proofs by this actor. */
  overdue: number;
  /** Submissions in a short window (flood heuristic), if known. */
  recentBurst?: number;
  /** Supporting proof IDs per category (for fair adjudication). Present on the live path. */
  weakProofIds?: string[];
  rejectedProofIds?: string[];
  duplicateProofIds?: string[];
  overdueProofIds?: string[];
}

export interface ReviewerStats {
  reviewerId: string;
  role?: string | null;
  accepted: number;
  /** Accepted proofs that were duplicate-flagged or weak — rubber-stamp signal. */
  acceptedWeak: number;
  /** Proofs where the reviewer is also the submitter. */
  selfReviewCount: number;
  /** Supporting proof IDs (for fair adjudication). Present on the live path. */
  acceptedWeakProofIds?: string[];
  selfReviewProofIds?: string[];
}

/**
 * Per-operator suspicious-proof aggregates, derived from the governed proof-DISPUTE trail
 * (SUSPECTED_FAKE_OR_REUSED_PROOF / WRONG_OR_INSUFFICIENT_PROOF categories) joined to the proof's
 * submitter, plus the persisted `tamper_suspected` / duplicate-flagged proof fields. Every count
 * carries the supporting proof IDs + `proof.disputed` audit refs — never a hidden score.
 */
export interface SuspiciousProofActorStats {
  actorId: string;
  role?: string | null;
  /** Proof disputed as SUSPECTED_FAKE_OR_REUSED_PROOF, attributed to its submitter. */
  suspectedFakeCount: number;
  /** Proof disputed as WRONG_OR_INSUFFICIENT_PROOF. */
  wrongInsufficientCount: number;
  /** Persisted tamper_suspected proof by this submitter. */
  tamperSuspectedCount: number;
  /** Duplicate-flagged (reused) proof by this submitter. */
  reusedCount: number;
  proofIds: string[];
  auditRefs: string[];
}
/** Per-reviewer suspicious-acceptance aggregates (accepted proof later disputed fake, or tamper). */
export interface SuspiciousReviewerStats {
  reviewerId: string;
  role?: string | null;
  /** Accepted a proof later disputed as SUSPECTED_FAKE_OR_REUSED_PROOF. */
  acceptedSuspiciousCount: number;
  /** Accepted a proof disputed as MANAGER_REVIEW_ERROR (their own review error). */
  reviewErrorCount: number;
  /** Accepted a tamper-suspected proof. */
  acceptedTamperCount: number;
  proofIds: string[];
  auditRefs: string[];
}

export interface AntiGamingInput {
  workspaceId: string;
  actors: ActorProofStats[];
  reviewers: ReviewerStats[];
  /** Fake/reused/suspicious proof-dispute-derived aggregates (per submitter / reviewer). */
  suspiciousProofActors?: SuspiciousProofActorStats[];
  suspiciousReviewers?: SuspiciousReviewerStats[];
  /**
   * Deterministic reused-hash reuse per submitter (from the dedicated reused-hash precheck). When
   * present, it is the authoritative source for REUSED_PROOF_PATTERN (excludes same-task reuse),
   * superseding the coarse duplicate-flag heuristic. Each entry carries the matched proof IDs.
   */
  reusedHashActors?: Array<{ actorId: string; role?: string | null; crossTaskReuseCount: number; proofIds: string[]; matchType: string }>;
  currentConstraint?: ConstraintType | null;
  topProfitLeakType?: ProfitLeakType | null;
  /** Sources not yet persisted (e.g. complaint↔proof linkage) — for honest missing-data. */
  missingSources?: string[];
  evaluatedAt: string; // ISO
}

export interface GamingSignal {
  workspaceId: string;
  actorId: string | null;
  actorRole: string | null;
  signalType: GamingSignalType;
  /** Transparent reason codes (never a hidden score). */
  reasonCodes: string[];
  severity: GamingSeverity;
  confidence: GamingConfidence;
  evidence: string[];
  patternCount: number;
  missingData: string[];
  ownerExplanation: string;
  businessImpact: string;
  relatedProfitLeak: ProfitLeakType | null;
  relatedConstraint: ConstraintType | null;
  recommendedResponse: string;
  ownerActionRequired: boolean;
  managerActionSufficient: boolean;
  trainingOrProcessRecommendation: string | null;
  reassessmentTrigger: string | null;
  /**
   * Whether this is a REPEATED pattern (≥ threshold) vs a single severe warning. A single severe
   * event (e.g. one suspected-fake dispute) surfaces as a warning with isRepeatedPattern=false —
   * OpsIQ never claims a "pattern" from one event.
   */
  isRepeatedPattern?: boolean;
  /** Related evidence-credibility concern type, when this behaviour maps to one (link, not duplicate). */
  relatedCredibilityConcern?: CredibilitySignalType | null;
  /**
   * The proof IDs backing this signal, when known — used to suppress the signal after an owner
   * adjudication clears exactly those proofs (a new supporting proof re-surfaces it). Absent when the
   * signal has no per-proof evidence (then it is never suppressed — fail visible).
   */
  supportingProofIds?: string[];
  /**
   * Whether the signal's per-proof evidence is COMPLETE (proof IDs identify the whole basis),
   * PARTIAL (some proof IDs but not the whole basis), or BLOCKED_BY_DATA (no persisted proof-level
   * source — the signal stays fail-visible and cannot be adjudication-suppressed yet).
   */
  sourceCompleteness?: "COMPLETE" | "PARTIAL" | "BLOCKED_BY_DATA";
  signalScore: number;
  evaluatedAt: string;
}

export interface AntiGamingAnalysis {
  topSignal: GamingSignal | null;
  signals: GamingSignal[];
  evaluatedAt: string;
}

// Pattern thresholds — a single weak event is never a "pattern".
const WEAK_THRESHOLD = 3;
const REJECTED_THRESHOLD = 2;
const DUPLICATE_THRESHOLD = 2;
const OVERDUE_THRESHOLD = 3;
const REVIEW_BURDEN_THRESHOLD = 3;
const RUBBER_STAMP_THRESHOLD = 2;
const FLOOD_THRESHOLD = 8;

const SEVERITY_WEIGHT: Record<GamingSeverity, number> = { CRITICAL: 1000, HIGH: 100, MEDIUM: 10, LOW: 1 };
const TYPE_PRIORITY: Record<GamingSignalType, number> = {
  // Fake/tamper proof-fraud patterns rank at the top — they are the most direct trust failures.
  SUSPECTED_FAKE_OR_REUSED_PROOF_PATTERN: 22, TAMPER_SUSPECTED_PROOF_PATTERN: 21,
  MANAGER_ACCEPTED_SUSPICIOUS_PROOF: 20, CROSS_WORKSPACE_TAMPER_ATTEMPT: 17, PAYLOAD_TAMPER_ATTEMPT: 16,
  SELF_REVIEW_ATTEMPT: 15, MANAGER_RUBBER_STAMP: 14, REUSED_PROOF_PATTERN: 13, REPEATED_REJECTED_PROOF: 12,
  REVIEW_QUALITY_CONCERN: 11, WRONG_OR_INSUFFICIENT_PROOF_PATTERN: 11,
  REPEATED_WEAK_PROOF: 11, COMPLAINT_AFTER_ACCEPTED_PROOF: 10, REWORK_AFTER_ACCEPTED_PROOF: 9,
  MISSING_PROOF_PATTERN: 8, LATE_COMPLETION_PATTERN: 7, PROOF_FLOOD_LOW_QUALITY: 6,
  MANAGER_IGNORES_ESCALATION: 5, OWNER_REVIEW_BURDEN_CREATED_BY_STAFF: 4,
  SUSPICIOUS_FAST_COMPLETION: 3, STAFF_PATTERN_LINKED_TO_PROFIT_LEAK: 2, DATA_INSUFFICIENT: 0,
};

function sigScore(sev: GamingSeverity, type: GamingSignalType, count: number): number {
  return SEVERITY_WEIGHT[sev] + TYPE_PRIORITY[type] + Math.min(count, 20);
}

/** A single proof row's fields needed for gaming aggregation. */
export interface ProofEventRow {
  /** Proof id — used to attach a per-proof evidence list to each signal (for fair adjudication). */
  id?: string;
  submittedByUserId: string | null;
  reviewedByUserId: string | null;
  status: string;
  duplicateFlagged: boolean;
  createdAt: Date;
}

const WEAK_STATUSES = new Set(["NEEDS_HUMAN_REVIEW", "AI_PRECHECK_FAILED"]);
const OVERDUE_PENDING = new Set(["REQUIRED", "PENDING_SUBMISSION", "RESUBMISSION_REQUIRED"]);
const OVERDUE_AGE_MS = 48 * 60 * 60 * 1000;

/**
 * Aggregate raw proof rows into per-actor / per-reviewer stats. Pure — the caller supplies
 * the rows (from a workspace-scoped query) and `nowMs`. This is what turns single events into
 * the cross-event counts the pattern detector needs.
 */
export function aggregateProofEvents(rows: ProofEventRow[], nowMs: number): { actors: ActorProofStats[]; reviewers: ReviewerStats[] } {
  const actorMap = new Map<string, ActorProofStats>();
  const reviewerMap = new Map<string, ReviewerStats>();
  const pushId = (arr: string[] | undefined, id: string | undefined): string[] => {
    const out = arr ?? [];
    if (id) out.push(id);
    return out;
  };
  for (const p of rows) {
    if (p.submittedByUserId) {
      const a = actorMap.get(p.submittedByUserId) ?? { actorId: p.submittedByUserId, totalProofs: 0, weakOrReviewNeeded: 0, rejected: 0, duplicateFlagged: 0, overdue: 0, weakProofIds: [], rejectedProofIds: [], duplicateProofIds: [], overdueProofIds: [] };
      a.totalProofs++;
      if (WEAK_STATUSES.has(p.status)) { a.weakOrReviewNeeded++; a.weakProofIds = pushId(a.weakProofIds, p.id); }
      if (p.status === "REJECTED") { a.rejected++; a.rejectedProofIds = pushId(a.rejectedProofIds, p.id); }
      if (p.duplicateFlagged) { a.duplicateFlagged++; a.duplicateProofIds = pushId(a.duplicateProofIds, p.id); }
      if (OVERDUE_PENDING.has(p.status) && nowMs - p.createdAt.getTime() > OVERDUE_AGE_MS) { a.overdue++; a.overdueProofIds = pushId(a.overdueProofIds, p.id); }
      actorMap.set(p.submittedByUserId, a);
    }
    if (p.reviewedByUserId) {
      const r = reviewerMap.get(p.reviewedByUserId) ?? { reviewerId: p.reviewedByUserId, accepted: 0, acceptedWeak: 0, selfReviewCount: 0, acceptedWeakProofIds: [], selfReviewProofIds: [] };
      if (p.status === "ACCEPTED") { r.accepted++; if (p.duplicateFlagged) { r.acceptedWeak++; r.acceptedWeakProofIds = pushId(r.acceptedWeakProofIds, p.id); } }
      if (p.submittedByUserId && p.submittedByUserId === p.reviewedByUserId) { r.selfReviewCount++; r.selfReviewProofIds = pushId(r.selfReviewProofIds, p.id); }
      reviewerMap.set(p.reviewedByUserId, r);
    }
  }
  return { actors: [...actorMap.values()], reviewers: [...reviewerMap.values()] };
}

/** A governed proof-dispute record (from the proof.disputed audit trail). */
export interface SuspiciousDisputeRecord { proofId: string; disputeCategory: string; auditEventId: string }
/** A proof row's identity fields, to attribute a dispute/tamper to its submitter + reviewer. */
export interface SuspiciousProofRow {
  id: string;
  submittedByUserId: string | null;
  reviewedByUserId: string | null;
  duplicateFlagged: boolean;
  tamperSuspected?: boolean;
  status: string;
}

const ACCEPTED_CLASS = new Set(["ACCEPTED", "DISPUTED", "OVERRIDDEN_NOT_VERIFIED"]);

/**
 * Aggregate suspicious-proof behaviour per submitter + reviewer from the governed dispute trail and
 * the persisted tamper/duplicate proof fields. Pure: the caller supplies dispute records + the proof
 * rows they reference. Fabricates nothing — a proof with no dispute/tamper contributes no count, and
 * a dispute whose proof is absent (e.g. cross-workspace) is skipped.
 */
export function aggregateSuspiciousProof(
  records: SuspiciousDisputeRecord[],
  rows: SuspiciousProofRow[]
): { suspiciousProofActors: SuspiciousProofActorStats[]; suspiciousReviewers: SuspiciousReviewerStats[] } {
  const proofById = new Map(rows.map((p) => [p.id, p]));
  const actors = new Map<string, SuspiciousProofActorStats>();
  const reviewers = new Map<string, SuspiciousReviewerStats>();
  const actor = (id: string): SuspiciousProofActorStats =>
    actors.get(id) ?? { actorId: id, suspectedFakeCount: 0, wrongInsufficientCount: 0, tamperSuspectedCount: 0, reusedCount: 0, proofIds: [], auditRefs: [] };
  const reviewer = (id: string): SuspiciousReviewerStats =>
    reviewers.get(id) ?? { reviewerId: id, acceptedSuspiciousCount: 0, reviewErrorCount: 0, acceptedTamperCount: 0, proofIds: [], auditRefs: [] };

  // Persisted tamper/duplicate proof fields (independent of any dispute).
  for (const p of rows) {
    if (p.tamperSuspected && p.submittedByUserId) {
      const a = actor(p.submittedByUserId); a.tamperSuspectedCount++; a.proofIds.push(p.id); actors.set(p.submittedByUserId, a);
      if (p.reviewedByUserId && ACCEPTED_CLASS.has(p.status)) {
        const r = reviewer(p.reviewedByUserId); r.acceptedTamperCount++; r.proofIds.push(p.id); reviewers.set(p.reviewedByUserId, r);
      }
    }
    if (p.duplicateFlagged && p.submittedByUserId) {
      const a = actor(p.submittedByUserId); a.reusedCount++; if (!a.proofIds.includes(p.id)) a.proofIds.push(p.id); actors.set(p.submittedByUserId, a);
    }
  }

  // Governed disputes → attribute to the proof's submitter (and reviewer where the review is implicated).
  for (const rec of records) {
    const p = proofById.get(rec.proofId);
    if (!p) continue; // absent/cross-workspace proof → never fabricate an attribution
    if (rec.disputeCategory === "SUSPECTED_FAKE_OR_REUSED_PROOF") {
      if (p.submittedByUserId) { const a = actor(p.submittedByUserId); a.suspectedFakeCount++; if (!a.proofIds.includes(p.id)) a.proofIds.push(p.id); a.auditRefs.push(rec.auditEventId); actors.set(p.submittedByUserId, a); }
      if (p.reviewedByUserId) { const r = reviewer(p.reviewedByUserId); r.acceptedSuspiciousCount++; if (!r.proofIds.includes(p.id)) r.proofIds.push(p.id); r.auditRefs.push(rec.auditEventId); reviewers.set(p.reviewedByUserId, r); }
    } else if (rec.disputeCategory === "WRONG_OR_INSUFFICIENT_PROOF") {
      if (p.submittedByUserId) { const a = actor(p.submittedByUserId); a.wrongInsufficientCount++; if (!a.proofIds.includes(p.id)) a.proofIds.push(p.id); a.auditRefs.push(rec.auditEventId); actors.set(p.submittedByUserId, a); }
    } else if (rec.disputeCategory === "MANAGER_REVIEW_ERROR") {
      if (p.reviewedByUserId) { const r = reviewer(p.reviewedByUserId); r.reviewErrorCount++; if (!r.proofIds.includes(p.id)) r.proofIds.push(p.id); r.auditRefs.push(rec.auditEventId); reviewers.set(p.reviewedByUserId, r); }
    }
  }

  return { suspiciousProofActors: [...actors.values()], suspiciousReviewers: [...reviewers.values()] };
}

// Fake/suspicious proof-dispute pattern thresholds — a single event is a warning, not a "pattern".
const FAKE_PATTERN_THRESHOLD = 2;
const WRONG_INSUFFICIENT_PATTERN_THRESHOLD = 2;
const TAMPER_PATTERN_THRESHOLD = 2;

export function identifyGamingSignals(input: AntiGamingInput): AntiGamingAnalysis {
  const at = input.evaluatedAt;
  const ws = input.workspaceId;
  const out: GamingSignal[] = [];
  const push = (f: Omit<GamingSignal, "workspaceId" | "evaluatedAt" | "signalScore">): void => {
    out.push({ ...f, workspaceId: ws, evaluatedAt: at, signalScore: sigScore(f.severity, f.signalType, f.patternCount) });
  };
  // Attach a per-proof evidence list so a signal can be fairly adjudicated. When the proof-level
  // source is present the signal is COMPLETE (and suppressible); when absent it stays BLOCKED_BY_DATA
  // (fail-visible, never suppressed) with an honest missing-source note.
  const withEvidence = (ids: string[] | undefined): Pick<GamingSignal, "supportingProofIds" | "sourceCompleteness" | "missingData"> =>
    ids && ids.length > 0
      ? { supportingProofIds: ids.slice(0, 50), sourceCompleteness: "COMPLETE", missingData: [] }
      : { supportingProofIds: undefined, sourceCompleteness: "BLOCKED_BY_DATA", missingData: ["no persisted proof-level source for this signal — cannot be adjudication-suppressed yet"] };

  // ── Fake / reused / suspicious proof-DISPUTE-derived patterns ──────────────
  // Driven by the governed proof.disputed trail + persisted tamper/duplicate fields. Conservative:
  // no "fraud" label, no hidden score; a single event is a warning, repetition is a "pattern".
  for (const a of input.suspiciousProofActors ?? []) {
    const refs = a.proofIds.slice(0, 10);
    if (a.suspectedFakeCount >= 1) {
      const repeated = a.suspectedFakeCount >= FAKE_PATTERN_THRESHOLD;
      push({
        actorId: a.actorId, actorRole: a.role ?? "staff", signalType: "SUSPECTED_FAKE_OR_REUSED_PROOF_PATTERN",
        reasonCodes: [repeated ? "REPEATED_SUSPECTED_FAKE_OR_REUSED_PROOF_DISPUTE" : "SINGLE_SEVERE_WARNING", ...(a.reusedCount > 0 ? ["DUPLICATE_FILE_HASH"] : [])],
        severity: repeated ? "CRITICAL" : "HIGH", confidence: "HIGH",
        evidence: [`${a.suspectedFakeCount} proof(s) disputed as suspected fake/reused${a.reusedCount > 0 ? `; ${a.reusedCount} duplicate-flagged` : ""}`, ...(refs.length ? [`proof refs: ${refs.join(", ")}`] : []), ...(a.auditRefs.length ? [`audit refs: ${a.auditRefs.slice(0, 10).join(", ")}`] : [])],
        patternCount: a.suspectedFakeCount, isRepeatedPattern: repeated, missingData: [], supportingProofIds: a.proofIds, sourceCompleteness: "COMPLETE",
        ownerExplanation: repeated
          ? "This operator repeatedly has proof disputed as suspected fake or reused — a serious, repeated credibility pattern. This is not an accusation; it needs owner review and adjudication."
          : "This operator had proof disputed as suspected fake or reused — a single severe warning (not yet a repeated pattern). Needs owner review before any conclusion.",
        businessImpact: "Suspected fake/reused proof means work may be certified as done without being done — the highest-risk behaviour pattern.",
        relatedProfitLeak: input.topProfitLeakType === "WEAK_PROOF_REWORK_RISK" ? "WEAK_PROOF_REWORK_RISK" : null,
        relatedConstraint: input.currentConstraint === "STAFF" ? "STAFF" : null,
        relatedCredibilityConcern: "ACCEPTED_PROOF_WITH_BAD_OUTCOME",
        recommendedResponse: "Owner-review this operator's recent proof; require fresh, independently verified artifacts before assigning new work. Do not accuse without adjudication.",
        ownerActionRequired: true, managerActionSufficient: false,
        trainingOrProcessRecommendation: "Owner-led review + stricter unique-artifact proof requirement; escalate only through the owner's adjudication process.",
        reassessmentTrigger: repeated ? "Open a reassessment of this operator's recent accepted work." : null,
      });
    }
    if (a.wrongInsufficientCount >= WRONG_INSUFFICIENT_PATTERN_THRESHOLD) {
      push({
        actorId: a.actorId, actorRole: a.role ?? "staff", signalType: "WRONG_OR_INSUFFICIENT_PROOF_PATTERN",
        reasonCodes: ["REPEATED_WRONG_OR_INSUFFICIENT_PROOF_DISPUTE"], severity: a.wrongInsufficientCount >= 4 ? "HIGH" : "MEDIUM", confidence: "HIGH",
        evidence: [`${a.wrongInsufficientCount} proof(s) disputed as wrong/insufficient`, ...(refs.length ? [`proof refs: ${refs.join(", ")}`] : [])],
        patternCount: a.wrongInsufficientCount, isRepeatedPattern: true, missingData: [], supportingProofIds: a.proofIds, sourceCompleteness: "COMPLETE",
        ownerExplanation: "This operator repeatedly submits proof that is later ruled wrong or insufficient — the proof requirement or the work itself is not up to standard.",
        businessImpact: "Wrong/insufficient proof predicts rework and hides true completion status.",
        relatedProfitLeak: input.topProfitLeakType === "WEAK_PROOF_REWORK_RISK" ? "WEAK_PROOF_REWORK_RISK" : null,
        relatedConstraint: input.currentConstraint === "STAFF" ? "STAFF" : null,
        relatedCredibilityConcern: "WEAK_PROOF_NEEDS_REVIEW",
        recommendedResponse: "Show the operator the acceptable proof standard and require it before assigning new work; coach before discipline.",
        ownerActionRequired: false, managerActionSufficient: true,
        trainingOrProcessRecommendation: "Coaching + clearer proof checklist for this task type.",
        reassessmentTrigger: null,
      });
    }
    if (a.tamperSuspectedCount >= TAMPER_PATTERN_THRESHOLD) {
      push({
        actorId: a.actorId, actorRole: a.role ?? "staff", signalType: "TAMPER_SUSPECTED_PROOF_PATTERN",
        reasonCodes: ["REPEATED_TAMPER_SUSPECTED_PROOF"], severity: "CRITICAL", confidence: "MEDIUM",
        evidence: [`${a.tamperSuspectedCount} tamper-suspected proof(s) from this operator`, ...(refs.length ? [`proof refs: ${refs.join(", ")}`] : [])],
        patternCount: a.tamperSuspectedCount, isRepeatedPattern: true, missingData: [], supportingProofIds: a.proofIds, sourceCompleteness: "COMPLETE",
        ownerExplanation: "This operator repeatedly submits tamper-suspected proof — the evidence may be forged. Not an accusation; needs owner review and adjudication.",
        businessImpact: "Forged/tampered proof is the highest-risk credibility failure — completion cannot be trusted.",
        relatedProfitLeak: input.topProfitLeakType === "WEAK_PROOF_REWORK_RISK" ? "WEAK_PROOF_REWORK_RISK" : null,
        relatedConstraint: input.currentConstraint === "STAFF" ? "STAFF" : null,
        relatedCredibilityConcern: "TAMPER_SUSPECTED_PROOF",
        recommendedResponse: "Reject the tamper-suspected proof, require fresh verified artifacts, and owner-review this operator's recent work.",
        ownerActionRequired: true, managerActionSufficient: false,
        trainingOrProcessRecommendation: "Owner-led review; tighten proof capture to a tamper-evident method.",
        reassessmentTrigger: "Open a reassessment of this operator's recent accepted work.",
      });
    }
  }
  for (const r of input.suspiciousReviewers ?? []) {
    const refs = r.proofIds.slice(0, 10);
    if (r.acceptedSuspiciousCount >= 1) {
      const repeated = r.acceptedSuspiciousCount >= FAKE_PATTERN_THRESHOLD;
      push({
        actorId: r.reviewerId, actorRole: r.role ?? "manager", signalType: "MANAGER_ACCEPTED_SUSPICIOUS_PROOF",
        reasonCodes: [repeated ? "REPEATED_ACCEPTED_SUSPICIOUS_PROOF" : "SINGLE_SEVERE_WARNING"], severity: repeated ? "CRITICAL" : "HIGH", confidence: "HIGH",
        evidence: [`${r.acceptedSuspiciousCount} proof(s) this reviewer accepted were later disputed as suspected fake/reused`, ...(refs.length ? [`proof refs: ${refs.join(", ")}`] : [])],
        patternCount: r.acceptedSuspiciousCount, isRepeatedPattern: repeated, missingData: [], supportingProofIds: r.proofIds, sourceCompleteness: "COMPLETE",
        ownerExplanation: "A manager/reviewer accepted proof that was later disputed as suspected fake/reused — the review gate let suspicious evidence through.",
        businessImpact: "If the review gate passes fake/reused proof, no acceptance can be trusted.",
        relatedProfitLeak: input.topProfitLeakType === "WEAK_PROOF_REWORK_RISK" ? "WEAK_PROOF_REWORK_RISK" : null,
        relatedConstraint: input.currentConstraint === "MANAGER" ? "MANAGER" : null,
        relatedCredibilityConcern: "REVIEW_QUALITY_CONCERN",
        recommendedResponse: "Owner-review this reviewer's recent acceptances; require independent double-review for suspected-fake-prone task types.",
        ownerActionRequired: true, managerActionSufficient: false,
        trainingOrProcessRecommendation: "Reviewer coaching on detecting reused/tampered artifacts; tighten the approval policy.",
        reassessmentTrigger: repeated ? "Open a reassessment of this reviewer's recent accepted items." : null,
      });
    } else if (r.acceptedTamperCount >= 1 || r.reviewErrorCount >= RUBBER_STAMP_THRESHOLD) {
      push({
        actorId: r.reviewerId, actorRole: r.role ?? "manager", signalType: "REVIEW_QUALITY_CONCERN",
        reasonCodes: [r.acceptedTamperCount >= 1 ? "ACCEPTED_TAMPER_SUSPECTED_PROOF" : "REPEATED_REVIEW_ERROR"], severity: "HIGH", confidence: "MEDIUM",
        evidence: [r.acceptedTamperCount >= 1 ? `${r.acceptedTamperCount} tamper-suspected proof(s) accepted by this reviewer` : `${r.reviewErrorCount} of this reviewer's acceptances were disputed as review errors`, ...(refs.length ? [`proof refs: ${refs.join(", ")}`] : [])],
        patternCount: Math.max(r.acceptedTamperCount, r.reviewErrorCount), isRepeatedPattern: r.reviewErrorCount >= RUBBER_STAMP_THRESHOLD, missingData: [], supportingProofIds: r.proofIds, sourceCompleteness: "COMPLETE",
        ownerExplanation: "This reviewer's review quality is a concern — they accepted tamper-suspected proof or had repeated review errors.",
        businessImpact: "Weak review lets untrustworthy proof pass, driving rework and complaints downstream.",
        relatedProfitLeak: null, relatedConstraint: input.currentConstraint === "MANAGER" ? "MANAGER" : null,
        relatedCredibilityConcern: "REVIEW_QUALITY_CONCERN",
        recommendedResponse: "Spot-audit this reviewer's recent approvals and require a written reason per acceptance.",
        ownerActionRequired: false, managerActionSufficient: true,
        trainingOrProcessRecommendation: "Proof-review training; raise the proof bar for this reviewer.",
        reassessmentTrigger: null,
      });
    }
  }

  // ── Deterministic reused-hash pattern (from the dedicated reused-hash precheck) ──
  for (const a of input.reusedHashActors ?? []) {
    if (a.crossTaskReuseCount >= DUPLICATE_THRESHOLD) {
      const refs = a.proofIds.slice(0, 10);
      push({
        actorId: a.actorId, actorRole: a.role ?? "staff", signalType: "REUSED_PROOF_PATTERN",
        reasonCodes: ["EXACT_REUSED_HASH", "REUSED_ACROSS_DIFFERENT_TASKS"], severity: "HIGH", confidence: "HIGH",
        evidence: [`${a.crossTaskReuseCount} of this operator's proofs reuse a ${a.matchType.toLowerCase()} across different jobs`, ...(refs.length ? [`proof refs: ${refs.join(", ")}`] : [])],
        patternCount: a.crossTaskReuseCount, isRepeatedPattern: true, missingData: [], supportingProofIds: a.proofIds, sourceCompleteness: "COMPLETE",
        ownerExplanation: "The same proof artifact is reused by this operator across different jobs — the work may not actually be happening each time. This needs review, not an accusation.",
        businessImpact: "Reused proof fakes completion, hiding undone work until a complaint surfaces.",
        relatedProfitLeak: input.topProfitLeakType === "WEAK_PROOF_REWORK_RISK" ? "WEAK_PROOF_REWORK_RISK" : null,
        relatedConstraint: input.currentConstraint === "STAFF" ? "STAFF" : null,
        relatedCredibilityConcern: "REUSED_PROOF",
        recommendedResponse: "Require a fresh, job-specific proof for each task; review the reused artifacts before relying on those completions.",
        ownerActionRequired: false, managerActionSufficient: true,
        trainingOrProcessRecommendation: "Stricter unique-artifact-per-job proof requirement + a conversation with the operator.",
        reassessmentTrigger: "Re-verify the jobs backed by reused proof.",
      });
    }
  }

  // ── Reviewer patterns ──────────────────────────────────────────────────────
  for (const r of input.reviewers) {
    if (r.selfReviewCount >= 1) {
      push({
        actorId: r.reviewerId, actorRole: r.role ?? "reviewer", signalType: "SELF_REVIEW_ATTEMPT",
        reasonCodes: ["SELF_REVIEW"], severity: "HIGH", confidence: "HIGH",
        evidence: [`${r.selfReviewCount} proof(s) reviewed by their own submitter`, ...((r.selfReviewProofIds ?? []).length ? [`proof refs: ${(r.selfReviewProofIds ?? []).slice(0, 10).join(", ")}`] : [])], patternCount: r.selfReviewCount, ...withEvidence(r.selfReviewProofIds),
        ownerExplanation: "A reviewer accepted work they submitted themselves — separation of duty is being bypassed.",
        businessImpact: "Self-review defeats verification: bad work can be signed off as done.",
        relatedProfitLeak: null, relatedConstraint: null,
        recommendedResponse: "Enforce that a different person reviews each proof; audit the affected items and re-review.",
        ownerActionRequired: true, managerActionSufficient: false,
        trainingOrProcessRecommendation: "Process/permission fix: block reviewer == submitter (the FSM already forbids it — investigate how these occurred).",
        reassessmentTrigger: "Re-check the affected actions' outcomes; open reassessment if any were relied upon.",
      });
    }
    if (r.acceptedWeak >= RUBBER_STAMP_THRESHOLD) {
      push({
        actorId: r.reviewerId, actorRole: r.role ?? "manager", signalType: "MANAGER_RUBBER_STAMP",
        reasonCodes: ["ACCEPTED_WEAK_OR_DUPLICATE_PROOF"], severity: "HIGH", confidence: "MEDIUM",
        evidence: [`${r.acceptedWeak} weak/duplicate proof(s) accepted by this reviewer`, ...((r.acceptedWeakProofIds ?? []).length ? [`proof refs: ${(r.acceptedWeakProofIds ?? []).slice(0, 10).join(", ")}`] : [])], patternCount: r.acceptedWeak, ...withEvidence(r.acceptedWeakProofIds),
        ownerExplanation: "A manager is approving weak or reused proof — completion is being rubber-stamped, not verified.",
        businessImpact: "Rubber-stamping lets unreliable work pass, driving rework and complaints downstream.",
        relatedProfitLeak: input.topProfitLeakType && ["REWORK_REDO_COST", "COMPLAINT_REVENUE_RISK", "WEAK_PROOF_REWORK_RISK"].includes(input.topProfitLeakType) ? input.topProfitLeakType : null,
        relatedConstraint: input.currentConstraint === "QUALITY" || input.currentConstraint === "MANAGER" ? input.currentConstraint : null,
        recommendedResponse: "Require a written reason for each acceptance and spot-audit this reviewer's recent approvals.",
        ownerActionRequired: true, managerActionSufficient: false,
        trainingOrProcessRecommendation: "Proof-review training + mandatory rejection reason; consider raising the proof bar for this reviewer.",
        reassessmentTrigger: "Re-open outcome checks on the rubber-stamped items.",
      });
    }
  }

  // ── Submitter (staff/operator) patterns ────────────────────────────────────
  for (const a of input.actors) {
    // When the deterministic reused-hash precheck is supplied it is authoritative for REUSED_PROOF_PATTERN
    // (it excludes legitimate same-task reuse); fall back to the coarse duplicate flag only without it.
    if (!input.reusedHashActors && a.duplicateFlagged >= DUPLICATE_THRESHOLD) {
      push({
        actorId: a.actorId, actorRole: a.role ?? "staff", signalType: "REUSED_PROOF_PATTERN",
        reasonCodes: ["DUPLICATE_FILE_HASH"], severity: "HIGH", confidence: "HIGH",
        evidence: [`${a.duplicateFlagged} duplicate-flagged proof(s) from this actor`], patternCount: a.duplicateFlagged, ...withEvidence(a.duplicateProofIds),
        ownerExplanation: "The same proof is being reused across jobs — the work may not actually be happening each time.",
        businessImpact: "Reused proof fakes completion, hiding undone work until a complaint surfaces.",
        relatedProfitLeak: null, relatedConstraint: input.currentConstraint === "STAFF" ? "STAFF" : null,
        recommendedResponse: "Require a fresh, job-specific proof for each task; reject reused artifacts and re-verify the affected jobs.",
        ownerActionRequired: false, managerActionSufficient: true,
        trainingOrProcessRecommendation: "Stricter proof requirement (unique artifact per job) + a conversation with the operator.",
        reassessmentTrigger: "Re-verify the jobs backed by reused proof.",
      });
    }
    if (a.rejected >= REJECTED_THRESHOLD) {
      push({
        actorId: a.actorId, actorRole: a.role ?? "staff", signalType: "REPEATED_REJECTED_PROOF",
        reasonCodes: ["REPEATED_REJECTION"], severity: "MEDIUM", confidence: "HIGH",
        evidence: [`${a.rejected} rejected proof(s) from this actor`], patternCount: a.rejected, ...withEvidence(a.rejectedProofIds),
        ownerExplanation: "This person's proof keeps getting rejected — either the work or the evidence is not up to standard.",
        businessImpact: "Repeated rejections waste review time and delay verified completion.",
        relatedProfitLeak: null, relatedConstraint: input.currentConstraint === "STAFF" ? "STAFF" : null,
        recommendedResponse: "Show the operator exactly what an acceptable proof looks like; pair with a lead until proof passes first time.",
        ownerActionRequired: false, managerActionSufficient: true,
        trainingOrProcessRecommendation: "Training issue: clarify the proof standard for this task type.",
        reassessmentTrigger: null,
      });
    }
    if (a.weakOrReviewNeeded >= WEAK_THRESHOLD) {
      push({
        actorId: a.actorId, actorRole: a.role ?? "staff", signalType: "REPEATED_WEAK_PROOF",
        reasonCodes: ["REPEATED_WEAK_OR_REVIEW_NEEDED"], severity: a.weakOrReviewNeeded >= 8 ? "HIGH" : "MEDIUM", confidence: "HIGH",
        evidence: [`${a.weakOrReviewNeeded} weak/review-needed proof(s) from this actor`], patternCount: a.weakOrReviewNeeded, ...withEvidence(a.weakProofIds),
        ownerExplanation: "This person repeatedly submits weak proof that needs human review — it is slowing verification and creating review load.",
        businessImpact: "Weak proof predicts rework and complaints and piles work onto the owner/manager review queue.",
        relatedProfitLeak: input.topProfitLeakType && ["WEAK_PROOF_REWORK_RISK", "STAFF_PRODUCTIVITY_DROP", "REWORK_REDO_COST"].includes(input.topProfitLeakType) ? input.topProfitLeakType : null,
        relatedConstraint: input.currentConstraint === "STAFF" || input.currentConstraint === "QUALITY" ? input.currentConstraint : null,
        recommendedResponse: "Set a clear proof checklist for this operator and require it before assigning new work.",
        ownerActionRequired: false, managerActionSufficient: true,
        trainingOrProcessRecommendation: "Training + proof checklist; this is a coaching issue before a discipline issue.",
        reassessmentTrigger: "Re-evaluate if weak proof continues after coaching.",
      });
    } else if (a.overdue >= OVERDUE_THRESHOLD) {
      push({
        actorId: a.actorId, actorRole: a.role ?? "staff", signalType: "LATE_COMPLETION_PATTERN",
        reasonCodes: ["REPEATED_OVERDUE_PROOF"], severity: a.overdue >= 8 ? "HIGH" : "MEDIUM", confidence: "MEDIUM",
        evidence: [`${a.overdue} overdue proof(s) from this actor`], patternCount: a.overdue, ...withEvidence(a.overdueProofIds),
        ownerExplanation: "This person is repeatedly late submitting proof — completion and cash are being delayed.",
        businessImpact: "Late completion holds up cash and ties up work-in-progress.",
        relatedProfitLeak: null, relatedConstraint: input.currentConstraint === "STAFF" ? "STAFF" : null,
        recommendedResponse: "Re-balance this operator's load and set a same-day proof cutoff.",
        ownerActionRequired: false, managerActionSufficient: true,
        trainingOrProcessRecommendation: "Workload/process issue: check if the operator is overloaded before treating it as compliance.",
        reassessmentTrigger: null,
      });
    }
    // Owner review burden created by staff (weak proofs that land in the human-review queue).
    if (a.weakOrReviewNeeded >= REVIEW_BURDEN_THRESHOLD) {
      push({
        actorId: a.actorId, actorRole: a.role ?? "staff", signalType: "OWNER_REVIEW_BURDEN_CREATED_BY_STAFF",
        reasonCodes: ["STAFF_DRIVEN_REVIEW_LOAD"], severity: "MEDIUM", confidence: "HIGH",
        evidence: [`${a.weakOrReviewNeeded} of this actor's proofs need human review`], patternCount: a.weakOrReviewNeeded, ...withEvidence(a.weakProofIds),
        ownerExplanation: "This operator is generating most of the owner/manager review load through weak proof.",
        businessImpact: "Concentrated review burden is an owner-workload leak — fixing one operator frees the most owner time.",
        relatedProfitLeak: "OWNER_BOTTLENECK_COST", relatedConstraint: input.currentConstraint === "OWNER" ? "OWNER" : null,
        recommendedResponse: "Fix this operator's proof quality first — it removes the biggest chunk of review load.",
        ownerActionRequired: false, managerActionSufficient: true,
        trainingOrProcessRecommendation: "Targeted coaching on the one operator driving review load.",
        reassessmentTrigger: null,
      });
    }
    if ((a.recentBurst ?? 0) >= FLOOD_THRESHOLD && a.weakOrReviewNeeded >= WEAK_THRESHOLD) {
      push({
        actorId: a.actorId, actorRole: a.role ?? "staff", signalType: "PROOF_FLOOD_LOW_QUALITY",
        reasonCodes: ["HIGH_VOLUME_LOW_QUALITY"], severity: "MEDIUM", confidence: "MEDIUM",
        evidence: [`${a.recentBurst} submissions in a short window with ${a.weakOrReviewNeeded} weak`], patternCount: a.recentBurst ?? 0, missingData: [],
        ownerExplanation: "A burst of low-quality proof submissions looks like gaming the system rather than genuine work.",
        businessImpact: "Proof spam buries real verification and wastes review time.",
        relatedProfitLeak: null, relatedConstraint: null,
        recommendedResponse: "Rate-limit / batch this operator's submissions and require the proof checklist per job.",
        ownerActionRequired: false, managerActionSufficient: true,
        trainingOrProcessRecommendation: "Process control: throttle + checklist.",
        reassessmentTrigger: null,
      });
    }
  }

  // ── DATA_INSUFFICIENT — no pattern crosses threshold ───────────────────────
  if (out.length === 0) {
    const missing = input.missingSources && input.missingSources.length > 0
      ? input.missingSources
      : ["more proof/review events per actor to establish a pattern"];
    push({
      actorId: null, actorRole: null, signalType: "DATA_INSUFFICIENT",
      reasonCodes: ["NO_PATTERN_ABOVE_THRESHOLD"], severity: "LOW", confidence: "NEEDS_DATA",
      evidence: ["no gaming pattern crosses the repetition threshold"], patternCount: 0, missingData: missing,
      ownerExplanation: "No staff/manager gaming pattern is established yet — not enough repeated events to be sure.",
      businessImpact: "None identified; keep collecting proof/review events.",
      relatedProfitLeak: null, relatedConstraint: null,
      recommendedResponse: `Provide/accumulate: ${missing.join("; ")}.`,
      ownerActionRequired: false, managerActionSufficient: true,
      trainingOrProcessRecommendation: null,
      reassessmentTrigger: "Re-evaluate as more proof/review events accumulate.",
    });
  }

  out.sort((a, b) => b.signalScore - a.signalScore);
  return { topSignal: out[0] ?? null, signals: out, evaluatedAt: at };
}

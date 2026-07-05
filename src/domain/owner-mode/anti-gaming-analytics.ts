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

export type GamingSignalType =
  | "REPEATED_WEAK_PROOF" | "REPEATED_REJECTED_PROOF" | "REUSED_PROOF_PATTERN" | "MISSING_PROOF_PATTERN"
  | "SUSPICIOUS_FAST_COMPLETION" | "LATE_COMPLETION_PATTERN" | "PROOF_FLOOD_LOW_QUALITY"
  | "SELF_REVIEW_ATTEMPT" | "MANAGER_RUBBER_STAMP" | "MANAGER_IGNORES_ESCALATION"
  | "COMPLAINT_AFTER_ACCEPTED_PROOF" | "REWORK_AFTER_ACCEPTED_PROOF" | "PAYLOAD_TAMPER_ATTEMPT"
  | "CROSS_WORKSPACE_TAMPER_ATTEMPT" | "OWNER_REVIEW_BURDEN_CREATED_BY_STAFF"
  | "STAFF_PATTERN_LINKED_TO_PROFIT_LEAK" | "DATA_INSUFFICIENT";

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
}

export interface ReviewerStats {
  reviewerId: string;
  role?: string | null;
  accepted: number;
  /** Accepted proofs that were duplicate-flagged or weak — rubber-stamp signal. */
  acceptedWeak: number;
  /** Proofs where the reviewer is also the submitter. */
  selfReviewCount: number;
}

export interface AntiGamingInput {
  workspaceId: string;
  actors: ActorProofStats[];
  reviewers: ReviewerStats[];
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
  CROSS_WORKSPACE_TAMPER_ATTEMPT: 17, PAYLOAD_TAMPER_ATTEMPT: 16, SELF_REVIEW_ATTEMPT: 15,
  MANAGER_RUBBER_STAMP: 14, REUSED_PROOF_PATTERN: 13, REPEATED_REJECTED_PROOF: 12,
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
  for (const p of rows) {
    if (p.submittedByUserId) {
      const a = actorMap.get(p.submittedByUserId) ?? { actorId: p.submittedByUserId, totalProofs: 0, weakOrReviewNeeded: 0, rejected: 0, duplicateFlagged: 0, overdue: 0 };
      a.totalProofs++;
      if (WEAK_STATUSES.has(p.status)) a.weakOrReviewNeeded++;
      if (p.status === "REJECTED") a.rejected++;
      if (p.duplicateFlagged) a.duplicateFlagged++;
      if (OVERDUE_PENDING.has(p.status) && nowMs - p.createdAt.getTime() > OVERDUE_AGE_MS) a.overdue++;
      actorMap.set(p.submittedByUserId, a);
    }
    if (p.reviewedByUserId) {
      const r = reviewerMap.get(p.reviewedByUserId) ?? { reviewerId: p.reviewedByUserId, accepted: 0, acceptedWeak: 0, selfReviewCount: 0 };
      if (p.status === "ACCEPTED") { r.accepted++; if (p.duplicateFlagged) r.acceptedWeak++; }
      if (p.submittedByUserId && p.submittedByUserId === p.reviewedByUserId) r.selfReviewCount++;
      reviewerMap.set(p.reviewedByUserId, r);
    }
  }
  return { actors: [...actorMap.values()], reviewers: [...reviewerMap.values()] };
}

export function identifyGamingSignals(input: AntiGamingInput): AntiGamingAnalysis {
  const at = input.evaluatedAt;
  const ws = input.workspaceId;
  const out: GamingSignal[] = [];
  const push = (f: Omit<GamingSignal, "workspaceId" | "evaluatedAt" | "signalScore">): void => {
    out.push({ ...f, workspaceId: ws, evaluatedAt: at, signalScore: sigScore(f.severity, f.signalType, f.patternCount) });
  };

  // ── Reviewer patterns ──────────────────────────────────────────────────────
  for (const r of input.reviewers) {
    if (r.selfReviewCount >= 1) {
      push({
        actorId: r.reviewerId, actorRole: r.role ?? "reviewer", signalType: "SELF_REVIEW_ATTEMPT",
        reasonCodes: ["SELF_REVIEW"], severity: "HIGH", confidence: "HIGH",
        evidence: [`${r.selfReviewCount} proof(s) reviewed by their own submitter`], patternCount: r.selfReviewCount, missingData: [],
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
        evidence: [`${r.acceptedWeak} weak/duplicate proof(s) accepted by this reviewer`], patternCount: r.acceptedWeak, missingData: [],
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
    if (a.duplicateFlagged >= DUPLICATE_THRESHOLD) {
      push({
        actorId: a.actorId, actorRole: a.role ?? "staff", signalType: "REUSED_PROOF_PATTERN",
        reasonCodes: ["DUPLICATE_FILE_HASH"], severity: "HIGH", confidence: "HIGH",
        evidence: [`${a.duplicateFlagged} duplicate-flagged proof(s) from this actor`], patternCount: a.duplicateFlagged, missingData: [],
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
        evidence: [`${a.rejected} rejected proof(s) from this actor`], patternCount: a.rejected, missingData: [],
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
        evidence: [`${a.weakOrReviewNeeded} weak/review-needed proof(s) from this actor`], patternCount: a.weakOrReviewNeeded, missingData: [],
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
        evidence: [`${a.overdue} overdue proof(s) from this actor`], patternCount: a.overdue, missingData: [],
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
        evidence: [`${a.weakOrReviewNeeded} of this actor's proofs need human review`], patternCount: a.weakOrReviewNeeded, missingData: [],
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

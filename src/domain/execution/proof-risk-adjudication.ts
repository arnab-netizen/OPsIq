/**
 * Owner proof-risk adjudication — PURE domain rules.
 *
 * When OpsIQ flags a reused / fake / suspicious proof (reused-hash finding, anti-gaming signal,
 * reused-proof credibility concern, or a suspicious/fake proof dispute), the owner or an authorized
 * reviewer decides fairly what to do. This module owns the outcome vocabulary, fail-closed validation
 * (an outcome + a reason are always required), and the conservative downstream effect of each outcome.
 *
 * It is NOT HR discipline tooling: it records a decision about the FINDING, never a payroll/termination
 * recommendation. It never emits a fraud/theft label and never holds a hidden score. It never deletes
 * evidence or rewrites proof status (that stays in the governed dispute flow).
 */

export enum AdjudicationOutcome {
  REQUIRE_FRESH_PROOF = "REQUIRE_FRESH_PROOF",
  ACCEPT_AS_VALID = "ACCEPT_AS_VALID",
  DISMISS_FALSE_POSITIVE = "DISMISS_FALSE_POSITIVE",
  CONFIRM_SUSPICIOUS_PATTERN = "CONFIRM_SUSPICIOUS_PATTERN",
  ESCALATE_FOR_TRAINING = "ESCALATE_FOR_TRAINING",
  ESCALATE_FOR_OWNER_REVIEW = "ESCALATE_FOR_OWNER_REVIEW",
  MARK_INCONCLUSIVE_NEEDS_DATA = "MARK_INCONCLUSIVE_NEEDS_DATA",
}

export enum AdjudicationSourceType {
  REUSED_HASH_FINDING = "REUSED_HASH_FINDING",
  ANTI_GAMING_SIGNAL = "ANTI_GAMING_SIGNAL",
  CREDIBILITY_CONCERN = "CREDIBILITY_CONCERN",
  PROOF_DISPUTE = "PROOF_DISPUTE",
}

/** Owner-facing status the finding takes after adjudication. */
export type AdjudicationStatus = "ACTIVE" | "CLEARED" | "CONFIRMED" | "INCONCLUSIVE" | "TRAINING" | "OWNER_REVIEW";

export function isAdjudicationOutcome(v: unknown): v is AdjudicationOutcome {
  return typeof v === "string" && (Object.values(AdjudicationOutcome) as string[]).includes(v);
}
export function isAdjudicationSourceType(v: unknown): v is AdjudicationSourceType {
  return typeof v === "string" && (Object.values(AdjudicationSourceType) as string[]).includes(v);
}

interface OutcomeEffect {
  status: AdjudicationStatus;
  ownerActionRequired: boolean;
  /** Whether the finding keeps driving live risk (kept visible / not suppressed from surfacing). */
  keepsRisk: boolean;
  /** Whether this outcome maintains/creates a reassessment trigger. */
  triggersReassessment: boolean;
  recommendedNextAction: string;
}

const EFFECTS: Record<AdjudicationOutcome, OutcomeEffect> = {
  [AdjudicationOutcome.REQUIRE_FRESH_PROOF]: {
    status: "ACTIVE", ownerActionRequired: true, keepsRisk: true, triggersReassessment: true,
    recommendedNextAction: "Require a fresh, job-specific proof for the affected job(s) before relying on those completions.",
  },
  [AdjudicationOutcome.ACCEPT_AS_VALID]: {
    status: "CLEARED", ownerActionRequired: false, keepsRisk: false, triggersReassessment: false,
    recommendedNextAction: "No further action — the flagged proof was judged valid; the evidence and audit trail are retained.",
  },
  [AdjudicationOutcome.DISMISS_FALSE_POSITIVE]: {
    status: "CLEARED", ownerActionRequired: false, keepsRisk: false, triggersReassessment: false,
    recommendedNextAction: "No further action — the flag was a false positive; source events are retained for the record.",
  },
  [AdjudicationOutcome.CONFIRM_SUSPICIOUS_PATTERN]: {
    status: "CONFIRMED", ownerActionRequired: true, keepsRisk: true, triggersReassessment: true,
    recommendedNextAction: "Keep the risk active: require independent verification of this operator's work before further delegation. This is a review decision, not an accusation.",
  },
  [AdjudicationOutcome.ESCALATE_FOR_TRAINING]: {
    status: "TRAINING", ownerActionRequired: false, keepsRisk: false, triggersReassessment: false,
    recommendedNextAction: "Coach the operator on the correct proof standard; treat as a training/process issue, not punishment.",
  },
  [AdjudicationOutcome.ESCALATE_FOR_OWNER_REVIEW]: {
    status: "OWNER_REVIEW", ownerActionRequired: true, keepsRisk: true, triggersReassessment: false,
    recommendedNextAction: "Owner to review the finding directly before any decision on the affected work.",
  },
  [AdjudicationOutcome.MARK_INCONCLUSIVE_NEEDS_DATA]: {
    status: "INCONCLUSIVE", ownerActionRequired: false, keepsRisk: true, triggersReassessment: false,
    recommendedNextAction: "Keep the finding open at a conservative status and gather the missing data before deciding.",
  },
};

export interface AdjudicationRequest {
  workspaceId: unknown;
  sourceType: unknown;
  sourceRef: unknown;
  outcome: unknown;
  reason: unknown;
  proofIds?: unknown;
  actorIds?: unknown;
  adjudicatedByUserId?: string | null;
  adjudicatedByRole?: string | null;
  /** Optional explicit idempotency key; defaults to `${sourceType}:${sourceRef}`. */
  idempotencyKey?: unknown;
}

export interface AdjudicationPlan {
  workspaceId: string;
  sourceType: AdjudicationSourceType;
  sourceRef: string;
  idempotencyKey: string;
  outcome: AdjudicationOutcome;
  reason: string;
  proofIds: string[];
  actorIds: string[];
  status: AdjudicationStatus;
  ownerActionRequired: boolean;
  keepsRisk: boolean;
  triggersReassessment: boolean;
  recommendedNextAction: string;
}

export type AdjudicationValidation = { ok: true; plan: AdjudicationPlan } | { ok: false; reason: string };

const MIN_REASON = 3;
const FRAUD_LABEL = /\b(fraud|fraudster|theft|thief|stealing|stole)\b/i;

function toIdArray(v: unknown): string[] {
  if (!Array.isArray(v)) return [];
  return [...new Set(v.filter((x): x is string => typeof x === "string" && x.trim().length > 0).map((x) => x.trim()))];
}

/** Validate an adjudication request. Fail-closed on a missing/invalid outcome, source, or reason. */
export function planAdjudication(req: AdjudicationRequest): AdjudicationValidation {
  const workspaceId = typeof req.workspaceId === "string" ? req.workspaceId.trim() : "";
  if (!workspaceId) return { ok: false, reason: "workspaceId is required." };

  if (!isAdjudicationSourceType(req.sourceType)) {
    return { ok: false, reason: "sourceType must be REUSED_HASH_FINDING, ANTI_GAMING_SIGNAL, CREDIBILITY_CONCERN, or PROOF_DISPUTE." };
  }
  const sourceRef = typeof req.sourceRef === "string" ? req.sourceRef.trim() : "";
  if (!sourceRef) return { ok: false, reason: "sourceRef (the deterministic source key) is required." };

  if (!isAdjudicationOutcome(req.outcome)) {
    return { ok: false, reason: "A valid adjudication outcome is required." };
  }
  const reason = typeof req.reason === "string" ? req.reason.trim() : "";
  if (reason.length < MIN_REASON) return { ok: false, reason: "A reason/note is required for every adjudication." };
  // Guard the owner against recording an unsupported accusation in the reason text.
  if (FRAUD_LABEL.test(reason)) {
    return { ok: false, reason: "The reason must not assert fraud/theft — record the factual finding and decision; adjudication is not a legal verdict." };
  }

  const effect = EFFECTS[req.outcome];
  const idempotencyKey = (typeof req.idempotencyKey === "string" && req.idempotencyKey.trim())
    ? req.idempotencyKey.trim()
    : `${req.sourceType}:${sourceRef}`;

  return {
    ok: true,
    plan: {
      workspaceId, sourceType: req.sourceType, sourceRef, idempotencyKey, outcome: req.outcome, reason,
      proofIds: toIdArray(req.proofIds), actorIds: toIdArray(req.actorIds),
      status: effect.status, ownerActionRequired: effect.ownerActionRequired, keepsRisk: effect.keepsRisk,
      triggersReassessment: effect.triggersReassessment, recommendedNextAction: effect.recommendedNextAction,
    },
  };
}

/** Outcomes that CLEAR a finding from surfacing (reduce owner noise) — evidence/audit are retained. */
export const CLEARING_OUTCOMES: ReadonlySet<string> = new Set<string>([
  AdjudicationOutcome.ACCEPT_AS_VALID, AdjudicationOutcome.DISMISS_FALSE_POSITIVE, AdjudicationOutcome.ESCALATE_FOR_TRAINING,
]);

/** Whether an adjudication status suppresses the linked finding from re-surfacing (unless new evidence). */
export function clearsFinding(outcome: string): boolean {
  return CLEARING_OUTCOMES.has(outcome);
}

/**
 * Governed Proof Dispute (depth pass) — PURE domain rules.
 *
 * A dispute reverses a previously-ACCEPTED proof when later business reality contradicts it. This
 * module owns the deterministic, DB-free rules: the dispute categories, the mapping from a category
 * to the reassessment trigger it should raise, request validation (a reason and category are
 * REQUIRED — fail closed), the governed target status (DISPUTED, or OWNER-only
 * OVERRIDDEN_NOT_VERIFIED), and the shape of the persisted dispute record.
 *
 * It does NOT invent complaint/rework records: the category is captured as governed dispute
 * metadata on the dispute event, never as a fake separate CustomerComplaint/Rework row.
 */

import { ProofStatus } from "@/domain/execution/proof";
import { TaskActorRole } from "@/domain/execution/delegated-task";
import type { ReassessmentTrigger } from "@/services/owner-mode/reassessment-event.service";

export enum ProofDisputeCategory {
  CUSTOMER_COMPLAINT = "CUSTOMER_COMPLAINT",
  REWORK_REQUIRED = "REWORK_REQUIRED",
  BAD_OUTCOME = "BAD_OUTCOME",
  QUALITY_FAILURE = "QUALITY_FAILURE",
  WRONG_OR_INSUFFICIENT_PROOF = "WRONG_OR_INSUFFICIENT_PROOF",
  SUSPECTED_FAKE_OR_REUSED_PROOF = "SUSPECTED_FAKE_OR_REUSED_PROOF",
  MANAGER_REVIEW_ERROR = "MANAGER_REVIEW_ERROR",
  OTHER = "OTHER",
}

export type DisputeSource = "owner" | "manager" | "system";

/** Every dispute category maps to the reassessment trigger it should raise. */
const CATEGORY_TRIGGER: Record<ProofDisputeCategory, ReassessmentTrigger> = {
  [ProofDisputeCategory.CUSTOMER_COMPLAINT]: "disputed_outcome",
  [ProofDisputeCategory.REWORK_REQUIRED]: "failed_outcome",
  [ProofDisputeCategory.BAD_OUTCOME]: "failed_outcome",
  [ProofDisputeCategory.QUALITY_FAILURE]: "failed_outcome",
  [ProofDisputeCategory.WRONG_OR_INSUFFICIENT_PROOF]: "evidence_retraction",
  [ProofDisputeCategory.SUSPECTED_FAKE_OR_REUSED_PROOF]: "evidence_retraction",
  [ProofDisputeCategory.MANAGER_REVIEW_ERROR]: "evidence_retraction",
  [ProofDisputeCategory.OTHER]: "new_contradicting_evidence",
};

/** High-impact categories always require an owner-visible human-reviewed reassessment. */
const HIGH_IMPACT = new Set<ProofDisputeCategory>([
  ProofDisputeCategory.BAD_OUTCOME,
  ProofDisputeCategory.SUSPECTED_FAKE_OR_REUSED_PROOF,
  ProofDisputeCategory.CUSTOMER_COMPLAINT,
]);

export function isDisputeCategory(v: unknown): v is ProofDisputeCategory {
  return typeof v === "string" && (Object.values(ProofDisputeCategory) as string[]).includes(v);
}

export interface DisputeRequest {
  category: unknown;
  reason: unknown;
  /** Owner-only escalation: reverse to OVERRIDDEN_NOT_VERIFIED instead of DISPUTED. */
  override?: boolean;
  actorRole: TaskActorRole;
}

export interface DisputePlan {
  category: ProofDisputeCategory;
  reason: string;
  targetStatus: ProofStatus.DISPUTED | ProofStatus.OVERRIDDEN_NOT_VERIFIED;
  trigger: ReassessmentTrigger;
  requiresHumanReview: boolean;
  source: DisputeSource;
}

export type DisputeValidation =
  | { ok: true; plan: DisputePlan }
  | { ok: false; reason: string };

const MIN_REASON_LEN = 3;

/**
 * Validate a dispute request into a governed plan. Fails closed on a missing/blank reason, an
 * unknown category, or an owner-only override attempted by a non-owner.
 */
export function planProofDispute(req: DisputeRequest): DisputeValidation {
  if (!isDisputeCategory(req.category)) {
    return { ok: false, reason: "A valid dispute category is required." };
  }
  if (typeof req.reason !== "string" || req.reason.trim().length < MIN_REASON_LEN) {
    return { ok: false, reason: "A dispute reason is required." };
  }
  const override = req.override === true;
  if (override && req.actorRole !== TaskActorRole.OWNER) {
    return { ok: false, reason: "Only the owner may override accepted proof (OVERRIDDEN_NOT_VERIFIED)." };
  }
  const category = req.category;
  const source: DisputeSource =
    req.actorRole === TaskActorRole.OWNER ? "owner" : req.actorRole === TaskActorRole.SYSTEM ? "system" : "manager";
  return {
    ok: true,
    plan: {
      category,
      reason: req.reason.trim(),
      targetStatus: override ? ProofStatus.OVERRIDDEN_NOT_VERIFIED : ProofStatus.DISPUTED,
      trigger: CATEGORY_TRIGGER[category],
      requiresHumanReview: HIGH_IMPACT.has(category) || override,
      source,
    },
  };
}

/** The persisted dispute record (audit payload) — the full governed shape. */
export interface DisputeRecord {
  workspaceId: string;
  proofId: string;
  previousProofStatus: string;
  nextProofStatus: string;
  disputedByActorId: string;
  disputedByRole: string;
  disputeCategory: ProofDisputeCategory;
  reason: string;
  source: DisputeSource;
  relatedActionId: string | null;
  relatedOutcomeId: string | null;
  /** No per-event complaint/rework model exists yet — recorded as missing-source, not faked. */
  relatedComplaintId: string | null;
  relatedReworkId: string | null;
  reassessmentEventId: string | null;
  createdAt: string;
}

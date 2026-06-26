/**
 * R12 / R13 — Checklist-proof binding + proof status/strength/authenticity (§20–§25). Pure.
 *
 * Critical checklist items must map to proof (a tick alone is weak evidence). Proof
 * authenticity is screened (§24) and weak proof is NEVER upgraded to strong. AI alone
 * cannot certify high-risk proof as high-confidence (enforced by the verification chain).
 */

import type { ProofStatus, ProofStrength, ProofType, ProofBurden } from "@/domain/remote-operations/remote-types";

/** §20 critical-checklist → required proof binding. */
export const CRITICAL_CHECKLIST_PROOF: Record<string, ProofType> = {
  "bathroom cleaned": "AFTER_PHOTO",
  "kitchen cleaned": "AFTER_PHOTO",
  "floors cleaned": "AFTER_PHOTO",
  "linens changed": "AFTER_PHOTO",
  "consumables restocked": "INVENTORY_USED",
  "damage checked": "DAMAGE_REPORT",
  "key returned": "KEY_RETURN_PROOF",
  "maintenance completed": "MAINTENANCE_PHOTO",
};

export interface ChecklistItem {
  label: string;
  critical: boolean;
  done: boolean;
  /** Proof types attached to this item. */
  attachedProof: ProofType[];
}

/** Returns critical items whose required proof is missing (empty = bound correctly). */
export function validateChecklistProofBinding(items: readonly ChecklistItem[]): string[] {
  const missing: string[] = [];
  for (const it of items) {
    if (!it.critical) continue;
    const required = CRITICAL_CHECKLIST_PROOF[it.label.toLowerCase()];
    if (!required) continue;
    if (it.done && !it.attachedProof.includes(required)) missing.push(`${it.label}:requires:${required}`);
  }
  return missing;
}

/** §24 authenticity signals (true = OK / present unless the name implies a problem). */
export interface ProofAuthenticitySignals {
  requiredProofPresent: boolean;
  hasRequiredView: boolean;
  beforeAfterPaired: boolean;
  authorizedSubmitter: boolean;
  withinWindow: boolean;
  imageQualityOk: boolean;
  relatedToChecklistItem: boolean;
  metadataPresent: boolean;
  // problem flags (true = problem)
  duplicateSuspected: boolean;
  samePhotoBeforeAndAfter: boolean;
  noVisibleChangeWhereExpected: boolean;
  timestampSuspicious: boolean;
  locationMismatch: boolean;
  contradictedByComplaint: boolean;
  resolutionBelowMinimum: boolean;
  multiSource: boolean;
}

export interface ProofAssessment {
  status: ProofStatus;
  strength: ProofStrength;
  blocksVerification: boolean;
  requiresHumanReview: boolean;
}

/** Assess proof. Worst issue wins; weak proof is never reported as strong. */
export function assessProof(s: ProofAuthenticitySignals, burden: ProofBurden): ProofAssessment {
  const block = (status: ProofStatus, strength: ProofStrength, human = true): ProofAssessment =>
    ({ status, strength, blocksVerification: true, requiresHumanReview: human });

  if (!s.requiredProofPresent) return block("MISSING", "NO_PROOF");
  if (!s.authorizedSubmitter) return block("REJECTED", "DISPUTED_PROOF");
  if (s.duplicateSuspected) return block("DUPLICATE_SUSPECTED", "DISPUTED_PROOF");
  if (s.samePhotoBeforeAndAfter || s.noVisibleChangeWhereExpected) return block("CONTRADICTORY", "CONTRADICTORY_PROOF");
  if (s.contradictedByComplaint) return block("CONTRADICTED_BY_COMPLAINT", "DISPUTED_PROOF");
  if (s.timestampSuspicious) return block("TIMESTAMP_SUSPICIOUS", "WEAK_PROOF");
  if (s.locationMismatch) return block("LOCATION_MISMATCH", "WEAK_PROOF");
  if (!s.hasRequiredView) return block("MISSING_REQUIRED_VIEW", "WEAK_PROOF");
  if (s.resolutionBelowMinimum || !s.imageQualityOk) return block("QUALITY_WEAK", "WEAK_PROOF");
  if (!s.metadataPresent) return { status: "METADATA_MISSING", strength: "WEAK_PROOF", blocksVerification: burden === "CRITICAL", requiresHumanReview: burden === "HIGH" || burden === "CRITICAL" };
  if (!s.withinWindow) return { status: "STALE", strength: "WEAK_PROOF", blocksVerification: false, requiresHumanReview: true };
  if (!s.relatedToChecklistItem) return block("INSUFFICIENT", "WEAK_PROOF");

  // Clean proof. HIGH/CRITICAL burden still needs human verification; AI/auto cannot certify alone.
  if (s.multiSource) return { status: "ACCEPTED_HIGH_CONFIDENCE", strength: "MULTI_SOURCE_PROOF", blocksVerification: false, requiresHumanReview: burden === "CRITICAL" };
  return { status: "ACCEPTED", strength: "STANDARD_PROOF", blocksVerification: false, requiresHumanReview: burden === "HIGH" || burden === "CRITICAL" };
}

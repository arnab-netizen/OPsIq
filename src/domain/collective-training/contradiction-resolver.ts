/**
 * C6 — Contradiction resolver (pure).
 *
 * Detects contradictions across owner claim vs evidence, staff claim vs evidence,
 * revenue vs cash/profit, marketing vs margin/complaints, completion claim vs proof,
 * quality claim vs complaints/rework, supplier cost saving vs quality harm, and growth
 * desire vs capacity/staff/owner limits. Each contradiction carries its governance
 * effect (downgrade confidence, block closure, prevent success classification).
 */

import type { Contradiction } from "@/domain/collective-training/collective-types";

export interface ContradictionInput {
  ownerClaim?: { text: string; contradictedByEvidence: boolean };
  staffCompletionClaim?: { text: string; proofPresent: boolean };
  revenueUp?: boolean;
  profitDown?: boolean;
  cashDown?: boolean;
  marketingClaimedSuccess?: boolean;
  complaintsUp?: boolean;
  marginDown?: boolean;
  qualityClaimedGood?: boolean;
  complaintsOrReworkUp?: boolean;
  supplierCostSaved?: boolean;
  supplierQualityHarm?: boolean;
  growthDesired?: boolean;
  capacityOrStaffOrOwnerRed?: boolean;
}

export interface ContradictionResult {
  contradictions: Contradiction[];
  /** True if any contradiction requires downgrading confidence. */
  downgradeConfidence: boolean;
  /** True if a claimed completion cannot be closed (no proof). */
  blockClosure: boolean;
  /** True if a claimed success must NOT be classified as success. */
  preventSuccess: boolean;
}

export function detectContradictions(i: ContradictionInput): ContradictionResult {
  const contradictions: Contradiction[] = [];
  let downgradeConfidence = false;
  let blockClosure = false;
  let preventSuccess = false;

  if (i.ownerClaim?.contradictedByEvidence) {
    contradictions.push({ kind: "owner_claim_vs_evidence", description: `Owner claim contradicted by evidence: ${i.ownerClaim.text}`, effect: "downgrade confidence; require reconciliation" });
    downgradeConfidence = true;
  }
  if (i.staffCompletionClaim && !i.staffCompletionClaim.proofPresent) {
    contradictions.push({ kind: "staff_claim_vs_evidence", description: `Staff completion claimed without proof: ${i.staffCompletionClaim.text}`, effect: "block closure until evidence-backed" });
    blockClosure = true;
  }
  if (i.revenueUp && (i.profitDown || i.cashDown)) {
    contradictions.push({ kind: "metric_vs_metric", description: "Revenue up but profit/cash down", effect: "reject revenue vanity; do not classify as success" });
    preventSuccess = true;
  }
  if (i.marketingClaimedSuccess && (i.complaintsUp || i.marginDown)) {
    contradictions.push({ kind: "metric_vs_metric", description: "Marketing 'success' contradicted by rising complaints/falling margin", effect: "do not classify campaign as success" });
    preventSuccess = true;
  }
  if (i.qualityClaimedGood && i.complaintsOrReworkUp) {
    contradictions.push({ kind: "domain_vs_domain", description: "Quality claimed good but complaints/rework rising", effect: "downgrade confidence; investigate root cause" });
    downgradeConfidence = true;
  }
  if (i.supplierCostSaved && i.supplierQualityHarm) {
    contradictions.push({ kind: "domain_vs_domain", description: "Supplier cost saving harmed quality", effect: "reject margin-only success; rollback or quarantine" });
    preventSuccess = true;
  }
  if (i.growthDesired && i.capacityOrStaffOrOwnerRed) {
    contradictions.push({ kind: "domain_vs_domain", description: "Growth desired but capacity/staff/owner is red", effect: "block growth until constraint clears" });
  }
  return { contradictions, downgradeConfidence, blockClosure, preventSuccess };
}

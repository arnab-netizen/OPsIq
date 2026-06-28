/**
 * Jarvis 360 Slice 9 — owner control-center composer (pure).
 *
 * Merges the new Slice 0–8 controls into ONE owner-facing decision panel: what is
 * blocked, what needs the owner today, what OpsIQ handled, what NOT to do, and the
 * attention budget. Reuses the Slice 4 attention summary (no new scoring). No I-O.
 */

import type { AttentionSummary } from "@/domain/owner-mode/owner-load";

export interface ControlCenterInputs {
  dataSufficiencyStatus: "sufficient" | "caution" | "insufficient";
  lowConfidenceDomains: string[];
  attention: AttentionSummary;
  blockedRecommendations: number;
  proofBlocked: number;
  financeBlocked: number;
  sopsNeedingReview: number;
  trainingRecommendations: number;
  equipmentBottlenecks: string[];
  processReviewsDue: number;
  ownerApprovalsRequired: number;
  /** Failed self-evaluations whose reassessment is now due (EH-21). */
  reassessmentsDue: number;
  nextBestAction?: string | null;
}

export interface OwnerControlCenter {
  attention: AttentionSummary;
  criticalAlerts: string[];
  whatNotToDo: string[];
  ownerActionsToday: number;
  handledByOpsIQ: number;
  needsOwnerAttention: boolean;
  nextBestAction: string | null;
  sections: {
    blockedRecommendations: number;
    proofBlocked: number;
    financeBlocked: number;
    sopsNeedingReview: number;
    trainingRecommendations: number;
    equipmentBottlenecks: number;
    processReviewsDue: number;
    reassessmentsDue: number;
  };
}

/** Compose the owner control center from the aggregated control signals. */
export function buildOwnerControlCenter(i: ControlCenterInputs): OwnerControlCenter {
  const criticalAlerts: string[] = [];
  const whatNotToDo: string[] = [];

  if (i.dataSufficiencyStatus === "insufficient") {
    criticalAlerts.push(`Data is insufficient for confident decisions (${i.lowConfidenceDomains.join(", ") || "missing critical inputs"}).`);
    whatNotToDo.push("Do not make material decisions until the missing/stale data is provided.");
  }
  if (i.financeBlocked > 0) {
    criticalAlerts.push(`${i.financeBlocked} finance/margin/cash-unsafe recommendation(s) were blocked.`);
    whatNotToDo.push("Do not spend or discount while cash/margin guardrails are blocking.");
  }
  if (i.equipmentBottlenecks.length > 0) {
    criticalAlerts.push(`Capacity bottleneck: ${i.equipmentBottlenecks.join(", ")}.`);
    whatNotToDo.push("Do not pursue growth/marketing until the capacity bottleneck is cleared.");
  }
  if (i.proofBlocked > 0) {
    criticalAlerts.push(`${i.proofBlocked} task(s) cannot complete: required proof is not cleared.`);
  }
  if (i.attention.criticalUnresolved > 0) {
    criticalAlerts.push(`${i.attention.criticalUnresolved} critical item(s) unresolved.`);
  }
  if (i.reassessmentsDue > 0) {
    criticalAlerts.push(`${i.reassessmentsDue} failed outcome(s) are due for reassessment.`);
    whatNotToDo.push("Do not re-run a failed approach until its reassessment is complete.");
  }

  const ownerActionsToday = i.ownerApprovalsRequired + i.attention.ownerDecisionsRequired + i.sopsNeedingReview + i.processReviewsDue + i.reassessmentsDue;
  const needsOwnerAttention = ownerActionsToday > 0 || criticalAlerts.length > 0;

  return {
    attention: i.attention,
    criticalAlerts,
    whatNotToDo,
    ownerActionsToday,
    handledByOpsIQ: i.attention.handledByOpsIQ,
    needsOwnerAttention,
    nextBestAction: i.nextBestAction ?? null,
    sections: {
      blockedRecommendations: i.blockedRecommendations,
      proofBlocked: i.proofBlocked,
      financeBlocked: i.financeBlocked,
      sopsNeedingReview: i.sopsNeedingReview,
      trainingRecommendations: i.trainingRecommendations,
      equipmentBottlenecks: i.equipmentBottlenecks.length,
      processReviewsDue: i.processReviewsDue,
      reassessmentsDue: i.reassessmentsDue,
    },
  };
}

/**
 * Jarvis 360 Slice 9 — owner control-center composer (pure).
 *
 * Merges the new Slice 0–8 controls into ONE owner-facing decision panel: what is
 * blocked, what needs the owner today, what OpsIQ handled, what NOT to do, and the
 * attention budget. Reuses the Slice 4 attention summary (no new scoring). No I-O.
 */

import type { AttentionSummary } from "@/domain/owner-mode/owner-load";
import type { OwnerDecisionTarget } from "@/domain/owner-spine/owner-decision";
import { ownerMaterialCommitmentGuard, sufficiencyOnlyAdvicePolicy, type OwnerAdvicePolicy } from "@/domain/owner-spine/owner-advice-policy";
import { ownerImperativeContext, partitionReconciled, quoteTitles, reconcileOwnerProhibition, type ReconciledProhibition } from "@/domain/owner-spine/owner-imperatives";

/** A canonical decision target, as far as the panel's guardrails need it. */
export type ControlCenterMainTarget = Pick<OwnerDecisionTarget, "title" | "priorityClass" | "source" | "findingCode">;

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
  /** Approvals OpsIQ auto-handled in the window (EH-16 workload reduction). */
  approvalsAvoided: number;
  nextBestAction?: string | null;
  /**
   * The ONE canonical owner decision's main target. The panel never vetoes it: every guardrail that
   * would forbid it becomes a condition on HOW to execute it (same pattern as Now View's
   * reconcileAvoidsWithOwnerDecision). Guardrails unrelated to the target are unchanged.
   */
  mainTarget?: ControlCenterMainTarget | null;
  /** The canonical decision's supporting steps (never vetoed either). */
  supportingSteps?: ControlCenterMainTarget[];
  /**
   * The canonical decision's advice policy (owner-advice-policy.ts). The panel reads it so it never states a different
   * "act / do not act" semantics from the decision beside it; it never overrides it.
   */
  advicePolicy?: OwnerAdvicePolicy | null;
}

export interface OwnerControlCenter {
  /** The canonical decision's advice policy, passed through unchanged (null when no decision was supplied). */
  advicePolicy: OwnerAdvicePolicy | null;
  attention: AttentionSummary;
  criticalAlerts: string[];
  whatNotToDo: string[];
  /** Guardrails reconciled into the permitted scope of canonical steps (how to carry them out). */
  conditions: string[];
  ownerActionsToday: number;
  handledByOpsIQ: number;
  /** Approvals OpsIQ auto-handled (workload reduction, EH-16). */
  approvalsAvoided: number;
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
  const guardrails: ReconciledProhibition[] = [];

  // Every guardrail passes through the ONE shared reconciler (owner-imperatives.ts): it never vetoes the
  // canonical main target or a supporting step; a refresh (data-request) target rewrites nothing.
  const ctx = ownerImperativeContext(i.mainTarget ? { primaryTarget: i.mainTarget, supportingSteps: i.supportingSteps ?? [] } : null);
  // Data sufficiency is an INFORMATIONAL data-quality signal here. The owner-wide statement about committing money, capacity or
  // a plan comes ONLY from the canonical advice policy (the decision's own, or — when no decision exists for the selected
  // business — a sufficiency-only policy resolved by the same module). This panel keeps no separate permission rule.
  if (i.dataSufficiencyStatus === "insufficient") {
    // A recorded fact (compliance breach, recorded risk, recorded safety block) is not made uncertain by data gaps elsewhere.
    const recordedFactNote = i.advicePolicy?.mode === "RECORDED_FACT" ? " The recorded issue below is a fact and is unaffected." : "";
    criticalAlerts.push(`Data is insufficient for confident decisions (${i.lowConfidenceDomains.join(", ") || "missing critical inputs"}).${recordedFactNote}`);
  }
  const policy = i.advicePolicy ?? sufficiencyOnlyAdvicePolicy(i.dataSufficiencyStatus);
  const commitmentGuard = policy ? ownerMaterialCommitmentGuard(policy) : null;
  if (commitmentGuard) {
    // The canonical arbiter already accounted for missing data (confidence caps, data-request targets); the guardrail applies
    // to OTHER material decisions, never to an action main target.
    guardrails.push(
      reconcileOwnerProhibition(
        {
          text: commitmentGuard.prohibition,
          vetoes: "ANY_ACTION",
          asCondition: (t) => `Go ahead with ${quoteTitles(t)}; ${commitmentGuard.condition}`,
        },
        ctx
      )
    );
  } else if (i.advicePolicy?.mode === "RECORDED_FACT" && i.dataSufficiencyStatus === "insufficient" && i.mainTarget) {
    // A recorded fact is actionable as a fact; only analysis that depends on the missing data waits — disclosed, never a "do not act" on the fact.
    guardrails.push({
      kind: "condition",
      text: `Go ahead with ${quoteTitles([i.mainTarget.title])}; hold other material decisions that depend on the missing data until it is supplied.`,
      conditionOn: [],
    });
  }
  if (i.financeBlocked > 0) {
    criticalAlerts.push(`${i.financeBlocked} finance/margin/cash-unsafe recommendation(s) were blocked.`);
    guardrails.push(
      reconcileOwnerProhibition(
        {
          text: "Do not add discretionary spend or discounts while cash/margin guardrails are blocking.",
          vetoes: "GROW",
          asCondition: (t) => `Run ${quoteTitles(t)} only within its existing budget and at normal prices while cash/margin guardrails are blocking.`,
        },
        ctx
      )
    );
  }
  if (i.equipmentBottlenecks.length > 0) {
    criticalAlerts.push(`Capacity bottleneck: ${i.equipmentBottlenecks.join(", ")}.`);
    guardrails.push(
      reconcileOwnerProhibition(
        {
          text: "Do not scale demand (new acquisition spend, campaign expansion or extra volume) until the capacity bottleneck is cleared.",
          vetoes: "GROW",
          asCondition: (t) => `Run ${quoteTitles(t)} only up to what current capacity can deliver until the bottleneck is cleared.`,
        },
        ctx
      )
    );
  }
  if (i.proofBlocked > 0) {
    criticalAlerts.push(`${i.proofBlocked} task(s) cannot complete: required proof is not cleared.`);
  }
  if (i.attention.criticalUnresolved > 0) {
    criticalAlerts.push(`${i.attention.criticalUnresolved} critical item(s) unresolved.`);
  }
  if (i.reassessmentsDue > 0) {
    criticalAlerts.push(`${i.reassessmentsDue} failed outcome(s) are due for reassessment.`);
    guardrails.push({ kind: "prohibition", text: "Do not re-run a failed approach until its reassessment is complete.", conditionOn: [] });
  }

  const { prohibitions: whatNotToDo, conditions } = partitionReconciled(guardrails);
  const ownerActionsToday = i.ownerApprovalsRequired + i.attention.ownerDecisionsRequired + i.sopsNeedingReview + i.processReviewsDue + i.reassessmentsDue;
  const needsOwnerAttention = ownerActionsToday > 0 || criticalAlerts.length > 0;

  return {
    advicePolicy: i.advicePolicy ?? null,
    attention: i.attention,
    criticalAlerts,
    whatNotToDo,
    conditions,
    ownerActionsToday,
    handledByOpsIQ: i.attention.handledByOpsIQ,
    approvalsAvoided: i.approvalsAvoided,
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

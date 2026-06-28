/**
 * Jarvis 360 gap-closure (G15) — decision arbitration invoked by recommendation generation.
 *
 * Strict re-audit finding: `arbitrate` was only reachable via /api/owner/arbitrate; no
 * decision flow called it. This maps the prioritized interventions OpsIQ is about to turn
 * into recommendations onto arbitration candidates, arbitrates them, and returns the chosen
 * action + rejected alternatives + reasons + what-NOT-to-do + reconsideration conditions.
 * Audited so the arbitration is observable. Reuses the pure `arbitrate` (no duplicate logic).
 */

import { emitAuditEvent } from "@/infra/audit";
import { AUDIT_EVENTS } from "@/domain/constants/audit-events";
import {
  arbitrate,
  type ArbitrationCandidate,
  type ArbitrationResult,
} from "@/domain/owner-mode/decision-arbitration";
import type { PrioritizedIntervention } from "@/domain/consulting-engine/types";

const COST_ACTION_RISK: Record<string, number> = { MINIMAL: 0.1, LOW: 0.3, MEDIUM: 0.5, HIGH: 0.8 };
const CLASS_INACTION_RISK: Record<string, number> = {
  CONTAINMENT: 0.9,
  STABILIZATION: 0.7,
  RESILIENCE_PROTECTION: 0.5,
  STRUCTURAL_REPAIR: 0.4,
  GROWTH_ENABLEMENT: 0.3,
};
const HIGH_IMPACT = new Set(["SIGNIFICANT", "TRANSFORMATIVE"]);

function clamp01(n: number): number {
  return Math.max(0, Math.min(1, n));
}

/** Map a prioritized intervention to an arbitration candidate (pure, deterministic). */
export function interventionToCandidate(p: PrioritizedIntervention): ArbitrationCandidate {
  const iv = p.intervention;
  const actionRisk = COST_ACTION_RISK[iv.estimatedCostBand] ?? 0.5;
  const classRisk = CLASS_INACTION_RISK[iv.class] ?? 0.5;
  // Inaction risk blends the class baseline with the prioritization urgency.
  const inactionRisk = clamp01(classRisk * 0.6 + (p.priorityScore / 100) * 0.4);
  return {
    id: iv.id,
    blockedBy: [], // hard gate state is enforced separately at promotion; arbitration ranks the viable set
    riskOfAction: actionRisk,
    riskOfInaction: inactionRisk,
    confidence: clamp01(p.priorityScore / 100),
    ownerGoalAligned: HIGH_IMPACT.has(iv.expectedImpactOnRevenue),
    reversible: iv.estimatedCostBand !== "HIGH" && iv.class !== "STRUCTURAL_REPAIR",
  };
}

export interface ArbitrationSummary {
  result: ArbitrationResult;
  recommendedInterventionId: string | null;
  /** Owner-facing "do not do this now" list with reconsideration conditions. */
  whatNotToDo: string[];
}

export interface ArbitrationDeps {
  emitAudit?: typeof emitAuditEvent;
}

/**
 * Arbitrate the interventions OpsIQ is about to recommend. Returns the chosen option,
 * the rejected/blocked/deferred alternatives, and a what-NOT-to-do list. Audited.
 */
export async function arbitrateInterventions(
  workspaceId: string,
  interventions: PrioritizedIntervention[],
  injected?: ArbitrationDeps
): Promise<ArbitrationSummary> {
  const emit = injected?.emitAudit ?? emitAuditEvent;
  const titleById = new Map(interventions.map((p) => [p.intervention.id, p.intervention.title]));
  const candidates = interventions.map(interventionToCandidate);
  const result = arbitrate(candidates);

  const whatNotToDo = result.decisions
    .filter((d) => d.verdict !== "recommended")
    .map((d) => {
      const title = titleById.get(d.id) ?? d.id;
      const when = d.reconsiderWhen ? ` — reconsider ${d.reconsiderWhen}` : "";
      return `Do not pursue "${title}" now: ${d.reasons[0] ?? d.verdict}${when}`;
    });

  await emit({
    workspaceId,
    eventName: AUDIT_EVENTS.OWNER_ARBITRATION_RESOLVED,
    actorType: "system",
    entityType: "owner_arbitration",
    entityId: result.recommended?.id ?? "none",
    payload: {
      candidateCount: candidates.length,
      recommendedId: result.recommended?.id ?? null,
      rejected: result.decisions.filter((d) => d.verdict === "rejected").length,
      blocked: result.decisions.filter((d) => d.verdict === "blocked").length,
      deferred: result.decisions.filter((d) => d.verdict === "deferred").length,
    },
  });

  return {
    result,
    recommendedInterventionId: result.recommended?.id ?? null,
    whatNotToDo,
  };
}

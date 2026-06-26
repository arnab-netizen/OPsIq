/**
 * C5 — Collective veto resolver (pure).
 *
 * Builds the F6 VetoContext from the aggregated domain signals and calls the existing
 * `evaluateVetoes` engine (it does NOT re-derive vetoes). The authoritative blocked-action
 * set comes from F6; per-domain ActiveVeto records (with unlock conditions) are projected
 * from the red domains via the registry. Owner preference is never an input — it cannot
 * bypass a veto.
 */

import type { AggregationResult } from "@/domain/collective-training/signal-aggregator";
import { isRed } from "@/domain/collective-training/signal-aggregator";
import type { ActiveVeto, CollectiveAction, DomainKey } from "@/domain/collective-training/collective-types";
import { domainMeta } from "@/domain/collective-training/domain-registry";
import { evaluateVetoes, type VetoContext, type VetoedAction } from "@/domain/domain-training/veto-matrix";

export interface VetoResolverExtras {
  contradictoryData?: boolean;
  unverifiedOutcome?: boolean;
  missingCriticalProof?: boolean;
}

function red(agg: AggregationResult, d: DomainKey): boolean {
  const s = agg.byDomain.get(d);
  return !!s && isRed(s.status, s.severity);
}

/** Project the aggregated signals onto the F6 VetoContext. */
export function buildVetoContext(agg: AggregationResult, extra: VetoResolverExtras = {}): VetoContext {
  const compliance = agg.byDomain.get("risk-compliance");
  const complianceUncertain = red(agg, "risk-compliance") || compliance?.confidence === "ESCALATE";
  const cashCritical = red(agg, "cash-survival");
  return {
    criticalCashSurvivalRisk: cashCritical,
    complianceOrSafetyUncertain: !!complianceUncertain,
    severeQualityFailure: red(agg, "quality"),
    capacityOverload: red(agg, "capacity") || red(agg, "supplier-inventory"),
    staffOverload: red(agg, "staff-workload"),
    ownerOverload: red(agg, "owner-workload"),
    negativeMargin: red(agg, "profit-improvement") || red(agg, "pricing-decisions"),
    missingProof: red(agg, "proof-required") || extra.missingCriticalProof === true,
    contradictoryData: extra.contradictoryData === true,
    unverifiedOutcome: red(agg, "verify-outcome") || extra.unverifiedOutcome === true,
    survivalCritical: cashCritical,
  };
}

/** F6 VetoedAction → collective CollectiveAction. */
const ACTION_MAP: Record<VetoedAction, CollectiveAction> = {
  growth: "growth", paid_marketing: "paid_marketing", expansion: "expansion",
  non_essential_hiring: "hiring", bulk_buying: "bulk_inventory_purchase",
  discounting_below_margin: "discounting_below_margin", low_price_b2b: "discounting_below_margin",
  revenue_chasing: "revenue_chasing", demand_generation: "demand_generation",
  new_non_critical_task: "non_critical_tasks", owner_heavy_action: "owner_heavy_action",
  scale: "scale", closure: "closure_without_proof", learning_admission: "learning_admission",
  high_confidence_recommendation: "confident_diagnosis", confident_diagnosis: "confident_diagnosis",
};

export interface VetoResolution {
  blockedActions: CollectiveAction[];
  activeVetoes: ActiveVeto[];
  context: VetoContext;
}

const UNLOCK: Partial<Record<DomainKey, string>> = {
  "cash-survival": "cash positive and runway restored (verified)",
  "risk-compliance": "verified expert sign-off obtained",
  quality: "defect/complaint rate back to green (verified)",
  capacity: "capacity headroom restored",
  "supplier-inventory": "supply secured / stock cover restored",
  "staff-workload": "staff workload back within limits",
  "owner-workload": "owner freed from the bottleneck",
  "sop-process": "SOP proven repeatable",
  "customer-complaints": "complaint recovery proven",
  "profit-improvement": "contribution margin restored to positive",
  "pricing-decisions": "margin protected by a contribution check",
  retention: "retention leak closed (verified)",
  "growth-readiness": "all growth readiness gates pass",
  "scale-readiness": "all scale readiness gates pass",
  "proof-required": "required proof collected",
  "verify-outcome": "outcome independently verified",
};

/** Resolve collective vetoes by wiring F6 and projecting per-domain ActiveVeto records. */
export function resolveVetoes(agg: AggregationResult, extra: VetoResolverExtras = {}): VetoResolution {
  const context = buildVetoContext(agg, extra);
  const f6 = evaluateVetoes(context);
  const blockedActions = [...new Set(f6.blocked.map((a) => ACTION_MAP[a]))];

  const activeVetoes: ActiveVeto[] = [];
  for (const d of agg.presentDomains) {
    if (!red(agg, d)) continue;
    const meta = domainMeta(d);
    if (meta.vetoesWhenRed.length === 0) continue;
    activeVetoes.push({
      domain: d,
      reason: `${d} is red (${meta.riskCategory})`,
      blockedActions: meta.vetoesWhenRed,
      unlockCondition: UNLOCK[d] ?? "condition cleared and verified",
    });
  }
  return { blockedActions, activeVetoes, context };
}

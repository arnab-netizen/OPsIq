/**
 * C3 — Business stage classifier (pure).
 *
 * Classifies the business lifecycle stage from the aggregated domain signals using a
 * strict precedence: survival → recovery/turnaround → process control → profit repair
 * → stabilization → scale readiness → growth readiness → mature optimization. Cash
 * survival outranks everything; strategic stages only when earlier levels are clear.
 */

import type { AggregationResult } from "@/domain/collective-training/signal-aggregator";
import { isRed } from "@/domain/collective-training/signal-aggregator";
import type { BusinessStage, DomainKey } from "@/domain/collective-training/collective-types";

function red(agg: AggregationResult, domain: DomainKey): boolean {
  const s = agg.byDomain.get(domain);
  return !!s && isRed(s.status, s.severity);
}

function green(agg: AggregationResult, domain: DomainKey): boolean {
  const s = agg.byDomain.get(domain);
  return !!s && s.status === "GREEN" && s.severity !== "HIGH" && s.severity !== "CRITICAL";
}

/** Count of red condition domains (excludes governance/structural domains). */
const CONDITION_DOMAINS: DomainKey[] = [
  "cash-survival", "profit-improvement", "pricing-decisions", "staff-workload", "owner-workload",
  "capacity", "quality", "sop-process", "customer-complaints", "retention", "marketing",
  "supplier-inventory", "risk-compliance",
];

export function countRedConditions(agg: AggregationResult): number {
  return CONDITION_DOMAINS.filter((d) => red(agg, d)).length;
}

export interface StageResult {
  stage: BusinessStage;
  reason: string;
}

export function classifyBusinessStage(agg: AggregationResult): StageResult {
  // 1. Cash survival risk outranks everything.
  if (red(agg, "cash-survival")) return { stage: "survival", reason: "critical cash survival risk" };

  // 2. Severe broad decline across multiple condition domains → recovery/turnaround.
  const redCount = countRedConditions(agg);
  if (redCount >= 3) return { stage: "recovery_turnaround", reason: `severe decline (${redCount} red condition domains)` };

  // 3. Quality / SOP instability → process control.
  if (red(agg, "quality") || red(agg, "sop-process")) {
    return { stage: "process_control", reason: "quality or SOP unstable" };
  }

  // 4. Margin/profit problem (e.g. revenue up, profit down) → profit repair.
  if (red(agg, "profit-improvement") || red(agg, "pricing-decisions")) {
    return { stage: "profit_repair", reason: "profit/margin leakage" };
  }

  // 5. Level-2 operating constraint red → stabilization.
  const level2 = (["capacity", "staff-workload", "owner-workload", "customer-complaints", "supplier-inventory"] as DomainKey[]);
  if (level2.some((d) => red(agg, d))) {
    return { stage: "stabilization", reason: "operating constraint red" };
  }

  // 6. Repeatable, owner-independent system ready → scale readiness.
  if (green(agg, "scale-readiness")) return { stage: "scale_readiness", reason: "scale gates pass (repeatable, owner-independent)" };

  // 7. Stable operations with growth signals → growth readiness.
  if (green(agg, "growth-readiness")) return { stage: "growth_readiness", reason: "growth gates pass" };

  // 8. Otherwise mature optimization.
  return { stage: "mature_optimization", reason: "all condition domains stable" };
}

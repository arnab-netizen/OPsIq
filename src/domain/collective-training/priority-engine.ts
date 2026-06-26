/**
 * C4 — Cross-domain priority engine (pure).
 *
 * Ranks the aggregated domain signals by the Section-7 hierarchy: Level 1 hard blockers
 * (compliance/safety, cash, severe quality, missing proof) outrank Level 2 operating
 * constraints, which outrank Level 3 economic optimization, which outrank Level 4
 * strategic movement. Red conditions float to the top; within a tier a fixed canonical
 * order breaks ties (compliance/safety first). Deterministic.
 */

import type { AggregationResult } from "@/domain/collective-training/signal-aggregator";
import { isRed, isAmber } from "@/domain/collective-training/signal-aggregator";
import type { DomainKey, RankedDomainSignal } from "@/domain/collective-training/collective-types";

/** Canonical priority order — index breaks ties and already respects the 4 levels. */
export const CANONICAL_PRIORITY: readonly DomainKey[] = [
  // Level 1 — hard blockers
  "risk-compliance", "cash-survival", "quality", "proof-required", "verify-outcome", "what-not-to-do",
  // Level 2 — operating constraints
  "capacity", "supplier-inventory", "sop-process", "customer-complaints", "staff-workload",
  "owner-workload", "stop-rollback-redesign", "who", "how", "daily-priorities", "what-to-do-next", "review-cadence",
  // Level 3 — economic optimization
  "profit-improvement", "pricing-decisions", "retention", "marketing",
  // Level 4 — strategic movement
  "growth-readiness", "scale-readiness",
];

function canonicalIndex(d: DomainKey): number {
  const i = CANONICAL_PRIORITY.indexOf(d);
  return i === -1 ? CANONICAL_PRIORITY.length : i;
}

/** Group: 0 = red/active, 1 = amber, 2 = green/unknown. Red always ranks above amber/green. */
function statusGroup(status: string, severity: string): number {
  if (isRed(status as never, severity)) return 0;
  if (isAmber(status as never, severity)) return 1;
  return 2;
}

export interface PriorityResult {
  ranked: RankedDomainSignal[];
  topPriority: RankedDomainSignal | null;
  /** The highest-priority RED domain (the binding constraint), if any. */
  bindingConstraint: RankedDomainSignal | null;
}

export function rankSignals(agg: AggregationResult): PriorityResult {
  const ranked = agg.signals
    .map((s) => ({
      domain: s.domain,
      domainId: s.domainId,
      status: s.status,
      severity: s.severity,
      confidence: s.confidence,
      priorityLevel: s.priorityLevel,
      rank: 0,
      evidenceUsed: s.evidenceUsed,
      missingData: s.missingData,
      sideEffectRisks: s.sideEffectMetrics,
      _group: statusGroup(s.status, s.severity),
      _ci: canonicalIndex(s.domain),
    }))
    .sort((a, b) => (a._group - b._group) || (a._ci - b._ci))
    .map((r, idx): RankedDomainSignal => ({
      domain: r.domain, domainId: r.domainId, status: r.status, severity: r.severity,
      confidence: r.confidence, priorityLevel: r.priorityLevel, rank: idx,
      evidenceUsed: r.evidenceUsed, missingData: r.missingData, sideEffectRisks: r.sideEffectRisks,
    }));

  const bindingConstraint = ranked.find((r) => isRed(r.status as never, r.severity)) ?? null;
  return { ranked, topPriority: ranked[0] ?? null, bindingConstraint };
}

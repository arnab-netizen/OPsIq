/**
 * Module 15 — Quality Economics (pure domain core).
 *
 * Models the Cost of Poor Quality (COPQ): complaints, rework, refunds, late
 * deliveries, and damage claims each carry direct + recovery + goodwill cost.
 * Aggregates COPQ and expresses it as a fraction of revenue so quality problems
 * become a measurable profit leak the recommendation engine can act on. Pure.
 */

export enum QualityIncidentType {
  COMPLAINT = "COMPLAINT",
  REWORK = "REWORK",
  REFUND = "REFUND",
  LATE_DELIVERY = "LATE_DELIVERY",
  DAMAGE_CLAIM = "DAMAGE_CLAIM",
}

export interface QualityIncident {
  type: QualityIncidentType;
  /** Number of occurrences (default 1). */
  count?: number;
  /** Direct cost per occurrence (refund amount, redo labour, claim payout, etc.). */
  directCost?: number;
  /** Cost per occurrence to recover the customer/relationship. */
  recoveryCost?: number;
  /** Estimated goodwill / future-revenue loss per occurrence. */
  goodwillCost?: number;
}

function n(v: number | undefined): number {
  return typeof v === "number" && Number.isFinite(v) && v > 0 ? v : 0;
}

/** Total cost of a single incident type (count × per-occurrence costs). */
export function incidentCost(i: QualityIncident): number {
  const count = i.count && i.count > 0 ? i.count : 1;
  return count * (n(i.directCost) + n(i.recoveryCost) + n(i.goodwillCost));
}

export interface CostOfPoorQuality {
  total: number;
  byType: Record<QualityIncidentType, number>;
  incidentCount: number;
}

/** Aggregate the cost of poor quality across incidents. */
export function totalCostOfPoorQuality(incidents: QualityIncident[]): CostOfPoorQuality {
  const byType = {
    [QualityIncidentType.COMPLAINT]: 0,
    [QualityIncidentType.REWORK]: 0,
    [QualityIncidentType.REFUND]: 0,
    [QualityIncidentType.LATE_DELIVERY]: 0,
    [QualityIncidentType.DAMAGE_CLAIM]: 0,
  };
  let total = 0;
  let incidentCount = 0;
  for (const i of incidents) {
    const c = incidentCost(i);
    byType[i.type] += c;
    total += c;
    incidentCount += i.count && i.count > 0 ? i.count : 1;
  }
  return { total, byType, incidentCount };
}

export type CopqSeverity = "LOW" | "MODERATE" | "HIGH" | "SEVERE";

export interface QualityEconomicsSummary {
  copq: number;
  /** COPQ as a fraction of revenue (0 when revenue unknown). */
  copqPct: number;
  severity: CopqSeverity;
  dominantType: QualityIncidentType | null;
  incidentCount: number;
}

/** Classify COPQ as a fraction of revenue. */
export function classifyCopq(copqPct: number): CopqSeverity {
  if (copqPct >= 0.15) return "SEVERE";
  if (copqPct >= 0.08) return "HIGH";
  if (copqPct >= 0.03) return "MODERATE";
  return "LOW";
}

/** Summarize quality economics for a period given revenue. */
export function qualityEconomicsSummary(incidents: QualityIncident[], revenue: number): QualityEconomicsSummary {
  const copqAgg = totalCostOfPoorQuality(incidents);
  const rev = n(revenue);
  const copqPct = rev > 0 ? copqAgg.total / rev : 0;

  let dominantType: QualityIncidentType | null = null;
  let max = 0;
  for (const t of Object.values(QualityIncidentType)) {
    if (copqAgg.byType[t] > max) {
      max = copqAgg.byType[t];
      dominantType = t;
    }
  }

  return {
    copq: copqAgg.total,
    copqPct,
    severity: classifyCopq(copqPct),
    dominantType,
    incidentCount: copqAgg.incidentCount,
  };
}

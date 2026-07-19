/**
 * Phase 4 — Cost Intelligence (Capability 9).
 *
 * Attribution of spend entries and budget lines to business objectives.
 * Surfaces cost concentration, objective-level burn rate, and spend efficiency.
 *
 * Pure — no DB, no I/O.
 */

export type CostCategory =
  | "LABOUR"
  | "MATERIALS"
  | "EQUIPMENT"
  | "MARKETING"
  | "OVERHEAD"
  | "EXTERNAL_SERVICE"
  | "CAPITAL"
  | "OTHER";

export interface CostEntry {
  entryId: string;
  amount: number;
  category: CostCategory;
  linkedObjectiveId: string | null;
  recordedAt: string; // ISO
  isVerified: boolean;
}

export interface ObjectiveCostSummary {
  objectiveId: string;
  totalCost: number;
  verifiedCost: number;
  unverifiedCost: number;
  entryCount: number;
  categoryBreakdown: Partial<Record<CostCategory, number>>;
  largestCategory: CostCategory | null;
  burnRate: number | null; // cost per day (if date range > 0)
}

export interface UnattributedCostSummary {
  totalUnattributed: number;
  entryCount: number;
  pct: number; // % of total spend that is unattributed
  categoryBreakdown: Partial<Record<CostCategory, number>>;
}

export interface CostIntelligenceView {
  objectiveSummaries: ObjectiveCostSummary[];
  unattributed: UnattributedCostSummary;
  totalSpend: number;
  topObjectiveId: string | null; // highest spend
  attributionCoveragePct: number; // % of total spend linked to an objective
  highConcentrationAlert: boolean; // single objective > 60% of spend
}

function daysBetween(a: string, b: string): number {
  const ms = Math.abs(new Date(b).getTime() - new Date(a).getTime());
  return Math.max(1, Math.round(ms / 86_400_000));
}

/** Build per-objective cost summary from a flat list of cost entries. */
export function buildObjectiveCostSummaries(
  entries: CostEntry[],
): { summaries: ObjectiveCostSummary[]; unattributed: CostEntry[] } {
  const objectiveMap = new Map<string, CostEntry[]>();
  const unattributed: CostEntry[] = [];

  for (const entry of entries) {
    if (entry.linkedObjectiveId === null) {
      unattributed.push(entry);
    } else {
      const bucket = objectiveMap.get(entry.linkedObjectiveId) ?? [];
      bucket.push(entry);
      objectiveMap.set(entry.linkedObjectiveId, bucket);
    }
  }

  const summaries: ObjectiveCostSummary[] = [];

  for (const [objectiveId, objEntries] of objectiveMap) {
    const totalCost = objEntries.reduce((s, e) => s + e.amount, 0);
    const verifiedCost = objEntries.filter((e) => e.isVerified).reduce((s, e) => s + e.amount, 0);
    const unverifiedCost = totalCost - verifiedCost;

    const categoryBreakdown: Partial<Record<CostCategory, number>> = {};
    for (const e of objEntries) {
      categoryBreakdown[e.category] = (categoryBreakdown[e.category] ?? 0) + e.amount;
    }

    const sortedCategories = Object.entries(categoryBreakdown).sort(([, a], [, b]) => b - a);
    const largestCategory = (sortedCategories[0]?.[0] ?? null) as CostCategory | null;

    const dates = objEntries.map((e) => e.recordedAt).sort();
    const burnRate =
      dates.length >= 2
        ? parseFloat((totalCost / daysBetween(dates[0]!, dates[dates.length - 1]!)).toFixed(2))
        : null;

    summaries.push({
      objectiveId,
      totalCost: parseFloat(totalCost.toFixed(2)),
      verifiedCost: parseFloat(verifiedCost.toFixed(2)),
      unverifiedCost: parseFloat(unverifiedCost.toFixed(2)),
      entryCount: objEntries.length,
      categoryBreakdown,
      largestCategory,
      burnRate,
    });
  }

  return {
    summaries: summaries.sort((a, b) => b.totalCost - a.totalCost),
    unattributed,
  };
}

/** Build the full cost intelligence view. */
export function buildCostIntelligence(entries: CostEntry[]): CostIntelligenceView {
  const { summaries, unattributed } = buildObjectiveCostSummaries(entries);

  const totalSpend = entries.reduce((s, e) => s + e.amount, 0);
  const unattributedTotal = unattributed.reduce((s, e) => s + e.amount, 0);
  const attributedTotal = totalSpend - unattributedTotal;

  const attributionCoveragePct =
    totalSpend > 0 ? Math.round((attributedTotal / totalSpend) * 100) : 100;

  const topObjective = summaries[0] ?? null;
  const highConcentrationAlert =
    topObjective !== null && totalSpend > 0 && topObjective.totalCost / totalSpend > 0.6;

  const unattributedCategoryBreakdown: Partial<Record<CostCategory, number>> = {};
  for (const e of unattributed) {
    unattributedCategoryBreakdown[e.category] =
      (unattributedCategoryBreakdown[e.category] ?? 0) + e.amount;
  }

  return {
    objectiveSummaries: summaries,
    unattributed: {
      totalUnattributed: parseFloat(unattributedTotal.toFixed(2)),
      entryCount: unattributed.length,
      pct: totalSpend > 0 ? Math.round((unattributedTotal / totalSpend) * 100) : 0,
      categoryBreakdown: unattributedCategoryBreakdown,
    },
    totalSpend: parseFloat(totalSpend.toFixed(2)),
    topObjectiveId: topObjective?.objectiveId ?? null,
    attributionCoveragePct,
    highConcentrationAlert,
  };
}

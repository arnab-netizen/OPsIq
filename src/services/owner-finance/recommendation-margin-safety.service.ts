/**
 * Jarvis 360 Slice 2 — margin-safety enforcement at recommendation promotion.
 *
 * Loads the business's CURRENT EFFECTIVE OwnerFinancialSnapshot (revenue + COGS —
 * financial-snapshot-selection.ts), derives the
 * recommendation's sensitivity from its linked finding, and runs the pure
 * margin-safety gate. Reuses the proven sensitivity mapping + the snapshot the
 * owner-finance module already persists (no new finance engine). DI for testing.
 */

import {
  assertMarginSafetyForPromotion,
  grossMarginPctFrom,
  DEFAULT_MARGIN_FLOOR_PCT,
} from "@/domain/owner-finance/margin-safety-gate";
import {
  currentEffectiveFinancialSnapshotQuery,
  type CurrentEffectiveSnapshotQuery,
} from "@/services/owner-finance/financial-snapshot-selection";
import {
  mapImpactAreaToSensitivity,
  RecommendationSensitivity,
} from "@/domain/owner-mode/recommendation-input-quality-gate";

interface MarginDb {
  recommendation: {
    findUnique(args: { where: { id: string; workspaceId: string }; select: { findingId: true } }): Promise<{ findingId: string | null } | null>;
  };
  finding: {
    findFirst(args: { where: { id: string; engagement: { workspaceId: string } }; select: { impactArea: true } }): Promise<{ impactArea: string | null } | null>;
  };
  ownerBusiness: {
    findMany(args: {
      where: { workspaceId: string; isActive: true; isFixtureBusiness: false };
      select: { id: true };
      take: 2;
    }): Promise<Array<{ id: string }>>;
  };
  ownerFinancialSnapshot: {
    findFirst(args: CurrentEffectiveSnapshotQuery<{ revenue: true; costOfGoods: true }>): Promise<{ revenue: number | null; costOfGoods: number | null } | null>;
  };
}

export interface MarginDeps {
  db: MarginDb;
  marginFloorPct?: number;
}

async function resolveDefaultDeps(): Promise<MarginDeps> {
  const { db } = await import("@/lib/db");
  return { db: db as unknown as MarginDb };
}

async function resolveSensitivity(recommendationId: string, workspaceId: string, deps: MarginDeps): Promise<RecommendationSensitivity> {
  const rec = await deps.db.recommendation.findUnique({ where: { id: recommendationId, workspaceId }, select: { findingId: true } });
  if (!rec?.findingId) return RecommendationSensitivity.GENERAL;
  const finding = await deps.db.finding.findFirst({ where: { id: rec.findingId, engagement: { workspaceId } }, select: { impactArea: true } });
  return mapImpactAreaToSensitivity(finding?.impactArea);
}

/** Enforce the margin-safety gate for a recommendation promotion. */
export async function enforceMarginSafetyForPromotion(
  recommendationId: string,
  workspaceId: string,
  injected?: MarginDeps
): Promise<void> {
  const deps = injected ?? (await resolveDefaultDeps());
  const sensitivity = await resolveSensitivity(recommendationId, workspaceId, deps);
  // Cheap exit: only pricing recs are gated, so skip the snapshot read otherwise.
  if (sensitivity !== RecommendationSensitivity.PRICING_SENSITIVE) return;
  // A recommendation belongs to an engagement, which carries no owner business: its margin is
  // attributable only when the workspace has exactly one real business. Otherwise the margin is
  // unknown (the gate defers to the input-quality path) — another business's figures are never used.
  const businesses = await deps.db.ownerBusiness.findMany({
    where: { workspaceId, isActive: true, isFixtureBusiness: false },
    select: { id: true },
    take: 2,
  });
  const snap = businesses.length === 1
    ? await deps.db.ownerFinancialSnapshot.findFirst(
        currentEffectiveFinancialSnapshotQuery({ workspaceId, businessId: businesses[0].id }, { revenue: true, costOfGoods: true })
      )
    : null;
  const grossMargin = grossMarginPctFrom(snap?.revenue ?? null, snap?.costOfGoods ?? null);
  assertMarginSafetyForPromotion(grossMargin, sensitivity, recommendationId, deps.marginFloorPct ?? DEFAULT_MARGIN_FLOOR_PCT);
}

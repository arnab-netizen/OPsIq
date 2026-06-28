/**
 * Jarvis 360 Slice 2 — margin-safety enforcement at recommendation promotion.
 *
 * Loads the latest persisted OwnerFinancialSnapshot (revenue + COGS), derives the
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
  mapImpactAreaToSensitivity,
  RecommendationSensitivity,
} from "@/domain/owner-mode/recommendation-input-quality-gate";

interface MarginDb {
  recommendation: {
    findUnique(args: { where: { id: string; workspaceId: string }; select: { findingId: true } }): Promise<{ findingId: string | null } | null>;
  };
  finding: {
    findUnique(args: { where: { id: string; workspaceId: string }; select: { impactArea: true } }): Promise<{ impactArea: string | null } | null>;
  };
  ownerFinancialSnapshot: {
    findFirst(args: {
      where: { workspaceId: string };
      orderBy: { createdAt: "desc" };
      select: { revenue: true; costOfGoods: true };
    }): Promise<{ revenue: number | null; costOfGoods: number | null } | null>;
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
  const finding = await deps.db.finding.findUnique({ where: { id: rec.findingId, workspaceId }, select: { impactArea: true } });
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
  const snap = await deps.db.ownerFinancialSnapshot.findFirst({
    where: { workspaceId },
    orderBy: { createdAt: "desc" },
    select: { revenue: true, costOfGoods: true },
  });
  const grossMargin = grossMarginPctFrom(snap?.revenue ?? null, snap?.costOfGoods ?? null);
  assertMarginSafetyForPromotion(grossMargin, sensitivity, recommendationId, deps.marginFloorPct ?? DEFAULT_MARGIN_FLOOR_PCT);
}

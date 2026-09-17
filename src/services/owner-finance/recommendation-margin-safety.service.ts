/**
 * Jarvis 360 Slice 2 — margin-safety enforcement at recommendation promotion.
 *
 * Loads the latest persisted OwnerFinancialSnapshot (revenue + COGS), derives the
 * recommendation's sensitivity from its linked finding, and runs the pure
 * margin-safety gate. Reuses the proven sensitivity mapping + the snapshot the
 * owner-finance module already persists (no new finance engine). DI for testing.
 *
 * WORKSPACE-WIDE BY NECESSITY, NOT BY OMISSION (re-verified 2026-09-17 against the
 * fix/recommendation-safety-scoping cross-business-scoping audit): the snapshot read
 * below filters OwnerFinancialSnapshot by workspaceId only, even though the model
 * carries a required businessId (see prisma/schema.prisma). This function is
 * reachable ONLY via updateRecommendationStatus (services/recommendation.ts) ->
 * enforceOwnerGatesForPromotion (gate-enforcement-policy.ts) -> here, and that whole
 * chain operates on the LEGACY consultant/engagement Recommendation/Finding/Engagement
 * models. Recommendation has workspaceId + findingId only; Finding has engagementId
 * only; Engagement has a clientId (ClientAccount), not a businessId/OwnerBusiness
 * relation -- there is no OwnerBusiness concept anywhere in this call's data model to
 * scope by, so "workspace-wide" is the only coherent contract available here, not a
 * missing filter. Confirmed unreachable by any self-serve owner: the route this
 * hangs off, PATCH /api/recommendations/[recommendationId], requires
 * CAPABILITIES.RECOMMENDATION_APPROVE, which is in INTERNAL_ONLY_CAPABILITIES and
 * absent from OWNER_SCOPED_CAPABILITIES (capability-check.ts) -- no self-serve owner
 * can ever trigger this path. Contrast with owner-action-gate.service.ts's bizScope()
 * helper, the correct precedent for a TRUE business-scoped read of this same table,
 * used by the (reachable) owner.finance/sales/marketing.action gates registered in
 * material-gate-registry.ts. If Engagement ever gains a businessId/OwnerBusiness
 * relation, this read must be revisited; until then, do not "fix" this into a
 * fabricated business-scoped filter. See
 * recommendation-margin-safety-snapshot-scope.db.test.ts. Same conclusion as the
 * sibling finding already proven for recommendation-capacity-safety.service.ts
 * (commit 0af781ee9) and recommendation-cash-safety.service.ts.
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
    findFirst(args: { where: { id: string; engagement: { workspaceId: string } }; select: { impactArea: true } }): Promise<{ impactArea: string | null } | null>;
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
  const snap = await deps.db.ownerFinancialSnapshot.findFirst({
    where: { workspaceId },
    orderBy: { createdAt: "desc" },
    select: { revenue: true, costOfGoods: true },
  });
  const grossMargin = grossMarginPctFrom(snap?.revenue ?? null, snap?.costOfGoods ?? null);
  assertMarginSafetyForPromotion(grossMargin, sensitivity, recommendationId, deps.marginFloorPct ?? DEFAULT_MARGIN_FLOOR_PCT);
}

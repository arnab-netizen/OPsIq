/**
 * Jarvis 360 Slice 7 — capacity-safety enforcement at recommendation promotion.
 *
 * For GROWTH-sensitive recommendations, loads the workspace's equipment fleet and
 * blocks promotion when the worst-case capacity is high_risk/blocked (down, overdue
 * maintenance, or saturated utilization). Non-growth recs and equipment-free
 * workspaces are unaffected. Reuses the pure capacity rules + sensitivity taxonomy.
 *
 * WORKSPACE-WIDE BY NECESSITY, NOT BY OMISSION (hostile-review finding, 2026-09-10):
 * ownerEquipment.findMany below filters by workspaceId only, with no businessId. This
 * was flagged as a possible cross-business "wrong business intelligence" gap and
 * traced to its root: this function is reachable ONLY via
 * updateRecommendationStatus (services/recommendation.ts) -> enforceOwnerGatesForPromotion
 * (gate-enforcement-policy.ts) -> here, and that whole chain operates on the LEGACY
 * consultant/engagement Recommendation/Finding/Engagement models. Engagement has a
 * clientId, not a businessId (see prisma/schema.prisma model Engagement) -- there is
 * no OwnerBusiness concept anywhere in this call's data model to scope by, so
 * "workspace-wide" is the only coherent contract available here, not a missing
 * filter. Confirmed unreachable by any self-serve owner: the route this eventually
 * hangs off, PATCH /api/recommendations/[recommendationId], requires
 * CAPABILITIES.RECOMMENDATION_APPROVE, which is absent from OWNER_SCOPED_CAPABILITIES
 * (capability-check.ts) -- no self-serve owner can ever trigger this path. Contrast
 * with owner-action-gate.service.ts's bizScope() helper, the correct precedent for a
 * TRUE business-scoped read of this same OwnerEquipment table, used by the (reachable)
 * ProcessExecutionTask gate, which does have a businessId to scope by.
 * If Engagement ever gains a businessId/OwnerBusiness relation, this read must be
 * revisited; until then, do not "fix" this into a fabricated business-scoped filter.
 * See write-isolation-recommendation-capacity-equipment-scope.db.test.ts.
 */

import {
  assessFleetCapacity,
  capacityBlocksGrowth,
  type EquipmentRecord,
} from "@/domain/owner-mode/equipment-capacity";
import {
  mapImpactAreaToSensitivity,
  RecommendationSensitivity,
} from "@/domain/owner-mode/recommendation-input-quality-gate";

interface CapacityDb {
  recommendation: {
    findUnique(args: { where: { id: string; workspaceId: string }; select: { findingId: true } }): Promise<{ findingId: string | null } | null>;
  };
  finding: {
    findFirst(args: { where: { id: string; engagement: { workspaceId: string } }; select: { impactArea: true } }): Promise<{ impactArea: string | null } | null>;
  };
  ownerEquipment: {
    findMany(args: { where: { workspaceId: string }; select: Record<string, boolean> }): Promise<Array<EquipmentRecord & { name: string }>>;
  };
}

export interface CapacityDeps {
  db: CapacityDb;
  now?: () => Date;
}

async function resolveDefaultDeps(): Promise<CapacityDeps> {
  const { db } = await import("@/lib/db");
  return { db: db as unknown as CapacityDb };
}

export class CapacitySafetyGateError extends Error {
  readonly code = "CAPACITY_SAFETY_GATE_BLOCKED";
  readonly bottlenecks: string[];
  constructor(recommendationId: string, reason: string, bottlenecks: string[]) {
    super(`Recommendation ${recommendationId} cannot be promoted: ${reason}`);
    this.name = "CapacitySafetyGateError";
    this.bottlenecks = bottlenecks;
  }
}

async function resolveSensitivity(recommendationId: string, workspaceId: string, deps: CapacityDeps): Promise<RecommendationSensitivity> {
  const rec = await deps.db.recommendation.findUnique({ where: { id: recommendationId, workspaceId }, select: { findingId: true } });
  if (!rec?.findingId) return RecommendationSensitivity.GENERAL;
  const finding = await deps.db.finding.findFirst({ where: { id: rec.findingId, engagement: { workspaceId } }, select: { impactArea: true } });
  return mapImpactAreaToSensitivity(finding?.impactArea);
}

/** Enforce capacity safety for a growth-sensitive recommendation promotion. */
export async function enforceCapacitySafetyForPromotion(
  recommendationId: string,
  workspaceId: string,
  injected?: CapacityDeps
): Promise<void> {
  const deps = injected ?? (await resolveDefaultDeps());
  const sensitivity = await resolveSensitivity(recommendationId, workspaceId, deps);
  if (sensitivity !== RecommendationSensitivity.GROWTH_SENSITIVE) return;
  const now = (deps.now ?? (() => new Date()))();
  const fleet = await deps.db.ownerEquipment.findMany({
    where: { workspaceId },
    select: { name: true, utilization: true, downtimeState: true, maintenanceDueAt: true, status: true },
  });
  const result = assessFleetCapacity(fleet, now);
  if (capacityBlocksGrowth(result.status)) {
    throw new CapacitySafetyGateError(recommendationId, result.reason, result.bottlenecks);
  }
}

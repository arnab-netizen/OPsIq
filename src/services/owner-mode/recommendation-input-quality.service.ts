/**
 * Module 2 — Recommendation input-quality enforcement at promotion.
 *
 * Loads the recommendation's linked finding (impact area → sensitivity) and the
 * workspace's latest persisted input-quality status, then runs the fail-closed
 * gate. Enforced only when the workspace has opted into the Owner Mode governance
 * suite (same flag as Module 1) — default off keeps existing flows unchanged.
 *
 * Reuses the proven assessInputQuality status taxonomy + the persisted
 * OwnerInputQualityAssessment (no duplication). DI for unit-testability.
 */

import type { InputQualityStatus } from "@/domain/owner-mode/input-quality";
import {
  assertInputQualityForPromotion,
  mapImpactAreaToSensitivity,
  RecommendationSensitivity,
} from "@/domain/owner-mode/recommendation-input-quality-gate";

interface IQDb {
  clientAccount: {
    findUnique(args: { where: { id: string }; select: { requireBusinessImpactAssessment: true } }): Promise<{ requireBusinessImpactAssessment: boolean } | null>;
  };
  recommendation: {
    findUnique(args: { where: { id: string; workspaceId: string }; select: { findingId: true } }): Promise<{ findingId: string | null } | null>;
  };
  finding: {
    findUnique(args: { where: { id: string; workspaceId: string }; select: { impactArea: true } }): Promise<{ impactArea: string | null } | null>;
  };
  ownerInputQualityAssessment: {
    findFirst(args: { where: { workspaceId: string }; orderBy: { assessedAt: "desc" }; select: { qualityStatus: true } }): Promise<{ qualityStatus: string } | null>;
  };
}

export interface IQDeps {
  db: IQDb;
}

async function resolveDefaultDeps(): Promise<IQDeps> {
  const { db } = await import("@/lib/db");
  return { db: db as unknown as IQDb };
}

/** True when the workspace has opted into the Owner Mode governance gate suite. */
export async function isInputQualityGateEnabled(workspaceId: string, injected?: IQDeps): Promise<boolean> {
  const deps = injected ?? (await resolveDefaultDeps());
  const row = await deps.db.clientAccount.findUnique({
    where: { id: workspaceId },
    select: { requireBusinessImpactAssessment: true },
  });
  return row?.requireBusinessImpactAssessment === true;
}

async function resolveSensitivity(recommendationId: string, workspaceId: string, deps: IQDeps): Promise<RecommendationSensitivity> {
  const rec = await deps.db.recommendation.findUnique({
    where: { id: recommendationId, workspaceId },
    select: { findingId: true },
  });
  if (!rec?.findingId) return RecommendationSensitivity.GENERAL;
  const finding = await deps.db.finding.findUnique({
    where: { id: rec.findingId, workspaceId },
    select: { impactArea: true },
  });
  return mapImpactAreaToSensitivity(finding?.impactArea);
}

/**
 * Enforce the input-quality gate for a recommendation promotion. Fail-closed: when
 * no input-quality assessment exists for the workspace, sensitive recommendations
 * are treated as critical_missing (blocked). Throws InputQualityGateError on block.
 */
export async function enforceInputQualityForPromotion(
  recommendationId: string,
  workspaceId: string,
  injected?: IQDeps,
  /**
   * Status assumed when the workspace has no input-quality assessment on record.
   * STRICT (opt-in) callers keep "critical_missing" (hard fail-closed). The
   * default-on policy passes "data_limited" so only MATERIAL/sensitive recs are
   * blocked/downgraded while low-risk GENERAL recs proceed with caution.
   */
  missingDefault: InputQualityStatus = "critical_missing"
): Promise<void> {
  const deps = injected ?? (await resolveDefaultDeps());
  const sensitivity = await resolveSensitivity(recommendationId, workspaceId, deps);
  const latest = await deps.db.ownerInputQualityAssessment.findFirst({
    where: { workspaceId },
    orderBy: { assessedAt: "desc" },
    select: { qualityStatus: true },
  });
  // No assessment on record → fail-closed using the caller-supplied default.
  const status = (latest?.qualityStatus as InputQualityStatus | undefined) ?? missingDefault;
  assertInputQualityForPromotion(status, sensitivity, recommendationId);
}

/** Backward-compatible guard: enforce only when the workspace opted in (default off). */
export async function enforceInputQualityIfRequired(
  recommendationId: string,
  workspaceId: string,
  injected?: IQDeps
): Promise<void> {
  if (!(await isInputQualityGateEnabled(workspaceId, injected))) return;
  await enforceInputQualityForPromotion(recommendationId, workspaceId, injected);
}

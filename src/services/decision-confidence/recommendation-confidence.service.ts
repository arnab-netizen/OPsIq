/**
 * Module 3 — Recommendation confidence enforcement at promotion.
 *
 * Composes the already-persisted governance signals into a unified confidence
 * classification (no fabricated engine inputs):
 *   - confidenceLevel  ← Module 1 evidence-confidence
 *   - isUnsafe         ← Module 1 lean classification (blocking) or no assessment
 *   - hasSufficientData← Module 2 latest input-quality status
 *   - needsProfessionalReview ← finding impact area is compliance-sensitive
 * Enforced only when the workspace opted into the governance suite (same flag as
 * Modules 1/2; default off). DI for unit-testability.
 */

import {
  assertConfidenceForPromotion,
  deriveConfidenceLevelFromEvidence,
} from "@/domain/decision-confidence/recommendation-confidence-gate";
import { PROMOTION_BLOCKING_LEAN, LeanClassification } from "@/domain/business-impact/recommendation-business-impact";
import { mapImpactAreaToSensitivity, RecommendationSensitivity } from "@/domain/owner-mode/recommendation-input-quality-gate";

interface ConfDb {
  clientAccount: {
    findUnique(args: { where: { id: string }; select: { requireBusinessImpactAssessment: true } }): Promise<{ requireBusinessImpactAssessment: boolean } | null>;
  };
  recommendationBusinessImpact: {
    findUnique(args: { where: { workspaceId_recommendationId: { workspaceId: string; recommendationId: string } } }): Promise<{ leanClassification: string; evidenceConfidence: string } | null>;
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

export interface ConfDeps {
  db: ConfDb;
}

async function resolveDefaultDeps(): Promise<ConfDeps> {
  const { db } = await import("@/lib/db");
  return { db: db as unknown as ConfDb };
}

const SUFFICIENT_BLOCKING = new Set(["critical_missing", "conflicting", "unsafe_for_strong_recommendation"]);

export async function isConfidenceGateEnabled(workspaceId: string, injected?: ConfDeps): Promise<boolean> {
  const deps = injected ?? (await resolveDefaultDeps());
  const row = await deps.db.clientAccount.findUnique({ where: { id: workspaceId }, select: { requireBusinessImpactAssessment: true } });
  return row?.requireBusinessImpactAssessment === true;
}

/**
 * Enforce the confidence gate by composing M1/M2 governance signals. Fail-closed:
 * a missing business-impact assessment is treated as unsafe; a missing input-quality
 * assessment as insufficient data.
 */
export async function enforceConfidenceForPromotion(
  recommendationId: string,
  workspaceId: string,
  injected?: ConfDeps
): Promise<void> {
  const deps = injected ?? (await resolveDefaultDeps());

  const impact = await deps.db.recommendationBusinessImpact.findUnique({
    where: { workspaceId_recommendationId: { workspaceId, recommendationId } },
  });
  const isUnsafe = !impact || PROMOTION_BLOCKING_LEAN.has(impact.leanClassification as LeanClassification);
  const confidenceLevel = deriveConfidenceLevelFromEvidence(impact?.evidenceConfidence);

  const latest = await deps.db.ownerInputQualityAssessment.findFirst({
    where: { workspaceId },
    orderBy: { assessedAt: "desc" },
    select: { qualityStatus: true },
  });
  const hasSufficientData = !!latest && !SUFFICIENT_BLOCKING.has(latest.qualityStatus);

  const rec = await deps.db.recommendation.findUnique({ where: { id: recommendationId, workspaceId }, select: { findingId: true } });
  let needsProfessionalReview = false;
  if (rec?.findingId) {
    const finding = await deps.db.finding.findUnique({ where: { id: rec.findingId, workspaceId }, select: { impactArea: true } });
    needsProfessionalReview = mapImpactAreaToSensitivity(finding?.impactArea) === RecommendationSensitivity.COMPLIANCE_SENSITIVE;
  }

  assertConfidenceForPromotion({ confidenceLevel, hasSufficientData, isUnsafe, needsProfessionalReview }, recommendationId);
}

/** Backward-compatible guard: enforce only when the workspace opted in (default off). */
export async function enforceConfidenceIfRequired(
  recommendationId: string,
  workspaceId: string,
  injected?: ConfDeps
): Promise<void> {
  if (!(await isConfidenceGateEnabled(workspaceId, injected))) return;
  await enforceConfidenceForPromotion(recommendationId, workspaceId, injected);
}

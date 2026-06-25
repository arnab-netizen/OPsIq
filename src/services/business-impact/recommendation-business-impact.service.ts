/**
 * Module 1 — RecommendationBusinessImpact persistence + promotion enforcement.
 *
 * Workspace-scoped store for the governance assessment, plus the enforcement entry
 * point the recommendation service calls before approving a recommendation. DI so
 * the logic is unit-testable without a DB; production resolves the real client.
 */

import {
  assertBusinessImpactForPromotion,
  type RecommendationBusinessImpact,
} from "@/domain/business-impact/recommendation-business-impact";

interface RBIRow {
  workspaceId: string;
  recommendationId: string;
  leanClassification: string;
  evidenceConfidence: string;
  assessment: unknown;
}

interface RBIDb {
  clientAccount?: {
    findUnique(args: {
      where: { id: string };
      select: { requireBusinessImpactAssessment: true };
    }): Promise<{ requireBusinessImpactAssessment: boolean } | null>;
  };
  recommendationBusinessImpact: {
    upsert(args: {
      where: { workspaceId_recommendationId: { workspaceId: string; recommendationId: string } };
      create: Record<string, unknown>;
      update: Record<string, unknown>;
    }): Promise<unknown>;
    findUnique(args: {
      where: { workspaceId_recommendationId: { workspaceId: string; recommendationId: string } };
    }): Promise<RBIRow | null>;
  };
}

export interface RBIDeps {
  db: RBIDb;
  uuid: () => string;
}

async function resolveDefaultDeps(): Promise<RBIDeps> {
  const { db } = await import("@/lib/db");
  const { randomUUID } = await import("crypto");
  return { db: db as unknown as RBIDb, uuid: () => randomUUID() };
}

/** Persist (upsert) the governance assessment for a recommendation, workspace-scoped. */
export async function saveBusinessImpact(
  assessment: RecommendationBusinessImpact,
  opts: { createdByUserId?: string } = {},
  injected?: RBIDeps
): Promise<void> {
  const deps = injected ?? (await resolveDefaultDeps());
  const base = {
    leanClassification: assessment.leanClassification,
    evidenceConfidence: assessment.evidenceConfidence,
    assessment: assessment as unknown as Record<string, unknown>,
  };
  await deps.db.recommendationBusinessImpact.upsert({
    where: {
      workspaceId_recommendationId: {
        workspaceId: assessment.workspaceId,
        recommendationId: assessment.recommendationId,
      },
    },
    create: {
      id: deps.uuid(),
      workspaceId: assessment.workspaceId,
      recommendationId: assessment.recommendationId,
      createdByUserId: opts.createdByUserId ?? null,
      ...base,
    },
    update: { ...base, updatedAt: new Date() },
  });
}

/** Fetch the persisted assessment for a recommendation, scoped to the workspace. */
export async function getBusinessImpact(
  recommendationId: string,
  workspaceId: string,
  injected?: RBIDeps
): Promise<RecommendationBusinessImpact | null> {
  const deps = injected ?? (await resolveDefaultDeps());
  const row = await deps.db.recommendationBusinessImpact.findUnique({
    where: { workspaceId_recommendationId: { workspaceId, recommendationId } },
  });
  if (!row) return null;
  // Defense-in-depth: never return an assessment scoped to another workspace.
  if (row.workspaceId !== workspaceId) return null;
  return row.assessment as RecommendationBusinessImpact;
}

/**
 * Enforcement entry point for the recommendation promotion path. Loads the
 * persisted assessment and runs the fail-closed gate; throws BusinessImpactGateError
 * when absent, incomplete, or unsafe.
 */
export async function enforceBusinessImpactForPromotion(
  recommendationId: string,
  workspaceId: string,
  injected?: RBIDeps
): Promise<void> {
  const assessment = await getBusinessImpact(recommendationId, workspaceId, injected);
  assertBusinessImpactForPromotion(assessment, { recommendationId, workspaceId });
}

/** True when the workspace has opted into mandatory business-impact assessments. */
export async function isBusinessImpactRequired(
  workspaceId: string,
  injected?: RBIDeps
): Promise<boolean> {
  const deps = injected ?? (await resolveDefaultDeps());
  if (!deps.db.clientAccount) return false;
  const row = await deps.db.clientAccount.findUnique({
    where: { id: workspaceId },
    select: { requireBusinessImpactAssessment: true },
  });
  return row?.requireBusinessImpactAssessment === true;
}

/**
 * Backward-compatible promotion guard: enforces the gate ONLY when the workspace
 * has opted in (default off → no behavior change for existing flows). Owner Mode
 * workspaces enable the flag to get hard enforcement.
 */
export async function enforceBusinessImpactIfRequired(
  recommendationId: string,
  workspaceId: string,
  injected?: RBIDeps
): Promise<void> {
  if (!(await isBusinessImpactRequired(workspaceId, injected))) return;
  await enforceBusinessImpactForPromotion(recommendationId, workspaceId, injected);
}

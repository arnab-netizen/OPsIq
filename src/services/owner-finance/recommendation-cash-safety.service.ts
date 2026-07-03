/**
 * Modules 4 & 5 — cash/finance-safety enforcement at recommendation promotion.
 *
 * Loads the latest persisted cashflow state (M5 OwnerCashflowCycle) and survival
 * state (M4 OwnerFinanceCycle) for the workspace, derives the recommendation's
 * sensitivity from its linked finding, and runs the fail-closed cash-safety gate.
 * Enforced only when the workspace opted into the Owner Mode governance suite
 * (same flag as M1/M2/M3). Reuses the proven owner-finance/owner-cashflow domains.
 */

import {
  assertCashSafetyForPromotion,
  type FinancialHealthState,
} from "@/domain/owner-finance/cash-safety-gate";
import { mapImpactAreaToSensitivity, RecommendationSensitivity } from "@/domain/owner-mode/recommendation-input-quality-gate";

const VALID_STATES = new Set(["SAFE", "WATCH", "AT_RISK", "CRITICAL", "INSOLVENT_RISK"]);

interface CashDb {
  clientAccount: {
    findUnique(args: { where: { id: string }; select: { requireBusinessImpactAssessment: true } }): Promise<{ requireBusinessImpactAssessment: boolean } | null>;
  };
  ownerCashflowCycle: {
    findFirst(args: { where: { workspaceId: string }; orderBy: { createdAt: "desc" }; select: { cashflowState: true } }): Promise<{ cashflowState: string } | null>;
  };
  ownerFinanceCycle: {
    findFirst(args: { where: { workspaceId: string }; orderBy: { createdAt: "desc" }; select: { survivalState: true } }): Promise<{ survivalState: string } | null>;
  };
  recommendation: {
    findUnique(args: { where: { id: string; workspaceId: string }; select: { findingId: true } }): Promise<{ findingId: string | null } | null>;
  };
  finding: {
    findFirst(args: { where: { id: string; engagement: { workspaceId: string } }; select: { impactArea: true } }): Promise<{ impactArea: string | null } | null>;
  };
}

export interface CashDeps {
  db: CashDb;
}

async function resolveDefaultDeps(): Promise<CashDeps> {
  const { db } = await import("@/lib/db");
  return { db: db as unknown as CashDb };
}

function toState(v: string | undefined): FinancialHealthState {
  // Missing/unknown finance data → AT_RISK: blocks growth, allows non-growth (the
  // spec requires proven cash safety before growth, not before everything).
  return v && VALID_STATES.has(v) ? (v as FinancialHealthState) : "AT_RISK";
}

export async function isCashSafetyGateEnabled(workspaceId: string, injected?: CashDeps): Promise<boolean> {
  const deps = injected ?? (await resolveDefaultDeps());
  const row = await deps.db.clientAccount.findUnique({ where: { id: workspaceId }, select: { requireBusinessImpactAssessment: true } });
  return row?.requireBusinessImpactAssessment === true;
}

async function resolveSensitivity(recommendationId: string, workspaceId: string, deps: CashDeps): Promise<RecommendationSensitivity> {
  const rec = await deps.db.recommendation.findUnique({ where: { id: recommendationId, workspaceId }, select: { findingId: true } });
  if (!rec?.findingId) return RecommendationSensitivity.GENERAL;
  const finding = await deps.db.finding.findFirst({ where: { id: rec.findingId, engagement: { workspaceId } }, select: { impactArea: true } });
  return mapImpactAreaToSensitivity(finding?.impactArea);
}

/** Enforce the cash-safety gate using the latest persisted M4/M5 states. */
export async function enforceCashSafetyForPromotion(
  recommendationId: string,
  workspaceId: string,
  injected?: CashDeps
): Promise<void> {
  const deps = injected ?? (await resolveDefaultDeps());
  const [cashRow, finRow, sensitivity] = await Promise.all([
    deps.db.ownerCashflowCycle.findFirst({ where: { workspaceId }, orderBy: { createdAt: "desc" }, select: { cashflowState: true } }),
    deps.db.ownerFinanceCycle.findFirst({ where: { workspaceId }, orderBy: { createdAt: "desc" }, select: { survivalState: true } }),
    resolveSensitivity(recommendationId, workspaceId, deps),
  ]);
  assertCashSafetyForPromotion(toState(cashRow?.cashflowState), toState(finRow?.survivalState), sensitivity, recommendationId);
}

/** Backward-compatible guard: enforce only when the workspace opted in (default off). */
export async function enforceCashSafetyIfRequired(
  recommendationId: string,
  workspaceId: string,
  injected?: CashDeps
): Promise<void> {
  if (!(await isCashSafetyGateEnabled(workspaceId, injected))) return;
  await enforceCashSafetyForPromotion(recommendationId, workspaceId, injected);
}

/**
 * Modules 4 & 5 — cash/finance-safety enforcement at recommendation promotion (Formal Consulting Mode).
 *
 * Semantics are the pre-consolidation gate's, unchanged: BOTH persisted states are passed to the pure
 * gate, which takes the WORSE of the two (cash-safety-gate.ts worseState) — a newer SAFE Finance reading
 * never wipes out a still-recorded CRITICAL cash reading, and there is no source arbitration here (that is
 * Owner Mode's current-cash-finance-reading.ts). A missing half is AT_RISK (growth blocked, non-growth
 * allowed), exactly as before.
 *
 * The only change from the base is attribution/isolation: the cycles read are those of the ONE business
 * the recommendation is attributable to (the workspace's only real business — a recommendation's
 * engagement carries no owner business), in current-cycle order (current-diagnosis-cycle.ts), never the
 * workspace-wide latest cycle that could belong to another business. No attributable business → both
 * halves are missing → AT_RISK.
 * Enforced only when the workspace opted into the Owner Mode governance suite (same flag as M1/M2/M3).
 */

import {
  assertCashSafetyForPromotion,
  type FinancialHealthState,
} from "@/domain/owner-finance/cash-safety-gate";
import { mapImpactAreaToSensitivity, RecommendationSensitivity } from "@/domain/owner-mode/recommendation-input-quality-gate";
import { CURRENT_DIAGNOSIS_CYCLE_ORDER } from "@/services/owner-spine/current-diagnosis-cycle";

const VALID_STATES = new Set(["SAFE", "WATCH", "AT_RISK", "CRITICAL", "INSOLVENT_RISK"]);

function toState(v: string | undefined): FinancialHealthState {
  // Missing/unknown finance data → AT_RISK: blocks growth, allows non-growth (the
  // spec requires proven cash safety before growth, not before everything).
  return v && VALID_STATES.has(v) ? (v as FinancialHealthState) : "AT_RISK";
}

interface CashDb {
  clientAccount: {
    findUnique(args: { where: { id: string }; select: { requireBusinessImpactAssessment: true } }): Promise<{ requireBusinessImpactAssessment: boolean } | null>;
  };
  ownerBusiness: {
    findMany(args: {
      where: { workspaceId: string; isActive: true; isFixtureBusiness: false };
      select: { id: true };
      take: 2;
    }): Promise<Array<{ id: string }>>;
  };
  ownerCashflowCycle: {
    findFirst(args: {
      where: { workspaceId: string; businessId: string };
      orderBy: typeof CURRENT_DIAGNOSIS_CYCLE_ORDER;
      select: { cashflowState: true };
    }): Promise<{ cashflowState: string } | null>;
  };
  ownerFinanceCycle: {
    findFirst(args: {
      where: { workspaceId: string; businessId: string };
      orderBy: typeof CURRENT_DIAGNOSIS_CYCLE_ORDER;
      select: { survivalState: true };
    }): Promise<{ survivalState: string } | null>;
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
  // A recommendation belongs to an engagement, which carries no owner business: cash state is
  // attributable only to the workspace's single real business (same rule as the margin gate).
  const businesses = await deps.db.ownerBusiness.findMany({
    where: { workspaceId, isActive: true, isFixtureBusiness: false },
    select: { id: true },
    take: 2,
  });
  const businessId = businesses.length === 1 ? businesses[0].id : null;
  const [cashRow, finRow, sensitivity] = await Promise.all([
    businessId
      ? deps.db.ownerCashflowCycle.findFirst({ where: { workspaceId, businessId }, orderBy: CURRENT_DIAGNOSIS_CYCLE_ORDER, select: { cashflowState: true } })
      : Promise.resolve(null),
    businessId
      ? deps.db.ownerFinanceCycle.findFirst({ where: { workspaceId, businessId }, orderBy: CURRENT_DIAGNOSIS_CYCLE_ORDER, select: { survivalState: true } })
      : Promise.resolve(null),
    resolveSensitivity(recommendationId, workspaceId, deps),
  ]);
  // Base semantics: the gate takes the worse of the two states; a missing half is AT_RISK.
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

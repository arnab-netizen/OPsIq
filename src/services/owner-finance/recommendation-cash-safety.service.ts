/**
 * Modules 4 & 5 — cash/finance-safety enforcement at recommendation promotion.
 *
 * Reads the ONE current cash/finance reading (current-cash-finance-reading.ts: current diagnosis
 * cycles, arbitrated by evidence period, amended Finance figures fail safe) of the ONE business the
 * recommendation is attributable to (the workspace's only real business; never workspace-wide cycles,
 * which could belong to another business). A missing reading — no business (consulting-only), several
 * businesses (unattributable), no diagnosis, or a Finance diagnosis on amended figures — is AT_RISK: the
 * recommendation gate's long-standing semantics (growth is blocked, non-growth allowed), unchanged for
 * Consulting Mode and never broadened. No business's figures leak into another's. Derives the
 * recommendation's sensitivity from its linked finding, and runs the fail-closed cash-safety gate.
 * Enforced only when the workspace opted into the Owner Mode governance suite
 * (same flag as M1/M2/M3). Reuses the proven owner-finance/owner-cashflow domains.
 */

import {
  assertCashSafetyForPromotion,
  type FinancialHealthState,
} from "@/domain/owner-finance/cash-safety-gate";
import { mapImpactAreaToSensitivity, RecommendationSensitivity } from "@/domain/owner-mode/recommendation-input-quality-gate";
import { CURRENT_DIAGNOSIS_CYCLE_ORDER } from "@/services/owner-spine/current-diagnosis-cycle";
import { currentCashFinanceReading } from "@/services/owner-spine/current-cash-finance-reading";


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
      select: { cashflowState: true; snapshot: { select: { periodEnd: true } } };
    }): Promise<{ cashflowState: string; snapshot?: { periodEnd: Date } | null } | null>;
  };
  ownerFinanceCycle: {
    findFirst(args: {
      where: { workspaceId: string; businessId: string };
      orderBy: typeof CURRENT_DIAGNOSIS_CYCLE_ORDER;
      select: { survivalState: true; snapshot: { select: { periodEnd: true; supersededById: true } } };
    }): Promise<{ survivalState: string; snapshot?: { periodEnd: Date; supersededById: string | null } | null } | null>;
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
  now?: () => Date;
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
      ? deps.db.ownerCashflowCycle.findFirst({ where: { workspaceId, businessId }, orderBy: CURRENT_DIAGNOSIS_CYCLE_ORDER, select: { cashflowState: true, snapshot: { select: { periodEnd: true } } } })
      : Promise.resolve(null),
    businessId
      ? deps.db.ownerFinanceCycle.findFirst({ where: { workspaceId, businessId }, orderBy: CURRENT_DIAGNOSIS_CYCLE_ORDER, select: { survivalState: true, snapshot: { select: { periodEnd: true, supersededById: true } } } })
      : Promise.resolve(null),
    resolveSensitivity(recommendationId, workspaceId, deps),
  ]);
  const reading = currentCashFinanceReading(
    cashRow ? { state: cashRow.cashflowState, snapshot: cashRow.snapshot } : null,
    finRow ? { state: finRow.survivalState, snapshot: finRow.snapshot } : null,
    (deps.now ?? (() => new Date()))().getTime()
  );
  // A missing current reading (no business, unattributable, no diagnosis, or amended Finance figures) is
  // AT_RISK — the gate's unchanged base semantics.
  const state = (reading.gateState ?? "AT_RISK") as FinancialHealthState;
  const halfMissing = !reading.cashState || !reading.financeState;
  assertCashSafetyForPromotion(state, halfMissing ? "AT_RISK" : state, sensitivity, recommendationId);
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

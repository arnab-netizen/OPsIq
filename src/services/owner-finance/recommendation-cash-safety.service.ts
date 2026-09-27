/**
 * Modules 4 & 5 — cash/finance-safety enforcement at recommendation promotion (Formal Consulting Mode).
 *
 * The pure gate and its sensitivity rules are the pre-consolidation gate's, unchanged
 * (cash-safety-gate.ts: the WORSE of the cash and survival states; a missing half is AT_RISK — growth
 * blocked, non-growth allowed). No Owner-Mode source arbitration happens here.
 *
 * Which states it is given — TEMPORARY UNSCOPED-CONSULTING FAIL-SAFE. A recommendation belongs to an
 * engagement, which carries no owner business. So:
 *   - one real business → that business's current cash and Finance states (base-compatible);
 *   - several real businesses → the WORST valid current state across them. Never an average, never the
 *     latest-inserted business (the base's accidental "last written business wins"), never looser than
 *     any one business's own reading;
 *   - no business with a valid current reading → AT_RISK (both halves missing).
 * Only current valid evidence counts: each business's current diagnosis cycles (current-diagnosis-cycle.ts
 * order) over periods that have ENDED (currentEvidenceWhere — a future-dated period never counts), and a
 * Finance cycle only while its snapshot is still the owner's figures (an amended/superseded snapshot's
 * cycle is no longer effective). A business with no valid current reading contributes nothing; one with
 * only one half contributes that half and AT_RISK for the missing one (the base's missing-half rule).
 * This is a fail-safe for Consulting recommendations that cannot be attributed to one business — it is
 * not Owner-Mode arbitration (current-cash-finance-reading.ts), and it is replaced once recommendations
 * carry their business.
 * Enforced only when the workspace opted into the Owner Mode governance suite (same flag as M1/M2/M3).
 */

import {
  assertCashSafetyForPromotion,
  worseState,
  type FinancialHealthState,
} from "@/domain/owner-finance/cash-safety-gate";
import { mapImpactAreaToSensitivity, RecommendationSensitivity } from "@/domain/owner-mode/recommendation-input-quality-gate";
import { CURRENT_DIAGNOSIS_CYCLE_ORDER, currentEvidenceWhere } from "@/services/owner-spine/current-diagnosis-cycle";

const VALID_STATES = new Set(["SAFE", "WATCH", "AT_RISK", "CRITICAL", "INSOLVENT_RISK"]);

function validState(v: string | null | undefined): FinancialHealthState | null {
  return v && VALID_STATES.has(v) ? (v as FinancialHealthState) : null;
}

/**
 * The state one business contributes, or null when it has no valid current reading at all. A missing
 * half is AT_RISK (blocks growth, allows non-growth — the spec requires proven cash safety before
 * growth, not before everything).
 */
export function consultingBusinessCashState(cash: string | null | undefined, finance: string | null | undefined): FinancialHealthState | null {
  const c = validState(cash);
  const f = validState(finance);
  if (c === null && f === null) return null;
  return worseState(c ?? "AT_RISK", f ?? "AT_RISK");
}

/** The worst contributed state across businesses; AT_RISK when none has a valid current reading. */
export function consultingWorstCashState(states: ReadonlyArray<FinancialHealthState | null>): FinancialHealthState {
  let out: FinancialHealthState | null = null;
  for (const s of states) if (s) out = out ? worseState(out, s) : s;
  return out ?? "AT_RISK";
}

interface CashDb {
  clientAccount: {
    findUnique(args: { where: { id: string }; select: { requireBusinessImpactAssessment: true } }): Promise<{ requireBusinessImpactAssessment: boolean } | null>;
  };
  ownerBusiness: {
    findMany(args: {
      where: { workspaceId: string; isActive: true; isFixtureBusiness: false };
      select: { id: true };
    }): Promise<Array<{ id: string }>>;
  };
  ownerCashflowCycle: {
    findFirst(args: {
      where: { workspaceId: string; businessId: string; snapshot: { periodEnd: { lte: Date } } };
      orderBy: typeof CURRENT_DIAGNOSIS_CYCLE_ORDER;
      select: { cashflowState: true };
    }): Promise<{ cashflowState: string } | null>;
  };
  ownerFinanceCycle: {
    findFirst(args: {
      where: { workspaceId: string; businessId: string; snapshot: { periodEnd: { lte: Date }; supersededById: null } };
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

/** Enforce the cash-safety gate using the current persisted M4/M5 states (see the module doc). */
export async function enforceCashSafetyForPromotion(
  recommendationId: string,
  workspaceId: string,
  injected?: CashDeps,
  now: Date = new Date()
): Promise<void> {
  const deps = injected ?? (await resolveDefaultDeps());
  const businesses = await deps.db.ownerBusiness.findMany({
    where: { workspaceId, isActive: true, isFixtureBusiness: false },
    select: { id: true },
  });
  const current = currentEvidenceWhere(now);
  const [perBusiness, sensitivity] = await Promise.all([
    Promise.all(businesses.map(async ({ id: businessId }) => {
      const [cashRow, finRow] = await Promise.all([
        deps.db.ownerCashflowCycle.findFirst({ where: { workspaceId, businessId, ...current }, orderBy: CURRENT_DIAGNOSIS_CYCLE_ORDER, select: { cashflowState: true } }),
        deps.db.ownerFinanceCycle.findFirst({
          where: { workspaceId, businessId, snapshot: { ...current.snapshot, supersededById: null } },
          orderBy: CURRENT_DIAGNOSIS_CYCLE_ORDER,
          select: { survivalState: true },
        }),
      ]);
      return consultingBusinessCashState(cashRow?.cashflowState, finRow?.survivalState);
    })),
    resolveSensitivity(recommendationId, workspaceId, deps),
  ]);
  const state = consultingWorstCashState(perBusiness);
  // The pure gate takes the worse of its two inputs; the worst valid current state is both.
  assertCashSafetyForPromotion(state, state, sensitivity, recommendationId);
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

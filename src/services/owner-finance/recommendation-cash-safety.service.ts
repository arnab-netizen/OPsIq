/**
 * Modules 4 & 5 — cash/finance-safety enforcement at recommendation promotion (Formal Consulting Mode).
 *
 * The pure gate and its sensitivity rules are the pre-consolidation gate's, unchanged
 * (cash-safety-gate.ts: the WORSE of the cash and survival states; a missing half is AT_RISK — growth
 * blocked, non-growth allowed). No Owner-Mode source arbitration happens here.
 *
 * Which states it is given — TEMPORARY UNSCOPED-CONSULTING FAIL-SAFE. A recommendation belongs to an
 * engagement, which carries no owner business. So:
 *   - each real business contributes ONE state (consultingBusinessEvidenceState, below);
 *   - several real businesses → the WORST contributed state across them. Never an average, never the
 *     latest-inserted business (the base's accidental "last written business wins"), never looser than
 *     any one business's own reading;
 *   - no business with any reading → AT_RISK (both halves missing).
 * What one business contributes, per half (Cash flow's cashflowState, Finance's survivalState), from its
 * current diagnosis cycle (current-diagnosis-cycle.ts order) over COMPLETED periods (currentEvidenceWhere):
 *   - a half whose figures are valid and current is used as is;
 *   - a half that is not verified — out of date (older than the freshness window) or, for Finance, an
 *     AMENDED snapshot not yet re-diagnosed — keeps its last-known state only when that state is unsafe
 *     (it never becomes safer: the last completed Finance diagnosis is never replaced by an OLDER period's
 *     cycle); a SAFE/WATCH unverified half counts as missing;
 *   - a missing half is AT_RISK (the base's missing-half rule: growth blocked, non-growth allowed);
 *   - the in-progress current period (PROVISIONAL — provisional-cash-finance.ts) only tightens: effective =
 *     worse(completed state, provisional state); provisional SAFE/WATCH alone never proves safety (the
 *     missing halves stay AT_RISK); a genuinely future period never counts.
 * With one real business and completed, current, unamended figures this is exactly the base rule
 * (worse of the two halves). It is a fail-safe for Consulting recommendations that cannot be attributed to
 * one business — not Owner-Mode arbitration (current-cash-finance-reading.ts) — and it is replaced once
 * recommendations carry their business.
 * Enforced only when the workspace opted into the Owner Mode governance suite (same flag as M1/M2/M3).
 */

import {
  assertCashSafetyForPromotion,
  worseState,
  type FinancialHealthState,
} from "@/domain/owner-finance/cash-safety-gate";
import { mapImpactAreaToSensitivity, RecommendationSensitivity } from "@/domain/owner-mode/recommendation-input-quality-gate";
import { CURRENT_DIAGNOSIS_CYCLE_ORDER, currentEvidenceWhere } from "@/services/owner-spine/current-diagnosis-cycle";
import { currentEvidenceTime } from "@/services/owner-spine/current-cash-finance-reading";
import { loadProvisionalCashFinance, type ProvisionalCashFinanceDb } from "@/services/owner-spine/provisional-cash-finance";
import { OWNER_DECISION_STALE_EVIDENCE_DAYS } from "@/services/owner-home/owner-decision-candidates";

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

const SAFE_STATES = new Set(["SAFE", "WATCH"]);
const DAY_MS = 86_400_000;

/** One half's completed reading: its state and snapshot (period, amendment). */
export interface ConsultingHalfRead {
  state: string | null | undefined;
  snapshot?: { periodEnd?: unknown; supersededById?: unknown } | null;
}

/**
 * What one business contributes (see the module doc): each completed half, verified or — when unverified
 * (stale, amended) — kept only while unsafe; the missing-half rule; then tightened (never relaxed) by the
 * in-progress period. null when the business has no reading at all.
 */
export function consultingBusinessEvidenceState(
  cash: ConsultingHalfRead | null,
  finance: ConsultingHalfRead | null,
  provisional: { cash?: { state?: string | null } | null; finance?: { state?: string | null } | null } | null,
  nowMs: number
): FinancialHealthState | null {
  const staleCutoffMs = nowMs - OWNER_DECISION_STALE_EVIDENCE_DAYS * DAY_MS;
  const half = (r: ConsultingHalfRead | null): FinancialHealthState | null => {
    const st = validState(r?.state ?? null);
    if (st === null) return null;
    const verified = currentEvidenceTime(r?.snapshot, staleCutoffMs, nowMs) !== null;
    return verified || !SAFE_STATES.has(st) ? st : null;
  };
  const anyCompleted = validState(cash?.state ?? null) !== null || validState(finance?.state ?? null) !== null;
  const completed = anyCompleted ? consultingBusinessCashState(half(cash) ?? "AT_RISK", half(finance) ?? "AT_RISK") : null;
  // The in-progress period's states only tighten (worse of); none → the completed state as is.
  let prov: FinancialHealthState | null = null;
  for (const st of [validState(provisional?.cash?.state ?? null), validState(provisional?.finance?.state ?? null)]) {
    if (st) prov = prov ? worseState(prov, st) : st;
  }
  if (prov === null) return completed;
  return worseState(completed ?? "AT_RISK", prov);
}

/** The worst contributed state across businesses; AT_RISK when none has a valid current reading. */
export function consultingWorstCashState(states: ReadonlyArray<FinancialHealthState | null>): FinancialHealthState {
  let out: FinancialHealthState | null = null;
  for (const s of states) if (s) out = out ? worseState(out, s) : s;
  return out ?? "AT_RISK";
}

interface CashDb extends ProvisionalCashFinanceDb {
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
      where: Record<string, unknown>;
      orderBy: typeof CURRENT_DIAGNOSIS_CYCLE_ORDER;
      select: Record<string, unknown>;
    }): Promise<unknown>;
  };
  ownerFinanceCycle: {
    findFirst(args: {
      where: Record<string, unknown>;
      orderBy: typeof CURRENT_DIAGNOSIS_CYCLE_ORDER;
      select: Record<string, unknown>;
    }): Promise<unknown>;
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
      // The latest COMPLETED cycle of each half, as recorded — an amended Finance snapshot's cycle included
      // (never skipped for an older period's), judged by consultingBusinessEvidenceState.
      const [cashRow, finRow, provisional] = (await Promise.all([
        deps.db.ownerCashflowCycle.findFirst({
          where: { workspaceId, businessId, ...current },
          orderBy: CURRENT_DIAGNOSIS_CYCLE_ORDER,
          select: { cashflowState: true, snapshot: { select: { periodEnd: true } } },
        }),
        deps.db.ownerFinanceCycle.findFirst({
          where: { workspaceId, businessId, ...current },
          orderBy: CURRENT_DIAGNOSIS_CYCLE_ORDER,
          select: { survivalState: true, snapshot: { select: { periodEnd: true, supersededById: true } } },
        }),
        loadProvisionalCashFinance(deps.db, { workspaceId, businessId }, now),
      ])) as [
        { cashflowState: string; snapshot?: { periodEnd: Date } | null } | null,
        { survivalState: string; snapshot?: { periodEnd: Date; supersededById: string | null } | null } | null,
        Awaited<ReturnType<typeof loadProvisionalCashFinance>>,
      ];
      return consultingBusinessEvidenceState(
        cashRow ? { state: cashRow.cashflowState, snapshot: cashRow.snapshot ?? null } : null,
        finRow ? { state: finRow.survivalState, snapshot: finRow.snapshot ?? null } : null,
        provisional,
        now.getTime()
      );
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

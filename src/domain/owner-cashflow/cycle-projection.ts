/**
 * Owner Cashflow — READ-TIME projection of a persisted diagnosis cycle (pure, deterministic, no I/O, no writes).
 *
 * A cycle persisted BEFORE the complete-cash-position fix (or any cycle whose snapshot cannot establish total cash)
 * may carry conclusions that depended on a partial cash total: a false INSOLVENT_RISK / low-runway finding and its
 * action, a danger score built from that, or a safe-looking state with a high confidence. The persisted rows stay
 * immutable; every CURRENT surface reads them through this projection instead:
 *   - COMPLETE position (both cash components known, a known 0 included): the persisted cycle is returned untouched.
 *   - INCOMPLETE position: the conclusions are re-evaluated from the snapshot by the CURRENT engine (the same
 *     diagnoseCashflowSnapshot that would run today — no second rule): state and scores are the current engine's
 *     (WATCH unless an independently measured risk is stronger), and only findings/actions whose finding code the
 *     current engine STILL raises for that snapshot are kept — so a measured overdue-receivables risk survives while
 *     a cash-derived claim that rested on a partial total does not. Nothing is invented: no new rows, no new fields
 *     beyond `cashPosition`, and unknown is never turned into zero, safe, or danger.
 * "Is the position complete" is the one primitive (cashflowCashPositionMissingComponents); the projection only says
 * what remains supportable once it is not.
 */
import { cashflowCashPositionMissingComponents, type CashflowCashComponent } from "@/domain/owner-finance/liquidity";
import { diagnoseCashflowSnapshot } from "./diagnosis";
import { rowToCashflowInput } from "./row-input";

export interface CashPositionEvidence {
  /** The snapshot's cash columns were available to judge. False for a row read without them (nothing to judge). */
  judged: boolean;
  /** Total cash is established from BOTH components (always true when not judged — there is no signal). */
  complete: boolean;
  /** The unknown component(s), by field name. */
  missing: CashflowCashComponent[];
}

type SnapshotLike = Record<string, unknown>;

function cashColumns(snapshot: unknown): { cashInHand?: number | null; bankBalance?: number | null } | null {
  if (!snapshot || typeof snapshot !== "object") return null;
  const s = snapshot as SnapshotLike;
  if (!("cashInHand" in s) && !("bankBalance" in s)) return null;
  return { cashInHand: s.cashInHand as number | null | undefined, bankBalance: s.bankBalance as number | null | undefined };
}

/** The cash-position evidence of a cycle's snapshot (one primitive; see the module doc). */
export function cashPositionEvidence(snapshot: unknown): CashPositionEvidence {
  const cols = cashColumns(snapshot);
  if (!cols) return { judged: false, complete: true, missing: [] };
  const missing = cashflowCashPositionMissingComponents(cols);
  return { judged: true, complete: missing.length === 0, missing };
}

/** A persisted cycle row, as far as the projection needs it (extra fields pass through untouched). */
export interface CashflowCycleLike {
  cashflowState?: unknown;
  healthScore?: unknown;
  dangerScore?: unknown;
  opportunityScore?: unknown;
  dataConfidenceScore?: unknown;
  generatedAt?: unknown;
  createdAt?: unknown;
  snapshot?: unknown;
  findings?: unknown;
  actions?: unknown;
}

function asDate(v: unknown): Date | undefined {
  if (v instanceof Date) return v;
  if (typeof v === "string" || typeof v === "number") {
    const d = new Date(v);
    return Number.isNaN(d.getTime()) ? undefined : d;
  }
  return undefined;
}

/**
 * Project a persisted Cashflow cycle for CURRENT use. Returns the SAME row (plus `cashPosition`) when the position is
 * complete or was not judged; otherwise a copy whose state/scores/findings/actions are what the current engine
 * supports for that snapshot. Pure: never mutates `row`.
 */
export function projectCashflowCycleRow<T extends CashflowCycleLike>(row: T, opts: { now?: Date } = {}): T & { cashPosition: CashPositionEvidence } {
  const cashPosition = cashPositionEvidence(row.snapshot);
  if (!cashPosition.judged || cashPosition.complete) return { ...row, cashPosition };
  const dx = diagnoseCashflowSnapshot(rowToCashflowInput(row.snapshot), { now: opts.now ?? asDate(row.generatedAt) ?? asDate(row.createdAt) });
  const supported = new Set(dx.findings.map((f) => f.code));
  const keep = <R extends { code?: unknown; findingCode?: unknown }>(rows: unknown): R[] | undefined =>
    Array.isArray(rows) ? (rows as R[]).filter((r) => supported.has(String(r.code ?? r.findingCode))) : undefined;
  const findings = keep(row.findings);
  const actions = keep(row.actions);
  return {
    ...row,
    cashflowState: dx.metrics.cashflowState,
    healthScore: dx.metrics.cashflowHealthScore,
    dangerScore: dx.metrics.cashflowDangerScore,
    opportunityScore: dx.metrics.cashflowOpportunityScore,
    dataConfidenceScore: dx.metrics.dataConfidenceScore,
    ...(findings ? { findings } : {}),
    ...(actions ? { actions } : {}),
    cashPosition,
  };
}

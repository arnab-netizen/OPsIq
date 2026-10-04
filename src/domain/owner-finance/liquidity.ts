/**
 * Owner Finance — the ONE liquidity contract.
 *
 * Two different facts are recorded in two different places and must never be confused:
 *   - PHYSICAL CASH  — money held outside the bank (till, safe, petty cash). Persisted on the Finance
 *     snapshot as `cashOnHand`. Owner meaning since PR #586 (CASH_IN_HAND_COPY).
 *   - BANK CASH      — money in bank accounts. Recorded on a Cashflow snapshot (`bankBalance`) and
 *     enriched into the Finance engine input at diagnosis time (never stored on the Finance snapshot).
 * TOTAL LIQUID FUNDS = physical cash + bank cash, and it is only a fact when BOTH are known:
 *   - a known 0 is a fact; an absent value is UNKNOWN, never 0;
 *   - physical 0 with an unknown bank balance is "no till cash, total unknown" — NOT zero liquidity;
 *   - so a runway / cash-buffer claim is made only from a COMPLETE position and otherwise abstains.
 *
 * Bank-balance usability (the single rule, used by the diagnosis enrichment and the dashboard's
 * dependency check): a Cashflow bank balance is usable only if its period ends AT OR BEFORE the Finance
 * period end (a later balance never alters an earlier diagnosis) and no more than
 * `BANK_BALANCE_FRESHNESS_DAYS` days before it (stale evidence is not current liquidity). Anything else
 * is "unknown", never 0.
 *
 * Historical semantics: before PR #586 the Money form told owners that `cashOnHand` was "cash and bank
 * balance", so older snapshots may ALREADY contain bank money. No persisted marker distinguishes them
 * (HISTORICAL_CASH_SEMANTIC_VERSIONING=ABSENT); the only reliable discriminator is the snapshot's creation
 * time relative to the change. Snapshots created before `PHYSICAL_CASH_SEMANTICS_EFFECTIVE_FROM` are
 * LEGACY_AMBIGUOUS: bank is NOT added on top (that could double-count) and `cashOnHand` is used as
 * entered. Residual limits: rows created between the merge and the deploy, and amendments that copy a
 * pre-cutover value into a new row, cannot be told apart.
 *
 * Pure: no I/O, no clock.
 */
import type { FinancialSnapshotInput } from "./types";

/** The ONE freshness window for a bank balance relative to the Finance period end. */
export const BANK_BALANCE_FRESHNESS_DAYS = 45;

/** Merge instant of PR #586, which made `cashOnHand` mean physical cash only (2026-10-04T20:57:23+05:30). */
export const PHYSICAL_CASH_SEMANTICS_EFFECTIVE_FROM = "2026-10-04T15:27:23.000Z";

export type CashSemantics = "PHYSICAL_ONLY" | "LEGACY_AMBIGUOUS";

/**
 * Which meaning of `cashOnHand` a snapshot carries, from its creation time. An unknown creation time is
 * LEGACY_AMBIGUOUS (fail-safe: never add bank on top of a value that may already include it).
 */
export function cashSemanticsForSnapshot(createdAt: Date | string | null | undefined): CashSemantics {
  if (createdAt === null || createdAt === undefined) return "LEGACY_AMBIGUOUS";
  const t = createdAt instanceof Date ? createdAt.getTime() : new Date(createdAt).getTime();
  if (Number.isNaN(t)) return "LEGACY_AMBIGUOUS";
  return t >= new Date(PHYSICAL_CASH_SEMANTICS_EFFECTIVE_FROM).getTime() ? "PHYSICAL_ONLY" : "LEGACY_AMBIGUOUS";
}

const MS_PER_DAY = 86_400_000;

function toMs(d: Date | string): number {
  return d instanceof Date ? d.getTime() : new Date(d).getTime();
}

/**
 * The bank balance a Finance diagnosis may use, or `undefined` (unknown — never 0). Fail-closed:
 * absent, non-finite, future-dated (period ends after the Finance period end), stale (older than the
 * window) or unparseable dates all yield `undefined`.
 */
export function selectUsableBankBalance(args: {
  financePeriodEnd: Date | string;
  cashflow: { bankBalance: number | null | undefined; periodEnd: Date | string } | null | undefined;
  windowDays?: number;
}): number | undefined {
  const { cashflow } = args;
  if (!cashflow) return undefined;
  const balance = cashflow.bankBalance;
  if (balance === null || balance === undefined || !Number.isFinite(balance)) return undefined;
  const financeEnd = toMs(args.financePeriodEnd);
  const cashEnd = toMs(cashflow.periodEnd);
  if (Number.isNaN(financeEnd) || Number.isNaN(cashEnd)) return undefined;
  if (cashEnd > financeEnd) return undefined; // future relative to the Finance period
  const ageDays = (financeEnd - cashEnd) / MS_PER_DAY;
  if (ageDays > (args.windowDays ?? BANK_BALANCE_FRESHNESS_DAYS)) return undefined; // stale
  return balance;
}

export type LiquidityStatus =
  /** Both parts known (or a legacy `cashOnHand` taken as entered): total liquid funds is a fact. */
  | "COMPLETE"
  /** Physical cash known, bank unknown: total liquidity is NOT known. */
  | "BANK_UNKNOWN"
  /** Bank known, physical cash unknown: total liquidity is NOT known. */
  | "PHYSICAL_UNKNOWN"
  /** Neither known. */
  | "UNKNOWN";

export interface LiquidityPosition {
  semantics: CashSemantics;
  status: LiquidityStatus;
  /** Finance `cashOnHand` when known; `null` when absent (0 is a known value). */
  physicalCash: number | null;
  /** Usable bank cash when known and added; `null` when unknown or not added (legacy). */
  bankCash: number | null;
  /** Physical + bank, ONLY when status is COMPLETE; otherwise `null` (never a partial sum). */
  totalLiquidFunds: number | null;
}

function finiteOrNull(x: number | undefined | null): number | null {
  return x === undefined || x === null || !Number.isFinite(x) ? null : x;
}

/** Resolve the liquidity position of one Finance engine input. The only place cash parts are combined. */
export function resolveLiquidity(
  input: Pick<FinancialSnapshotInput, "cashOnHand" | "bankBalance" | "cashSemantics">
): LiquidityPosition {
  const semantics: CashSemantics = input.cashSemantics ?? "PHYSICAL_ONLY";
  const physicalCash = finiteOrNull(input.cashOnHand);

  if (semantics === "LEGACY_AMBIGUOUS") {
    // Older owners were told `cashOnHand` was "cash and bank balance": use it as entered, never add bank.
    return physicalCash === null
      ? { semantics, status: "UNKNOWN", physicalCash, bankCash: null, totalLiquidFunds: null }
      : { semantics, status: "COMPLETE", physicalCash, bankCash: null, totalLiquidFunds: physicalCash };
  }

  const bankCash = finiteOrNull(input.bankBalance);
  if (physicalCash !== null && bankCash !== null) {
    return { semantics, status: "COMPLETE", physicalCash, bankCash, totalLiquidFunds: physicalCash + bankCash };
  }
  if (physicalCash !== null) return { semantics, status: "BANK_UNKNOWN", physicalCash, bankCash: null, totalLiquidFunds: null };
  if (bankCash !== null) return { semantics, status: "PHYSICAL_UNKNOWN", physicalCash: null, bankCash, totalLiquidFunds: null };
  return { semantics, status: "UNKNOWN", physicalCash: null, bankCash: null, totalLiquidFunds: null };
}

/** Owner-facing sentence for an incomplete position (the abstention, in plain words). */
export const LIQUIDITY_UNCONFIRMED_STATEMENT =
  "Your bank balance is not yet known, so OpsIQ cannot confirm how long your cash will last. Cash in hand alone is not your total cash.";

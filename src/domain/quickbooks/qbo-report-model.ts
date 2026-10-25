/**
 * QuickBooks Online V1 — report observation vocabulary and period policy (pure: no DB, no network, no clock reads).
 *
 * V1 is READ-ONLY and acquires exactly four accounting reports. Everything else (customers, invoices, bills) is
 * deliberately NOT mirrored: no current OpsIQ consumer needs entity-level data (see QBO_V1_ARCHITECTURE.md).
 */
import type { QboReportName } from "./qbo-read-catalog";

export const QBO_REPORT_TYPES = ["PROFIT_AND_LOSS", "BALANCE_SHEET", "AGED_RECEIVABLES", "AGED_PAYABLES"] as const;
export type QboReportType = (typeof QBO_REPORT_TYPES)[number];

export const QBO_REPORT_API_NAME: Readonly<Record<QboReportType, QboReportName>> = Object.freeze({
  PROFIT_AND_LOSS: "ProfitAndLoss",
  BALANCE_SHEET: "BalanceSheet",
  AGED_RECEIVABLES: "AgedReceivables",
  AGED_PAYABLES: "AgedPayables",
});

export const QBO_ACCOUNTING_BASES = ["ACCRUAL", "CASH"] as const;
export type QboAccountingBasis = (typeof QBO_ACCOUNTING_BASES)[number];

/**
 * V1 default accounting basis. OpsIQ has no business-level basis setting, so V1 requests ACCRUAL for every report and
 * exposes that choice in the owner status. Cash and accrual reports are never mixed: canonical materialization requires
 * every contributing observation to carry one identical basis.
 */
export const QBO_V1_DEFAULT_BASIS: QboAccountingBasis = "ACCRUAL";

/** Bumped when parsing/derivation semantics change; stored with every observation. */
export const QBO_PARSER_VERSION = 1;

/**
 * Initial baseline: the last 12 CLOSED calendar months. Rationale: Finance diagnosis reads the latest completed period and
 * compares against history; twelve months gives a full seasonal year without importing the company's entire ledger.
 * 12 months x 4 reports = 48 report reads (well inside Intuit's per-realm limits; see QBO_PROVIDER_LIMITS).
 */
export const QBO_BASELINE_MONTHS = 12;

/** Closed months re-read on every refresh, so a backdated change to a recent closed month is picked up within one run. */
export const QBO_REFRESH_RECENT_MONTHS = 3;

/** A full re-read of the whole baseline window at most this often (reconciliation for missed webhooks / old backdating). */
export const QBO_FULL_RECONCILE_INTERVAL_DAYS = 7;

/** Months fetched per sync run before the run yields and schedules its own continuation. */
export const QBO_MONTHS_PER_RUN = 3;

/** Freshness: a connection whose last success is older than this is shown as stale. V1 refreshes daily. */
export const QBO_STALE_AFTER_HOURS = 36;

/** Largest magnitude accepted from a report (matches the Finance validators' 1e12 bound). */
export const QBO_MAX_AMOUNT = 1e12;

/** ISO calendar date (UTC), `YYYY-MM-DD`. */
export type IsoDate = string;

export function isIsoDate(v: unknown): v is IsoDate {
  if (typeof v !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(v)) return false;
  const d = new Date(`${v}T00:00:00.000Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === v;
}

export function toIsoDate(d: Date): IsoDate {
  return d.toISOString().slice(0, 10);
}

export function fromIsoDate(v: IsoDate): Date {
  return new Date(`${v}T00:00:00.000Z`);
}

export interface MonthPeriod {
  /** First day of the month (UTC). */
  start: IsoDate;
  /** Last day of the month (UTC) — the same period convention manual Finance entries use (periodEnd = last day, 00:00Z). */
  end: IsoDate;
}

export function monthOf(year: number, monthIndex0: number): MonthPeriod {
  const start = new Date(Date.UTC(year, monthIndex0, 1));
  const end = new Date(Date.UTC(year, monthIndex0 + 1, 0));
  return { start: toIsoDate(start), end: toIsoDate(end) };
}

/**
 * The most recent CLOSED calendar months, newest first. A month is closed once `now` (UTC) is on or after the first day
 * of the following month. The in-progress month is never returned: no canonical snapshot is generated for it, so there
 * is no daily version churn.
 */
/**
 * A month counts as closed one day after it ends in UTC, so it has also ended in every company time zone and the last day's
 * entries exist before the figures are read (otherwise a partial month would be imported and then amended).
 */
const CLOSE_GRACE_MS = 24 * 3_600_000;
const closureClock = (now: Date) => new Date(now.getTime() - CLOSE_GRACE_MS);

export function closedMonths(now: Date, count: number): MonthPeriod[] {
  const out: MonthPeriod[] = [];
  const clock = closureClock(now);
  let y = clock.getUTCFullYear();
  let m = clock.getUTCMonth() - 1; // previous month is the newest candidate
  for (let i = 0; i < count; i++) {
    if (m < 0) {
      m += 12;
      y -= 1;
    }
    out.push(monthOf(y, m));
    m -= 1;
  }
  return out;
}

export function isClosedMonth(period: MonthPeriod, now: Date): boolean {
  const clock = closureClock(now);
  return period.end < toIsoDate(new Date(Date.UTC(clock.getUTCFullYear(), clock.getUTCMonth(), 1)));
}

export type QboFreshness = "FRESH" | "STALE" | "NEVER";

export function freshnessOf(lastSuccessAt: Date | null, now: Date): QboFreshness {
  if (!lastSuccessAt) return "NEVER";
  return now.getTime() - lastSuccessAt.getTime() > QBO_STALE_AFTER_HOURS * 3_600_000 ? "STALE" : "FRESH";
}

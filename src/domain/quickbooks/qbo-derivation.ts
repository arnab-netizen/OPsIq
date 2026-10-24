/**
 * QuickBooks Online V1 — derivation of canonical OpsIQ figures from report observations (pure).
 *
 * Only values that QuickBooks genuinely states under the SAME meaning OpsIQ gives them are derived. Everything else stays
 * unknown — never zero, never estimated:
 *
 *   Finance snapshot (OwnerFinancialSnapshot)      revenue            <- P&L "Income" total (operating income; Other Income excluded)
 *                                                  costOfGoods        <- P&L "Cost of Goods Sold" total
 *                                                  receivables        <- Aged Receivables grand total
 *                                                  overdueReceivables <- Aged Receivables total minus its "Current" bucket
 *                                                  payables           <- Aged Payables grand total
 *                                                  overduePayables    <- Aged Payables total minus its "Current" bucket
 *   Cashflow snapshot (OwnerCashflowSnapshot)      bankBalance        <- Balance Sheet "Bank Accounts" total
 *                                                  receivables / receivablesOverdue / payables / payablesOverdue (same as above)
 *
 * NOT derived (QuickBooks does not state them under OpsIQ's definition): fixedCosts, variableCosts, payroll, rent,
 * utilities, marketingSpend, debtPayments, totalDebtOutstanding, inventoryCashLock, and Finance `cashOnHand` — OpsIQ defines
 * that as PHYSICAL cash (till/safe) distinct from bank cash (owner-finance/liquidity.ts), and QuickBooks cannot distinguish them.
 *
 * Evidence quality of ledger-derived figures is ACTUAL ("These numbers come from your bank, accounts or sales records.",
 * owner-finance/evidence-quality.ts) — that is exactly what a closed-period accounting ledger is.
 */
import type { IsoDate, QboAccountingBasis, QboReportType } from "./qbo-report-model";

export const QBO_MATERIALIZATION_REFUSALS = [
  "NO_DERIVABLE_FIGURES",
  "CURRENCY_UNKNOWN",
  "CURRENCY_MISMATCH",
  "BASIS_MISMATCH",
  "PERIOD_NOT_CLOSED",
  "SANDBOX_ISOLATION",
  "REALM_MISMATCH",
  "FINANCE_VALIDATION_REFUSED",
  "CONNECTION_NOT_ACTIVE",
] as const;
export type QboMaterializationRefusal = (typeof QBO_MATERIALIZATION_REFUSALS)[number];

/** Owner-safe wording for each bounded refusal (no provider detail). */
export const QBO_REFUSAL_OWNER_TEXT: Readonly<Record<QboMaterializationRefusal, string>> = Object.freeze({
  NO_DERIVABLE_FIGURES: "QuickBooks had no figures OpsIQ can use for this month.",
  CURRENCY_UNKNOWN: "QuickBooks did not state the report currency, so these figures were not used.",
  CURRENCY_MISMATCH: "QuickBooks reports in a different currency than this business, so these figures were not used. OpsIQ does not convert currencies.",
  BASIS_MISMATCH: "QuickBooks returned reports on different accounting bases (cash vs accrual), so these figures were not combined.",
  PERIOD_NOT_CLOSED: "This month has not closed yet.",
  SANDBOX_ISOLATION: "QuickBooks sandbox data is never added to a real business.",
  REALM_MISMATCH: "These months were filled from a different QuickBooks company, so they were left unchanged.",
  FINANCE_VALIDATION_REFUSED: "QuickBooks figures for this month contradict each other, so they were not used.",
  CONNECTION_NOT_ACTIVE: "The QuickBooks connection is not active.",
});

export interface QboObservationView {
  id: string;
  reportType: QboReportType;
  periodStart: IsoDate;
  periodEnd: IsoDate;
  basis: QboAccountingBasis;
  currency: string | null;
  noReportData: boolean;
  values: Record<string, number | null>;
  version: number;
}

export interface MonthObservations {
  pl?: QboObservationView | null;
  bs?: QboObservationView | null;
  ar?: QboObservationView | null;
  ap?: QboObservationView | null;
}

export interface DerivedFigures {
  finance: {
    revenue: number | null;
    costOfGoods: number | null;
    receivables: number | null;
    overdueReceivables: number | null;
    payables: number | null;
    overduePayables: number | null;
  };
  cashflow: {
    bankBalance: number | null;
    receivables: number | null;
    receivablesOverdue: number | null;
    payables: number | null;
    payablesOverdue: number | null;
  };
  /** Figures QuickBooks stated but OpsIQ cannot represent (negative where the model is non-negative). */
  omitted: Record<string, "NEGATIVE_VALUE">;
  basis: QboAccountingBasis;
  currency: string;
  observationIds: { pl: string | null; bs: string | null; ar: string | null; ap: string | null };
}

export type DeriveResult = { ok: true; figures: DerivedFigures } | { ok: false; refusal: QboMaterializationRefusal };

function nonNegative(name: string, v: number | null | undefined, omitted: DerivedFigures["omitted"]): number | null {
  if (v === null || v === undefined) return null;
  if (v < 0) {
    omitted[name] = "NEGATIVE_VALUE";
    return null;
  }
  return v;
}

/** past-due = total − current, only when BOTH are stated; a negative result (net credits) is not representable. */
function pastDue(name: string, o: QboObservationView | null | undefined, omitted: DerivedFigures["omitted"]): number | null {
  if (!o) return null;
  const total = o.values.total;
  const current = o.values.current;
  if (total === null || total === undefined || current === null || current === undefined) return null;
  const d = Math.round((total - current) * 100) / 100;
  return nonNegative(name, d, omitted);
}

export function deriveMonthlyFigures(
  obs: MonthObservations,
  ctx: { businessCurrency: string; expectedBasis: QboAccountingBasis },
): DeriveResult {
  const present = [obs.pl, obs.bs, obs.ar, obs.ap].filter((o): o is QboObservationView => !!o);
  if (present.length === 0) return { ok: false, refusal: "NO_DERIVABLE_FIGURES" };

  if (present.some((o) => o.currency === null)) return { ok: false, refusal: "CURRENCY_UNKNOWN" };
  const business = ctx.businessCurrency.trim().toUpperCase();
  if (present.some((o) => (o.currency as string) !== business)) return { ok: false, refusal: "CURRENCY_MISMATCH" };
  if (present.some((o) => o.basis !== ctx.expectedBasis)) return { ok: false, refusal: "BASIS_MISMATCH" };

  const omitted: DerivedFigures["omitted"] = {};
  const arTotal = obs.ar ? obs.ar.values.total ?? null : null;
  const apTotal = obs.ap ? obs.ap.values.total ?? null : null;
  const receivables = nonNegative("receivables", arTotal, omitted);
  const payables = nonNegative("payables", apTotal, omitted);
  const overdueReceivables = pastDue("overdueReceivables", obs.ar, omitted);
  const overduePayables = pastDue("overduePayables", obs.ap, omitted);

  const figures: DerivedFigures = {
    finance: {
      revenue: nonNegative("revenue", obs.pl && !obs.pl.noReportData ? obs.pl.values.income : null, omitted),
      costOfGoods: nonNegative("costOfGoods", obs.pl && !obs.pl.noReportData ? obs.pl.values.cogs : null, omitted),
      receivables,
      overdueReceivables,
      payables,
      overduePayables,
    },
    cashflow: {
      bankBalance: nonNegative("bankBalance", obs.bs && !obs.bs.noReportData ? obs.bs.values.bankAccounts : null, omitted),
      receivables,
      receivablesOverdue: overdueReceivables,
      payables,
      payablesOverdue: overduePayables,
    },
    omitted,
    basis: ctx.expectedBasis,
    currency: business,
    observationIds: { pl: obs.pl?.id ?? null, bs: obs.bs?.id ?? null, ar: obs.ar?.id ?? null, ap: obs.ap?.id ?? null },
  };

  const anyFinance = Object.values(figures.finance).some((v) => v !== null);
  const anyCash = Object.values(figures.cashflow).some((v) => v !== null);
  if (!anyFinance && !anyCash) return { ok: false, refusal: "NO_DERIVABLE_FIGURES" };
  return { ok: true, figures };
}

/** Do two optional figures differ materially? Compared at cent precision; null on the incoming side never counts as a change. */
export function figuresDiffer(recorded: number | null | undefined, incoming: number | null): boolean {
  if (incoming === null) return false;
  if (recorded === null || recorded === undefined) return true;
  return Math.round(recorded * 100) !== Math.round(incoming * 100);
}

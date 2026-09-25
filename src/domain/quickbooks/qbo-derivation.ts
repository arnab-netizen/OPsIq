/**
 * QuickBooks Online — derives OpsIQ snapshot inputs from QBO reports.
 *
 * Feeds `FinancialSnapshotCreateInput` (src/domain/owner-finance/validation.ts)
 * and `CashflowSnapshotCreateInput` (src/domain/owner-cashflow/validation.ts).
 * This module NEVER invents accounting facts: a field is populated only when
 * its source report group is present and numeric; otherwise the field is
 * omitted (not defaulted to 0) and an issue is recorded explaining why. The
 * governed snapshot services still run their own Zod validation on the
 * returned partials — this module only decides what CAN be safely populated
 * from QBO data.
 *
 * Pure module: no DB, no network.
 */

import { getAgingBuckets, getReportGroupTotal, parseQboReport, type ParsedQboReport } from "./qbo-report-parser";

/** Accepts either a raw `/reports/{ReportName}` JSON body or an already-parsed report. */
export type QboReportInput = ParsedQboReport | Record<string, unknown> | null | undefined;

function toParsed(input: QboReportInput, fallbackName: string): ParsedQboReport | null {
  if (!input) return null;
  if (typeof input === "object" && "rows" in input && Array.isArray((input as ParsedQboReport).rows) && "columns" in input) {
    return input as ParsedQboReport;
  }
  const parsed = parseQboReport(input);
  return { ...parsed, name: parsed.name ?? fallbackName };
}

export interface DeriveSnapshotInputsParams {
  profitAndLoss?: QboReportInput;
  balanceSheet?: QboReportInput;
  agedReceivables?: QboReportInput;
  agedPayables?: QboReportInput;
  periodStart: string;
  periodEnd: string;
  currency: string;
}

/** Subset of FinancialSnapshotCreateInput this module can populate from QBO reports. */
export interface DerivedFinancialFields {
  periodStart: string;
  periodEnd: string;
  currency: string;
  revenue?: number;
  costOfGoodsOrServices?: number;
  /**
   * Never populated by this module. QBO's P&L "Expenses" group is total
   * operating expenses with no fixed/variable split, so it cannot be mapped
   * to this field without guessing an accounting classification — see the
   * comment above the ProfitAndLoss block in deriveSnapshotInputsFromReports.
   * Field kept in the type only because it's part of FinancialSnapshotCreateInput.
   */
  fixedCosts?: number;
  receivables?: number;
  receivablesOverdue?: number;
  payables?: number;
  payablesOverdue?: number;
  cashOnHand?: number;
}

/** Subset of CashflowSnapshotCreateInput this module can populate from QBO reports. */
export interface DerivedCashflowFields {
  periodStart: string;
  periodEnd: string;
  currency: string;
  bankBalance?: number;
  receivables?: number;
  receivablesOverdue?: number;
  payables?: number;
  payablesOverdue?: number;
}

export interface DeriveSnapshotInputsResult {
  financial: DerivedFinancialFields;
  cashflow: DerivedCashflowFields;
  issues: string[];
  /** Names of the reports actually consulted (only those supplied and non-empty). */
  sourceReports: string[];
}

function overdueFromAging(total: number | null, current: number | null): number | null {
  if (total === null || current === null) return null;
  const overdue = total - current;
  // Guard against a malformed report (overdue < 0 would mean current > total).
  return overdue >= 0 ? overdue : null;
}

export function deriveSnapshotInputsFromReports(params: DeriveSnapshotInputsParams): DeriveSnapshotInputsResult {
  const issues: string[] = [];
  const sourceReports: string[] = [];

  const pnl = toParsed(params.profitAndLoss, "ProfitAndLoss");
  const bs = toParsed(params.balanceSheet, "BalanceSheet");
  const ar = toParsed(params.agedReceivables, "AgedReceivables");
  const ap = toParsed(params.agedPayables, "AgedPayables");

  const financial: DerivedFinancialFields = {
    periodStart: params.periodStart,
    periodEnd: params.periodEnd,
    currency: params.currency,
  };
  const cashflow: DerivedCashflowFields = {
    periodStart: params.periodStart,
    periodEnd: params.periodEnd,
    currency: params.currency,
  };

  // ── Profit & Loss → revenue, cost of goods/services ──────────────────────
  // fixedCosts is intentionally NEVER derived from P&L. QBO's "Expenses"
  // group is total operating expenses with no fixed/variable split, and
  // OpsIQ's fixedCostBurdenPct / breakEvenRevenue / survivalState
  // calculations (src/services/owner-finance/metrics.ts) treat fixedCosts as
  // an owner-asserted, already-classified figure — silently feeding it the
  // unclassified Expenses total would misclassify variable spend as fixed
  // and could flip a business into AT_RISK on a fabricated number. OpsIQ
  // does not guess accounting classifications it cannot verify.
  if (pnl) {
    sourceReports.push(pnl.name ?? "ProfitAndLoss");

    const revenue = getReportGroupTotal(pnl, "Income");
    if (revenue !== null) financial.revenue = revenue;
    else issues.push("ProfitAndLoss: no 'Income' group found — revenue not derived");

    const cogs = getReportGroupTotal(pnl, "COGS");
    if (cogs !== null) financial.costOfGoodsOrServices = cogs;
    else issues.push("ProfitAndLoss: no 'COGS' group found — costOfGoodsOrServices not derived");

    issues.push("ProfitAndLoss 'Expenses' mixes fixed and variable costs — not classified; OpsIQ does not guess");
  } else {
    issues.push("ProfitAndLoss report not supplied — revenue, costOfGoodsOrServices not derived");
  }

  // ── Balance Sheet → cash on hand / bank balance ──────────────────────────
  if (bs) {
    sourceReports.push(bs.name ?? "BalanceSheet");

    const bankTotal = getReportGroupTotal(bs, "BankAccounts");
    if (bankTotal !== null) {
      financial.cashOnHand = bankTotal;
      cashflow.bankBalance = bankTotal;
    } else {
      issues.push("BalanceSheet: no 'BankAccounts' group found — cashOnHand/bankBalance not derived");
    }
  } else {
    issues.push("BalanceSheet report not supplied — cashOnHand/bankBalance not derived");
  }

  // ── Aged Receivables → receivables, receivablesOverdue ───────────────────
  if (ar) {
    sourceReports.push(ar.name ?? "AgedReceivables");
    const buckets = getAgingBuckets(ar);
    if (buckets.total !== null) {
      financial.receivables = buckets.total;
      cashflow.receivables = buckets.total;
    } else {
      issues.push("AgedReceivables: no TOTAL row found — receivables not derived");
    }
    const overdue = overdueFromAging(buckets.total, buckets.current);
    if (overdue !== null) {
      financial.receivablesOverdue = overdue;
      cashflow.receivablesOverdue = overdue;
    } else if (buckets.total !== null) {
      issues.push("AgedReceivables: missing/inconsistent Current column — receivablesOverdue not derived");
    }
  } else {
    issues.push("AgedReceivables report not supplied — receivables/receivablesOverdue not derived");
  }

  // ── Aged Payables → payables, payablesOverdue ────────────────────────────
  if (ap) {
    sourceReports.push(ap.name ?? "AgedPayables");
    const buckets = getAgingBuckets(ap);
    if (buckets.total !== null) {
      financial.payables = buckets.total;
      cashflow.payables = buckets.total;
    } else {
      issues.push("AgedPayables: no TOTAL row found — payables not derived");
    }
    const overdue = overdueFromAging(buckets.total, buckets.current);
    if (overdue !== null) {
      financial.payablesOverdue = overdue;
      cashflow.payablesOverdue = overdue;
    } else if (buckets.total !== null) {
      issues.push("AgedPayables: missing/inconsistent Current column — payablesOverdue not derived");
    }
  } else {
    issues.push("AgedPayables report not supplied — payables/payablesOverdue not derived");
  }

  return { financial, cashflow, issues, sourceReports };
}

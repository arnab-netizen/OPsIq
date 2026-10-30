/**
 * QuickBooks Online V1 — pure report parsers (ProfitAndLoss, BalanceSheet, AgedReceivables, AgedPayables).
 *
 * Why this does not use fixed row/column positions: Intuit is moving report responses onto its modernized report
 * service, which may change row order, grouping and column layout (Intuit developer announcements, 2026). The parser
 * therefore locates everything SEMANTICALLY:
 *   - the amount column is resolved from `Columns` (ColKey `total` / title `Total` / the only Money column), never by index;
 *   - sections are found by their `group` identifier (Income, COGS, BankAccounts, GrandTotal ...), falling back to an exact
 *     normalised summary/header label; two candidates for one figure is an error, never a guess;
 *   - cell values are read at the resolved column index of THAT row's ColData.
 *
 * Contract
 *   - absence stays absence: a figure that is not present is `null`, never 0. A cell that is present and "0.00" is 0.
 *   - fail closed: a body that is not a report of the expected kind, whose stated period contradicts the request, whose
 *     columns cannot be resolved, or that holds a non-numeric amount raises QboReportParseError (bounded code, no body).
 *   - minimisation: only allowlisted totals leave this module. Per-customer / per-vendor / per-account rows (customer PII)
 *     are never read into the result.
 *   - currency and accounting basis are preserved exactly as the report states them; nothing is converted or assumed here.
 *
 * Intuit's exact 2026 response schema could not be fetched from this build environment (developer.intuit.com is not
 * reachable), so compatibility rests on the structural invariants above plus the fixtures in
 * src/__tests__/fixtures/qbo (historical shape and a regrouped/reordered modern shape). See QBO_V1_ARCHITECTURE.md §Reports.
 */
import {
  QBO_MAX_AMOUNT,
  QBO_REPORT_API_NAME,
  isIsoDate,
  type IsoDate,
  type QboAccountingBasis,
  type QboReportType,
} from "./qbo-report-model";

export const QBO_REPORT_PARSE_ERROR_CODES = [
  "NOT_A_REPORT",
  "REPORT_NAME_MISMATCH",
  "PERIOD_MISMATCH",
  "COLUMNS_UNRESOLVED",
  "SECTION_AMBIGUOUS",
  "VALUE_NOT_NUMERIC",
  "VALUE_OUT_OF_RANGE",
  "CURRENCY_INVALID",
  "BASIS_INVALID",
] as const;
export type QboReportParseErrorCode = (typeof QBO_REPORT_PARSE_ERROR_CODES)[number];

const PARSE_MESSAGES: Record<QboReportParseErrorCode, string> = {
  NOT_A_REPORT: "The QuickBooks response is not a recognisable report.",
  REPORT_NAME_MISMATCH: "QuickBooks returned a different report than requested.",
  PERIOD_MISMATCH: "QuickBooks returned a different period than requested.",
  COLUMNS_UNRESOLVED: "The QuickBooks report columns could not be interpreted safely.",
  SECTION_AMBIGUOUS: "The QuickBooks report has more than one candidate for a figure.",
  VALUE_NOT_NUMERIC: "The QuickBooks report contains a non-numeric amount.",
  VALUE_OUT_OF_RANGE: "The QuickBooks report contains an amount outside the supported range.",
  CURRENCY_INVALID: "The QuickBooks report states an invalid currency.",
  BASIS_INVALID: "The QuickBooks report states an unsupported accounting basis.",
};

/** Bounded, body-free parse failure. `message` is a fixed sentence; `code` is the machine key; `figure` names the figure only. */
export class QboReportParseError extends Error {
  readonly code: QboReportParseErrorCode;
  readonly figure?: string;
  constructor(code: QboReportParseErrorCode, figure?: string) {
    super(PARSE_MESSAGES[code]);
    this.name = "QboReportParseError";
    this.code = code;
    this.figure = figure;
  }
}

export function isQboReportParseError(e: unknown): e is QboReportParseError {
  return e instanceof QboReportParseError;
}

export interface QboParsedReport {
  reportType: QboReportType;
  /** Equal to `periodEnd` for as-of reports (balance sheet, agings). */
  periodStart: IsoDate;
  periodEnd: IsoDate;
  /** As STATED by the report header; null when the header is silent (the caller then records the requested basis). */
  basis: QboAccountingBasis | null;
  /** ISO-4217-shaped code as stated by the report; null when absent. */
  currency: string | null;
  noReportData: boolean;
  /** Allowlisted totals. `null` = not present in the report. */
  values: Record<string, number | null>;
  /** Aged reports only: per-bucket grand totals (titles bounded), in the report's own column order. */
  buckets: Array<{ title: string; value: number | null }>;
}

// ─── Raw shape helpers (all untrusted) ────────────────────────────────────────

type Obj = Record<string, unknown>;
const isObj = (v: unknown): v is Obj => typeof v === "object" && v !== null && !Array.isArray(v);
const asArray = (v: unknown): unknown[] => (Array.isArray(v) ? v : v === undefined || v === null ? [] : [v]);
const str = (v: unknown): string => (typeof v === "string" ? v : "");
const norm = (v: unknown): string => str(v).trim().toLowerCase().replace(/\s+/g, " ");

interface Column {
  title: string;
  type: string;
  key: string;
}

function readColumns(body: Obj): Column[] {
  const cols = isObj(body.Columns) ? asArray(body.Columns.Column) : [];
  return cols.filter(isObj).map((c) => {
    const meta = asArray(c.MetaData).filter(isObj);
    const keyEntry = meta.find((m) => norm(m.Name) === "colkey");
    return { title: str(c.ColTitle), type: norm(c.ColType), key: norm(keyEntry?.Value) };
  });
}

function resolveTotalColumn(columns: Column[]): number {
  const money = columns.map((c, i) => ({ c, i })).filter(({ c }) => c.type === "money");
  const named = money.filter(({ c }) => c.key === "total" || norm(c.title) === "total");
  if (named.length === 1) return named[0].i;
  if (named.length > 1) throw new QboReportParseError("COLUMNS_UNRESOLVED");
  if (money.length === 1) return money[0].i;
  throw new QboReportParseError("COLUMNS_UNRESOLVED");
}

/** Strict decimal: "", missing → null (absent). Anything else non-numeric fails the report. */
export function parseAmount(v: unknown, figure: string): number | null {
  if (v === undefined || v === null) return null;
  if (typeof v !== "string") throw new QboReportParseError("VALUE_NOT_NUMERIC", figure);
  const t = v.trim();
  if (t === "") return null;
  if (!/^-?\d+(\.\d+)?$/.test(t)) throw new QboReportParseError("VALUE_NOT_NUMERIC", figure);
  const n = Number(t);
  if (!Number.isFinite(n) || Math.abs(n) > QBO_MAX_AMOUNT) throw new QboReportParseError("VALUE_OUT_OF_RANGE", figure);
  return n;
}

interface Section {
  group: string;
  headerLabel: string;
  summaryLabel: string;
  summary: unknown[] | null;
  depth: number;
}

function collectSections(rows: unknown, depth: number, out: Section[]): void {
  const list = isObj(rows) ? asArray(rows.Row) : [];
  for (const r of list) {
    if (!isObj(r)) continue;
    const hasSummary = isObj(r.Summary);
    const isSection = norm(r.type) === "section" || hasSummary || isObj(r.Rows);
    if (isSection) {
      const header = isObj(r.Header) ? asArray(r.Header.ColData).filter(isObj) : [];
      const summary = isObj(r.Summary) ? asArray(r.Summary.ColData) : null;
      out.push({
        group: norm(r.group),
        headerLabel: norm(header[0]?.value),
        summaryLabel: norm(summary && isObj(summary[0]) ? summary[0].value : ""),
        summary,
        depth,
      });
      collectSections(r.Rows, depth + 1, out);
    }
  }
}

/** Group identifier first; exact normalised label as fallback. More than one candidate is ambiguous (never a guess). */
function selectSection(sections: Section[], figure: string, groups: readonly string[], labels: readonly string[]): Section | null {
  const g = new Set(groups.map(norm));
  const byGroup = sections.filter((s) => s.group !== "" && g.has(s.group));
  if (byGroup.length === 1) return byGroup[0];
  if (byGroup.length > 1) throw new QboReportParseError("SECTION_AMBIGUOUS", figure);
  const l = new Set(labels.map(norm));
  const byLabel = sections.filter((s) => l.has(s.summaryLabel) || (s.summary === null && l.has(s.headerLabel)));
  if (byLabel.length === 1) return byLabel[0];
  if (byLabel.length > 1) throw new QboReportParseError("SECTION_AMBIGUOUS", figure);
  return null;
}

function cell(section: Section | null, col: number, figure: string): number | null {
  if (!section || !section.summary) return null;
  const c = section.summary[col];
  return isObj(c) ? parseAmount(c.value, figure) : null;
}

// ─── Header ──────────────────────────────────────────────────────────────────

interface HeaderInfo {
  reportName: string;
  basis: QboAccountingBasis | null;
  currency: string | null;
  start: string;
  end: string;
  noReportData: boolean;
}

function readHeader(body: Obj): HeaderInfo {
  const h = body.Header;
  if (!isObj(h)) throw new QboReportParseError("NOT_A_REPORT");
  const basisRaw = norm(h.ReportBasis);
  let basis: QboAccountingBasis | null = null;
  if (basisRaw !== "") {
    if (basisRaw === "accrual") basis = "ACCRUAL";
    else if (basisRaw === "cash") basis = "CASH";
    else throw new QboReportParseError("BASIS_INVALID");
  }
  const curRaw = str(h.Currency).trim().toUpperCase();
  if (curRaw !== "" && !/^[A-Z]{3}$/.test(curRaw)) throw new QboReportParseError("CURRENCY_INVALID");
  const options = asArray(h.Option).filter(isObj);
  const noData = options.find((o) => norm(o.Name) === "noreportdata");
  return {
    reportName: norm(h.ReportName),
    basis,
    currency: curRaw === "" ? null : curRaw,
    start: str(h.StartPeriod).trim(),
    end: str(h.EndPeriod).trim(),
    noReportData: norm(noData?.Value) === "true",
  };
}

function checkName(h: HeaderInfo, reportType: QboReportType): void {
  if (h.reportName !== "" && h.reportName !== norm(QBO_REPORT_API_NAME[reportType])) {
    throw new QboReportParseError("REPORT_NAME_MISMATCH");
  }
}

function sectionsOf(body: Obj): Section[] {
  const out: Section[] = [];
  collectSections(body.Rows, 0, out);
  return out;
}

// ─── Parsers ─────────────────────────────────────────────────────────────────

export interface QboPeriodRequest {
  start: IsoDate;
  end: IsoDate;
}

export function parseProfitAndLoss(body: unknown, requested: QboPeriodRequest): QboParsedReport {
  if (!isObj(body)) throw new QboReportParseError("NOT_A_REPORT");
  const h = readHeader(body);
  checkName(h, "PROFIT_AND_LOSS");
  if ((h.start !== "" && h.start !== requested.start) || (h.end !== "" && h.end !== requested.end)) {
    throw new QboReportParseError("PERIOD_MISMATCH");
  }
  const values: Record<string, number | null> = { income: null, cogs: null, expenses: null, netIncome: null };
  if (!h.noReportData) {
    const col = resolveTotalColumn(readColumns(body));
    const sections = sectionsOf(body);
    values.income = cell(selectSection(sections, "income", ["Income"], ["total income", "total revenue", "total revenues"]), col, "income");
    values.cogs = cell(selectSection(sections, "cogs", ["COGS"], ["total cost of goods sold", "total cogs"]), col, "cogs");
    values.expenses = cell(selectSection(sections, "expenses", ["Expenses"], ["total expenses"]), col, "expenses");
    values.netIncome = cell(selectSection(sections, "netIncome", ["NetIncome"], ["net income"]), col, "netIncome");
  }
  return { reportType: "PROFIT_AND_LOSS", periodStart: requested.start, periodEnd: requested.end, basis: h.basis, currency: h.currency, noReportData: h.noReportData, values, buckets: [] };
}

export function parseBalanceSheet(body: unknown, asOf: IsoDate): QboParsedReport {
  if (!isObj(body)) throw new QboReportParseError("NOT_A_REPORT");
  const h = readHeader(body);
  checkName(h, "BALANCE_SHEET");
  if (h.end !== "" && h.end !== asOf) throw new QboReportParseError("PERIOD_MISMATCH");
  const values: Record<string, number | null> = { bankAccounts: null, accountsReceivable: null, accountsPayable: null, totalAssets: null };
  if (!h.noReportData) {
    const col = resolveTotalColumn(readColumns(body));
    const sections = sectionsOf(body);
    values.bankAccounts = cell(selectSection(sections, "bankAccounts", ["BankAccounts"], ["total bank accounts"]), col, "bankAccounts");
    values.accountsReceivable = cell(selectSection(sections, "accountsReceivable", ["AR"], ["total accounts receivable", "total accounts receivable (a/r)"]), col, "accountsReceivable");
    values.accountsPayable = cell(selectSection(sections, "accountsPayable", ["AP"], ["total accounts payable", "total accounts payable (a/p)"]), col, "accountsPayable");
    values.totalAssets = cell(selectSection(sections, "totalAssets", ["TotalAssets"], ["total assets"]), col, "totalAssets");
  }
  return { reportType: "BALANCE_SHEET", periodStart: asOf, periodEnd: asOf, basis: h.basis, currency: h.currency, noReportData: h.noReportData, values, buckets: [] };
}

function parseAged(reportType: "AGED_RECEIVABLES" | "AGED_PAYABLES", body: unknown, asOf: IsoDate): QboParsedReport {
  if (!isObj(body)) throw new QboReportParseError("NOT_A_REPORT");
  const h = readHeader(body);
  checkName(h, reportType);
  const values: Record<string, number | null> = { total: null, current: null };
  const buckets: Array<{ title: string; value: number | null }> = [];
  if (h.noReportData) {
    // An open-item listing with no rows states that nothing is outstanding: a known zero (unlike P&L / balance sheet, where
    // "no data" does not establish a zero figure).
    values.total = 0;
    values.current = 0;
  } else {
    const columns = readColumns(body);
    const totalCol = resolveTotalColumn(columns);
    const sections = sectionsOf(body);
    const grand = selectSection(sections.filter((s) => s.depth === 0), "total", ["GrandTotal"], ["total"]);
    values.total = cell(grand, totalCol, "total");
    const currentCols = columns.map((c, i) => ({ c, i })).filter(({ c }) => c.type === "money" && (c.key === "current" || norm(c.title) === "current"));
    if (currentCols.length > 1) throw new QboReportParseError("COLUMNS_UNRESOLVED");
    if (currentCols.length === 1) values.current = cell(grand, currentCols[0].i, "current");
    columns.forEach((c, i) => {
      if (c.type === "money" && i !== totalCol) buckets.push({ title: c.title.trim().slice(0, 40), value: cell(grand, i, "bucket") });
    });
  }
  return { reportType, periodStart: asOf, periodEnd: asOf, basis: h.basis, currency: h.currency, noReportData: h.noReportData, values, buckets };
}

export const parseAgedReceivables = (body: unknown, asOf: IsoDate): QboParsedReport => parseAged("AGED_RECEIVABLES", body, asOf);
export const parseAgedPayables = (body: unknown, asOf: IsoDate): QboParsedReport => parseAged("AGED_PAYABLES", body, asOf);

/** Dispatch by report type. `period.end` is the as-of date for the as-of reports. */
export function parseQboReport(reportType: QboReportType, body: unknown, period: QboPeriodRequest): QboParsedReport {
  if (!isIsoDate(period.start) || !isIsoDate(period.end)) throw new QboReportParseError("PERIOD_MISMATCH");
  switch (reportType) {
    case "PROFIT_AND_LOSS": return parseProfitAndLoss(body, period);
    case "BALANCE_SHEET": return parseBalanceSheet(body, period.end);
    case "AGED_RECEIVABLES": return parseAgedReceivables(body, period.end);
    case "AGED_PAYABLES": return parseAgedPayables(body, period.end);
  }
}

/** Stable JSON of everything that defines an observation's content (key-sorted). Hash this to dedupe unchanged observations. */
export function canonicalObservationJson(p: QboParsedReport, parserVersion: number): string {
  const sortObj = (o: Record<string, number | null>) => Object.fromEntries(Object.entries(o).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)));
  return JSON.stringify({
    reportType: p.reportType,
    periodStart: p.periodStart,
    periodEnd: p.periodEnd,
    basis: p.basis,
    currency: p.currency,
    noReportData: p.noReportData,
    values: sortObj(p.values),
    buckets: p.buckets,
    parserVersion,
  });
}

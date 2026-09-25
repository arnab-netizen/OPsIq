/**
 * QuickBooks Online — report JSON parser.
 *
 * QBO's `/reports/{ReportName}` endpoints return a recursive Section/Data row
 * tree (see Intuit's Report Entity documentation). This module flattens that
 * tree into a flat, easy-to-scan list and offers two lookups used by the
 * derivation layer: named group totals (P&L / Balance Sheet) and the aging
 * bucket columns of the two Aged Receivables/Payables reports.
 *
 * Pure module: no DB, no network. Defensive against every field being
 * missing, empty, or `""` (QBO renders blank cells as empty strings, not
 * `null`).
 */

export type QboReportRowType = "Section" | "Data" | "Summary";

export interface FlatRow {
  /** Nesting depth; 0 for a top-level row. */
  depth: number;
  type: QboReportRowType;
  /** The enclosing Section's `group` (e.g. "Income", "TotalAssets"), or the row's own group when it is itself a Summary/Section. */
  group: string | null;
  label: string;
  /** Parsed numeric columns after the label column; `null` for blank/unparseable cells. */
  values: (number | null)[];
  /** QBO account id from `ColData[0].id`, when present (leaf account rows). */
  accountId: string | null;
}

export interface QboReportColumn {
  title: string;
  colType: string | null;
}

export interface ParsedQboReport {
  name: string | null;
  startPeriod: string | null;
  endPeriod: string | null;
  currency: string | null;
  columns: QboReportColumn[];
  rows: FlatRow[];
}

function asRecord(v: unknown): Record<string, unknown> | null {
  return v !== null && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : null;
}

function asArray(v: unknown): unknown[] {
  return Array.isArray(v) ? v : [];
}

function str(v: unknown): string | null {
  return typeof v === "string" && v.length > 0 ? v : null;
}

/** Parses a single ColData cell's `value` into a finite number, or null for blank/non-numeric cells. */
function parseCellNumber(raw: unknown): number | null {
  const rec = asRecord(raw);
  if (!rec) return null;
  const value = rec.value;
  if (typeof value !== "string" || value.trim() === "") return null;
  // Amounts may carry thousands separators or parentheses for negatives, e.g. "(1,234.56)".
  const negative = /^\(.*\)$/.test(value.trim());
  const cleaned = value.replace(/[(),]/g, "").trim();
  const n = Number(cleaned);
  if (!Number.isFinite(n)) return null;
  return negative ? -Math.abs(n) : n;
}

function cellLabel(colData: unknown[]): string {
  const first = asRecord(colData[0]);
  return str(first?.value) ?? "";
}

function cellAccountId(colData: unknown[]): string | null {
  const first = asRecord(colData[0]);
  return str(first?.id);
}

function flattenColData(colData: unknown[]): (number | null)[] {
  return colData.slice(1).map(parseCellNumber);
}

function flattenRows(rowNodes: unknown[], depth: number, inheritedGroup: string | null, out: FlatRow[]): void {
  for (const raw of rowNodes) {
    const node = asRecord(raw);
    if (!node) continue;

    const nodeType = str(node.type);
    const group = str(node.group) ?? inheritedGroup;

    if (nodeType === "Data") {
      const colData = asArray(node.ColData);
      out.push({
        depth,
        type: "Data",
        group,
        label: cellLabel(colData),
        values: flattenColData(colData),
        accountId: cellAccountId(colData),
      });
      continue;
    }

    // Section: may carry a Header row, nested Rows, and a Summary row.
    const header = asRecord(node.Header);
    if (header) {
      const colData = asArray(header.ColData);
      out.push({
        depth,
        type: "Section",
        group,
        label: cellLabel(colData),
        values: flattenColData(colData),
        accountId: cellAccountId(colData),
      });
    }

    const nestedRows = asRecord(node.Rows);
    if (nestedRows) {
      flattenRows(asArray(nestedRows.Row), depth + 1, group, out);
    }

    const summary = asRecord(node.Summary);
    if (summary) {
      const colData = asArray(summary.ColData);
      out.push({
        depth,
        type: "Summary",
        group,
        label: cellLabel(colData),
        values: flattenColData(colData),
        accountId: cellAccountId(colData),
      });
    }
  }
}

/** Parses a raw `/reports/{ReportName}` JSON body into a flat, defensively-typed report. */
export function parseQboReport(json: unknown): ParsedQboReport {
  const root = asRecord(json) ?? {};
  const header = asRecord(root.Header);
  const columnsNode = asRecord(root.Columns);
  const rowsNode = asRecord(root.Rows);

  const columns: QboReportColumn[] = asArray(columnsNode?.Column).map((raw) => {
    const c = asRecord(raw) ?? {};
    return { title: str(c.ColTitle) ?? "", colType: str(c.ColType) };
  });

  const rows: FlatRow[] = [];
  if (rowsNode) flattenRows(asArray(rowsNode.Row), 0, null, rows);

  return {
    name: str(header?.ReportName),
    startPeriod: str(header?.StartPeriod),
    endPeriod: str(header?.EndPeriod),
    currency: str(header?.Currency),
    columns,
    rows,
  };
}

/**
 * The single numeric total for a named report group (e.g. P&L "NetIncome",
 * Balance Sheet "TotalAssets"). Prefers a Summary row carrying that group;
 * falls back to a Section header row when no Summary is present (some
 * single-line groups render as a bare Section/Data row with no children).
 * Uses the LAST non-null value column, since QBO puts the report's primary
 * total in the rightmost column (multi-period/comparative reports put
 * earlier periods to the left of it). Returns null when the group is absent.
 */
export function getReportGroupTotal(report: ParsedQboReport, group: string): number | null {
  const matches = report.rows.filter((r) => r.group === group);
  if (matches.length === 0) return null;

  const summary = [...matches].reverse().find((r) => r.type === "Summary");
  const candidate = summary ?? [...matches].reverse().find((r) => r.values.some((v) => v !== null));
  if (!candidate) return null;

  for (let i = candidate.values.length - 1; i >= 0; i--) {
    const v = candidate.values[i];
    if (v !== null) return v;
  }
  return null;
}

export interface AgingBuckets {
  current: number | null;
  d1_30: number | null;
  d31_60: number | null;
  d61_90: number | null;
  d91plus: number | null;
  total: number | null;
}

function normalizeTitle(title: string): string {
  return title.trim().toLowerCase().replace(/\s+/g, " ");
}

const AGING_TITLE_MATCHERS: Array<{ key: keyof AgingBuckets; test: (t: string) => boolean }> = [
  { key: "current", test: (t) => t === "current" },
  { key: "d1_30", test: (t) => t === "1 - 30" || t === "1-30" },
  { key: "d31_60", test: (t) => t === "31 - 60" || t === "31-60" },
  { key: "d61_90", test: (t) => t === "61 - 90" || t === "61-90" },
  {
    key: "d91plus",
    test: (t) => t === "91 and over" || t === "91 & over" || t === "> 90" || t === "90+" || t === "91+" || t === "over 90",
  },
  { key: "total", test: (t) => t === "total" },
];

/**
 * Extracts the Current/1-30/31-60/61-90/91+/Total aging columns from the
 * grand-total row of an AgedReceivables/AgedPayables report, matched by
 * column title (QBO does not tag aging columns with a stable `ColType`).
 * Returns all-null when no total row or no recognizable aging columns are
 * found (e.g. an empty report with zero open transactions).
 */
export function getAgingBuckets(report: ParsedQboReport): AgingBuckets {
  const empty: AgingBuckets = { current: null, d1_30: null, d31_60: null, d61_90: null, d91plus: null, total: null };

  const totalRow = [...report.rows].reverse().find((r) => normalizeTitle(r.label) === "total");
  if (!totalRow) return empty;

  // report.columns[0] is the label column ("", or e.g. "Customer"); the
  // remaining columns line up 1:1 with totalRow.values.
  const dataColumns = report.columns.slice(1);
  const out: AgingBuckets = { ...empty };

  dataColumns.forEach((col, idx) => {
    const title = normalizeTitle(col.title);
    const matcher = AGING_TITLE_MATCHERS.find((m) => m.test(title));
    if (!matcher) return;
    const value = totalRow.values[idx];
    if (value !== undefined) out[matcher.key] = value;
  });

  return out;
}

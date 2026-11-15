/**
 * QuickBooks Online — what the READ-ONLY client may ask for.
 *
 * Everything the client sends is built from these allowlists: entity names, report names and report
 * parameter names are fixed sets; query predicates are structured (field / operator / literal) and
 * every literal is escaped. There is no way to pass a raw path, a raw query string, or a verb.
 *
 * Pure module: no DB, no network.
 */

import { QBO_PROVIDER_LIMITS } from "./qbo-config";

/** Entities that may be queried / read by id. Accounting data only; no payroll, no payments scope. */
export const QBO_READABLE_ENTITIES = [
  "Account",
  "Bill",
  "BillPayment",
  "Class",
  "CreditMemo",
  "Customer",
  "Department",
  "Deposit",
  "Estimate",
  "Invoice",
  "Item",
  "JournalEntry",
  "Payment",
  "PaymentMethod",
  "Purchase",
  "PurchaseOrder",
  "RefundReceipt",
  "SalesReceipt",
  "Term",
  "Transfer",
  "Vendor",
  "VendorCredit",
] as const;

export type QboReadableEntity = (typeof QBO_READABLE_ENTITIES)[number];

const READABLE_ENTITY_SET: ReadonlySet<string> = new Set(QBO_READABLE_ENTITIES);

export function isReadableEntity(name: unknown): name is QboReadableEntity {
  return typeof name === "string" && READABLE_ENTITY_SET.has(name);
}

export const QBO_REPORT_NAMES = [
  "ProfitAndLoss",
  "BalanceSheet",
  "CashFlow",
  "TrialBalance",
  "AgedReceivables",
  "AgedPayables",
] as const;

export type QboReportName = (typeof QBO_REPORT_NAMES)[number];

const REPORT_NAME_SET: ReadonlySet<string> = new Set(QBO_REPORT_NAMES);

export function isReportName(name: unknown): name is QboReportName {
  return typeof name === "string" && REPORT_NAME_SET.has(name);
}

/** Report parameters the client will forward. Values are further restricted to a safe character set. */
export const QBO_REPORT_PARAMS = [
  "start_date",
  "end_date",
  "report_date",
  "accounting_method",
  "date_macro",
  "summarize_column_by",
  "aging_period",
  "num_periods",
  "past_due",
  "customer",
  "vendor",
  "department",
  "class",
  "minorversion",
] as const;

const REPORT_PARAM_SET: ReadonlySet<string> = new Set(QBO_REPORT_PARAMS);
const REPORT_VALUE_PATTERN = /^[A-Za-z0-9_.,:-]{1,64}$/;

export type QboReportParams = Partial<Record<(typeof QBO_REPORT_PARAMS)[number], string | number>>;

/** Validate report params against the allowlist; returns a clean string map or throws a plain Error naming the key. */
export function validateReportParams(params: QboReportParams | undefined): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [key, raw] of Object.entries(params ?? {})) {
    if (raw === undefined) continue;
    if (!REPORT_PARAM_SET.has(key) || key === "minorversion") {
      throw new RangeError(`Report parameter not allowed: ${key}`);
    }
    const value = String(raw);
    if (!REPORT_VALUE_PATTERN.test(value)) throw new RangeError(`Report parameter value not allowed for ${key}`);
    out[key] = value;
  }
  return out;
}

// ── Structured query ─────────────────────────────────────────────────────

const FIELD_PATTERN = /^[A-Za-z][A-Za-z0-9_.]{0,63}$/;
export const QBO_QUERY_OPERATORS = ["=", "<", ">", "<=", ">=", "LIKE"] as const;
export type QboQueryOperator = (typeof QBO_QUERY_OPERATORS)[number];

export type QboQueryLiteral = string | number | boolean;

export interface QboQueryPredicate {
  field: string;
  op: QboQueryOperator;
  value: QboQueryLiteral;
}

export interface QboQuerySpec {
  entity: QboReadableEntity;
  where?: readonly QboQueryPredicate[];
  orderBy?: { field: string; direction?: "ASC" | "DESC" };
  /** 1-based. */
  startPosition?: number;
  /** 1..1000 (Intuit's maximum page). */
  maxResults?: number;
}

/** Quote a literal for QBO's query language: strings single-quoted with `\` and `'` backslash-escaped. */
export function quoteQboLiteral(value: QboQueryLiteral): string {
  if (typeof value === "number") {
    if (!Number.isFinite(value)) throw new RangeError("Query literal must be finite");
    return String(value);
  }
  if (typeof value === "boolean") return value ? "true" : "false";
  if (typeof value !== "string") throw new RangeError("Unsupported query literal");
  if (/[\u0000-\u001f\u007f]/.test(value)) throw new RangeError("Query literal contains control characters");
  if (value.length > 256) throw new RangeError("Query literal too long");
  return `'${value.replace(/\\/g, "\\\\").replace(/'/g, "\\'")}'`;
}

/** Build a SELECT statement from a structured spec. Throws RangeError on anything outside the allowlists. */
export function buildQboQuery(spec: QboQuerySpec): string {
  if (!isReadableEntity(spec.entity)) throw new RangeError("Entity not readable");
  const parts = [`SELECT * FROM ${spec.entity}`];
  if (spec.where && spec.where.length > 0) {
    const clauses = spec.where.map((p) => {
      if (!FIELD_PATTERN.test(p.field)) throw new RangeError("Invalid query field");
      if (!(QBO_QUERY_OPERATORS as readonly string[]).includes(p.op)) throw new RangeError("Invalid query operator");
      return `${p.field} ${p.op} ${quoteQboLiteral(p.value)}`;
    });
    parts.push(`WHERE ${clauses.join(" AND ")}`);
  }
  if (spec.orderBy) {
    if (!FIELD_PATTERN.test(spec.orderBy.field)) throw new RangeError("Invalid order field");
    parts.push(`ORDERBY ${spec.orderBy.field}${spec.orderBy.direction === "DESC" ? " DESC" : ""}`);
  }
  const start = spec.startPosition ?? 1;
  const max = spec.maxResults ?? QBO_PROVIDER_LIMITS.queryMaxResults;
  if (!Number.isInteger(start) || start < 1 || start > 10_000_000) throw new RangeError("Invalid startPosition");
  if (!Number.isInteger(max) || max < 1 || max > QBO_PROVIDER_LIMITS.queryMaxResults) throw new RangeError("Invalid maxResults");
  parts.push(`STARTPOSITION ${start}`, `MAXRESULTS ${max}`);
  return parts.join(" ");
}

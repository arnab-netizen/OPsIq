/**
 * QuickBooks Online — normalization of provider records and reports (pure: no DB, no network).
 *
 * Provider payloads are untrusted. Every normalizer validates shape and returns either a compact, PII-minimal
 * record plus a deterministic content hash, or a reason it was rejected. Nothing here throws for bad provider data.
 *
 * Minimization: customer e-mail, phone, address and free-text notes are NOT retained. A record keeps its provider
 * id, the display name needed to recognise it, monetary fields, dates, currency and state.
 *
 * Amounts: QuickBooks returns JSON numbers (or numeric strings inside reports). They are kept as exact decimal
 * strings (max 4 fractional digits) so no floating-point arithmetic leaks into stored values.
 */
import { createHash } from "node:crypto";
import { isSafeEntityId } from "./qbo-identifiers";
import type { QboSyncQueryEntity, QboRecordState } from "./qbo-sync-model";

// ─── helpers ─────────────────────────────────────────────────────────────────

type Raw = Record<string, unknown>;

function isObject(v: unknown): v is Raw {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

/** Canonical JSON (sorted keys) so the hash does not depend on key order. */
export function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  if (isObject(value)) {
    return `{${Object.keys(value).sort().map((k) => `${JSON.stringify(k)}:${canonicalJson(value[k])}`).join(",")}}`;
  }
  return JSON.stringify(value === undefined ? null : value);
}

export function contentHash(value: unknown): string {
  return createHash("sha256").update(canonicalJson(value), "utf8").digest("hex");
}

/** Exact decimal string with at most 4 fractional digits; null when the value is not a finite number. */
export function toDecimalString(value: unknown): string | null {
  let n: number;
  if (typeof value === "number") n = value;
  else if (typeof value === "string" && /^-?\d{1,15}(\.\d{1,8})?$/.test(value.trim())) n = Number(value.trim());
  else return null;
  if (!Number.isFinite(n) || Math.abs(n) > 1e15) return null;
  const fixed = (Math.round(n * 10000) / 10000).toFixed(4);
  const trimmed = fixed.replace(/\.?0+$/, "");
  return trimmed === "-0" || trimmed === "" ? "0" : trimmed;
}

function text(v: unknown, max: number): string | null {
  if (typeof v !== "string") return null;
  // eslint-disable-next-line no-control-regex
  const cleaned = v.replace(/[\u0000-\u001f\u007f]/g, " ").trim();
  return cleaned.length === 0 ? null : cleaned.slice(0, max);
}

function isoDate(v: unknown): string | null {
  return typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v) && !Number.isNaN(Date.parse(`${v}T00:00:00Z`)) ? v : null;
}

function isoInstant(v: unknown): Date | null {
  if (typeof v !== "string" || v.length > 40) return null;
  const t = Date.parse(v);
  return Number.isNaN(t) ? null : new Date(t);
}

function currencyOf(raw: Raw): string | null {
  const ref = raw.CurrencyRef;
  const value = isObject(ref) ? ref.value : null;
  return typeof value === "string" && /^[A-Z]{3}$/.test(value) ? value : null;
}

function refId(v: unknown): string | null {
  return isObject(v) && typeof v.value === "string" && isSafeEntityId(v.value) ? v.value : null;
}

// ─── entity records ──────────────────────────────────────────────────────────

export interface NormalizedRecord {
  entityType: QboSyncQueryEntity | "CompanyInfo";
  providerEntityId: string;
  providerSyncToken: string | null;
  providerUpdatedAt: Date | null;
  recordState: QboRecordState;
  normalized: Record<string, unknown>;
  contentHash: string;
}

export type NormalizeResult = { ok: true; record: NormalizedRecord } | { ok: false; reason: "MALFORMED" | "UNSAFE_ID" };

function base(raw: Raw, idOverride?: string): { id: string; syncToken: string | null; updated: Date | null } | null {
  const id = idOverride ?? (typeof raw.Id === "string" ? raw.Id : null);
  if (!id || !isSafeEntityId(id)) return null;
  const meta = isObject(raw.MetaData) ? raw.MetaData : null;
  const syncToken = typeof raw.SyncToken === "string" && raw.SyncToken.length <= 32 && /^[0-9]+$/.test(raw.SyncToken) ? raw.SyncToken : null;
  return { id, syncToken, updated: meta ? isoInstant(meta.LastUpdatedTime) : null };
}

function finish(entityType: NormalizedRecord["entityType"], b: { id: string; syncToken: string | null; updated: Date | null }, state: QboRecordState, normalized: Record<string, unknown>): NormalizeResult {
  return {
    ok: true,
    record: { entityType, providerEntityId: b.id, providerSyncToken: b.syncToken, providerUpdatedAt: b.updated, recordState: state, normalized, contentHash: contentHash({ state, normalized, v: b.syncToken }) },
  };
}

export function normalizeCustomer(raw: unknown): NormalizeResult {
  if (!isObject(raw)) return { ok: false, reason: "MALFORMED" };
  const b = base(raw);
  if (!b) return { ok: false, reason: typeof raw.Id === "string" ? "UNSAFE_ID" : "MALFORMED" };
  const active = raw.Active === false ? false : true;
  return finish("Customer", b, active ? "ACTIVE" : "INACTIVE", {
    displayName: text(raw.DisplayName, 200),
    balance: toDecimalString(raw.Balance),
    currency: currencyOf(raw),
    isJob: raw.Job === true,
  });
}

function normalizeTransaction(entity: "Invoice" | "Bill", raw: unknown): NormalizeResult {
  if (!isObject(raw)) return { ok: false, reason: "MALFORMED" };
  const b = base(raw);
  if (!b) return { ok: false, reason: typeof raw.Id === "string" ? "UNSAFE_ID" : "MALFORMED" };
  const total = toDecimalString(raw.TotalAmt);
  const balance = toDecimalString(raw.Balance);
  // An Invoice/Bill without a numeric total is not usable financial evidence.
  if (total === null) return { ok: false, reason: "MALFORMED" };
  const counterpartyRef = entity === "Invoice" ? raw.CustomerRef : raw.VendorRef;
  return finish(entity, b, "ACTIVE", {
    docNumber: text(raw.DocNumber, 21),
    txnDate: isoDate(raw.TxnDate),
    dueDate: isoDate(raw.DueDate),
    totalAmt: total,
    balance,
    currency: currencyOf(raw),
    counterpartyId: refId(counterpartyRef),
  });
}

export const normalizeInvoice = (raw: unknown): NormalizeResult => normalizeTransaction("Invoice", raw);
export const normalizeBill = (raw: unknown): NormalizeResult => normalizeTransaction("Bill", raw);

export function normalizeCompanyInfo(raw: unknown, realmId: string): NormalizeResult {
  if (!isObject(raw)) return { ok: false, reason: "MALFORMED" };
  // CompanyInfo.Id is the realm id; the realm itself (not the payload) is the identity we store it under.
  const b = base(raw, realmId);
  if (!b) return { ok: false, reason: "MALFORMED" };
  const country = text(raw.Country, 8);
  return finish("CompanyInfo", b, "ACTIVE", {
    companyName: text(raw.CompanyName, 200),
    country,
    fiscalYearStartMonth: text(raw.FiscalYearStartMonth, 16),
    reportedRealmId: typeof raw.Id === "string" ? raw.Id : null,
  });
}

export function normalizeQueryRecord(entity: QboSyncQueryEntity, raw: unknown): NormalizeResult {
  switch (entity) {
    case "Customer": return normalizeCustomer(raw);
    case "Invoice": return normalizeInvoice(raw);
    case "Bill": return normalizeBill(raw);
  }
}

/**
 * Collapse provider duplicates within a result set (a record can appear on two pages when the data changes under
 * pagination): the copy with the newest provider timestamp wins, ties keep the first seen.
 */
export function dedupeRecords(records: readonly NormalizedRecord[]): NormalizedRecord[] {
  const byKey = new Map<string, NormalizedRecord>();
  for (const r of records) {
    const key = `${r.entityType}:${r.providerEntityId}`;
    const prior = byKey.get(key);
    if (!prior) byKey.set(key, r);
    else if ((r.providerUpdatedAt?.getTime() ?? 0) > (prior.providerUpdatedAt?.getTime() ?? 0)) byKey.set(key, r);
  }
  return [...byKey.values()];
}

// ─── reports ─────────────────────────────────────────────────────────────────

export type ReportMetrics = Record<string, string>;

export interface ParsedReport {
  currency: string | null;
  basis: string | null;
  startPeriod: string | null;
  endPeriod: string | null;
  metrics: ReportMetrics;
  /** Parsed internal-consistency problems (never silently corrected). */
  inconsistencies: string[];
  generatedAt: Date | null;
}

export type ReportParseResult = { ok: true; report: ParsedReport } | { ok: false; reason: "MALFORMED" };

interface RowNode { group: string | null; summary: string[] | null; children: RowNode[]; colData: string[] | null }

function cellValues(colData: unknown): string[] | null {
  if (!Array.isArray(colData)) return null;
  return colData.map((c) => (isObject(c) && typeof c.value === "string" ? c.value : ""));
}

function parseRows(rows: unknown, depth: number): RowNode[] | null {
  if (depth > 12) return null;
  if (rows === undefined || rows === null) return [];
  if (!isObject(rows)) return null;
  const list = rows.Row;
  if (list === undefined) return [];
  if (!Array.isArray(list)) return null;
  const out: RowNode[] = [];
  for (const r of list) {
    if (!isObject(r)) return null;
    const children = parseRows(r.Rows, depth + 1);
    if (children === null) return null;
    out.push({
      group: typeof r.group === "string" ? r.group : null,
      summary: isObject(r.Summary) ? cellValues(r.Summary.ColData) : null,
      children,
      colData: cellValues(r.ColData),
    });
  }
  return out;
}

function collect(nodes: readonly RowNode[], into: RowNode[]): void {
  for (const n of nodes) {
    into.push(n);
    collect(n.children, into);
  }
}

function header(body: Raw): { currency: string | null; basis: string | null; start: string | null; end: string | null; generatedAt: Date | null } | null {
  const h = body.Header;
  if (!isObject(h)) return null;
  const cur = typeof h.Currency === "string" && /^[A-Z]{3}$/.test(h.Currency) ? h.Currency : null;
  return {
    currency: cur,
    basis: typeof h.ReportBasis === "string" ? text(h.ReportBasis, 16) : null,
    start: isoDate(h.StartPeriod),
    end: isoDate(h.EndPeriod),
    generatedAt: isoInstant(h.Time),
  };
}

/** Section groups surfaced per statement. A group Intuit does not return is ABSENT from the result — never zero. */
const PL_GROUPS = ["Income", "COGS", "GrossProfit", "Expenses", "NetOperatingIncome", "OtherIncome", "OtherExpenses", "NetOtherIncome", "NetIncome"] as const;
const BS_GROUPS = ["BankAccounts", "AR", "AP", "CurrentAssets", "TotalAssets", "CurrentLiabilities", "Liabilities", "Equity"] as const;

function groupSummaries(body: Raw, wanted: readonly string[]): { ok: true; metrics: ReportMetrics } | { ok: false } {
  const top = parseRows(body.Rows, 0);
  if (top === null) return { ok: false };
  const all: RowNode[] = [];
  collect(top, all);
  const metrics: ReportMetrics = {};
  for (const n of all) {
    if (!n.group || !wanted.includes(n.group) || !n.summary || n.summary.length < 2) continue;
    // Single-total statements: column 0 is the label, column 1 the amount.
    const v = toDecimalString(n.summary[1]);
    if (v === null) return { ok: false };
    if (!(n.group in metrics)) metrics[n.group] = v;
  }
  return { ok: true, metrics };
}

export function parseProfitAndLoss(body: unknown): ReportParseResult {
  if (!isObject(body)) return { ok: false, reason: "MALFORMED" };
  const h = header(body);
  if (!h) return { ok: false, reason: "MALFORMED" };
  const g = groupSummaries(body, PL_GROUPS);
  if (!g.ok) return { ok: false, reason: "MALFORMED" };
  const inconsistencies: string[] = [];
  const { Income, COGS, GrossProfit } = g.metrics;
  if (Income !== undefined && GrossProfit !== undefined) {
    const expected = Number(Income) - Number(COGS ?? "0");
    if (Math.abs(expected - Number(GrossProfit)) > 0.011) inconsistencies.push("GROSS_PROFIT_MISMATCH");
  }
  return { ok: true, report: { currency: h.currency, basis: h.basis, startPeriod: h.start, endPeriod: h.end, metrics: g.metrics, inconsistencies, generatedAt: h.generatedAt } };
}

export function parseBalanceSheet(body: unknown): ReportParseResult {
  if (!isObject(body)) return { ok: false, reason: "MALFORMED" };
  const h = header(body);
  if (!h) return { ok: false, reason: "MALFORMED" };
  const g = groupSummaries(body, BS_GROUPS);
  if (!g.ok) return { ok: false, reason: "MALFORMED" };
  return { ok: true, report: { currency: h.currency, basis: h.basis, startPeriod: h.start, endPeriod: h.end, metrics: g.metrics, inconsistencies: [], generatedAt: h.generatedAt } };
}

const AGING_CURRENT = /^current$/i;
const AGING_TOTAL = /^total$/i;

/** Aged receivables / payables: the grand-total row split into the aging buckets named by the report's own columns. */
export function parseAgedReport(body: unknown): ReportParseResult {
  if (!isObject(body)) return { ok: false, reason: "MALFORMED" };
  const h = header(body);
  if (!h) return { ok: false, reason: "MALFORMED" };
  const cols = isObject(body.Columns) && Array.isArray(body.Columns.Column) ? body.Columns.Column : null;
  if (!cols) return { ok: false, reason: "MALFORMED" };
  const titles = cols.map((c) => (isObject(c) && typeof c.ColTitle === "string" ? c.ColTitle.trim() : ""));
  const currentIdx = titles.findIndex((t) => AGING_CURRENT.test(t));
  const totalIdx = titles.findIndex((t) => AGING_TOTAL.test(t));
  if (currentIdx < 1 || totalIdx < 1) return { ok: false, reason: "MALFORMED" };

  const top = parseRows(body.Rows, 0);
  if (top === null) return { ok: false, reason: "MALFORMED" };
  const all: RowNode[] = [];
  collect(top, all);
  const grand = all.find((n) => n.group === "GrandTotal" && n.summary !== null);
  const metrics: ReportMetrics = {};
  const inconsistencies: string[] = [];
  if (grand?.summary) {
    // In an aging report an empty bucket cell means zero.
    const cell = (i: number): string | null => {
      const raw = grand.summary?.[i];
      if (raw === undefined) return null;
      return raw === "" ? "0" : toDecimalString(raw);
    };
    const current = cell(currentIdx);
    const total = cell(totalIdx);
    if (current === null || total === null) return { ok: false, reason: "MALFORMED" };
    let bucketSum = 0;
    for (let i = 1; i < titles.length; i++) {
      if (i === currentIdx || i === totalIdx) continue;
      const v = cell(i);
      if (v === null) return { ok: false, reason: "MALFORMED" };
      bucketSum += Number(v);
    }
    metrics.current = current;
    metrics.total = total;
    metrics.overdue = toDecimalString(bucketSum) ?? "0";
    if (Math.abs(Number(current) + bucketSum - Number(total)) > 0.011) inconsistencies.push("AGING_BUCKETS_DO_NOT_SUM_TO_TOTAL");
  } else if (all.length === 0 || all.every((n) => n.group === null && n.summary === null)) {
    // A company with nothing outstanding returns no rows at all: zero is the truthful value there.
    metrics.current = "0";
    metrics.total = "0";
    metrics.overdue = "0";
  } else {
    return { ok: false, reason: "MALFORMED" };
  }
  return { ok: true, report: { currency: h.currency, basis: h.basis, startPeriod: h.start, endPeriod: h.end, metrics, inconsistencies, generatedAt: h.generatedAt } };
}

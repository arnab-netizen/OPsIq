/**
 * QuickBooks Online — data provenance and precedence policy for owner finance fields (pure).
 *
 * Why this exists: QuickBooks-derived numbers must never silently replace what an owner typed, nor be used when
 * they cannot be trusted (wrong currency, internally inconsistent report, archived business). The sync stores
 * provider data only in QBO-specific observation/record tables; nothing in this slice writes an owner snapshot.
 * When a later reviewed slice adopts QuickBooks values into snapshots it MUST resolve every field through
 * resolveFinancialFieldPrecedence(), which encodes these rules deterministically:
 *
 *  1. MANUAL ALWAYS WINS. A value the owner entered (any non-null manual value) is never overwritten. If the
 *     QuickBooks observation differs materially, the result carries `conflict: true` and the QuickBooks figure as
 *     a *suggestion* for the owner to accept — it does not replace the manual value.
 *  2. QBO FILLS GAPS ONLY. A field with no manual value may take the QuickBooks value, tagged PROVIDER_SYNCED with
 *     the observation's identity (so it can be traced back to a connection, report and fetch time).
 *  3. CURRENCY MUST MATCH. The business currency is authoritative. A QuickBooks value in another currency — or
 *     with an unknown currency — is never converted and never adopted (reason CURRENCY_MISMATCH / CURRENCY_UNKNOWN).
 *  4. INCONSISTENT REPORTS ARE NOT EVIDENCE. An observation whose parser flagged an internal inconsistency is
 *     refused (reason OBSERVATION_INCONSISTENT).
 *  5. STALE OBSERVATIONS ARE NOT EVIDENCE. An observation older than the staleness bound is refused (STALE).
 *  6. ARCHIVED BUSINESSES NEVER ADOPT.
 *  7. ABSENT IS NOT ZERO. A metric QuickBooks did not return stays absent (NO_PROVIDER_VALUE); a zero is only a
 *     zero when QuickBooks said so.
 *
 * Confidence: provider-synced values are strong but not owner-attested; callers cap data-confidence for any
 * snapshot field sourced from here at PROVIDER_SYNCED_CONFIDENCE.
 */

export type FinancialFieldSource = "MANUAL" | "QBO" | "NONE";

export type PrecedenceReason =
  | "MANUAL_VALUE_PRESENT"
  | "PROVIDER_FILLS_GAP"
  | "NO_PROVIDER_VALUE"
  | "CURRENCY_MISMATCH"
  | "CURRENCY_UNKNOWN"
  | "OBSERVATION_INCONSISTENT"
  | "STALE"
  | "BUSINESS_ARCHIVED";

/** Which QuickBooks metric informs which owner snapshot field. */
export const QBO_FIELD_SOURCES = {
  revenue: { report: "ProfitAndLoss", metric: "Income" },
  costOfGoods: { report: "ProfitAndLoss", metric: "COGS" },
  cashOnHand: { report: "BalanceSheet", metric: "BankAccounts" },
  receivables: { report: "AgedReceivables", metric: "total" },
  overdueReceivables: { report: "AgedReceivables", metric: "overdue" },
  payables: { report: "AgedPayables", metric: "total" },
  overduePayables: { report: "AgedPayables", metric: "overdue" },
} as const;
export type QboMappedField = keyof typeof QBO_FIELD_SOURCES;

/** Confidence ceiling for a snapshot field that came from QuickBooks (owner-attested manual data may score higher). */
export const PROVIDER_SYNCED_CONFIDENCE = 0.85;
/** An observation older than this is not used. */
export const QBO_OBSERVATION_MAX_AGE_MS = 45 * 24 * 60 * 60 * 1000;
/** Manual and provider values within this absolute tolerance are the same figure (rounding). */
export const CONFLICT_TOLERANCE = 0.5;

export interface QboObservationInput {
  /** Exact decimal string as stored. */
  value: string | null;
  currency: string | null;
  fetchedAt: Date;
  inconsistencies: readonly string[];
  /** Traceability back to the stored observation. */
  observationId: string;
  connectionId: string;
}

export interface PrecedenceInput {
  field: QboMappedField;
  /** The owner-entered value, or null when the owner has not provided one. */
  manualValue: number | null;
  qbo: QboObservationInput | null;
  businessCurrency: string;
  businessIsActive: boolean;
  now: Date;
}

export interface PrecedenceResult {
  field: QboMappedField;
  source: FinancialFieldSource;
  value: number | null;
  reason: PrecedenceReason;
  /** Manual and QuickBooks values both exist and differ materially. */
  conflict: boolean;
  /** The QuickBooks figure offered to the owner when it was not adopted but is usable. */
  suggestion: number | null;
  provenance: { observationId: string; connectionId: string; fetchedAt: Date } | null;
  confidenceCap: number | null;
}

function usableQbo(i: PrecedenceInput): { ok: true; value: number } | { ok: false; reason: PrecedenceReason } {
  const q = i.qbo;
  if (!q || q.value === null) return { ok: false, reason: "NO_PROVIDER_VALUE" };
  if (q.currency === null) return { ok: false, reason: "CURRENCY_UNKNOWN" };
  if (q.currency !== i.businessCurrency) return { ok: false, reason: "CURRENCY_MISMATCH" };
  if (q.inconsistencies.length > 0) return { ok: false, reason: "OBSERVATION_INCONSISTENT" };
  if (i.now.getTime() - q.fetchedAt.getTime() > QBO_OBSERVATION_MAX_AGE_MS) return { ok: false, reason: "STALE" };
  const n = Number(q.value);
  if (!Number.isFinite(n)) return { ok: false, reason: "NO_PROVIDER_VALUE" };
  return { ok: true, value: n };
}

export function resolveFinancialFieldPrecedence(i: PrecedenceInput): PrecedenceResult {
  const none = (reason: PrecedenceReason, suggestion: number | null = null): PrecedenceResult => ({
    field: i.field, source: "NONE", value: null, reason, conflict: false, suggestion, provenance: null, confidenceCap: null,
  });

  if (!i.businessIsActive) return none("BUSINESS_ARCHIVED");
  const q = usableQbo(i);

  if (i.manualValue !== null) {
    const conflict = q.ok && Math.abs(q.value - i.manualValue) > CONFLICT_TOLERANCE;
    return {
      field: i.field, source: "MANUAL", value: i.manualValue, reason: "MANUAL_VALUE_PRESENT",
      conflict, suggestion: conflict && q.ok ? q.value : null, provenance: null, confidenceCap: null,
    };
  }

  if (!q.ok) return none(q.reason);
  const obs = i.qbo as QboObservationInput;
  return {
    field: i.field, source: "QBO", value: q.value, reason: "PROVIDER_FILLS_GAP", conflict: false, suggestion: null,
    provenance: { observationId: obs.observationId, connectionId: obs.connectionId, fetchedAt: obs.fetchedAt },
    confidenceCap: PROVIDER_SYNCED_CONFIDENCE,
  };
}

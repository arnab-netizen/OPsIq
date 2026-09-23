/**
 * Owner-facing labels for Trust's (`/owner/trust`) finding type, audit event name, and audit
 * entity type fields.
 *
 * Contract (corrected after review): a **known** value -- one this codebase actually defines a
 * meaning for -- gets an accurate, curated, readable label. An **unknown or historical** value --
 * one present but not matched against a repository-defined source -- gets an honest neutral label
 * ("Other finding" / "Other event" / "Other entity type"), never a mechanical reformat of the raw
 * string. Reformatting an identifier's own words (splitting camelCase, replacing separators) is
 * NOT by itself evidence that the result is a meaningful business label -- it only proves the
 * string was reshaped, not that its meaning was verified. So reformatting is used here only where
 * it is paired with a positive match against an authoritative, repository-defined source (see
 * `eventNameLabel` below); it is never applied to an arbitrary, unverified runtime value. A
 * **missing** value (null/undefined/empty) is distinguished from "unknown but present" with its
 * own label, since the two mean different things to an owner (no data recorded vs. a real value
 * this page doesn't yet have a name for).
 *
 * The original raw value is never discarded by any of this -- callers keep it available verbatim
 * in Trust's "Technical reference" disclosure.
 */
import { FINDING_TYPE_LABEL } from "@/components/owner/FindingCard";
import { AUDIT_EVENTS } from "@/domain/constants/audit-events";

/**
 * Own-property-only lookup for a plain object literal used as a label table. A bare `map[key]`
 * lookup is unsafe when `key` comes from server/user-controlled data: every plain JS object
 * inherits `Object.prototype` members (`constructor`, `toString`, `hasOwnProperty`, `valueOf`,
 * ...), so a value like `"constructor"` would resolve to `Object`'s constructor function rather
 * than `undefined` -- silently returning a non-string, unrenderable value instead of falling
 * through to the "unknown" branch. `Object.prototype.hasOwnProperty.call` (not `map.hasOwnProperty`,
 * which itself could be shadowed by a same-named own property) confirms the key was actually
 * defined on `map` itself before it is ever indexed.
 */
function ownLookup<T>(map: Record<string, T>, key: string): T | undefined {
  return Object.prototype.hasOwnProperty.call(map, key) ? map[key] : undefined;
}

/** Reduces a raw field value to one of three cases every label function below handles identically. */
type FieldState = { kind: "missing" } | { kind: "invalid" } | { kind: "value"; value: string };
function classify(raw: unknown): FieldState {
  if (raw === null || raw === undefined) return { kind: "missing" };
  if (typeof raw !== "string") return { kind: "invalid" };
  if (raw.trim() === "") return { kind: "missing" };
  return { kind: "value", value: raw };
}

/**
 * findingType has exactly two curated, repository-defined values (FindingCard.tsx's own
 * FINDING_TYPE_LABEL: opportunity/risk). Anything else present is a genuinely unknown finding
 * classification -- "Other finding", never a guess.
 */
export function findingTypeLabel(raw: unknown): string {
  const state = classify(raw);
  if (state.kind === "missing") return "Finding type not recorded";
  if (state.kind === "invalid") return "Other finding";
  return ownLookup(FINDING_TYPE_LABEL, state.value.toLowerCase()) ?? "Other finding";
}

/**
 * Every audit event this codebase writes against a diagnosis cycle's own id (the only entityId
 * Trust's audit trail is ever queried with -- see getEntityAuditTrail/loadAudit) -- confirmed by
 * grepping every `entityType: "Owner*Cycle"` audit-emission site across all 7 owner-mode diagnosis
 * services (owner-finance/sales/cashflow/operations/sop/marketing/strategy diagnosis.service.ts).
 * Each entry here reuses the exact AUDIT_EVENTS constant it corresponds to (never a re-typed
 * string), so a rename in audit-events.ts breaks this file at compile time rather than silently
 * drifting. Deliberately NOT a reformat of every one of AUDIT_EVENTS' ~500 unrelated system-wide
 * event names (login, billing, client-account, etc.) -- those are outside what this page's audit
 * trail can ever show, and mapping them would be scope well beyond Trust.
 */
const CYCLE_EVENT_LABEL: Record<string, string> = {
  [AUDIT_EVENTS.OWNER_FINANCE_DIAGNOSIS_RUN]: "Finance diagnosis run",
  [AUDIT_EVENTS.OWNER_FINANCE_DIAGNOSIS_LOW_CONFIDENCE]: "Finance diagnosis flagged low confidence",
  [AUDIT_EVENTS.OWNER_SALES_DIAGNOSIS_RUN]: "Sales diagnosis run",
  [AUDIT_EVENTS.OWNER_CASHFLOW_DIAGNOSIS_RUN]: "Cashflow diagnosis run",
  [AUDIT_EVENTS.OWNER_OPERATIONS_DIAGNOSIS_RUN]: "Operations diagnosis run",
  [AUDIT_EVENTS.OWNER_SOP_DIAGNOSIS_RUN]: "Execution diagnosis run",
  [AUDIT_EVENTS.OWNER_MARKETING_DIAGNOSIS_RUN]: "Marketing diagnosis run",
  [AUDIT_EVENTS.OWNER_STRATEGY_DIAGNOSIS_RUN]: "Strategy diagnosis run",
};

export function eventNameLabel(raw: unknown): string {
  const state = classify(raw);
  if (state.kind === "missing") return "Event not recorded";
  if (state.kind === "invalid") return "Other event";
  return ownLookup(CYCLE_EVENT_LABEL, state.value) ?? "Other event";
}

/**
 * The `entityType` values the same 7 diagnosis services above write alongside those events
 * (verified at the same call sites) -- one Owner*Cycle model name per trust domain.
 */
const CYCLE_ENTITY_TYPE_LABEL: Record<string, string> = {
  OwnerFinanceCycle: "Finance cycle",
  OwnerSalesCycle: "Sales cycle",
  OwnerCashflowCycle: "Cashflow cycle",
  OwnerOperationsCycle: "Operations cycle",
  OwnerSopCycle: "Execution cycle",
  OwnerMarketingCycle: "Marketing cycle",
  OwnerStrategyCycle: "Strategy cycle",
};

export function entityTypeLabel(raw: unknown): string {
  const state = classify(raw);
  if (state.kind === "missing") return "Entity type not recorded";
  if (state.kind === "invalid") return "Other entity type";
  return ownLookup(CYCLE_ENTITY_TYPE_LABEL, state.value) ?? "Other entity type";
}

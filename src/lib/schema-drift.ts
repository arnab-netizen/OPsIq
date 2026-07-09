/**
 * Schema-drift classifier — Phase 4 (production schema-drift / runtime readiness).
 *
 * Pure functions (no DB, no filesystem, no secrets) that recognise a Prisma
 * "column does not exist" runtime error — Prisma code `P2022`, PostgreSQL SQLSTATE
 * `42703` (undefined_column), or driver-adapter `ColumnNotFound` — and map the missing
 * `table.column` to the migration that introduces it.
 *
 * Purpose: let runtime diagnostics and the production smoke tell a SCHEMA_DRIFT (the
 * deployed database is behind on a migration) apart from a genuine product failure or a
 * legitimate "record missing" state. Before this, a drift-induced 500 in a membership
 * read was mislabelled (e.g. as `membership_missing`) — a false, misleading signal.
 *
 * This module NEVER decides that drift is "ok"/PASS; it only classifies. Callers must
 * surface SCHEMA_DRIFT as a distinct non-pass state and never fake green.
 */

export type DbRuntimeErrorKind = "schema_drift" | "other";

export interface SchemaDriftInfo {
  kind: DbRuntimeErrorKind;
  /** table reported by the DB error, if extractable (e.g. "workspace_memberships") */
  table?: string;
  /** column reported by the DB error, if extractable (e.g. "primary_auth_method") */
  column?: string;
  /** migration directory that introduces the missing column, if known */
  introducedByMigration?: string;
  /** secret-free, operator-safe human summary */
  summary: string;
}

/**
 * Static manifest of columns added by migrations a deployed database can be behind on.
 * Keyed by "table.column" exactly as Prisma/PostgreSQL report them.
 *
 * Kept explicit and minimal — this is a readiness signal, not an exhaustive schema map.
 * Currently covers the `workspace_memberships` columns added by
 * `20260625120000_owner_mode_execution_tables` (the drift confirmed in Phase 3 that
 * broke owner login and the demo-permission-proof read). Extend as new drift is diagnosed.
 */
export const COLUMN_TO_MIGRATION: Readonly<Record<string, string>> = {
  "workspace_memberships.accepted_at": "20260625120000_owner_mode_execution_tables",
  "workspace_memberships.allowed_task_types": "20260625120000_owner_mode_execution_tables",
  "workspace_memberships.authority_limits": "20260625120000_owner_mode_execution_tables",
  "workspace_memberships.created_by_owner_id": "20260625120000_owner_mode_execution_tables",
  "workspace_memberships.designation": "20260625120000_owner_mode_execution_tables",
  "workspace_memberships.invitation_status": "20260625120000_owner_mode_execution_tables",
  "workspace_memberships.invited_at": "20260625120000_owner_mode_execution_tables",
  "workspace_memberships.manager_id": "20260625120000_owner_mode_execution_tables",
  "workspace_memberships.offboarded_at": "20260625120000_owner_mode_execution_tables",
  "workspace_memberships.primary_auth_method": "20260625120000_owner_mode_execution_tables",
  "workspace_memberships.suspended_at": "20260625120000_owner_mode_execution_tables",
};

function readString(obj: unknown, key: string): string | undefined {
  if (obj && typeof obj === "object" && key in obj) {
    const v = (obj as Record<string, unknown>)[key];
    if (typeof v === "string") return v;
  }
  return undefined;
}

function readMeta(error: unknown): Record<string, unknown> | undefined {
  if (error && typeof error === "object" && "meta" in error) {
    const meta = (error as { meta?: unknown }).meta;
    if (meta && typeof meta === "object") return meta as Record<string, unknown>;
  }
  return undefined;
}

function readDriverCause(error: unknown): Record<string, unknown> | undefined {
  const meta = readMeta(error);
  const dae = meta?.driverAdapterError;
  if (dae && typeof dae === "object") {
    const cause = (dae as Record<string, unknown>).cause;
    if (cause && typeof cause === "object") return cause as Record<string, unknown>;
  }
  return undefined;
}

function errorMessageFromDriverCause(error: unknown): string | undefined {
  const cause = readDriverCause(error);
  return readString(cause, "originalMessage");
}

function errorMessage(error: unknown): string {
  // Read the error text for column PARSING only (never rendered to a client/operator; the
  // classifier's output is a constructed, secret-free summary). Use String(error) rather than
  // `.message` so this stays a safe stringify — for an Error, String() yields "Error: <message>",
  // which still contains the "column ... does not exist" text the regex needs.
  if (typeof error === "string") return error;
  const driverMessage = errorMessageFromDriverCause(error);
  if (driverMessage) return driverMessage;
  return String(error ?? "");
}

/**
 * True if the error is a "column does not exist" schema-drift error, by any of the
 * equivalent signals Prisma / the driver adapter emit.
 */
export function isSchemaDriftError(error: unknown): boolean {
  if (readString(error, "code") === "P2022") return true;

  const cause = readDriverCause(error);
  if (cause) {
    if (readString(cause, "kind") === "ColumnNotFound") return true;
    if (readString(cause, "originalCode") === "42703") return true;
  }

  const msg = errorMessage(error);
  if (/column\b/i.test(msg) && /does not exist/i.test(msg)) return true;

  return false;
}

/**
 * Extract the missing `{ table, column }` from a schema-drift error, or `null` if the
 * error is not schema drift. Returns `{}` if drift is detected but the exact column
 * could not be parsed.
 */
export function extractMissingColumn(
  error: unknown
): { table?: string; column?: string } | null {
  if (!isSchemaDriftError(error)) return null;

  // 1) Prisma P2022 meta.column, or driver-adapter cause.column.
  const meta = readMeta(error);
  const cause = readDriverCause(error);
  const rawFromMeta = readString(meta, "column") ?? readString(cause, "column");

  // 2) Fallback: parse the message ("column workspace_memberships.foo does not exist").
  const rawFromMsg = errorMessage(error).match(
    /column\s+"?([a-zA-Z0-9_]+(?:\.[a-zA-Z0-9_]+)?)"?\s+does not exist/i
  )?.[1];

  const raw = rawFromMeta ?? rawFromMsg;
  if (!raw) return {};

  const dot = raw.indexOf(".");
  if (dot > 0) {
    return { table: raw.slice(0, dot), column: raw.slice(dot + 1) };
  }
  return { column: raw };
}

/**
 * Classify a database runtime error as `schema_drift` (with the missing column and the
 * migration that introduces it, when known) or `other`.
 */
export function classifyDbRuntimeError(error: unknown): SchemaDriftInfo {
  if (!isSchemaDriftError(error)) {
    return { kind: "other", summary: "Non-drift database error." };
  }

  const loc = extractMissingColumn(error) ?? {};
  const key = loc.table && loc.column ? `${loc.table}.${loc.column}` : undefined;
  const introducedByMigration = key ? COLUMN_TO_MIGRATION[key] : undefined;
  const where = key ?? loc.column ?? "an expected column";

  const summary = introducedByMigration
    ? `Schema drift: the deployed database is missing ${where} (introduced by migration ${introducedByMigration}). Apply the pending migration to the deployed database.`
    : `Schema drift: the deployed database is missing ${where}. A pending migration must be applied to the deployed database.`;

  return {
    kind: "schema_drift",
    table: loc.table,
    column: loc.column,
    introducedByMigration,
    summary,
  };
}

/**
 * Smoke/diagnostic helper: given a JSON response body from an internal proof endpoint,
 * report whether it signals schema drift. Kept here (single source of truth) so the
 * production smoke and any diagnostic surface classify identically.
 */
export function isSchemaDriftResponseBody(body: unknown): boolean {
  return readString(body, "classification") === "schema_drift";
}

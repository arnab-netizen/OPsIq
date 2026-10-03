/**
 * Known PRODUCTION database identity (non-secret) — used only to REFUSE, never to connect.
 *
 * ─── Why this exists ─────────────────────────────────────────────────────────
 *
 * `OPSIQ_ALLOW_REMOTE_TEST_DB=true` means "this is a remote TEST database". Before this module nothing
 * in code verified that: a TEST_DATABASE_URL / DATABASE_URL_TEST / DATABASE_URL secret accidentally set to the
 * production Neon database would have been accepted, and a destructive `.db.test.ts` run (or a
 * `prisma db push --force-reset`) would have reached production. The only other check was a regular
 * expression over the URL text in one workflow — not an identity check.
 *
 * ─── What it checks ──────────────────────────────────────────────────────────
 *
 * 1. STATIC (no connection): the URL's effective hostname must not be a production Neon endpoint. Compared
 *    on the endpoint id (first DNS label, with the `-pooler` / `-<compute binding>` suffixes ignored), so
 *    the pooler, the direct host, a compute host, upper case, a trailing dot and a percent-encoded hostname
 *    (pg decodes it; `new URL` does not for non-special schemes) all resolve to the same identity.
 * 2. RUNTIME (read-only): Neon exposes the connected endpoint/project/branch inside the database
 *    (`neon.endpoint_id`, `neon.project_id`, `neon.branch_id`). A connection that is on the production
 *    endpoint OR the production branch is production regardless of what hostname reached it (another endpoint
 *    on the production branch has a different hostname). A remote database whose identity cannot be read is
 *    UNVERIFIABLE and is refused — fail closed.
 *
 * The identifiers are infrastructure ids, not credentials (the production host is already recorded in the
 * repository's production-forensics evidence). Rotation does not need a code change: extend the list with
 * OPSIQ_PRODUCTION_DB_IDENTITIES (comma-separated `ep-…` endpoint ids and/or `br-…` branch ids).
 *
 * Pure and dependency-free. Nothing here ever returns, logs or throws a URL, host, user or password.
 */

/** Production Neon endpoint ids: the read-write endpoint and the read replica of the production branch. */
export const PRODUCTION_DB_ENDPOINT_IDS: readonly string[] = ["ep-empty-sky-ay1e6c27", "ep-red-bar-ay5godie"];

/** Production Neon branch id. A test branch of the same project has a different branch id and is not production. */
export const PRODUCTION_NEON_BRANCH_IDS: readonly string[] = ["br-purple-boat-ayjn6zl6"];

export const PRODUCTION_DB_IDENTITIES_ENV = "OPSIQ_PRODUCTION_DB_IDENTITIES";

export type DatabaseEnv = Readonly<Record<string, string | undefined>>;

export interface ProductionIdentitySet {
  endpoints: readonly string[];
  branches: readonly string[];
}

/** Built-in production identity plus any operator-declared extension (`ep-…` / `br-…` tokens only). */
export function productionIdentities(env: DatabaseEnv = {}): ProductionIdentitySet {
  const endpoints = new Set(PRODUCTION_DB_ENDPOINT_IDS);
  const branches = new Set(PRODUCTION_NEON_BRANCH_IDS);
  for (const raw of (env[PRODUCTION_DB_IDENTITIES_ENV] ?? "").split(",")) {
    const token = raw.trim().toLowerCase();
    if (token.startsWith("ep-")) endpoints.add(token);
    else if (token.startsWith("br-")) branches.add(token);
  }
  return { endpoints: [...endpoints], branches: [...branches] };
}

/**
 * The hostname pg will actually connect to, or null when it cannot be determined safely:
 * not a postgres: / postgresql: URL, a `host` / `hostaddr` override (pg connects there instead), an empty or
 * multi-host hostname (pg would fall back to PGHOST / a socket), or an undecodable hostname.
 */
export function effectiveDatabaseHostname(url: string): string | null {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return null;
  }
  if (parsed.protocol !== "postgres:" && parsed.protocol !== "postgresql:") return null;
  for (const key of parsed.searchParams.keys()) {
    const k = key.toLowerCase();
    if (k === "host" || k === "hostaddr") return null;
  }
  let host: string;
  try {
    // pg-connection-string decodes the hostname; `new URL` keeps it percent-encoded for non-special schemes.
    host = decodeURIComponent(parsed.hostname);
  } catch {
    return null;
  }
  host = host.trim().toLowerCase().replace(/\.+$/, "");
  if (!host || /[\s,/\\]/.test(host)) return null;
  return host;
}

export type RemoteHostVerdict = "ok" | "production" | "unverifiable";

/** Static (pre-connection) classification of a remote database URL. */
export function classifyRemoteDatabaseUrl(url: string, env: DatabaseEnv = {}): RemoteHostVerdict {
  const host = effectiveDatabaseHostname(url);
  if (host === null) return "unverifiable";
  const label = host.split(".")[0];
  const { endpoints } = productionIdentities(env);
  for (const id of endpoints) {
    // `ep-x-y-z`, `ep-x-y-z-pooler`, `ep-x-y-z-<binding>`, `ep-x-y-z-<binding>-pooler`
    if (label === id || label.startsWith(`${id}-`)) return "production";
  }
  return "ok";
}

/** Identity as the connected database reports it (Neon GUCs). */
export interface DatabaseIdentity {
  endpointId: string | null;
  projectId: string | null;
  branchId: string | null;
}

/** Read-only query that returns the connected database's own identity; empty values on non-Neon servers. */
export const DATABASE_IDENTITY_SQL =
  "SELECT current_setting('neon.endpoint_id', true) AS endpoint_id, " +
  "current_setting('neon.project_id', true) AS project_id, " +
  "current_setting('neon.branch_id', true) AS branch_id";

export type DatabaseIdentityVerdict = "production" | "non-production" | "unverifiable";

function clean(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim().toLowerCase() : null;
}

export function databaseIdentityFromRow(row: Record<string, unknown> | undefined | null): DatabaseIdentity {
  return { endpointId: clean(row?.endpoint_id), projectId: clean(row?.project_id), branchId: clean(row?.branch_id) };
}

/**
 * Production when the connected endpoint or branch is a production one. Non-production only when an identity
 * WAS read and none of it is production. No readable identity at all is unverifiable (refused by callers).
 */
export function classifyDatabaseIdentity(identity: DatabaseIdentity, env: DatabaseEnv = {}): DatabaseIdentityVerdict {
  const { endpoints, branches } = productionIdentities(env);
  if (identity.endpointId && endpoints.includes(identity.endpointId)) return "production";
  if (identity.branchId && branches.includes(identity.branchId)) return "production";
  if (identity.endpointId || identity.projectId || identity.branchId) return "non-production";
  return "unverifiable";
}

/**
 * The ONE staging database-target validator.
 *
 * Every repository-owned operation that mutates a remote STAGING database — the Prisma CLI guard
 * (`OPSIQ_DB_TARGET=staging`, src/infra/prisma-datasource.ts), the staging reset workflow's raw `psql`
 * `DROP SCHEMA`, the staging seed, the staging reset script — proves its target through this function, so the
 * rules cannot drift between a Prisma path and a path that never loads prisma.config.ts.
 *
 * Positive authorization, never a denylist: the URL's DIRECT endpoint id must exactly match an entry of the
 * operator-maintained allowlist (OPSIQ_APPROVED_STAGING_ENDPOINT_IDS, a non-secret list of ids). "Not a known
 * production host" is NOT authorization; an empty or malformed allowlist fails closed.
 *
 * Refusals are sanitized by construction: the messages name rules and variable names only — never the URL,
 * hostname, username, password or database name.
 *
 * Pure: no I/O, no clock.
 */
import { classifyRemoteDatabaseUrl, effectiveDatabaseHostname } from "./production-db-identity";
import { isLoopbackDatabaseUrl } from "./test-database-guard";

export const APPROVED_STAGING_ENDPOINT_IDS_ENV = "OPSIQ_APPROVED_STAGING_ENDPOINT_IDS";
export const LOCAL_DB_EXTRA_HOSTS_ENV = "OPSIQ_LOCAL_DB_EXTRA_HOSTS";

export type StagingTargetRefusalCode =
  | "URL_UNSET"
  | "URL_NOT_PLAIN_POSTGRES"
  | "PRODUCTION_ENDPOINT"
  | "POOLED_ENDPOINT"
  | "ALLOWLIST_EMPTY"
  | "ALLOWLIST_MALFORMED"
  | "ENDPOINT_NOT_APPROVED";

export class StagingTargetRefusal extends Error {
  readonly code: StagingTargetRefusalCode;
  constructor(code: StagingTargetRefusalCode, message: string) {
    super(message);
    this.name = "StagingTargetRefusal";
    this.code = code;
  }
}

type Env = Readonly<Record<string, string | undefined>>;

const ENDPOINT_ID = /^[a-z0-9][a-z0-9-]*$/;

/**
 * Parse the allowlist strictly. Accepts an env value (comma separated) or an array. Empty → refuse; any entry that
 * is not a plain lowercase endpoint id (spaces inside, slashes, URLs, wildcards, empty list elements) → refuse
 * the WHOLE list, so a typo can never widen what is approved.
 */
export function parseApprovedStagingEndpointIds(raw: string | readonly string[] | undefined): string[] {
  const entries = (Array.isArray(raw) ? [...raw] : String(raw ?? "").split(","))
    .map((e) => String(e).trim().toLowerCase());
  const nonEmpty = entries.filter(Boolean);
  if (nonEmpty.length === 0) {
    throw new StagingTargetRefusal(
      "ALLOWLIST_EMPTY",
      `${APPROVED_STAGING_ENDPOINT_IDS_ENV} is not set or is empty. Refusing: a staging target must be positively approved.`
    );
  }
  if (nonEmpty.length !== entries.length || nonEmpty.some((e) => !ENDPOINT_ID.test(e))) {
    throw new StagingTargetRefusal(
      "ALLOWLIST_MALFORMED",
      `${APPROVED_STAGING_ENDPOINT_IDS_ENV} is malformed (expected a comma-separated list of plain endpoint ids). Refusing.`
    );
  }
  return nonEmpty;
}

/**
 * Prove `url` is an approved staging database or throw StagingTargetRefusal (sanitized).
 * Returns the matched endpoint id (an allowlist entry — not a secret).
 */
export function assertApprovedStagingDatabaseUrl(
  url: string | undefined,
  approvedEndpointIds: string | readonly string[] | undefined,
  env: Env = {}
): { endpointId: string } {
  if (!url || !url.trim()) {
    throw new StagingTargetRefusal("URL_UNSET", "The staging database URL is not set. Refusing.");
  }
  // Validates scheme, rejects host/hostaddr query overrides and unsafe hostnames: the effective host must be provable.
  const host = effectiveDatabaseHostname(url);
  if (host === null) {
    throw new StagingTargetRefusal(
      "URL_NOT_PLAIN_POSTGRES",
      "The staging database URL is not a well-formed postgres URL with a plain, provable hostname (host/hostaddr overrides are refused). Refusing."
    );
  }
  if (classifyRemoteDatabaseUrl(url, env) !== "ok") {
    throw new StagingTargetRefusal("PRODUCTION_ENDPOINT", "The staging database URL is a known production endpoint. Refusing.");
  }
  const label = host.split(".")[0];
  if (label.endsWith("-pooler")) {
    throw new StagingTargetRefusal(
      "POOLED_ENDPOINT",
      "Schema mutation requires the DIRECT (non-pooler) staging endpoint. Refusing a pooled endpoint."
    );
  }
  const approved = parseApprovedStagingEndpointIds(approvedEndpointIds);
  if (!approved.includes(label)) {
    throw new StagingTargetRefusal(
      "ENDPOINT_NOT_APPROVED",
      `The staging database endpoint is not listed in ${APPROVED_STAGING_ENDPOINT_IDS_ENV}. ` +
        "Refusing to mutate a database that was merely labelled staging."
    );
  }
  return { endpointId: label };
}

/**
 * Positively local: a loopback URL, or a single-label compose service name (no dots, not an IP) the operator listed
 * in OPSIQ_LOCAL_DB_EXTRA_HOSTS. Every dotted remote hostname is not local.
 */
export function isPositivelyLocalDatabaseUrl(url: string, env: Env = {}): boolean {
  if (isLoopbackDatabaseUrl(url)) return true;
  const host = effectiveDatabaseHostname(url);
  if (host === null) return false;
  if (host.includes(".") || host.includes(":") || /^\d+$/.test(host)) return false;
  const extra = (env[LOCAL_DB_EXTRA_HOSTS_ENV] ?? "").split(",").map((x) => x.trim().toLowerCase()).filter(Boolean);
  return extra.includes(host);
}

/**
 * Guard for a destructive operation that does NOT go through the Prisma CLI: the target must be positively local
 * or an approved staging endpoint. Anything else (production, unknown remote, unlisted staging) is refused.
 */
export function assertLocalOrApprovedStagingTarget(
  url: string | undefined,
  env: Env = {}
): { kind: "local" } | { kind: "staging"; endpointId: string } {
  if (url && isPositivelyLocalDatabaseUrl(url, env)) return { kind: "local" };
  const { endpointId } = assertApprovedStagingDatabaseUrl(url, env[APPROVED_STAGING_ENDPOINT_IDS_ENV], env);
  return { kind: "staging", endpointId };
}

/**
 * Target guard for the runtime-role cutover tool (scripts/db/opsiq-role-cutover.ts).
 *
 * The tool can create roles and change grants, so the database it is pointed at must be PROVEN, never trusted from a label:
 *   local | ci   the URL is positively loopback (or an explicitly listed compose service);
 *   test         a plain remote hostname that is not production (a loopback URL is fine too);
 *   staging      the shared approved-staging validator (direct endpoint listed in OPSIQ_APPROVED_STAGING_ENDPOINT_IDS);
 *   production   the URL is a known production endpoint, the DIRECT endpoint (not the pooler), its hostname equals the operator-pinned
 *                --expected-host exactly, OPSIQ_DB_TARGET=production and OPSIQ_ALLOW_PRODUCTION_DB_COMMAND=true are set, and — after
 *                connecting — the database's OWN identity (Neon endpoint / branch GUCs) is production. A mutation additionally needs the
 *                exact confirmation phrase. Anything unverifiable is refused.
 * Every message is sanitized: it names variables and refusal codes, never a URL, host, user or password.
 */
import { classifyDatabaseIdentity, classifyRemoteDatabaseUrl, effectiveDatabaseHostname, type DatabaseIdentity } from "./production-db-identity";
import { StagingTargetRefusal, assertApprovedStagingDatabaseUrl, isPositivelyLocalDatabaseUrl } from "./staging-database-target";

export type RoleCutoverTarget = "local" | "ci" | "test" | "staging" | "production";
export type RoleCutoverCommand = "plan" | "apply" | "verify" | "probe";
export const ROLE_CUTOVER_TARGETS: readonly RoleCutoverTarget[] = ["local", "ci", "test", "staging", "production"];
export const PRODUCTION_APPLY_CONFIRMATION = "APPLY PRODUCTION RUNTIME ROLE TOPOLOGY";

export class RoleCutoverRefusal extends Error {
  constructor(readonly code: string, message: string) {
    super(message);
    this.name = "RoleCutoverRefusal";
  }
}

type Env = Readonly<Record<string, string | undefined>>;
export interface RoleCutoverTargetInput {
  command: RoleCutoverCommand;
  target: string | undefined;
  url: string | undefined;
  env: Env;
  /** Operator-pinned bare hostname (production only). */
  expectedHost?: string;
  /** Typed confirmation (production apply only). */
  confirm?: string;
  /** apply --dry-run changes nothing (rolled back), so it does not need the confirmation phrase. */
  dryRun?: boolean;
}

const BARE_HOST = /^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$/;

export function parseRoleCutoverTarget(raw: string | undefined): RoleCutoverTarget {
  const t = (raw ?? "").trim().toLowerCase();
  if (!(ROLE_CUTOVER_TARGETS as readonly string[]).includes(t)) {
    throw new RoleCutoverRefusal("TARGET_REQUIRED", `--target is required (one of: ${ROLE_CUTOVER_TARGETS.join(", ")}). No database is selected implicitly.`);
  }
  return t as RoleCutoverTarget;
}

/** Static (pre-connection) checks. Throws RoleCutoverRefusal; returns the proven target. */
export function assertRoleCutoverStaticTarget(input: RoleCutoverTargetInput): RoleCutoverTarget {
  const target = parseRoleCutoverTarget(input.target);
  const { url, env } = input;
  if (!url || !url.trim()) throw new RoleCutoverRefusal("URL_UNSET", "The database URL variable for this command is not set. Refusing.");
  const host = effectiveDatabaseHostname(url);
  if (host === null) throw new RoleCutoverRefusal("URL_NOT_PLAIN_POSTGRES", "The database URL is not a well-formed postgres URL with a plain, provable hostname. Refusing.");
  if (target === "local" || target === "ci") {
    if (!isPositivelyLocalDatabaseUrl(url, env)) throw new RoleCutoverRefusal("NOT_LOCAL", `--target ${target} requires a loopback database; the URL is not local. Refusing a database that was merely labelled ${target}.`);
    return target;
  }
  if (target === "test") {
    if (classifyRemoteDatabaseUrl(url, env) === "production") throw new RoleCutoverRefusal("PRODUCTION_ENDPOINT", "The test database URL is a known production endpoint. Refusing.");
    return target;
  }
  if (target === "staging") {
    try { assertApprovedStagingDatabaseUrl(url, env.OPSIQ_APPROVED_STAGING_ENDPOINT_IDS, env); } catch (e) {
      if (e instanceof StagingTargetRefusal) throw new RoleCutoverRefusal(e.code, e.message);
      throw e;
    }
    return target;
  }
  // production
  if (env.OPSIQ_DB_TARGET !== "production" || env.OPSIQ_ALLOW_PRODUCTION_DB_COMMAND !== "true") {
    throw new RoleCutoverRefusal("PRODUCTION_NOT_AUTHORIZED", "A production target requires OPSIQ_DB_TARGET=production together with OPSIQ_ALLOW_PRODUCTION_DB_COMMAND=true in the invoking environment.");
  }
  if (classifyRemoteDatabaseUrl(url, env) !== "production") {
    throw new RoleCutoverRefusal("NOT_PRODUCTION_ENDPOINT", "--target production but the URL is not a known production endpoint. Refusing (no label is trusted).");
  }
  if (host.split(".")[0].endsWith("-pooler")) throw new RoleCutoverRefusal("POOLED_ENDPOINT", "Role changes require the DIRECT (non-pooler) endpoint. Refusing a pooled endpoint.");
  const expected = (input.expectedHost ?? "").trim().toLowerCase();
  if (!expected || !BARE_HOST.test(expected)) throw new RoleCutoverRefusal("EXPECTED_HOST_REQUIRED", "--expected-host must be the bare production hostname (no scheme, credentials or path).");
  if (expected !== host) throw new RoleCutoverRefusal("EXPECTED_HOST_MISMATCH", "The database hostname does not equal --expected-host. Refusing.");
  if (input.command === "apply" && !input.dryRun && input.confirm !== PRODUCTION_APPLY_CONFIRMATION) {
    throw new RoleCutoverRefusal("CONFIRMATION_REQUIRED", `A production apply requires --confirm "${PRODUCTION_APPLY_CONFIRMATION}".`);
  }
  return target;
}

/** After connecting: the database's own identity must agree with the target label. */
export function assertRoleCutoverConnectedIdentity(target: RoleCutoverTarget, identity: DatabaseIdentity, env: Env): void {
  if (target === "local" || target === "ci") return;
  const verdict = classifyDatabaseIdentity(identity, env);
  if (target === "production") {
    if (verdict !== "production") throw new RoleCutoverRefusal("IDENTITY_NOT_PRODUCTION", "--target production but the connected database does not report the production identity (or reports none). Refusing.");
    return;
  }
  if (verdict === "production") throw new RoleCutoverRefusal("IDENTITY_IS_PRODUCTION", `--target ${target} but the connected database reports the production identity. Refusing.`);
}

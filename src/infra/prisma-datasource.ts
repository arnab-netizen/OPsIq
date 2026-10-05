/**
 * Explicit Prisma datasource selection — mutation safety is POSITIVE, not label-based.
 *
 * ─── Incident this prevents ──────────────────────────────────────────────────
 *
 * prisma.config.ts previously resolved:
 *
 *   MIGRATION_DATABASE_URL || DATABASE_URL || DATABASE_URL_TEST || local default
 *
 * In a Codespaces shell where MIGRATION_DATABASE_URL happened to hold the
 * production URL, `npx prisma migrate deploy` silently selected production even
 * though the operator intended a local container. Nothing was mutated (no
 * pending migrations), but production was reached unintentionally.
 *
 * A first hardening made production require an explicit two-factor opt-in, but
 * still let a mutation-capable command with NO target run against whatever
 * DATABASE_URL held (`DATABASE_URL=<prod> prisma migrate reset`), and trusted
 * `OPSIQ_DB_TARGET=local` without checking the URL. This module closes both.
 *
 * ─── Threat model ────────────────────────────────────────────────────────────
 *
 * Defends against ACCIDENTAL / OPERATOR ERROR: a production URL left in
 * DATABASE_URL, a stale shell, a copied .env.local, an arbitrary remote URL
 * mislabelled "local", a missing target, a CLI datasource override, the wrong
 * operation, wrong workflow wiring. It does NOT defend against a developer who
 * deliberately edits this source or invokes `prisma --config <other-file>`
 * (Prisma then never loads prisma.config.ts, so no repository code can run).
 * That bypass is covered by repository governance instead: no package script,
 * workflow, script or runbook owned by OpsIQ may use it
 * (src/__tests__/governance/prisma-mutation-governance.test.ts).
 *
 * ─── Contract ────────────────────────────────────────────────────────────────
 *
 * 1. MIGRATION_DATABASE_URL is NEVER resolved implicitly. It is used only when
 *    BOTH OPSIQ_DB_TARGET=production AND OPSIQ_ALLOW_PRODUCTION_DB_COMMAND=true
 *    are set — a two-factor, auditable opt-in. That pair is the production READ
 *    authorization.
 * 2. READ / SCHEMA-ONLY commands (generate, validate, format, migrate status,
 *    migrate diff, db pull) resolve DATABASE_URL -> DATABASE_URL_TEST ->
 *    built-in local default, so they keep working with no configuration.
 * 3. MUTATION-CAPABLE commands (migrate dev/deploy/reset/resolve, db push/
 *    execute/seed, studio, and anything unrecognised) have NO implicit
 *    datasource fallback. They refuse unless OPSIQ_DB_TARGET names the target,
 *    and the label is then PROVEN against the datasource rather than trusted:
 *      - local / ci : DATABASE_URL must be a loopback URL (or a single-label
 *                     compose service name explicitly listed in
 *                     OPSIQ_LOCAL_DB_EXTRA_HOSTS). An arbitrary remote host
 *                     labelled "local" is refused; CI=true grants nothing.
 *      - test       : TEST_DATABASE_URL / DATABASE_URL_TEST; loopback, or a
 *                     remote database that is not production AND whose
 *                     in-database identity positively matches the approved
 *                     OpsIQ test branch (verified by prisma.config.ts through
 *                     the same primitives the DB test guard uses).
 *      - staging    : DATABASE_URL whose direct (non-pooler) endpoint id is
 *                     listed in OPSIQ_APPROVED_STAGING_ENDPOINT_IDS.
 *      - production : see 1 and 4.
 *    `--url` (and the other datasource-URL flags) are refused on a mutating
 *    command, as is any `--config` other than this repository's, so Prisma can
 *    never execute against a datasource other than the one that was verified.
 * 4. A production MUTATION needs more than the read authorization: the operator
 *    must declare the exact operation in OPSIQ_PRODUCTION_OPERATION, that
 *    operation must be allowlisted (PRODUCTION_ALLOWED_OPERATIONS), and it must
 *    match the operation actually being run. Declaring `migrate deploy`
 *    therefore cannot smuggle through a `migrate reset`.
 * 5. Some operations are refused against production at ANY authorization level
 *    because no correct production use exists (PRODUCTION_FORBIDDEN_OPERATIONS).
 *    Anything not allowlisted is refused as well.
 * 6. Selection is reported as a sanitized logical target only. The URL, host,
 *    username, password and database name are never emitted. Prisma operation
 *    names are not secrets and may appear in refusal messages.
 *
 * No production identifier is hard-coded here; "not a known production host" is
 * never used as authorization — unknown remote does not mean safe.
 *
 * ─── Scope limit ─────────────────────────────────────────────────────────────
 *
 * This governs the Prisma CLI only, because prisma.config.ts is what the CLI
 * loads. Application runtime and standalone scripts construct PrismaClient from
 * `env("DATABASE_URL")` in prisma/schema.prisma and are not routed through here.
 */

import { classifyRemoteDatabaseUrl, effectiveDatabaseHostname } from "./production-db-identity";
import { isLoopbackDatabaseUrl } from "./test-database-guard";

export type PrismaTarget = "local" | "test" | "ci" | "staging" | "production-authorized";

/** Datasource used when nothing is configured. Schema-only commands rely on it. */
export const BUILT_IN_LOCAL_DEFAULT =
  "postgresql://postgres:postgres@localhost:5432/opsiq_dev?schema=public";

/** Environment variables that carry database-mutation AUTHORIZATION (never honoured from a dotenv file). */
export const PRISMA_AUTHORIZATION_ENV_KEYS = [
  "OPSIQ_DB_TARGET",
  "OPSIQ_ALLOW_PRODUCTION_DB_COMMAND",
  "OPSIQ_PRODUCTION_OPERATION",
  "OPSIQ_LOCAL_DB_EXTRA_HOSTS",
  "OPSIQ_APPROVED_STAGING_ENDPOINT_IDS",
] as const;

/**
 * Run a dotenv loader, then discard every database-mutation AUTHORIZATION variable it introduced. A dotenv file
 * may supply connection strings, but a copied or stale `.env.local` must never authorize a mutation the
 * operator did not intend: authorization has to come from the invoking environment.
 */
export function loadDotenvWithoutAuthorization(
  env: Record<string, string | undefined>,
  load: () => void
): void {
  const before = new Map<string, string | undefined>(PRISMA_AUTHORIZATION_ENV_KEYS.map((k) => [k, env[k]]));
  load();
  for (const [key, value] of before) {
    if (value === undefined) delete env[key];
    else env[key] = value;
  }
}

/**
 * Operations that can change schema, data or migration state. Anything not
 * known to be read-only is treated as mutation-capable.
 */
const MUTATING_OPERATIONS = new Set([
  "migrate dev",
  "migrate deploy",
  "migrate reset",
  "migrate resolve",
  "db push",
  "db execute",
  "db seed",
  "studio",
]);

/** Operations known to leave the database untouched (schema files / reads only). */
const READ_OPERATIONS = new Set([
  "generate",
  "validate",
  "format",
  "version",
  "debug",
  "init",
  "migrate status",
  "migrate diff",
  "db pull",
]);

/** Two-word Prisma subcommands, so `db push` is not mistaken for `db`. */
const TWO_WORD_PREFIXES = new Set(["migrate", "db"]);

/**
 * Production operations that are allowed once declared in OPSIQ_PRODUCTION_OPERATION.
 * Deliberately minimal: applying reviewed migrations through the governed workflow is the only production
 * schema write OpsIQ performs (the workflow states it never seeds and never resets). Read-only operations
 * (migrate status, validate, generate) need only the production read authorization.
 */
export const PRODUCTION_ALLOWED_OPERATIONS = ["migrate deploy"] as const;

/**
 * Operations refused against production regardless of authorization. `migrate
 * reset` drops every table; `migrate dev` and `db push` rewrite schema outside
 * the reviewed migration history; `db execute` runs arbitrary SQL; `studio`
 * exposes an interactive read/write UI; `db seed` and `migrate resolve` have no
 * governed production use.
 */
export const PRODUCTION_FORBIDDEN_OPERATIONS = [
  "migrate dev",
  "migrate reset",
  "migrate resolve",
  "db push",
  "db execute",
  "db seed",
  "studio",
] as const;

/** Mutations permitted against a positively-identified remote TEST database. */
export const REMOTE_TEST_ALLOWED_OPERATIONS = [
  "migrate deploy",
  "migrate resolve",
  "db push",
  "db execute",
] as const;

/** Mutations permitted against an approved STAGING endpoint. */
export const STAGING_ALLOWED_OPERATIONS = ["migrate deploy"] as const;

/** Flags that take a SEPARATE value token (`--flag value`); `--flag=value` is handled generically. */
const VALUE_FLAGS = new Set([
  "--schema",
  "--config",
  "--url",
  "--shadow-database-url",
  "--from-url",
  "--to-url",
  "--from-schema",
  "--to-schema",
  "--from-schema-datamodel",
  "--to-schema-datamodel",
  "--from-schema-datasource",
  "--to-schema-datasource",
  "--from-migrations",
  "--to-migrations",
  "--file",
  "--name",
  "--applied",
  "--rolled-back",
  "--port",
  "--browser",
  "--telemetry-information",
]);

/** Flags that point Prisma at a datasource other than the one this guard resolved. */
const DATASOURCE_URL_FLAGS = new Set(["--url", "--shadow-database-url", "--from-url", "--to-url"]);

export interface PrismaInvocation {
  /** Positional words in order (flags and flag values removed). */
  words: string[];
  /** The operation being run, e.g. "migrate deploy" or "validate"; "" when none. */
  operation: string;
  /** True when the operation can change schema, data or migration state. */
  mutating: boolean;
  /** A datasource-URL flag (`--url`, `--url=…`, …) is present. Its VALUE is never retained. */
  urlOverride: boolean;
  /** `--config` was supplied: its value (retained only to compare with this repository's config). */
  configValue: string | null;
}

/**
 * Smallest deterministic parser for the safety decisions Prisma invocations need. Handles flags before and
 * after the command, `--flag=value` and `--flag value`. Fail-closed on ambiguity: a mutating operation found
 * ANYWHERE among the positional words makes the invocation mutating, so an unknown value-taking flag that
 * swallows the wrong token can never turn `migrate reset` into something that looks read-only.
 */
export function parsePrismaInvocation(argv: readonly string[] = []): PrismaInvocation {
  const tokens = argv.slice(2);
  const words: string[] = [];
  let urlOverride = false;
  let configValue: string | null = null;

  for (let i = 0; i < tokens.length; i++) {
    const token = tokens[i];
    if (token === "--") continue;
    if (token.startsWith("--")) {
      const eq = token.indexOf("=");
      const name = eq === -1 ? token : token.slice(0, eq);
      let value: string | null = eq === -1 ? null : token.slice(eq + 1);
      if (eq === -1 && VALUE_FLAGS.has(name) && i + 1 < tokens.length) {
        value = tokens[i + 1];
        i += 1;
      }
      if (DATASOURCE_URL_FLAGS.has(name)) urlOverride = true;
      if (name === "--config") configValue = value ?? "";
      continue;
    }
    if (token.startsWith("-") && token.length > 1) continue; // short boolean flags (-h, -v)
    words.push(token);
  }

  // Every window of positional words: a mutating operation anywhere dominates.
  let operation = "";
  let mutating = false;
  for (let i = 0; i < words.length; i++) {
    const two = i + 1 < words.length ? `${words[i]} ${words[i + 1]}` : "";
    if (two && MUTATING_OPERATIONS.has(two)) {
      operation = two;
      mutating = true;
      break;
    }
    if (MUTATING_OPERATIONS.has(words[i])) {
      operation = words[i];
      mutating = true;
      break;
    }
  }
  if (!mutating && words.length > 0) {
    const first = words[0];
    const two = words.length > 1 ? `${first} ${words[1]}` : "";
    if (two && READ_OPERATIONS.has(two)) operation = two;
    else if (READ_OPERATIONS.has(first)) operation = first;
    else {
      // `migrate`/`db` with an unknown subcommand, or an unrecognised command: cannot prove it is read-only.
      operation = TWO_WORD_PREFIXES.has(first) && words.length > 1 ? two : first;
      mutating = true;
    }
  }
  return { words, operation, mutating, urlOverride, configValue };
}

/**
 * Name the Prisma operation being invoked, e.g. "migrate deploy" or "validate".
 */
export function classifyOperation(argv: readonly string[] = []): string {
  return parsePrismaInvocation(argv).operation;
}

/** True when the invocation can change schema, data or migration state (fail-closed on the unknown). */
export function isMutationCommand(argv: readonly string[] = []): boolean {
  return parsePrismaInvocation(argv).mutating;
}

export interface ResolveInput {
  /** Process environment to read. */
  env: NodeJS.ProcessEnv | Record<string, string | undefined>;
  /** Raw CLI argv (process.argv). Used to classify the command. */
  argv?: readonly string[];
}

export interface ResolveResult {
  url: string;
  target: PrismaTarget;
  /** True when the command can change schema or data. */
  mutating: boolean;
  /** The Prisma operation being run (a Prisma command name, not a secret). */
  operation: string;
  /**
   * True when the datasource is a REMOTE test database whose in-database identity must still be positively
   * matched against the approved OpsIQ test branch before Prisma may run (an async read; done by prisma.config.ts).
   */
  requiresApprovedTestIdentity: boolean;
  /** Sanitized notices for stderr. Never contains a URL or credential. */
  notices: string[];
}

export class PrismaDatasourceError extends Error {
  /** Sanitized context collected before the refusal. Never contains a URL. */
  readonly notices: readonly string[];

  constructor(message: string, notices: readonly string[] = []) {
    super(message);
    this.name = "PrismaDatasourceError";
    this.notices = notices;
  }
}

function readTarget(env: ResolveInput["env"]): PrismaTarget | undefined {
  const raw = (env.OPSIQ_DB_TARGET ?? "").trim().toLowerCase();
  if (!raw) return undefined;
  if (raw === "local" || raw === "test" || raw === "ci" || raw === "staging") return raw;
  if (raw === "production") return "production-authorized";
  throw new PrismaDatasourceError(
    `OPSIQ_DB_TARGET has an unsupported value. Expected one of: local, test, ci, staging, production.`
  );
}

function csv(raw: string | undefined): string[] {
  return (raw ?? "")
    .split(",")
    .map((x) => x.trim().toLowerCase())
    .filter(Boolean);
}

/**
 * Positively local: a loopback URL, or a single-label compose service name (no dots, not an IP) that the
 * operator listed in OPSIQ_LOCAL_DB_EXTRA_HOSTS. Anything else — including every dotted remote hostname — is not local.
 */
function isPositivelyLocal(url: string, env: ResolveInput["env"]): boolean {
  if (isLoopbackDatabaseUrl(url)) return true;
  const host = effectiveDatabaseHostname(url);
  if (host === null) return false;
  if (host.includes(".") || host.includes(":") || /^\d+$/.test(host)) return false;
  return csv(env.OPSIQ_LOCAL_DB_EXTRA_HOSTS).includes(host);
}

function refuseOperation(target: string, operation: string, allowed: readonly string[], notices: string[]): never {
  throw new PrismaDatasourceError(
    `Prisma operation "${operation}" is not permitted against a ${target} datasource. ` +
      `Permitted mutations: ${allowed.join(", ")}.`,
    notices
  );
}

/**
 * Resolve the datasource URL and its logical target.
 * Throws PrismaDatasourceError (never containing a URL) when selection is
 * ambiguous, unauthorized, or missing for a mutation-capable command.
 */
export function resolvePrismaDatasource(input: ResolveInput): ResolveResult {
  const { env } = input;
  const invocation = parsePrismaInvocation(input.argv ?? []);
  const { mutating, operation } = invocation;
  const notices: string[] = [];

  // A mutating command must run against exactly the datasource that is verified below.
  if (mutating && invocation.urlOverride) {
    throw new PrismaDatasourceError(
      "A datasource-URL flag (--url and related) is refused on a mutation-capable Prisma command: " +
        "the datasource must come from prisma.config.ts so it can be verified.",
      notices
    );
  }
  if (mutating && invocation.configValue !== null) {
    const normalised = invocation.configValue.replace(/\\/g, "/").replace(/^\.\//, "");
    if (normalised !== "prisma.config.ts") {
      throw new PrismaDatasourceError(
        "--config selecting another Prisma config is refused on a mutation-capable Prisma command.",
        notices
      );
    }
  }

  const explicitTarget = readTarget(env);
  const hasMigrationUrl = Boolean(env.MIGRATION_DATABASE_URL);

  // ─── Production: two-factor, explicit, auditable ──────────────────────────
  if (explicitTarget === "production-authorized") {
    if (env.OPSIQ_ALLOW_PRODUCTION_DB_COMMAND !== "true") {
      throw new PrismaDatasourceError(
        "OPSIQ_DB_TARGET=production requires OPSIQ_ALLOW_PRODUCTION_DB_COMMAND=true. " +
          "Refusing to select a production datasource without explicit authorization.",
        notices
      );
    }
    // Operations with no correct production use are refused outright, even with
    // OPSIQ_ALLOW_PRODUCTION_DB_COMMAND=true. `migrate reset` drops every table.
    if ((PRODUCTION_FORBIDDEN_OPERATIONS as readonly string[]).includes(operation)) {
      throw new PrismaDatasourceError(
        `Prisma operation "${operation}" is never permitted against production. ` +
          `Forbidden operations: ${PRODUCTION_FORBIDDEN_OPERATIONS.join(", ")}.`,
        notices
      );
    }

    // A production WRITE needs the operation declared up front, allowlisted, and matching what is actually
    // being run, so an authorization for one operation cannot carry another. Reads need only the flag above.
    if (mutating) {
      const declared = (env.OPSIQ_PRODUCTION_OPERATION ?? "").trim();
      if (!declared) {
        throw new PrismaDatasourceError(
          "A production mutation requires OPSIQ_PRODUCTION_OPERATION to declare the exact " +
            `operation. Allowlisted operations: ${PRODUCTION_ALLOWED_OPERATIONS.join(", ")}.`,
          notices
        );
      }
      if (!(PRODUCTION_ALLOWED_OPERATIONS as readonly string[]).includes(declared)) {
        throw new PrismaDatasourceError(
          `OPSIQ_PRODUCTION_OPERATION="${declared}" is not an allowlisted production operation. ` +
            `Allowlisted operations: ${PRODUCTION_ALLOWED_OPERATIONS.join(", ")}.`,
          notices
        );
      }
      if (declared !== operation) {
        throw new PrismaDatasourceError(
          `OPSIQ_PRODUCTION_OPERATION="${declared}" does not match the operation being run ` +
            `("${operation}"). Refusing to run an operation that was not authorized.`,
          notices
        );
      }
    }

    const url = env.MIGRATION_DATABASE_URL;
    if (!url) {
      throw new PrismaDatasourceError(
        "OPSIQ_DB_TARGET=production is authorized but MIGRATION_DATABASE_URL is not set. " +
          "Refusing to fall back to another datasource.",
        notices
      );
    }
    return { url, target: "production-authorized", mutating, operation, requiresApprovedTestIdentity: false, notices };
  }

  // ─── Non-production: MIGRATION_DATABASE_URL is never consulted ─────────────
  if (hasMigrationUrl) {
    // Explicit, auditable: state that it exists and is being ignored rather
    // than silently preferring or silently dropping it.
    notices.push(
      "MIGRATION_DATABASE_URL is present but ignored: production selection " +
        "requires OPSIQ_DB_TARGET=production with OPSIQ_ALLOW_PRODUCTION_DB_COMMAND=true."
    );
  }

  // ─── Mutation-capable: explicit target, positively proven ─────────────────
  if (mutating) {
    if (!explicitTarget) {
      throw new PrismaDatasourceError(
        "A mutation-capable Prisma command requires an explicit OPSIQ_DB_TARGET " +
          "(local, ci, test, staging or production). No datasource is selected implicitly, " +
          "whatever DATABASE_URL holds and whether or not CI is set.",
        notices
      );
    }

    if (explicitTarget === "local" || explicitTarget === "ci") {
      const url = env.DATABASE_URL;
      if (!url) {
        throw new PrismaDatasourceError(`OPSIQ_DB_TARGET=${explicitTarget} requires DATABASE_URL to be set.`, notices);
      }
      if (!isPositivelyLocal(url, env)) {
        throw new PrismaDatasourceError(
          `OPSIQ_DB_TARGET=${explicitTarget} requires a local datasource (a loopback URL), but DATABASE_URL is not local. ` +
            "Refusing to mutate a datasource that was merely labelled local.",
          notices
        );
      }
      return { url, target: explicitTarget, mutating, operation, requiresApprovedTestIdentity: false, notices };
    }

    if (explicitTarget === "test") {
      const url = env.TEST_DATABASE_URL || env.DATABASE_URL_TEST;
      if (!url) {
        throw new PrismaDatasourceError(
          "OPSIQ_DB_TARGET=test requires TEST_DATABASE_URL or DATABASE_URL_TEST to be set.",
          notices
        );
      }
      if (isLoopbackDatabaseUrl(url)) {
        return { url, target: "test", mutating, operation, requiresApprovedTestIdentity: false, notices };
      }
      if (!(REMOTE_TEST_ALLOWED_OPERATIONS as readonly string[]).includes(operation)) {
        refuseOperation("remote test", operation, REMOTE_TEST_ALLOWED_OPERATIONS, notices);
      }
      const verdict = classifyRemoteDatabaseUrl(url, env);
      if (verdict !== "ok") {
        throw new PrismaDatasourceError(
          verdict === "production"
            ? "The test datasource is a known production endpoint. Refusing."
            : "The test datasource is not a well-formed postgres URL with a plain hostname. Refusing.",
          notices
        );
      }
      return { url, target: "test", mutating, operation, requiresApprovedTestIdentity: true, notices };
    }

    // staging
    const url = env.DATABASE_URL;
    if (!url) {
      throw new PrismaDatasourceError("OPSIQ_DB_TARGET=staging requires DATABASE_URL to be set.", notices);
    }
    if (!(STAGING_ALLOWED_OPERATIONS as readonly string[]).includes(operation)) {
      refuseOperation("staging", operation, STAGING_ALLOWED_OPERATIONS, notices);
    }
    const host = effectiveDatabaseHostname(url);
    if (host === null || classifyRemoteDatabaseUrl(url, env) !== "ok") {
      throw new PrismaDatasourceError(
        "The staging datasource is not an acceptable remote postgres URL. Refusing.",
        notices
      );
    }
    const label = host.split(".")[0];
    if (label.endsWith("-pooler")) {
      throw new PrismaDatasourceError(
        "Migrations require the DIRECT (non-pooler) staging endpoint. Refusing a pooled endpoint.",
        notices
      );
    }
    if (!csv(env.OPSIQ_APPROVED_STAGING_ENDPOINT_IDS).includes(label)) {
      throw new PrismaDatasourceError(
        "The staging datasource endpoint is not listed in OPSIQ_APPROVED_STAGING_ENDPOINT_IDS. " +
          "Refusing to mutate a datasource that was merely labelled staging.",
        notices
      );
    }
    return { url, target: "staging", mutating, operation, requiresApprovedTestIdentity: false, notices };
  }

  // ─── Read / schema-only: safe fallback chain retained ─────────────────────
  let url: string | undefined;
  let target: PrismaTarget;
  switch (explicitTarget) {
    case "test":
      url = env.TEST_DATABASE_URL || env.DATABASE_URL_TEST;
      target = "test";
      if (!url) {
        throw new PrismaDatasourceError(
          "OPSIQ_DB_TARGET=test requires TEST_DATABASE_URL or DATABASE_URL_TEST to be set.",
          notices
        );
      }
      break;
    case "ci":
    case "local":
    case "staging":
      url = env.DATABASE_URL;
      target = explicitTarget;
      if (!url) {
        throw new PrismaDatasourceError(`OPSIQ_DB_TARGET=${explicitTarget} requires DATABASE_URL to be set.`, notices);
      }
      break;
    default: {
      url = env.DATABASE_URL || env.DATABASE_URL_TEST;
      target = env.CI === "true" || env.CI === "1" ? "ci" : "local";
      if (!url) {
        url = BUILT_IN_LOCAL_DEFAULT;
        notices.push(
          "No datasource configured; using the built-in local default for a schema-only command."
        );
      }
      break;
    }
  }
  return { url, target, mutating, operation, requiresApprovedTestIdentity: false, notices };
}

/** Sanitized one-line summary. Never includes a URL or any credential part. */
export function formatTargetLine(result: ResolveResult): string {
  return `PRISMA_TARGET=${result.target}${result.mutating ? " (mutation-capable)" : ""}`;
}

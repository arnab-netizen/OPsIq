/**
 * Explicit Prisma datasource selection.
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
 * ─── Why reordering the variables is not sufficient ──────────────────────────
 *
 * Putting DATABASE_URL first still selects MIGRATION_DATABASE_URL whenever
 * DATABASE_URL happens to be unset — which is exactly the shape the incident
 * had. Any implicit fallback chain that can reach a production variable is one
 * unset variable away from repeating it.
 *
 * ─── Contract ────────────────────────────────────────────────────────────────
 *
 * 1. MIGRATION_DATABASE_URL is NEVER resolved implicitly. It is used only when
 *    BOTH OPSIQ_DB_TARGET=production AND OPSIQ_ALLOW_PRODUCTION_DB_COMMAND=true
 *    are set — a two-factor, auditable opt-in. That pair is the production READ
 *    authorization.
 * 2. Ordinary resolution is DATABASE_URL -> DATABASE_URL_TEST -> built-in local
 *    default, so schema-only commands keep working with no configuration.
 * 3. Mutation-capable commands (migrate/db push/db execute/db seed/studio) fail
 *    closed when nothing was intentionally selected — i.e. when the value would
 *    come from the built-in local default.
 * 4. A production MUTATION needs more than the read authorization: the operator
 *    must declare the exact operation in OPSIQ_PRODUCTION_OPERATION, that
 *    operation must be allowlisted, and it must match the operation actually
 *    being run. Declaring `migrate deploy` therefore cannot smuggle through a
 *    `migrate reset`.
 * 5. Some operations are refused against production at ANY authorization level
 *    because no correct production use exists for them (see
 *    PRODUCTION_FORBIDDEN_OPERATIONS). `migrate reset` drops every table.
 * 6. Selection is reported as a sanitized logical target only. The URL, host,
 *    username, password and database name are never emitted. Prisma operation
 *    names are not secrets and may appear in refusal messages.
 *
 * No hostname matching, no assumption that Neon means production or that
 * localhost is safe, and no production identifier is hard-coded.
 *
 * ─── Scope limit ─────────────────────────────────────────────────────────────
 *
 * This governs the Prisma CLI only, because prisma.config.ts is what the CLI
 * loads. Application runtime and standalone scripts construct PrismaClient from
 * `env("DATABASE_URL")` in prisma/schema.prisma and are not routed through here.
 * An operator who deliberately exports a production URL as DATABASE_URL is
 * indistinguishable from one pointing at a local container — by design, since
 * hostname matching is explicitly not a control here.
 */

export type PrismaTarget = "local" | "test" | "ci" | "production-authorized";

/** Datasource used when nothing is configured. Schema-only commands rely on it. */
export const BUILT_IN_LOCAL_DEFAULT =
  "postgresql://postgres:postgres@localhost:5432/opsiq_dev?schema=public";

/**
 * Prisma subcommands that can change schema or data. These must never run
 * against an unintentionally selected datasource.
 */
const MUTATION_COMMANDS = [
  "migrate",
  "db push",
  "db execute",
  "db seed",
  "studio",
] as const;

/**
 * Prisma operations that may run against production once explicitly declared in
 * OPSIQ_PRODUCTION_OPERATION. Deliberately minimal: applying reviewed migrations
 * and running the governed seed are the only production writes OpsIQ performs.
 * `migrate status` is read-only but appears here because isMutationCommand
 * conservatively treats every `migrate *` subcommand as mutation-capable, and
 * migration verification must stay possible.
 */
export const PRODUCTION_ALLOWED_OPERATIONS = [
  "migrate deploy",
  "migrate status",
  "db seed",
] as const;

/**
 * Operations refused against production regardless of authorization. `migrate
 * reset` drops every table; `migrate dev` and `db push` rewrite schema outside
 * the reviewed migration history; `db execute` runs arbitrary SQL; `studio`
 * exposes an interactive read/write UI.
 */
export const PRODUCTION_FORBIDDEN_OPERATIONS = [
  "migrate dev",
  "migrate reset",
  "db push",
  "db execute",
  "studio",
] as const;

/** Two-word Prisma subcommands, so `db push` is not mistaken for `db`. */
const TWO_WORD_OPERATIONS = new Set([
  "db push",
  "db pull",
  "db seed",
  "db execute",
  "migrate dev",
  "migrate deploy",
  "migrate reset",
  "migrate status",
  "migrate resolve",
  "migrate diff",
]);

/**
 * Name the Prisma operation being invoked, e.g. "migrate deploy" or "validate".
 * Used only to police the production allowlist; mutation classification remains
 * isMutationCommand's job.
 */
export function classifyOperation(argv: readonly string[] = []): string {
  const words = argv.slice(2).filter((a) => !a.startsWith("-"));
  if (words.length === 0) return "";
  const twoWord = words.slice(0, 2).join(" ");
  if (TWO_WORD_OPERATIONS.has(twoWord)) return twoWord;
  return words[0];
}

export interface ResolveInput {
  /** Process environment to read. */
  env: NodeJS.ProcessEnv | Record<string, string | undefined>;
  /** Raw CLI argv (process.argv). Used only to classify the command. */
  argv?: readonly string[];
}

export interface ResolveResult {
  url: string;
  target: PrismaTarget;
  /** True when the command can change schema or data. */
  mutating: boolean;
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

/**
 * Classify a Prisma invocation as mutation-capable from its argv.
 * Unknown commands are treated as non-mutating; the fail-closed guarantee comes
 * from the explicit list, and schema-only commands must never be blocked.
 */
export function isMutationCommand(argv: readonly string[] = []): boolean {
  // Drop the node binary and the prisma entrypoint, keep flags out of the join.
  const words = argv.slice(2).filter((a) => !a.startsWith("-"));
  const joined = words.join(" ");
  return MUTATION_COMMANDS.some(
    (cmd) => joined === cmd || joined.startsWith(`${cmd} `)
  );
}

function readTarget(env: ResolveInput["env"]): PrismaTarget | undefined {
  const raw = (env.OPSIQ_DB_TARGET ?? "").trim().toLowerCase();
  if (!raw) return undefined;
  if (raw === "local" || raw === "test" || raw === "ci") return raw;
  if (raw === "production") return "production-authorized";
  throw new PrismaDatasourceError(
    `OPSIQ_DB_TARGET has an unsupported value. Expected one of: local, test, ci, production.`
  );
}

/**
 * Resolve the datasource URL and its logical target.
 * Throws PrismaDatasourceError (never containing a URL) when selection is
 * ambiguous, unauthorized, or missing for a mutation-capable command.
 */
export function resolvePrismaDatasource(input: ResolveInput): ResolveResult {
  const { env } = input;
  const mutating = isMutationCommand(input.argv ?? []);
  const notices: string[] = [];

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
    const operation = classifyOperation(input.argv ?? []);
    if ((PRODUCTION_FORBIDDEN_OPERATIONS as readonly string[]).includes(operation)) {
      throw new PrismaDatasourceError(
        `Prisma operation "${operation}" is never permitted against production. ` +
          `Forbidden operations: ${PRODUCTION_FORBIDDEN_OPERATIONS.join(", ")}.`,
        notices
      );
    }

    // A production WRITE needs the operation declared up front and matching what
    // is actually being run, so an authorization for one operation cannot carry
    // another. Reads need only the authorization flag checked above.
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
    return { url, target: "production-authorized", mutating, notices };
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
      url = env.DATABASE_URL;
      target = "ci";
      if (!url) {
        throw new PrismaDatasourceError(
          "OPSIQ_DB_TARGET=ci requires DATABASE_URL to be set.",
          notices
        );
      }
      break;
    case "local":
      url = env.DATABASE_URL;
      target = "local";
      if (!url) {
        throw new PrismaDatasourceError(
          "OPSIQ_DB_TARGET=local requires DATABASE_URL to be set.",
          notices
        );
      }
      break;
    default: {
      // No explicit target. Use the intended non-production variables only.
      url = env.DATABASE_URL || env.DATABASE_URL_TEST;
      target = env.CI === "true" || env.CI === "1" ? "ci" : "local";
      if (!url) {
        if (mutating) {
          // Nothing was intentionally selected and this command can change
          // schema or data — fail closed rather than touching a default.
          throw new PrismaDatasourceError(
            "No datasource was intentionally selected for a mutation-capable Prisma command. " +
              "Set DATABASE_URL for the intended database, or set OPSIQ_DB_TARGET explicitly. " +
              "Refusing to use the built-in local default.",
            notices
          );
        }
        url = BUILT_IN_LOCAL_DEFAULT;
        notices.push(
          "No datasource configured; using the built-in local default for a schema-only command."
        );
      }
      break;
    }
  }

  return { url, target, mutating, notices };
}

/** Sanitized one-line summary. Never includes a URL or any credential part. */
export function formatTargetLine(result: ResolveResult): string {
  return `PRISMA_TARGET=${result.target}${result.mutating ? " (mutation-capable)" : ""}`;
}

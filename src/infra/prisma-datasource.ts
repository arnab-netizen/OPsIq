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
 *    are set — a two-factor, auditable opt-in.
 * 2. Ordinary resolution is DATABASE_URL -> DATABASE_URL_TEST -> built-in local
 *    default, so schema-only commands keep working with no configuration.
 * 3. Mutation-capable commands (migrate/db push/db execute/db seed/studio) fail
 *    closed when nothing was intentionally selected — i.e. when the value would
 *    come from the built-in local default.
 * 4. Selection is reported as a sanitized logical target only. The URL, host,
 *    username, password and database name are never emitted.
 *
 * No hostname matching, no assumption that Neon means production or that
 * localhost is safe, and no production identifier is hard-coded.
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

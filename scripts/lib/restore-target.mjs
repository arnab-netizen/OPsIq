/**
 * Restore-target policy for scripts/restore-database.sh.
 *
 * A restore replays a `pg_dump --create --clean` dump, which embeds DROP DATABASE / CREATE DATABASE for the SOURCE
 * database's own name on whatever SERVER the connection string reaches. So the target must be PROVEN before anything is
 * decompressed, printed or written — `DATABASE_URL` alone is never authorization.
 *
 * Policy (reuses OPSIQ_DB_TARGET; no overlapping variable):
 *   local      → DATABASE_URL must be a true loopback URL (localhost, 127.0.0.1, ::1). OPSIQ_LOCAL_DB_EXTRA_HOSTS is
 *                deliberately NOT honoured: a destructive restore gets no named-host exception.
 *   staging    → the SAME canonical validator as every other staging mutation
 *                (scripts/assert-approved-staging-database.ts → src/infra/staging-database-target.ts); no URL is parsed here.
 *   production → refused ALWAYS (PRODUCTION_RESTORE_REQUIRES_GOVERNED_WORKFLOW). OPSIQ_ALLOW_PRODUCTION_DB_COMMAND and
 *                OPSIQ_PRODUCTION_OPERATION authorize the governed Prisma migration path, NOT a restore.
 *   anything else (missing, ci, test, unknown) → refused.
 *
 * Pure and dependency-free (the restore rehearsal runner installs no node_modules). Refusals never contain a URL, host,
 * username, password or database name.
 */

const LOOPBACK_HOSTS = new Set(["localhost", "127.0.0.1", "::1", "[::1]"]);

/** True only for a TCP postgres URL whose host is loopback and carries no host/hostaddr override. */
export function isLoopbackPostgresUrl(url) {
  let parsed;
  try {
    parsed = new URL(String(url ?? ""));
  } catch {
    return false;
  }
  if (parsed.protocol !== "postgres:" && parsed.protocol !== "postgresql:") return false;
  for (const key of parsed.searchParams.keys()) {
    const k = key.toLowerCase();
    if (k === "host" || k === "hostaddr") return false;
  }
  return LOOPBACK_HOSTS.has(parsed.hostname.toLowerCase());
}

/**
 * @param {Record<string, string | undefined>} env
 * @returns {{ ok: boolean, target?: "local" | "staging", code?: string, message: string, needsStagingValidator?: boolean }}
 */
export function assessRestoreTarget(env) {
  const target = String(env.OPSIQ_DB_TARGET ?? "").trim().toLowerCase();
  if (!target) {
    return {
      ok: false,
      code: "RESTORE_TARGET_REQUIRED",
      message: "OPSIQ_DB_TARGET is required (local or staging). DATABASE_URL alone never authorizes a restore.",
    };
  }
  if (target === "production") {
    return {
      ok: false,
      code: "PRODUCTION_RESTORE_REQUIRES_GOVERNED_WORKFLOW",
      message:
        "Restoring a production database is not supported by this script. It requires a separately governed production recovery workflow; do not bypass this by setting DATABASE_URL manually. No connection was attempted.",
    };
  }
  if (target !== "local" && target !== "staging") {
    return {
      ok: false,
      code: "RESTORE_TARGET_UNSUPPORTED",
      message: "OPSIQ_DB_TARGET is not a supported restore target (only local or staging).",
    };
  }
  const url = String(env.DATABASE_URL ?? "").trim();
  if (!url) {
    return { ok: false, code: "RESTORE_DATABASE_URL_UNSET", message: "DATABASE_URL is not set." };
  }
  if (target === "local") {
    if (!isLoopbackPostgresUrl(url)) {
      return {
        ok: false,
        code: "RESTORE_LOCAL_REQUIRES_LOOPBACK",
        message: "OPSIQ_DB_TARGET=local requires a loopback database (localhost, 127.0.0.1 or ::1). Refusing to restore onto a datasource that was merely labelled local.",
      };
    }
    return { ok: true, target: "local", message: "RESTORE_TARGET=local" };
  }
  return { ok: true, target: "staging", needsStagingValidator: true, message: "RESTORE_TARGET=staging" };
}

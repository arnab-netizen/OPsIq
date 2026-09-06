#!/usr/bin/env node
/**
 * Production acceptance-account password-reset token issuer.
 *
 * Purpose: production password-reset EMAIL delivery is currently unavailable
 * (no RESEND_API_KEY / no verified sender domain), which blocks the Stage 7
 * acceptance owner from redeeming the normal self-service /forgot-password
 * flow. This script performs ONLY the "create a token and hand the owner the
 * URL" half of that flow — created with the exact same hashing, TTL, and
 * single-use semantics as src/app/api/auth/forgot-password/route.ts — so the
 * REAL production /api/auth/reset-password route still performs the actual
 * password change, redemption, and session revocation. This script never
 * touches users.hashed_password directly and never authenticates as the user.
 *
 * WHY RAW PARAMETERIZED SQL, NOT THE GENERATED PRISMA CLIENT:
 * prisma/schema.prisma generates its client to src/generated/prisma (a custom
 * `output`, not the default node_modules location). That generated output is
 * plain TypeScript with extensionless internal imports (e.g. `./internal/class`),
 * resolved correctly only by a bundler-aware toolchain (Next.js's webpack build,
 * or vitest/esbuild in tests) — never by plain `node`. This was verified directly
 * in this environment: `node -e "import('@prisma/client')"` fails with
 * "Cannot find module '.prisma/client/default'" because `prisma generate` with a
 * custom output never creates that default-location shim; and importing the
 * generated `src/generated/prisma/client.ts` file directly (even through tsx's
 * programmatic API) fails on its own extensionless internal imports. Neither
 * path is provable under the required invocation
 * (`node scripts/production-acceptance-password-reset.mjs`, no extra loader
 * flags). `pg` — already a proven, working repository dependency (used directly
 * by src/lib/db.ts's own @prisma/adapter-pg construction) — has no such
 * resolution problem, so this script talks to Postgres directly with
 * parameterized queries instead.
 *
 * Governed, single-purpose, fail-closed:
 *   - targets exactly one email, read from PRODUCTION_ACCEPTANCE_EMAIL
 *   - requires the account to already exist, be active, and already have a
 *     password hash (mirrors forgot-password's own gate exactly) — refuses
 *     otherwise rather than creating an account or reactivating one
 *   - requires an exact-match production confirmation string
 *   - requires the resolved DB hostname to exactly equal an owner-supplied
 *     expected host, and refuses a pooler endpoint outright
 *   - creates the PasswordResetToken row and (when an active workspace
 *     membership exists) the governed AuditEvent row in ONE database
 *     transaction: either both commit or neither does. If no active
 *     membership exists, the token is still created without an audit event —
 *     this is not a weaker rule invented for this script, it is the actual
 *     production behavior of forgot-password/route.ts: emitAuditEvent()
 *     silently no-ops on a missing workspaceId (see src/infra/audit.ts) while
 *     the token row is created unconditionally.
 *   - prints the resulting reset URL exactly once, and only after the
 *     transaction has actually committed — never before, never on a rollback
 *   - never logs the email, user id, workspace id, password hash, token
 *     hash, or the DATABASE_URL
 *   - makes no other read or write: no User update, no WorkspaceMembership
 *     write, no account creation
 *
 * Required environment variables (never printed):
 *   PRODUCTION_DATABASE_URL          direct (non-pooler) production Postgres URL
 *   PRODUCTION_ACCEPTANCE_EMAIL      the exact account email to issue a token for
 *   CONFIRM_PRODUCTION_ACCEPTANCE_RESET   must equal RESET_CONFIRMATION_TEXT exactly
 *   EXPECTED_DATABASE_HOST           bare hostname the DB URL must resolve to
 *
 * Optional:
 *   PRODUCTION_APP_URL               defaults to https://o-ps-iq.vercel.app
 *
 * Usage (run by the owner, on a machine with production secrets access):
 *   PRODUCTION_DATABASE_URL=... \
 *   PRODUCTION_ACCEPTANCE_EMAIL=... \
 *   EXPECTED_DATABASE_HOST=ep-empty-sky-ay1e6c27.c-5.us-east-2.aws.neon.tech \
 *   CONFIRM_PRODUCTION_ACCEPTANCE_RESET="RESET PRODUCTION ACCEPTANCE PASSWORD" \
 *   node scripts/production-acceptance-password-reset.mjs
 */

import { randomBytes, randomUUID, createHash } from "crypto";

export const RESET_CONFIRMATION_TEXT = "RESET PRODUCTION ACCEPTANCE PASSWORD";
export const RESET_TOKEN_TTL_MS = 60 * 60 * 1000; // matches forgot-password/route.ts exactly
const DEFAULT_APP_URL = "https://o-ps-iq.vercel.app";
const AUDIT_EVENT_PASSWORD_RESET_REQUESTED = "user.password_reset_requested";

/** Trim + lowercase, matching src/lib/validation.ts's identityEmailSchema exactly. */
export function normalizeEmail(rawEmail) {
  return rawEmail.trim().toLowerCase();
}

/**
 * Parse a Postgres connection string's hostname without ever returning or
 * logging the credentials, path, or query string it also contains.
 * Returns null if the URL cannot be parsed at all.
 */
export function parseDatabaseHost(databaseUrl) {
  try {
    return new URL(databaseUrl).hostname;
  } catch {
    return null;
  }
}

/**
 * Fail-closed host gate: refuses a pooler endpoint outright, and refuses any
 * hostname that isn't an exact match for the owner-supplied expected host.
 * Returns { ok: true } or { ok: false, reason } — reason never contains the URL.
 */
export function validateDatabaseHost(databaseUrl, expectedHost) {
  const host = parseDatabaseHost(databaseUrl);
  if (!host) {
    return { ok: false, reason: "DATABASE_URL_UNPARSEABLE" };
  }
  if (host.includes("-pooler.")) {
    return { ok: false, reason: "POOLER_ENDPOINT_REFUSED — a direct, non-pooler URL is required" };
  }
  if (!expectedHost || host !== expectedHost) {
    return { ok: false, reason: "HOST_MISMATCH — resolved hostname does not exactly equal EXPECTED_DATABASE_HOST" };
  }
  return { ok: true, host };
}

export function isConfirmed(confirmInput) {
  return confirmInput === RESET_CONFIRMATION_TEXT;
}

/** Same construction as forgot-password/route.ts: 32 random bytes, sha256 of the raw hex. */
export function generateResetToken() {
  const rawToken = randomBytes(32).toString("hex");
  const tokenHash = createHash("sha256").update(rawToken).digest("hex");
  return { rawToken, tokenHash };
}

/** Same hash-chain construction as src/infra/audit.ts's computeEventHash. */
export function computeAuditEventHash(eventId, workspaceId, eventName, occurredAt) {
  return createHash("sha256")
    .update(`${eventId}|${workspaceId}|${eventName}|${occurredAt.toISOString()}`)
    .digest("hex");
}

/**
 * Read-only lookup, performed BEFORE any transaction is opened. Selects only
 * the booleans needed to gate the mutation — never the password hash itself.
 * Returns null if no such user exists.
 */
export async function findAcceptanceAccount(client, email) {
  const { rows } = await client.query(
    `SELECT id, is_active AS "isActive", (hashed_password IS NOT NULL) AS "hasPassword"
     FROM users WHERE email = $1`,
    [email]
  );
  return rows[0] ?? null;
}

/** Read-only: the account's oldest active workspace membership, if any. */
export async function findActiveWorkspaceId(client, userId) {
  const { rows } = await client.query(
    `SELECT workspace_id AS "workspaceId" FROM workspace_memberships
     WHERE user_id = $1 AND is_active = true
     ORDER BY added_at ASC LIMIT 1`,
    [userId]
  );
  return rows[0]?.workspaceId ?? null;
}

/**
 * The atomic mutation: creates the PasswordResetToken row and, when
 * workspaceId is non-null, the governed AuditEvent row (hash-chained exactly
 * like src/infra/audit.ts) — in a single transaction on the given client.
 * Returns { rawToken } ONLY after COMMIT has actually succeeded. On any
 * error, the caller must have already issued (or must issue) ROLLBACK before
 * this rejects — see runRecovery below, which owns the BEGIN/ROLLBACK
 * lifecycle around this function so a caller cannot forget either half.
 *
 * `client` needs only `.query(text, params)` — a real `pg.Client`/`pg.Pool`
 * connection, or (in tests) any fake satisfying that shape.
 */
export async function createResetTokenAndAudit(client, { userId, workspaceId }) {
  const { rawToken, tokenHash } = generateResetToken();
  const tokenId = randomUUID();
  const expiresAt = new Date(Date.now() + RESET_TOKEN_TTL_MS);

  await client.query(
    `INSERT INTO password_reset_tokens (id, user_id, token_hash, expires_at, ip_address)
     VALUES ($1, $2, $3, $4, NULL)`,
    [tokenId, userId, tokenHash, expiresAt]
  );

  if (workspaceId) {
    const { rows: lastEventRows } = await client.query(
      `SELECT id, event_name AS "eventName", occurred_at AS "occurredAt"
       FROM audit_events WHERE workspace_id = $1
       ORDER BY occurred_at DESC LIMIT 1`,
      [workspaceId]
    );
    const lastEvent = lastEventRows[0] ?? null;
    const previousHash = lastEvent
      ? computeAuditEventHash(lastEvent.id, workspaceId, lastEvent.eventName, new Date(lastEvent.occurredAt))
      : null;

    // actor_id is uuid but entity_id is plain text (see prisma/schema.prisma's
    // AuditEvent.entityId, which has no @db.Uuid annotation) — even though
    // both hold the same user id value here, they need separate placeholders:
    // reusing one parameter for both makes node-postgres deduce conflicting
    // types for it and reject the query outright (proven by the DB-backed
    // test suite against a real Postgres instance).
    await client.query(
      `INSERT INTO audit_events
         (id, workspace_id, event_name, actor_id, actor_type, entity_type, entity_id,
          correlation_id, visibility, previous_hash)
       VALUES ($1, $2, $3, $4, 'user', 'user', $5, NULL, 'internal', $6)`,
      [randomUUID(), workspaceId, AUDIT_EVENT_PASSWORD_RESET_REQUESTED, userId, userId, previousHash]
    );
  }

  return { rawToken };
}

/**
 * Owns the transaction lifecycle: BEGIN, run the mutation, COMMIT on success,
 * ROLLBACK on any failure (re-throwing afterwards). The raw token is only
 * ever returned to the caller after COMMIT has resolved successfully — a
 * throw here always means neither the token row nor the audit row persists.
 */
export async function runRecovery(client, { userId, workspaceId }) {
  await client.query("BEGIN");
  let result;
  try {
    result = await createResetTokenAndAudit(client, { userId, workspaceId });
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  }
  await client.query("COMMIT");
  return result;
}

async function main() {
  const databaseUrl = process.env.PRODUCTION_DATABASE_URL;
  const rawEmail = process.env.PRODUCTION_ACCEPTANCE_EMAIL;
  const confirmInput = process.env.CONFIRM_PRODUCTION_ACCEPTANCE_RESET;
  const expectedHost = process.env.EXPECTED_DATABASE_HOST;
  const appUrl = process.env.PRODUCTION_APP_URL || DEFAULT_APP_URL;

  const missing = [];
  if (!databaseUrl) missing.push("PRODUCTION_DATABASE_URL");
  if (!rawEmail) missing.push("PRODUCTION_ACCEPTANCE_EMAIL");
  if (!confirmInput) missing.push("CONFIRM_PRODUCTION_ACCEPTANCE_RESET");
  if (!expectedHost) missing.push("EXPECTED_DATABASE_HOST");
  if (missing.length > 0) {
    console.error(`REFUSED: missing required environment variable(s): ${missing.join(", ")}`);
    process.exit(1);
  }

  if (!isConfirmed(confirmInput)) {
    console.error(`REFUSED: CONFIRM_PRODUCTION_ACCEPTANCE_RESET must exactly equal "${RESET_CONFIRMATION_TEXT}".`);
    process.exit(1);
  }

  const hostCheck = validateDatabaseHost(databaseUrl, expectedHost);
  if (!hostCheck.ok) {
    console.error(`REFUSED: ${hostCheck.reason}`);
    process.exit(1);
  }
  console.log(`Database host confirmed: ${hostCheck.host}`);

  const email = normalizeEmail(rawEmail);

  const { Client } = await import("pg");
  const client = new Client({ connectionString: databaseUrl });
  await client.connect();

  try {
    const user = await findAcceptanceAccount(client, email);

    if (!user) {
      console.error("REFUSED: ACCOUNT_NOT_FOUND — no account exists for the configured email. No mutation performed.");
      process.exitCode = 1;
      return;
    }
    if (!user.isActive) {
      console.error("REFUSED: ACCOUNT_INACTIVE — this script does not reactivate accounts. No mutation performed.");
      process.exitCode = 1;
      return;
    }
    if (!user.hasPassword) {
      console.error("REFUSED: NO_PASSWORD_HASH_SET — the normal reset flow cannot establish a first-time password. No mutation performed.");
      process.exitCode = 1;
      return;
    }

    const workspaceId = await findActiveWorkspaceId(client, user.id);
    if (!workspaceId) {
      console.warn("No active workspace membership found — the token will still be created without an audit event, matching production forgot-password's own fail-safe behavior.");
    }

    const { rawToken } = await runRecovery(client, { userId: user.id, workspaceId });

    const resetUrl = `${appUrl}/reset-password?token=${rawToken}`;
    console.log(workspaceId ? "Audit event recorded (user.password_reset_requested)." : "");
    console.log("\nToken created. This URL is shown ONCE and is not logged anywhere else:");
    console.log(resetUrl);
    console.log(`\nExpires in ${RESET_TOKEN_TTL_MS / 60000} minutes. Single-use — redeeming it via the normal`);
    console.log("production /api/auth/reset-password route revokes all existing sessions for this account.");
  } catch (err) {
    console.error("REFUSED: transaction failed, rolled back — no token or audit event was created —", err instanceof Error ? err.constructor.name : "UnknownError");
    process.exitCode = 1;
  } finally {
    await client.end();
  }
}

const isMainModule = import.meta.url === `file://${process.argv[1]}`;
if (isMainModule) {
  main().catch((err) => {
    console.error("REFUSED: unexpected error —", err instanceof Error ? err.constructor.name : "UnknownError");
    process.exit(1);
  });
}

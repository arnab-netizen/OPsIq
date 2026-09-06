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
 * COMMIT-ACKNOWLEDGEMENT AMBIGUITY:
 * A mutation error raised BEFORE `COMMIT` is issued is unambiguous — ROLLBACK
 * is issued and, once *it* is acknowledged, nothing was persisted. But if the
 * connection drops between issuing `COMMIT` and receiving its acknowledgement,
 * Postgres may have committed the transaction anyway — the client simply never
 * found out. Treating that as "rolled back" would be a lie: it can leave a
 * genuinely valid, durably committed PasswordResetToken in production whose
 * raw token was never printed and is now unrecoverable (the same orphan-token
 * failure class this script exists to avoid). So a COMMIT failure is never
 * assumed to mean rollback. Instead: the raw token and its hash are generated
 * BEFORE the transaction opens, so after an unacknowledged COMMIT the script
 * opens a FRESH connection and looks up that exact tokenHash. If found (and,
 * when a workspace membership exists, its paired audit event is also found —
 * token and audit must both exist or neither must), the original transaction
 * is confirmed to have committed and the already-generated raw token is
 * printed — never a newly generated one, and never a second token row. If not
 * found, nothing persisted. If reconciliation itself cannot determine the
 * outcome (e.g. the fresh connection also fails), the script stops and reports
 * COMMIT_OUTCOME_UNKNOWN rather than guessing or retrying. See COMMIT_OUTCOME
 * and reconcileAmbiguousCommit below.
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
 * Every distinguishable transaction outcome this script can report. A commit
 * failure is NEVER collapsed into PRE_COMMIT_FAILURE_ROLLED_BACK — that label
 * is only ever used once an actual ROLLBACK has been acknowledged.
 */
export const COMMIT_OUTCOME = Object.freeze({
  PRE_COMMIT_FAILURE_ROLLED_BACK: "PRE_COMMIT_FAILURE_ROLLED_BACK",
  COMMIT_ACKNOWLEDGED: "COMMIT_ACKNOWLEDGED",
  COMMIT_RECOVERED_AFTER_ACK_FAILURE: "COMMIT_RECOVERED_AFTER_ACK_FAILURE",
  COMMIT_NOT_PERSISTED: "COMMIT_NOT_PERSISTED",
  COMMIT_OUTCOME_UNKNOWN: "COMMIT_OUTCOME_UNKNOWN",
});

/** Thrown by runRecovery/reconcileAmbiguousCommit; `.outcome` is always one of COMMIT_OUTCOME. */
export class RecoveryError extends Error {
  constructor(outcome, message, { invariantViolation = false } = {}) {
    super(message);
    this.name = "RecoveryError";
    this.outcome = outcome;
    this.invariantViolation = invariantViolation;
  }
}

/**
 * The atomic mutation: creates the PasswordResetToken row and, when
 * workspaceId is non-null, the governed AuditEvent row (hash-chained exactly
 * like src/infra/audit.ts) — in a single transaction on the given client. The
 * token's id doubles as the audit event's correlation_id, which is how
 * reconcileAmbiguousCommit later confirms the two rows belong to the same
 * issuance without needing to re-derive or expose the user/workspace id.
 * Both the token and (when applicable) the audit row must exist, or neither
 * must — the caller owns the transaction lifecycle (see runRecovery).
 *
 * `client` needs only `.query(text, params)` — a real `pg.Client`/`pg.Pool`
 * connection, or (in tests) any fake satisfying that shape.
 */
export async function createResetTokenAndAudit(client, { userId, workspaceId, tokenId, tokenHash, expiresAt }) {
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
       VALUES ($1, $2, $3, $4, 'user', 'user', $5, $6, 'internal', $7)`,
      [randomUUID(), workspaceId, AUDIT_EVENT_PASSWORD_RESET_REQUESTED, userId, userId, tokenId, previousHash]
    );
  }
}

/** Read-only: find a reset token row by its exact hash, scoped to the expected user. */
export async function findResetTokenByHash(client, { userId, tokenHash }) {
  const { rows } = await client.query(
    `SELECT id, expires_at AS "expiresAt", used_at AS "usedAt"
     FROM password_reset_tokens WHERE user_id = $1 AND token_hash = $2`,
    [userId, tokenHash]
  );
  return rows[0] ?? null;
}

/** Read-only: find the audit event paired to a specific token issuance via its correlation_id. */
export async function findAuditEventByCorrelationId(client, { workspaceId, correlationId }) {
  const { rows } = await client.query(
    `SELECT id FROM audit_events
     WHERE workspace_id = $1 AND correlation_id = $2 AND event_name = $3`,
    [workspaceId, correlationId, AUDIT_EVENT_PASSWORD_RESET_REQUESTED]
  );
  return rows[0] ?? null;
}

/**
 * Called only when COMMIT was sent but its acknowledgement was never
 * received. Opens a FRESH connection (the original one is unreliable — that's
 * exactly why we're here) via `createClient`, and looks up the exact
 * tokenHash generated before the transaction started. Never generates a new
 * token, never retries the mutation.
 *
 * - Fresh connection itself fails               -> COMMIT_OUTCOME_UNKNOWN
 * - No matching token row found                 -> COMMIT_NOT_PERSISTED
 * - Token found, but under a different token id  -> COMMIT_OUTCOME_UNKNOWN
 *   (a tokenHash collision would mean this isn't actually our row; treat as
 *   indeterminate rather than claiming someone else's row as our own)
 * - Token found; workspace expected an audit
 *   event and none is paired to it              -> COMMIT_OUTCOME_UNKNOWN,
 *   flagged as an invariant violation (token+audit must both exist or
 *   neither must) — never manufactured after the fact
 * - Token found and (if applicable) its audit
 *   event is also found                         -> COMMIT_RECOVERED_AFTER_ACK_FAILURE,
 *   returning the SAME rawToken generated before the transaction began
 */
export async function reconcileAmbiguousCommit({ createClient, userId, workspaceId, tokenId, tokenHash, rawToken }) {
  let reconClient;
  try {
    reconClient = await createClient();
  } catch {
    throw new RecoveryError(
      COMMIT_OUTCOME.COMMIT_OUTCOME_UNKNOWN,
      "COMMIT acknowledgement failed and a fresh reconciliation connection could not be established. Transaction outcome unknown — do not retry; no token or audit event was created by this run."
    );
  }

  try {
    const tokenRow = await findResetTokenByHash(reconClient, { userId, tokenHash });
    if (!tokenRow) {
      throw new RecoveryError(
        COMMIT_OUTCOME.COMMIT_NOT_PERSISTED,
        "COMMIT acknowledgement failed and reconciliation found no matching token row — the transaction did not persist. No token or audit event was created."
      );
    }
    if (tokenRow.id !== tokenId) {
      throw new RecoveryError(
        COMMIT_OUTCOME.COMMIT_OUTCOME_UNKNOWN,
        "Reconciliation found a token row with this hash but a different id than the one just issued. Transaction outcome unknown — do not retry."
      );
    }

    if (workspaceId) {
      const auditRow = await findAuditEventByCorrelationId(reconClient, { workspaceId, correlationId: tokenId });
      if (!auditRow) {
        throw new RecoveryError(
          COMMIT_OUTCOME.COMMIT_OUTCOME_UNKNOWN,
          "INVARIANT VIOLATION: the reset token committed but its paired audit event was not found (token and audit must both exist or neither must). Stopping without creating a replacement audit event or a new token — owner must investigate directly.",
          { invariantViolation: true }
        );
      }
    }

    return { rawToken, outcome: COMMIT_OUTCOME.COMMIT_RECOVERED_AFTER_ACK_FAILURE };
  } finally {
    await reconClient.end();
  }
}

/**
 * Owns the transaction lifecycle. The raw token and its hash are generated
 * BEFORE the transaction opens so that, if COMMIT's acknowledgement is lost,
 * reconciliation can look up that exact hash instead of ever generating (or
 * risking persisting) a second one. Three distinct paths, per COMMIT_OUTCOME:
 *
 *   1. Mutation fails before COMMIT is attempted -> ROLLBACK -> rethrow
 *      PRE_COMMIT_FAILURE_ROLLED_BACK (only ever used once ROLLBACK itself
 *      is acknowledged; if ROLLBACK also fails, that's COMMIT_OUTCOME_UNKNOWN
 *      too, never a false claim of a clean rollback).
 *   2. COMMIT is acknowledged normally -> return { rawToken, outcome: COMMIT_ACKNOWLEDGED }.
 *   3. COMMIT's acknowledgement is lost -> reconcileAmbiguousCommit decides
 *      the real outcome via a fresh connection; never a blind retry.
 */
export async function runRecovery(client, { userId, workspaceId, createClient }) {
  const { rawToken, tokenHash } = generateResetToken();
  const tokenId = randomUUID();
  const expiresAt = new Date(Date.now() + RESET_TOKEN_TTL_MS);

  try {
    await client.query("BEGIN");
  } catch {
    throw new RecoveryError(
      COMMIT_OUTCOME.PRE_COMMIT_FAILURE_ROLLED_BACK,
      "BEGIN failed before any mutation was attempted. No token or audit event was created."
    );
  }

  try {
    await createResetTokenAndAudit(client, { userId, workspaceId, tokenId, tokenHash, expiresAt });
  } catch (mutationErr) {
    try {
      await client.query("ROLLBACK");
    } catch {
      throw new RecoveryError(
        COMMIT_OUTCOME.COMMIT_OUTCOME_UNKNOWN,
        "Mutation failed and ROLLBACK could not be acknowledged either — transaction outcome unknown. Do not assume rollback; do not retry."
      );
    }
    throw new RecoveryError(
      COMMIT_OUTCOME.PRE_COMMIT_FAILURE_ROLLED_BACK,
      `Mutation failed before COMMIT was attempted; ROLLBACK acknowledged. No token or audit event was created. (${mutationErr instanceof Error ? mutationErr.constructor.name : "UnknownError"})`
    );
  }

  try {
    await client.query("COMMIT");
  } catch {
    // COMMIT was sent but never acknowledged — Postgres may have committed it
    // anyway. Reconcile via a fresh connection rather than assuming either
    // outcome; never generate or persist a second token here.
    return reconcileAmbiguousCommit({ createClient, userId, workspaceId, tokenId, tokenHash, rawToken });
  }

  return { rawToken, outcome: COMMIT_OUTCOME.COMMIT_ACKNOWLEDGED };
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

    // Only used if COMMIT's acknowledgement is lost — opens a brand new
    // connection for reconciliation, since the original one is unreliable.
    const createClient = async () => {
      const fresh = new Client({ connectionString: databaseUrl });
      await fresh.connect();
      return fresh;
    };

    const { rawToken, outcome } = await runRecovery(client, { userId: user.id, workspaceId, createClient });

    if (outcome === COMMIT_OUTCOME.COMMIT_RECOVERED_AFTER_ACK_FAILURE) {
      console.warn(
        "COMMIT status: COMMIT_RECOVERED_AFTER_ACK_FAILURE — the original connection never confirmed COMMIT, " +
          "but reconciliation over a fresh connection confirmed it actually persisted. The token below was already " +
          "committed by that transaction; this is NOT a newly created token."
      );
    } else {
      console.log("COMMIT status: COMMIT_ACKNOWLEDGED.");
    }

    const resetUrl = `${appUrl}/reset-password?token=${rawToken}`;
    if (workspaceId) {
      console.log("Audit event recorded (user.password_reset_requested).");
    }
    console.log("\nToken created. This URL is shown ONCE and is not logged anywhere else:");
    console.log(resetUrl);
    console.log(`\nExpires in ${RESET_TOKEN_TTL_MS / 60000} minutes. Single-use — redeeming it via the normal`);
    console.log("production /api/auth/reset-password route revokes all existing sessions for this account.");
  } catch (err) {
    if (err instanceof RecoveryError) {
      console.error(`REFUSED: [${err.outcome}] ${err.message}`);
    } else {
      console.error(
        "REFUSED: an error occurred before any transaction was opened —",
        err instanceof Error ? err.constructor.name : "UnknownError"
      );
    }
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

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
 * Governed, single-purpose, fail-closed:
 *   - targets exactly one email, read from PRODUCTION_ACCEPTANCE_EMAIL
 *   - requires the account to already exist, be active, and already have a
 *     password hash (mirrors forgot-password's own gate exactly) — refuses
 *     otherwise rather than creating an account or reactivating one
 *   - requires an exact-match production confirmation string
 *   - requires the resolved DB hostname to exactly equal an owner-supplied
 *     expected host, and refuses a pooler endpoint outright
 *   - creates exactly one PasswordResetToken row (+ one governed AuditEvent
 *     row, mirroring the real route) and prints the resulting reset URL once
 *   - never logs the email, user id, workspace id, password hash, token
 *     hash, or the DATABASE_URL
 *   - makes no other read or write: no User update, no WorkspaceMembership
 *     read beyond resolving the audit scope, no account creation
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
function computeAuditEventHash(eventId, workspaceId, eventName, timestamp) {
  return createHash("sha256")
    .update(`${eventId}|${workspaceId}|${eventName}|${timestamp.toISOString()}`)
    .digest("hex");
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

  // Matches src/lib/db.ts's own construction exactly: this schema's generated
  // client requires the @prisma/adapter-pg driver adapter, not a bare
  // connection-string option — a plain `new PrismaClient({ datasourceUrl })`
  // does not work against this generator's output.
  const pg = await import("pg");
  const { PrismaPg } = await import("@prisma/adapter-pg");
  const { PrismaClient } = await import("@prisma/client");
  const pool = new pg.Pool({ connectionString: databaseUrl, max: 1 });
  const adapter = new PrismaPg(pool);
  const prisma = new PrismaClient({ adapter });

  try {
    const user = await prisma.user.findUnique({ where: { email } });

    if (!user) {
      console.error("REFUSED: ACCOUNT_NOT_FOUND — no account exists for the configured email. No mutation performed.");
      process.exit(1);
    }
    if (!user.isActive) {
      console.error("REFUSED: ACCOUNT_INACTIVE — this script does not reactivate accounts. No mutation performed.");
      process.exit(1);
    }
    if (!user.hashedPassword) {
      console.error("REFUSED: NO_PASSWORD_HASH_SET — the normal reset flow cannot establish a first-time password. No mutation performed.");
      process.exit(1);
    }

    const { rawToken, tokenHash } = generateResetToken();

    await prisma.passwordResetToken.create({
      data: {
        id: randomUUID(),
        userId: user.id,
        tokenHash,
        expiresAt: new Date(Date.now() + RESET_TOKEN_TTL_MS),
        ipAddress: null,
      },
    });

    const membership = await prisma.workspaceMembership.findFirst({
      where: { userId: user.id, isActive: true },
      orderBy: { addedAt: "asc" },
      select: { workspaceId: true },
    });

    if (membership?.workspaceId) {
      const lastEvent = await prisma.auditEvent.findFirst({
        where: { workspaceId: membership.workspaceId },
        orderBy: { occurredAt: "desc" },
        select: { id: true, previousHash: true, eventName: true, occurredAt: true },
      });
      await prisma.auditEvent.create({
        data: {
          id: randomUUID(),
          workspaceId: membership.workspaceId,
          eventName: AUDIT_EVENT_PASSWORD_RESET_REQUESTED,
          actorId: user.id,
          actorType: "user",
          entityType: "user",
          entityId: user.id,
          correlationId: null,
          visibility: "internal",
          previousHash: lastEvent
            ? computeAuditEventHash(lastEvent.id, membership.workspaceId, lastEvent.eventName, lastEvent.occurredAt)
            : null,
        },
      });
      console.log("Audit event recorded (user.password_reset_requested).");
    } else {
      console.warn("No active workspace membership found — audit event skipped (fail-safe, matches emitAuditEvent's own no-workspace behavior).");
    }

    const resetUrl = `${appUrl}/reset-password?token=${rawToken}`;
    console.log("\nToken created. This URL is shown ONCE and is not logged anywhere else:");
    console.log(resetUrl);
    console.log(`\nExpires in ${RESET_TOKEN_TTL_MS / 60000} minutes. Single-use — redeeming it via the normal`);
    console.log("production /api/auth/reset-password route revokes all existing sessions for this account.");
  } finally {
    await prisma.$disconnect();
    await pool.end();
  }
}

const isMainModule = import.meta.url === `file://${process.argv[1]}`;
if (isMainModule) {
  main().catch((err) => {
    console.error("REFUSED: unexpected error —", err instanceof Error ? err.constructor.name : "UnknownError");
    process.exit(1);
  });
}

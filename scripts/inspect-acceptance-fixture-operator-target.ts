#!/usr/bin/env node
/**
 * STRICTLY READ-ONLY inspector for the Production acceptance account, used by
 * .github/workflows/provision-acceptance-fixture-operator.yml (DISCOVER mode, and the before/after
 * checks around DRY_RUN). It answers four questions and changes nothing:
 *
 *   1. Which user is the acceptance account, and is it active?
 *   2. Which workspace does the application's authorization loader resolve for that user?
 *   3. Does that user hold an active `system_admin` role assignment?
 *   4. Does that user hold an active `acceptance_fixture_operator` role assignment?
 *
 * TARGET IDENTITY: the email is read ONLY from the PRODUCTION_ACCEPTANCE_EMAIL environment variable (the
 * workflow wires it from the protected GitHub secret of the same name). There is deliberately no --email
 * argument and no other way to select a user, so this tool cannot be pointed at an arbitrary account. The
 * email is never printed; the user id is printed in a sanitized form only.
 *
 * WORKSPACE: resolved with the provisioner's own resolvePrimaryWorkspaceId() (imported, not copied), which is
 * the same "first active WorkspaceMembership, ordered by addedAt then workspaceId" contract that
 * getPolicyContext() uses, so DISCOVER and the provisioner can never disagree about the workspace.
 *
 * WRONG-DATABASE GATE: --expected-database-host is required and is verified with the provisioner's own
 * verifyExpectedDatabaseHost() (which wraps scripts/validate-expected-db-host.mjs) BEFORE any database
 * connection is opened. Only the two bare hostnames are ever printed, never the connection string.
 *
 * READ-ONLY BY CONSTRUCTION: this file performs only findUnique / findFirst / findMany / count / SHOW
 * statements. It emits no audit events. With --require-read-only it additionally refuses to run unless the
 * database session itself reports transaction_read_only=on (the workflow sets
 * PGOPTIONS="-c default_transaction_read_only=on" for DISCOVER and DRY_RUN), so Postgres would reject a write
 * even if this file contained one.
 *
 * OUTPUT: KEY=VALUE lines plus STATE_FINGERPRINT, a hash of every state line. Running the inspector before and
 * after a dry run and comparing the fingerprints proves the dry run changed nothing observable here.
 *
 * Usage:
 *   PRODUCTION_ACCEPTANCE_EMAIL=... DATABASE_URL=... \
 *     npx tsx scripts/inspect-acceptance-fixture-operator-target.ts \
 *       --expected-database-host <bare-hostname> [--require-read-only]
 */

import { createHash } from "crypto";
import { db, getDbInstance } from "@/lib/db";
import { ROLES } from "@/domain/constants/roles";
import { verifyExpectedDatabaseHost, resolvePrimaryWorkspaceId } from "./provision-acceptance-fixture-operator";

export const TARGET_EMAIL_ENV = "PRODUCTION_ACCEPTANCE_EMAIL";

const ACCEPTANCE_ROLE = ROLES.ACCEPTANCE_FIXTURE_OPERATOR;
const SYSTEM_ADMIN_ROLE = ROLES.SYSTEM_ADMIN;
const ROLE_SCOPE = "workspace";

/** A failure that is safe to print: it never contains the email, a connection string or a credential. */
export class InspectionError extends Error {}

interface RoleAssignmentRow {
  id: string;
  role: string;
  scope: string | null;
  scopeId: string | null;
  isActive: boolean;
  revokedAt: Date | null;
}

export interface TargetInspection {
  userIdSanitized: string;
  primaryWorkspaceId: string;
  activeRoles: string[];
  systemAdmin: boolean;
  acceptanceFixtureOperator: boolean;
  acceptanceFixtureOperatorInResolvedWorkspace: boolean;
  acceptanceFixtureOperatorRevokedRow: boolean;
  roleAssignmentRows: number;
  acceptanceRoleAssignmentRows: number;
  roleAssignmentAuditEvents: number;
}

/** First 8 and last 4 characters of the UUID: enough to recognise the account, not enough to be a handle. */
export function sanitizeUserId(userId: string): string {
  return userId.length >= 12 ? `${userId.slice(0, 8)}…${userId.slice(-4)}` : "…";
}

/** Defense in depth: never let a connection string reach a log, even inside a driver error message. */
export function redact(message: string): string {
  return message.replace(/[a-z][a-z0-9+.-]*:\/\/[^\s'")]+/gi, "<redacted-url>");
}

export function parseInspectorArgs(argv: string[]): { expectedDatabaseHost?: string; requireReadOnly: boolean } {
  const parsed: { expectedDatabaseHost?: string; requireReadOnly: boolean } = { requireReadOnly: false };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--expected-database-host") parsed.expectedDatabaseHost = argv[++i];
    else if (arg === "--require-read-only") parsed.requireReadOnly = true;
    else throw new InspectionError(`Unknown argument "${arg}". Accepted: --expected-database-host <bare-hostname> [--require-read-only].`);
  }
  return parsed;
}

/** The database session's own statement of whether it can write. */
export async function readSessionTransactionReadOnly(): Promise<boolean> {
  const rows = (await db.$queryRaw`SHOW transaction_read_only`) as Array<Record<string, unknown>>;
  const value = rows[0] ? String(Object.values(rows[0])[0]) : "";
  return value === "on";
}

export async function inspectAcceptanceFixtureTarget(email: string): Promise<TargetInspection> {
  if (typeof email !== "string" || email.trim().length === 0) {
    throw new InspectionError(`${TARGET_EMAIL_ENV} is not set or is empty.`);
  }

  const user = await db.user.findUnique({ where: { email }, select: { id: true, isActive: true } });
  if (!user) throw new InspectionError("The acceptance account was not found. Refusing.");
  if (!user.isActive) throw new InspectionError("The acceptance account exists but is not active. Refusing.");

  const primaryWorkspaceId = await resolvePrimaryWorkspaceId(user.id);
  if (!primaryWorkspaceId) {
    throw new InspectionError("The acceptance account has no active workspace membership, so no workspace can be resolved. Refusing.");
  }

  // `db` is a lazily-created client behind a Proxy typed `any`, so the row shape is declared here rather than inferred.
  const assignments: RoleAssignmentRow[] = await db.userRoleAssignment.findMany({
    where: { userId: user.id },
    select: { id: true, role: true, scope: true, scopeId: true, isActive: true, revokedAt: true },
  });
  const isLive = (a: { isActive: boolean; revokedAt: Date | null }) => a.isActive && a.revokedAt === null;
  const live = assignments.filter(isLive);

  const acceptanceInResolvedWorkspace = (a: { role: string; scope: string | null; scopeId: string | null }) =>
    a.role === ACCEPTANCE_ROLE && a.scope === ROLE_SCOPE && a.scopeId === primaryWorkspaceId;

  const roleAssignmentAuditEvents =
    assignments.length === 0
      ? 0
      : await db.auditEvent.count({
          where: { entityType: "user_role_assignment", entityId: { in: assignments.map((a) => a.id) } },
        });

  return {
    userIdSanitized: sanitizeUserId(user.id),
    primaryWorkspaceId,
    activeRoles: Array.from(new Set(live.map((a) => a.role))).sort(),
    systemAdmin: live.some((a) => a.role === SYSTEM_ADMIN_ROLE),
    acceptanceFixtureOperator: live.some((a) => a.role === ACCEPTANCE_ROLE),
    acceptanceFixtureOperatorInResolvedWorkspace: live.some(acceptanceInResolvedWorkspace),
    acceptanceFixtureOperatorRevokedRow: assignments.some((a) => acceptanceInResolvedWorkspace(a) && !isLive(a)),
    roleAssignmentRows: assignments.length,
    acceptanceRoleAssignmentRows: assignments.filter((a) => a.role === ACCEPTANCE_ROLE).length,
    roleAssignmentAuditEvents,
  };
}

const yn = (value: boolean) => (value ? "YES" : "NO");

/** Deterministic KEY=VALUE lines; the last line is a fingerprint of all the others. */
export function renderInspection(inspection: TargetInspection): string[] {
  const lines = [
    "TARGET_USER_FOUND=YES",
    "TARGET_USER_ACTIVE=YES",
    `TARGET_USER_ID=${inspection.userIdSanitized}`,
    `PRIMARY_WORKSPACE_ID=${inspection.primaryWorkspaceId}`,
    `ACTIVE_ROLES=${inspection.activeRoles.join(",") || "(none)"}`,
    `SYSTEM_ADMIN=${yn(inspection.systemAdmin)}`,
    `ACCEPTANCE_FIXTURE_OPERATOR=${yn(inspection.acceptanceFixtureOperator)}`,
    `ACCEPTANCE_FIXTURE_OPERATOR_IN_RESOLVED_WORKSPACE=${yn(inspection.acceptanceFixtureOperatorInResolvedWorkspace)}`,
    `ACCEPTANCE_FIXTURE_OPERATOR_REVOKED_ROW=${yn(inspection.acceptanceFixtureOperatorRevokedRow)}`,
    `ROLE_ASSIGNMENT_ROWS=${inspection.roleAssignmentRows}`,
    `ACCEPTANCE_ROLE_ASSIGNMENT_ROWS=${inspection.acceptanceRoleAssignmentRows}`,
    `ROLE_ASSIGNMENT_AUDIT_EVENTS=${inspection.roleAssignmentAuditEvents}`,
  ];
  const fingerprint = createHash("sha256").update(lines.join("\n")).digest("hex").slice(0, 16);
  return [...lines, `STATE_FINGERPRINT=${fingerprint}`];
}

async function main() {
  const args = parseInspectorArgs(process.argv.slice(2));

  // Wrong-database gate: first, and before getDbInstance() or any query, so a wrong, missing or malformed
  // expected host can never reach a database.
  verifyExpectedDatabaseHost(args.expectedDatabaseHost);

  const email = process.env[TARGET_EMAIL_ENV];
  if (!email || email.trim().length === 0) {
    throw new InspectionError(`${TARGET_EMAIL_ENV} is not set or is empty. The target is fixed by that protected secret; it cannot be passed as an argument.`);
  }

  await getDbInstance();

  const sessionReadOnly = await readSessionTransactionReadOnly();
  console.log(`DB_SESSION_READ_ONLY=${yn(sessionReadOnly)}`);
  if (args.requireReadOnly && !sessionReadOnly) {
    throw new InspectionError('--require-read-only was given but the database session is not read-only. Set PGOPTIONS="-c default_transaction_read_only=on". Refusing.');
  }

  const inspection = await inspectAcceptanceFixtureTarget(email);
  for (const line of renderInspection(inspection)) console.log(line);
}

// Run only as the process entry point, never as a side effect of being imported by a test.
const isMainModule = typeof process.argv[1] === "string" && process.argv[1].endsWith("inspect-acceptance-fixture-operator-target.ts");
if (isMainModule) {
  main()
    .catch((error: unknown) => {
      const message = error instanceof Error ? error.message : String(error);
      console.error(`✗ ${redact(message)}`);
      process.exitCode = 1;
    })
    .finally(() => {
      process.exit(process.exitCode ?? 0);
    });
}

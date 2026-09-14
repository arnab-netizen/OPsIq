#!/usr/bin/env node
/**
 * Provision (or revoke) the narrow ADMINISTRATION_OPERATOR role for one user.
 *
 * Sibling to scripts/provision-beta-request-operator.ts, same shape and same
 * rationale — that script's own doc comment explains WHY an out-of-band CLI
 * is needed at all (POST /api/users/[userId]/roles requires the caller to
 * already hold USER_ASSIGN_ROLE, forbids self-assignment, and nothing in
 * production grants USER_ASSIGN_ROLE to anyone today). This script does NOT
 * modify that one, does not touch BETA_REQUEST_OPERATOR in any way, and does
 * not generalize into an arbitrary-role grant tool — ROLE below is a fixed
 * constant, not a CLI argument.
 *
 * WHAT IT DOES: creates (or reactivates) exactly one UserRoleAssignment row —
 * role="administration_operator", scope="workspace", scopeId=<the target's
 * own resolvable primary workspace>. That role carries ONLY
 * BETA_PROGRAM_MANAGE and CUSTOMER_ACCESS_MANAGE (policies/capability-check.ts)
 * — no SYSTEM_ADMIN, no BETA_REQUEST_REVIEW/BETA_REQUEST_INVITE, no
 * engagement/client/lead/user-management access, no Owner Mode access. It
 * never touches the target's existing WorkspaceMembership.role or any other
 * UserRoleAssignment (BETA_REQUEST_OPERATOR included).
 *
 * WHY --workspace-id IS REQUIRED AND VALIDATED: same reason as the sibling
 * script — canonical route enforcement resolves policy context via the
 * caller's FIRST active WorkspaceMembership (addedAt asc, workspaceId asc)
 * for a `requireWorkspace: false` route. A UserRoleAssignment scoped to any
 * OTHER workspace would silently never be found at auth-check time. This
 * script independently re-derives that same "first active membership" and
 * REFUSES to proceed if it does not exactly match the workspace id passed in.
 *
 * SAFE BY DEFAULT: without --apply, this only prints what it would do. Nothing
 * is written. Pass --apply plus the exact --confirm phrase to actually mutate.
 *
 * Usage (dry run — always start here):
 *   npx tsx scripts/provision-administration-operator.ts --email owner@example.com --workspace-id <uuid>
 *
 * Usage (apply):
 *   npx tsx scripts/provision-administration-operator.ts --email owner@example.com --workspace-id <uuid> \
 *     --confirm "GRANT ADMINISTRATION OPERATOR" --apply [--granted-by <admin-user-uuid>]
 *
 * Usage (revoke):
 *   npx tsx scripts/provision-administration-operator.ts --email owner@example.com --workspace-id <uuid> \
 *     --confirm "REVOKE ADMINISTRATION OPERATOR" --apply --revoke
 *
 * This script has NEVER been run against production by Claude Code. Running it
 * against production is a privilege mutation requiring the repository owner's own,
 * separate, explicit authorization — see CLAUDE.md's "Owner approval boundaries"
 * and "Destructive-operation boundaries".
 */

import { randomUUID } from "crypto";
import { db, getDbInstance } from "@/lib/db";
import { ROLES } from "@/domain/constants/roles";
import { AUDIT_EVENTS } from "@/domain/constants/audit-events";
import { emitAuditEvent } from "@/infra/audit";
import type { Prisma } from "@/generated/prisma/client";

const GRANT_CONFIRM_PHRASE = "GRANT ADMINISTRATION OPERATOR";
const REVOKE_CONFIRM_PHRASE = "REVOKE ADMINISTRATION OPERATOR";
const ROLE = ROLES.ADMINISTRATION_OPERATOR;
const SCOPE = "workspace";

interface Args {
  email?: string;
  workspaceId?: string;
  confirm?: string;
  apply: boolean;
  revoke: boolean;
  grantedBy?: string;
}

function parseArgs(argv: string[]): Args {
  const args: Args = { apply: false, revoke: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--email") args.email = argv[++i];
    else if (a === "--workspace-id") args.workspaceId = argv[++i];
    else if (a === "--confirm") args.confirm = argv[++i];
    else if (a === "--apply") args.apply = true;
    else if (a === "--revoke") args.revoke = true;
    else if (a === "--granted-by") args.grantedBy = argv[++i];
  }
  return args;
}

export async function resolvePrimaryWorkspaceId(userId: string): Promise<string | null> {
  const membership = await db.workspaceMembership.findFirst({
    where: { userId, isActive: true },
    orderBy: [{ addedAt: "asc" }, { workspaceId: "asc" }],
    select: { workspaceId: true },
  });
  return membership?.workspaceId ?? null;
}

/**
 * AUDIT-01 atomicity: the UserRoleAssignment mutation and its audit event must
 * commit or roll back together, never one without the other. `emitAuditEvent`
 * accepts an `AuditClient` (see infra/audit.ts) so it can run against the same
 * `tx` handed out by `db.$transaction` -- same pattern as
 * scripts/provision-beta-request-operator.ts's grantBetaRequestOperator.
 * Extracted from `main()` (rather than inlined) so the transactional behavior
 * itself -- including rollback on a simulated audit failure -- is directly
 * unit-testable without spawning the CLI script as a subprocess.
 */
export interface GrantAdministrationOperatorResult {
  assignmentId: string;
  auditEventId: string;
}

export async function grantAdministrationOperator(params: {
  userId: string;
  email: string;
  workspaceId: string;
  grantedBy?: string;
}): Promise<GrantAdministrationOperatorResult> {
  const assignmentId = randomUUID();
  return db.$transaction(async (tx: Prisma.TransactionClient) => {
    await tx.userRoleAssignment.create({
      data: {
        id: assignmentId,
        userId: params.userId,
        role: ROLE,
        scope: SCOPE,
        scopeId: params.workspaceId,
        grantedBy: params.grantedBy ?? null,
        isActive: true,
      },
    });
    const auditEventId = await emitAuditEvent(
      {
        eventName: AUDIT_EVENTS.ROLE_ASSIGNED,
        actorId: params.grantedBy,
        workspaceId: params.workspaceId,
        entityType: "user_role_assignment",
        entityId: assignmentId,
        payload: {
          targetUserId: params.userId,
          targetEmail: params.email,
          role: ROLE,
          scope: SCOPE,
          scopeId: params.workspaceId,
          provisionedVia: "scripts/provision-administration-operator.ts",
        },
        visibility: "internal",
      },
      tx
    );
    return { assignmentId, auditEventId };
  });
}

export interface RevokeAdministrationOperatorResult {
  auditEventId: string;
}

export async function revokeAdministrationOperator(params: {
  assignmentId: string;
  userId: string;
  email: string;
  workspaceId: string;
  grantedBy?: string;
}): Promise<RevokeAdministrationOperatorResult> {
  return db.$transaction(async (tx: Prisma.TransactionClient) => {
    await tx.userRoleAssignment.update({
      where: { id: params.assignmentId },
      data: { isActive: false, revokedAt: new Date() },
    });
    const auditEventId = await emitAuditEvent(
      {
        eventName: AUDIT_EVENTS.ROLE_REVOKED,
        actorId: params.grantedBy,
        workspaceId: params.workspaceId,
        entityType: "user_role_assignment",
        entityId: params.assignmentId,
        payload: {
          targetUserId: params.userId,
          targetEmail: params.email,
          role: ROLE,
          scope: SCOPE,
          scopeId: params.workspaceId,
          provisionedVia: "scripts/provision-administration-operator.ts",
        },
        visibility: "internal",
      },
      tx
    );
    return { auditEventId };
  });
}

async function main() {
  const args = parseArgs(process.argv.slice(2));

  if (!args.email || !args.workspaceId) {
    console.error("Usage: --email <email> --workspace-id <uuid> [--confirm \"...\" --apply [--revoke] [--granted-by <uuid>]]");
    process.exit(1);
  }

  await getDbInstance();

  const user = await db.user.findUnique({ where: { email: args.email } });
  if (!user) {
    console.error(`✗ No user found with email ${args.email}`);
    process.exit(1);
  }
  if (!user.isActive) {
    console.error(`✗ User ${args.email} (${user.id}) is not active — refusing to grant a role to a deactivated account.`);
    process.exit(1);
  }

  const resolvedWorkspaceId = await resolvePrimaryWorkspaceId(user.id);
  if (!resolvedWorkspaceId) {
    console.error(`✗ User ${args.email} has no active WorkspaceMembership at all — a UserRoleAssignment here could never be resolved by getPolicyContext(). Refusing.`);
    process.exit(1);
  }
  if (resolvedWorkspaceId !== args.workspaceId) {
    console.error(
      `✗ Mismatch: this user's resolvable primary workspace is ${resolvedWorkspaceId}, but --workspace-id was ${args.workspaceId}.\n` +
      `  A grant scoped to the wrong workspace would silently never be found at auth-check time (getPolicyContext resolves the FIRST active membership, ordered by addedAt then workspaceId).\n` +
      `  Re-run with --workspace-id ${resolvedWorkspaceId}, or investigate why the user has more than one workspace and confirm which one their admin sessions actually resolve to.`
    );
    process.exit(1);
  }

  const existing = await db.userRoleAssignment.findFirst({
    where: { userId: user.id, role: ROLE, scope: SCOPE, scopeId: resolvedWorkspaceId, isActive: true, revokedAt: null },
  });

  if (args.revoke) {
    if (!existing) {
      console.log(`✓ No active ${ROLE} assignment exists for ${args.email} in workspace ${resolvedWorkspaceId} — nothing to revoke.`);
      return;
    }
    console.log(`Found active ${ROLE} assignment ${existing.id} for ${args.email} (workspace ${resolvedWorkspaceId}).`);
    if (!args.apply) {
      console.log("Dry run only — pass --apply to actually revoke. No changes made.");
      return;
    }
    if (args.confirm !== REVOKE_CONFIRM_PHRASE) {
      console.error(`✗ --confirm must be exactly "${REVOKE_CONFIRM_PHRASE}" to revoke. Refusing.`);
      process.exit(1);
    }
    await revokeAdministrationOperator({
      assignmentId: existing.id,
      userId: user.id,
      email: args.email,
      workspaceId: resolvedWorkspaceId,
      grantedBy: args.grantedBy,
    });
    console.log(`✓ Revoked ${ROLE} for ${args.email} (assignment ${existing.id}).`);
    return;
  }

  // Grant path
  if (existing) {
    console.log(`✓ ${args.email} already holds an active ${ROLE} assignment (${existing.id}) in workspace ${resolvedWorkspaceId} — nothing to do.`);
    return;
  }

  console.log(`Will grant role="${ROLE}" scope="${SCOPE}" scopeId="${resolvedWorkspaceId}" to ${args.email} (${user.id}).`);
  console.log("This grants EXACTLY BETA_PROGRAM_MANAGE and CUSTOMER_ACCESS_MANAGE — no SYSTEM_ADMIN and no beta-request-review/invite capabilities from this role.");

  if (!args.apply) {
    console.log("Dry run only — pass --apply (with --confirm) to actually grant. No changes made.");
    return;
  }
  if (args.confirm !== GRANT_CONFIRM_PHRASE) {
    console.error(`✗ --confirm must be exactly "${GRANT_CONFIRM_PHRASE}" to grant. Refusing.`);
    process.exit(1);
  }

  const { assignmentId } = await grantAdministrationOperator({
    userId: user.id,
    email: args.email,
    workspaceId: resolvedWorkspaceId,
    grantedBy: args.grantedBy,
  });
  console.log(`✓ Granted ${ROLE} to ${args.email} (assignment ${assignmentId}). Rollback: re-run with --revoke --confirm "${REVOKE_CONFIRM_PHRASE}" --apply.`);
}

// Only run main() when this file is the process's actual entry point (the
// normal `npx tsx scripts/provision-administration-operator.ts ...` CLI
// invocation) -- never as a side effect of importing grantAdministrationOperator/
// revokeAdministrationOperator/resolvePrimaryWorkspaceId for testing. Checking
// process.argv[1] avoids relying on require.main/import.meta module-identity
// semantics, which behave differently between a plain tsx CLI run and a
// module imported through a test bundler's transform pipeline.
const isMainModule = typeof process.argv[1] === "string" && process.argv[1].endsWith("provision-administration-operator.ts");
if (isMainModule) {
  main()
    .catch((error: unknown) => {
      console.error("Error:", error instanceof Error ? error.message : String(error));
      process.exitCode = 1;
    })
    .finally(() => {
      // main()'s success/no-op/dry-run paths all end in a plain `return;` --
      // none of them close the Prisma pool, so without an explicit exit here
      // the process hangs (idle DB connection) until Postgres's own
      // connection-idle timeout, well after the script has finished its work.
      // Explicit error paths inside main() already call process.exit(1)
      // directly and are unaffected by this.
      process.exit(process.exitCode ?? 0);
    });
}

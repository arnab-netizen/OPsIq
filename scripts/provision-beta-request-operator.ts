#!/usr/bin/env node
/**
 * Provision (or revoke) the narrow BETA_REQUEST_OPERATOR role for one user.
 *
 * WHY THIS SCRIPT EXISTS (rather than the existing POST /api/users/[userId]/roles):
 * that endpoint requires the CALLER to already hold USER_ASSIGN_ROLE, and forbids
 * self-assignment (`services/role-assignment.ts`'s `assertHierarchyAuthority` +
 * self-assignment guard). Nothing in production today grants USER_ASSIGN_ROLE to
 * anyone — the only production role-creation path is POST /api/auth/signup, which
 * always grants ADMIN_OR_PORTFOLIO_MANAGER, and a self-serve owner's
 * WorkspaceMembership.role="owner" narrows their *effective* capabilities down to
 * OWNER_SCOPED_CAPABILITIES (see policies/capability-check.ts), which excludes
 * USER_ASSIGN_ROLE even though their stored role is still admin_or_portfolio_manager.
 * This is the same bootstrap gap that makes granting the very first SYSTEM_ADMIN in
 * this system require an out-of-band action too — this script follows the same
 * shape as .github/workflows/migrate-production.yml's out-of-band, explicitly
 * confirmed, human-run pattern for exactly this class of problem.
 *
 * WHAT IT DOES: creates (or reactivates) exactly one UserRoleAssignment row —
 * role="beta_request_operator", scope="workspace", scopeId=<the target's own
 * resolvable primary workspace>. That role carries ONLY BETA_REQUEST_REVIEW and
 * BETA_REQUEST_INVITE (policies/capability-check.ts) — no SYSTEM_ADMIN, no
 * engagement/client/lead/user-management access, no Owner Mode access. It
 * never touches the target's existing WorkspaceMembership.role or any other
 * UserRoleAssignment.
 *
 * WHY --workspace-id IS REQUIRED AND VALIDATED: canonical route enforcement
 * resolves policy context via getPolicyContext(undefined) for a
 * `requireWorkspace: false` route (like GET /api/admin/beta-requests) — which
 * falls back to the caller's FIRST active WorkspaceMembership, ordered by
 * (addedAt asc, workspaceId asc). A UserRoleAssignment scoped to any OTHER
 * workspace would silently never be found at auth-check time. This script
 * independently re-derives that same "first active membership" and REFUSES to
 * proceed if it does not exactly match the workspace id you pass in — the same
 * wrong-target protection migrate-production.yml's expected_database_host gate
 * uses for a different resource.
 *
 * SAFE BY DEFAULT: without --apply, this only prints what it would do. Nothing is
 * written. Pass --apply plus the exact --confirm phrase to actually mutate.
 *
 * Usage (dry run — always start here):
 *   npx tsx scripts/provision-beta-request-operator.ts --email owner@example.com --workspace-id <uuid>
 *
 * Usage (apply):
 *   npx tsx scripts/provision-beta-request-operator.ts --email owner@example.com --workspace-id <uuid> \
 *     --confirm "GRANT BETA REQUEST OPERATOR" --apply [--granted-by <admin-user-uuid>]
 *
 * Usage (revoke):
 *   npx tsx scripts/provision-beta-request-operator.ts --email owner@example.com --workspace-id <uuid> \
 *     --confirm "REVOKE BETA REQUEST OPERATOR" --apply --revoke
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

const GRANT_CONFIRM_PHRASE = "GRANT BETA REQUEST OPERATOR";
const REVOKE_CONFIRM_PHRASE = "REVOKE BETA REQUEST OPERATOR";
const ROLE = ROLES.BETA_REQUEST_OPERATOR;
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
 * `tx` handed out by `db.$transaction` -- same pattern as e.g.
 * services/owner-mode/owner-action-outcome.service.ts. Extracted from `main()`
 * (rather than inlined) so the transactional behavior itself -- including
 * rollback on a simulated audit failure -- is directly unit-testable without
 * spawning the CLI script as a subprocess.
 */
export interface GrantBetaRequestOperatorResult {
  assignmentId: string;
  auditEventId: string;
}

export async function grantBetaRequestOperator(params: {
  userId: string;
  email: string;
  workspaceId: string;
  grantedBy?: string;
}): Promise<GrantBetaRequestOperatorResult> {
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
          provisionedVia: "scripts/provision-beta-request-operator.ts",
        },
        visibility: "internal",
      },
      tx
    );
    return { assignmentId, auditEventId };
  });
}

export interface RevokeBetaRequestOperatorResult {
  auditEventId: string;
}

export async function revokeBetaRequestOperator(params: {
  assignmentId: string;
  userId: string;
  email: string;
  workspaceId: string;
  grantedBy?: string;
}): Promise<RevokeBetaRequestOperatorResult> {
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
          provisionedVia: "scripts/provision-beta-request-operator.ts",
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
    await revokeBetaRequestOperator({
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
  console.log(`This grants EXACTLY BETA_REQUEST_REVIEW and BETA_REQUEST_INVITE — no SYSTEM_ADMIN, no other admin surface.`);

  if (!args.apply) {
    console.log("Dry run only — pass --apply (with --confirm) to actually grant. No changes made.");
    return;
  }
  if (args.confirm !== GRANT_CONFIRM_PHRASE) {
    console.error(`✗ --confirm must be exactly "${GRANT_CONFIRM_PHRASE}" to grant. Refusing.`);
    process.exit(1);
  }

  const { assignmentId } = await grantBetaRequestOperator({
    userId: user.id,
    email: args.email,
    workspaceId: resolvedWorkspaceId,
    grantedBy: args.grantedBy,
  });
  console.log(`✓ Granted ${ROLE} to ${args.email} (assignment ${assignmentId}). Rollback: re-run with --revoke --confirm "${REVOKE_CONFIRM_PHRASE}" --apply.`);
}

// Only run main() when this file is the process's actual entry point (the
// normal `npx tsx scripts/provision-beta-request-operator.ts ...` CLI
// invocation) -- never as a side effect of importing grantBetaRequestOperator/
// revokeBetaRequestOperator/resolvePrimaryWorkspaceId for testing. Checking
// process.argv[1] avoids relying on require.main/import.meta module-identity
// semantics, which behave differently between a plain tsx CLI run and a
// module imported through a test bundler's transform pipeline.
const isMainModule = typeof process.argv[1] === "string" && process.argv[1].endsWith("provision-beta-request-operator.ts");
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

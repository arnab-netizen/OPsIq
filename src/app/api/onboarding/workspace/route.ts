import { withCanonicalEnforcement, type CanonicalAuthContext } from "@/lib/canonical-route-enforcement";
import { CAPABILITIES } from "@/domain/constants/capabilities";
import { ROLES } from "@/domain/constants/roles";
import { ConflictError } from "@/infra/errors";
import { db, withStatementTimeout } from "@/lib/db";
import type { Prisma } from "@/generated/prisma/client";
import { emitAuditEvent } from "@/infra/audit";
import { AUDIT_EVENTS } from "@/domain/constants/audit-events";
import { randomUUID } from "crypto";
import { z } from "zod";

const CreateWorkspaceSchema = z.object({
  name: z.string().min(3).max(100),
  slug: z.string().min(3).max(50).regex(/^[a-z0-9-]+$/),
  description: z.string().optional(),
});

// Bounds the Postgres-side statement_timeout applied inside the transaction
// below (see withStatementTimeout in @/lib/db) — three simple inserts.
const WORKSPACE_RECOVERY_TRANSACTION_TIMEOUT_MS = 5000;

export const POST = withCanonicalEnforcement(
  async (ctx: CanonicalAuthContext) => {
    const actorId = ctx.verifiedActorId;

    const body = await ctx.request?.json();
    const input = CreateWorkspaceSchema.parse(body);

    // Public signup owns initial-workspace creation. This endpoint exists
    // only to recover an authenticated account that legitimately has none
    // (e.g. an account whose signup partially failed before this invariant
    // was closed) — not to let an already-onboarded user create a second
    // workspace. A genuine "create an additional workspace" feature would
    // need its own separate, explicitly-authorized surface.
    const existingMembership = await db.workspaceMembership.findFirst({
      where: { userId: actorId, isActive: true },
      select: { id: true },
    });
    if (existingMembership) {
      throw new ConflictError(
        "This account already has a workspace. This endpoint only recovers accounts with no workspace."
      );
    }

    const existingSlug = await db.workspace.findUnique({
      where: { slug: input.slug },
    });
    if (existingSlug) {
      throw new ConflictError("Workspace slug already exists");
    }

    const now = new Date();
    const workspaceId = randomUUID();

    // Workspace, WorkspaceMembership and UserRoleAssignment must commit
    // together — without the role assignment the recovered account would
    // have a membership but zero effective capabilities in its own
    // workspace (the defect that made the original onboarding-workspace
    // path incomplete relative to signup).
    const workspace = await withStatementTimeout(
      db,
      WORKSPACE_RECOVERY_TRANSACTION_TIMEOUT_MS,
      async (tx: Prisma.TransactionClient) => {
        const workspace = await tx.workspace.create({
          data: {
            id: workspaceId,
            name: input.name,
            slug: input.slug,
            description: input.description,
            createdBy: actorId,
            isActive: true,
          },
        });

        await tx.workspaceMembership.create({
          data: {
            workspaceId: workspace.id,
            userId: actorId,
            role: "admin",
            addedBy: actorId,
            isActive: true,
          },
        });

        await tx.userRoleAssignment.create({
          data: {
            id: randomUUID(),
            userId: actorId,
            role: ROLES.ADMIN_OR_PORTFOLIO_MANAGER,
            scope: "workspace",
            scopeId: workspace.id,
            grantedAt: now,
            isActive: true,
          },
        });

        return workspace;
      },
      "onboarding-workspace-recovery"
    );

    try {
      await emitAuditEvent({
        eventName: AUDIT_EVENTS.WORKSPACE_CREATED,
        actorId,
        workspaceId: workspace.id,
        payload: { name: workspace.name, slug: workspace.slug, path: "onboarding_recovery" },
        visibility: "internal",
      });
    } catch (auditError) {
      console.error(
        "[ONBOARDING_WORKSPACE_AUDIT_FAILURE]",
        auditError instanceof Error ? auditError.message : String(auditError)
      );
    }

    return {
      workspaceId: workspace.id,
      slug: workspace.slug,
      message: "Workspace created successfully",
    };
  },
  { requireWorkspace: false, requireCapabilities: [CAPABILITIES.OWNER_ONBOARD] }
);

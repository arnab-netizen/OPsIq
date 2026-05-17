import { withCanonicalEnforcement, type CanonicalAuthContext } from "@/lib/canonical-route-enforcement";
import { UnauthorizedError } from "@/infra/errors";
import { createEntity, getEntities } from "@/services/entity/store";
import { resolveServerRole } from "@/services/auth/server-role";
import { getSession } from "@/services/auth";
import { canEdit } from "@/services/auth/access";
import { logAuditEvent } from "@/services/audit/audit-log";
import { randomUUID } from "crypto";

export const GET = withCanonicalEnforcement(
  async (ctx: CanonicalAuthContext) => {
    const workspaceId = ctx.verifiedWorkspaceId;
    const entities = getEntities();
    return entities;
  },
  { requireWorkspace: true }
);

export const POST = withCanonicalEnforcement(
  async (ctx: CanonicalAuthContext) => {
    // Enforce server-side auth
    const role = await resolveServerRole();
    if (!role) {
      throw new UnauthorizedError("Unauthorized");
    }

    if (!canEdit(role)) {
      throw new Error("Insufficient permissions");
    }

    const body = await ctx.request!.json();
    const { name, type } = body;

    if (!name || !type) {
      throw new Error("Missing required fields: name, type");
    }

    const validTypes = ["business_unit", "client", "project"];
    if (!validTypes.includes(type)) {
      throw new Error("Invalid type: must be business_unit, client, or project");
    }

    const entityId = randomUUID();
    const entity = {
      id: entityId,
      name,
      type,
      createdAt: new Date().toISOString(),
    };

    // Get actor ID for audit
    const actorId = ctx.verifiedActorId;

    createEntity(entity);

    // Log audit event (fail-closed if audit fails)
    await logAuditEvent({
      eventName: "CREATE",
      entityType: "Entity",
      entityId,
      actorId,
      role,
      before: null,
      after: entity,
    });

    return entity;
  },
  { requireWorkspace: true }
);

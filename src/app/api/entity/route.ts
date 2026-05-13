import { NextRequest } from "next/server";
import { withAuth } from "@/lib/auth-guard";
import { UnauthorizedError } from "@/infra/errors";
import { withEnforcementFull } from "@/lib/enforced-route";
import { createEntity, getEntities } from "@/services/entity/store";
import { requireAuth } from "@/lib/auth-guard";
import { enforceWorkspaceScoping } from "@/middleware/workspace-enforcement";
import { resolveServerRole } from "@/services/auth/server-role";
import { getSession } from "@/services/auth";
import { canEdit } from "@/services/auth/access";
import { logAuditEvent } from "@/services/audit/audit-log";
import { randomUUID } from "crypto";

export const GET = withEnforcementFull(async (request: NextRequest) => {
  // Require authentication (fail-closed)
  await requireAuth();

  // Require workspace context
  const workspaceId = request.headers.get("x-workspace-id");
  if (!workspaceId) {
    throw new Error("Workspace ID required (x-workspace-id header)");
  }

  const membership = await enforceWorkspaceScoping(request, workspaceId);
  if (!membership) {
    throw new UnauthorizedError("Unauthorized");
  }

  const entities = getEntities();
  return entities;
});

export const POST = withEnforcementFull(async (request: NextRequest) => {
  // Enforce server-side auth
  const role = await resolveServerRole();
  if (!role) {
    throw new UnauthorizedError("Unauthorized");
  }

  if (!canEdit(role)) {
    throw new Error("Insufficient permissions");
  }

  const body = await request.json();
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
  const { session } = await withAuth();
  const actorId = session?.user.id ?? null;

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
});

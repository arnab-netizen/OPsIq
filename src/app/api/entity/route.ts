import { emitAuditEvent } from '@/infra/audit';
import { AUDIT_EVENTS } from '@/domain/constants/audit-events';
import { NextRequest } from "next/server";
import { withAuth, createServiceCapabilityContext } from "@/lib/auth-guard";
import { withEnforcementFull } from "@/lib/enforced-route";
import { withCanonicalEnforcement, type CanonicalAuthContext } from "@/lib/canonical-route-enforcement";
import { UnauthorizedError } from "@/infra/errors";
import { CAPABILITIES } from "@/domain/constants/capabilities";
import { createEntity, getEntities } from "@/services/entity/store";
import { resolveServerRole } from "@/services/auth/server-role";
import { getSession } from "@/services/auth";
import { canEdit } from "@/services/auth/access";
import { logAuditEvent } from "@/services/audit/audit-log";
import { randomUUID } from "crypto";

export const GET = withCanonicalEnforcement(
  async (ctx: CanonicalAuthContext) => {
    const workspaceId = nextRequest.headers.get("x-workspace-id");
    const entities = getEntities();
    return entities;
  },
  { requireCapabilities: [CAPABILITIES.CLIENT_VIEW], requireWorkspace: true }
);

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
  const auditContext = createServiceCapabilityContext({ capability: "mutation" });
  await logAuditEvent({
    eventName: "CREATE",
    entityType: "Entity",
    entityId,
    actorId,
    role,
    before: null,
    after: entity,
    context: auditContext,
  });

  return entity;
});

import { emitAuditEvent } from '@/infra/audit';
import { AUDIT_EVENTS } from '@/domain/constants/audit-events';
import { NextRequest } from "next/server";
import { withAuth, createServiceCapabilityContext } from "@/lib/auth-guard";
import { UnauthorizedError } from "@/infra/errors";
import { withEnforcementFull } from "@/lib/enforced-route";
import { addOverride } from "@/services/override/store";
import { getItems, applyOverride } from "@/services/operator/store";
import { resolveServerRole } from "@/services/auth/server-role";
import { canEdit } from "@/services/auth/access";
import { logAuditEvent } from "@/services/audit/audit-log";
import { randomUUID } from "crypto";

export const POST = withEnforcementFull(async (request: NextRequest) => {
  // Enforce server-side auth
  const role = await resolveServerRole();
  if (!role) {
    // Log AUTH_FAILED audit event
    await logAuditEvent({
      eventName: "AUTH_FAILED",
      entityType: "OperatorItem",
      entityId: "unknown",
      actorId: null,
      role: null,
      before: null,
      after: null,
      metadata: {
        reason: "Session not found or invalid",
        action: "override_attempt",
      },
      context: createServiceCapabilityContext({ capability: "mutation" }),
    }).catch((auditError) => {
      console.error(`Audit logging failed: ${auditError}`);
    });

    throw new UnauthorizedError("Unauthorized");
  }

  if (!canEdit(role)) {
    // Log PERMISSION_DENIED audit event
    // Note: userId is available from the session if needed, but role is just a string
    await logAuditEvent({
      eventName: "PERMISSION_DENIED",
      entityType: "OperatorItem",
      entityId: "unknown",
      actorId: null, // Would need session context to get actual userId
      role,
      before: null,
      after: null,
      metadata: {
        reason: "User role lacks edit permission",
        action: "override_attempt",
      },
      context: createServiceCapabilityContext({ capability: "mutation" }),
    }).catch((auditError) => {
      console.error(`Audit logging failed: ${auditError}`);
    });

    throw new Error("Insufficient permissions");
  }

  const body = await request.json();
  const { operatorItemId, overriddenAction, reason, overrideAllowed } = body;

  // Validate required fields
  if (!operatorItemId || !overriddenAction || !reason) {
    throw new Error("Missing required fields: operatorItemId, overriddenAction, reason");
  }

  // Fetch operator item to get original action
  const items = await getItems();
  const item = items.find((i) => i.id === operatorItemId);

  if (!item) {
    throw new Error("Operator item not found");
  }

  // Get actor ID for audit
  const { session } = await withAuth();
  const actorId = session?.user.id ?? null;

  // Check if override is allowed
  if (overrideAllowed === false) {
    // Log OVERRIDE_DENIED audit event
    await logAuditEvent({
      eventName: "OVERRIDE_DENIED",
      entityType: "OperatorItem",
      entityId: operatorItemId,
      actorId,
      role,
      before: item,
      after: null,
      metadata: {
        originalAction: item.action,
        attemptedOverride: overriddenAction,
        reason,
        denialReason: "Override not allowed for this violation",
      },
      context: createServiceCapabilityContext({ capability: "mutation" }),
    }).catch((auditError) => {
      console.error(`Audit logging failed: ${auditError}`);
    });

    throw new Error("Override not allowed for this guardrail violation");
  }

  // Create and store override record
  const overrideRecord = {
    id: randomUUID(),
    operatorItemId,
    originalAction: item.action,
    overriddenAction,
    reason,
    createdAt: new Date().toISOString(),
  };

  addOverride(overrideRecord);
  const beforeItem = item;
  await applyOverride(operatorItemId, overriddenAction);

  // Capture after state
  const itemsAfter = await getItems();
  const afterItem = itemsAfter.find((i) => i.id === operatorItemId);

  // Log OVERRIDE_APPROVED audit event
  await logAuditEvent({
    eventName: "OVERRIDE_APPROVED",
    entityType: "OperatorItem",
    entityId: operatorItemId,
    actorId,
    role,
    before: beforeItem,
    after: afterItem ?? null,
    metadata: {
      originalAction: item.action,
      overriddenAction,
      reason,
    },
    context: createServiceCapabilityContext({ capability: "mutation" }),
  }).catch((auditError) => {
    console.error(`Audit logging failed: ${auditError}`);
  });

  return { success: true };
});

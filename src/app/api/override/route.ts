import { NextRequest, NextResponse } from "next/server";
import { addOverride } from "@/services/override/store";
import { getItems, applyOverride } from "@/services/operator/store";
import { resolveServerRole } from "@/services/auth/server-role";
import { getSession } from "@/services/auth";
import { canEdit } from "@/services/auth/access";
import { logAuditEvent } from "@/services/audit/audit-log";
import { randomUUID } from "crypto";

export async function POST(request: NextRequest) {
  try {
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
      }).catch((auditError) => {
        console.error(`Audit logging failed: ${auditError}`);
        throw auditError;
      });

      return NextResponse.json(
        { error: "Unauthorized" },
        { status: 403 }
      );
    }

    if (!canEdit(role)) {
      // Log PERMISSION_DENIED audit event
      await logAuditEvent({
        eventName: "PERMISSION_DENIED",
        entityType: "OperatorItem",
        entityId: "unknown",
        actorId: (await getSession())?.user.id ?? null,
        role,
        before: null,
        after: null,
        metadata: {
          reason: "User role lacks edit permission",
          action: "override_attempt",
        },
      }).catch((auditError) => {
        console.error(`Audit logging failed: ${auditError}`);
        throw auditError;
      });

      return NextResponse.json(
        { error: "Insufficient permissions" },
        { status: 403 }
      );
    }

    const body = await request.json();
    const { operatorItemId, overriddenAction, reason, overrideAllowed } = body;

    // Validate required fields
    if (!operatorItemId || !overriddenAction || !reason) {
      return NextResponse.json(
        {
          error:
            "Missing required fields: operatorItemId, overriddenAction, reason",
        },
        { status: 400 }
      );
    }

    // Fetch operator item to get original action
    const items = await getItems();
    const item = items.find((i) => i.id === operatorItemId);

    if (!item) {
      return NextResponse.json(
        { error: "Operator item not found" },
        { status: 400 }
      );
    }

    // Get actor ID for audit
    const session = await getSession();
    const actorId = session?.user.id ?? null;

    // Check if override is allowed
    if (overrideAllowed === false) {
      // Log OVERRIDE_DENIED audit event (fail-closed)
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
      }).catch((auditError) => {
        console.error(`Audit logging failed: ${auditError}`);
        throw auditError;
      });

      return NextResponse.json(
        { error: "Override not allowed for this guardrail violation" },
        { status: 403 }
      );
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

    // Log OVERRIDE_APPROVED audit event (fail-closed)
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
    }).catch((auditError) => {
      console.error(`Audit logging failed: ${auditError}`);
      throw auditError;
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}

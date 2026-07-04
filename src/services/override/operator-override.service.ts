/* eslint-disable @typescript-eslint/no-explicit-any -- Prisma `db`/`tx` proxy returns untyped rows */
/**
 * Operator-item override — governed service (GAP-OVR-01).
 *
 * Mirrors the correct owner-budget override template (`recordOwnerOverride`):
 * the SERVER decides whether an override is permitted (never a client-supplied
 * flag), the decision is durably persisted, a hash-chained audit event is
 * written fail-closed inside the same transaction, and an explicit risk
 * acknowledgement + reason are required.
 *
 * The server-side safety gate is the operator item's own stored `guardrailResult`:
 * if the decision was blocked by a guardrail violation that is NOT overridable
 * (e.g. NEGATIVE_IMPACT_BLOCK — `overrideAllowed: false`), the override is denied.
 * This is the authoritative signal, not the request body.
 */
import { db } from "@/lib/db";
import { randomUUID } from "crypto";
import { NotFoundError, ForbiddenError, ValidationError } from "@/infra/errors";
import { emitAuditEvent } from "@/infra/audit";
import { AUDIT_EVENTS } from "@/domain/constants/audit-events";

export interface OperatorOverrideInput {
  operatorItemId: string;
  overriddenAction: string;
  reason: string;
  /** Explicit owner acknowledgement that the risk of overriding is understood. */
  riskAcknowledged: boolean;
  workspaceId: string;
  actorId: string;
  role: string | null;
}

export interface OperatorOverrideResult {
  success: true;
  overrideRecordId: string;
  operatorItemId: string;
  originalAction: string;
  overriddenAction: string;
}

/** A guardrail violation as persisted on `operatorItem.guardrailResult`. */
interface StoredGuardrailViolation {
  ruleId?: string;
  severity?: string;
  overrideAllowed?: boolean;
  message?: string;
}

/**
 * Returns the first non-overridable blocking violation on the item, or null.
 * A blocking violation with `overrideAllowed === false` hard-blocks the override.
 */
function findNonOverridableBlock(guardrailResult: unknown): StoredGuardrailViolation | null {
  if (!guardrailResult || typeof guardrailResult !== "object") return null;
  const violations = (guardrailResult as any).violations;
  if (!Array.isArray(violations)) return null;
  for (const v of violations as StoredGuardrailViolation[]) {
    if (v && v.severity === "block" && v.overrideAllowed === false) return v;
  }
  return null;
}

export async function recordOperatorOverride(
  input: OperatorOverrideInput,
): Promise<OperatorOverrideResult> {
  const { operatorItemId, overriddenAction, reason, riskAcknowledged, workspaceId, actorId } = input;

  if (!operatorItemId || !overriddenAction || !reason) {
    throw new ValidationError("Missing required fields: operatorItemId, overriddenAction, reason");
  }
  // Friction: an owner override must carry an explicit risk acknowledgement.
  if (riskAcknowledged !== true) {
    throw new ValidationError("Override requires an explicit risk acknowledgement (riskAcknowledged: true)");
  }

  // Load the item scoped to the caller's verified workspace (tenant isolation).
  const item = await db.operatorItem.findFirst({
    where: { id: operatorItemId, workspaceId },
    select: { id: true, action: true, guardrailResult: true, workspaceId: true },
  });
  if (!item) throw new NotFoundError("OperatorItem", operatorItemId);

  // SERVER-SIDE SAFETY GATE: a non-overridable guardrail block cannot be overridden.
  const hardBlock = findNonOverridableBlock(item.guardrailResult);
  if (hardBlock) {
    await emitAuditEvent({
      eventName: AUDIT_EVENTS.OVERRIDE_DENIED,
      actorId,
      entityType: "operator_item",
      entityId: operatorItemId,
      workspaceId,
      payload: {
        originalAction: item.action,
        attemptedOverride: overriddenAction,
        reason,
        denialReason: `Non-overridable guardrail: ${hardBlock.ruleId ?? "unknown"}`,
      },
      visibility: "internal",
    }).catch(() => {
      /* denial is already enforced by the throw below; audit best-effort here */
    });
    throw new ForbiddenError(
      `Override not permitted: decision is blocked by a non-overridable guardrail (${hardBlock.ruleId ?? "unknown"}).`,
    );
  }

  const overrideRecordId = randomUUID();

  // Atomic + fail-closed: durable override record, action mutation, and the
  // hash-chained OVERRIDE_APPROVED audit all commit together or none do.
  await db.$transaction(async (tx: any) => {
    await tx.overrideRecord.create({
      data: {
        id: overrideRecordId,
        operatorItemId,
        originalAction: item.action,
        overriddenAction,
        reason,
        overriddenBy: actorId,
      },
    });

    await tx.operatorItem.update({
      where: { id: operatorItemId, workspaceId },
      data: { action: overriddenAction },
    });

    await emitAuditEvent(
      {
        eventName: AUDIT_EVENTS.OVERRIDE_APPROVED,
        actorId,
        entityType: "operator_item",
        entityId: operatorItemId,
        workspaceId,
        payload: {
          overrideRecordId,
          originalAction: item.action,
          overriddenAction,
          reason,
          riskAcknowledged: true,
        },
        visibility: "internal",
      },
      tx,
    );
  });

  return {
    success: true,
    overrideRecordId,
    operatorItemId,
    originalAction: item.action,
    overriddenAction,
  };
}

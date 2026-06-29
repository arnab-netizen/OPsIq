/**
 * Defect 1 (pre-training hardening) — owner approval resolution must not 500.
 *
 * Captured baseline bug: resolving a risky approval returned HTTP 500
 * (PrismaClientKnownRequestError P2007: invalid input syntax for type uuid) because the audit log
 * wrote a non-uuid entity_id ("approval.owner_decision_required"). With audit_events.entity_id
 * widened to text, the flow must resolve to a controlled decision and persist the attention + audit
 * events without throwing. `[db]`-gated.
 */
import { describe, it, expect, beforeAll } from "vitest";
import { randomUUID } from "crypto";
import { db } from "@/lib/db";
import { resolveOwnerApproval } from "@/services/owner-mode/owner-approval-resolution.service";
import { SHOULD_RUN_DB_TESTS } from "@/__tests__/test-helpers/db-test-gate";

describe.skipIf(!SHOULD_RUN_DB_TESTS)("[db] owner approval resolution — no 500 on non-uuid audit entity", () => {
  const actor = randomUUID();
  const workspaceId = randomUUID();

  beforeAll(async () => {
    await db.user.upsert({
      where: { id: actor },
      update: {},
      create: { id: actor, email: `approval-${actor}@example.com`, name: "Approval Test", isActive: true, updatedAt: new Date() },
    });
    await db.workspace.upsert({
      where: { id: workspaceId },
      update: {},
      create: { id: workspaceId, name: "Approval WS", slug: `approval-ws-${workspaceId}`, createdBy: actor },
    });
  });

  it("[db] a risky discount approval with no standing rule resolves to needs_owner_approval (not a 500)", async () => {
    const resolution = await resolveOwnerApproval({
      workspaceId,
      scope: "pricing.discount",
      contentHash: "abc123def456",
      riskClass: "high",
      actionType: "apply_discount",
      amount: 50000,
    });

    expect(resolution.outcome).toBe("needs_owner_approval");
    expect(resolution.reason).toBe("owner_decision_required");
    expect(resolution.ownerActionRequired).toBe(true);
    expect(resolution.handledByOpsIQ).toBe(false);

    // The attention event was persisted with the non-uuid string event type.
    const attn = await db.ownerAttentionEvent.findFirst({
      where: { workspaceId, eventType: "approval.owner_decision_required" },
    });
    expect(attn).not.toBeNull();

    // The audit event was persisted with a non-uuid entity_id (now text) — this is the bug fix.
    const audit = await db.auditEvent.findFirst({
      where: { workspaceId, entityType: "owner_attention_event", entityId: "approval.owner_decision_required" },
    });
    expect(audit).not.toBeNull();
  });
});

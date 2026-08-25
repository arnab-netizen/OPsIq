/**
 * GAP-OVR-01 — governed operator-item override [db].
 *
 * Proves the hardened override path: server-side safety gate (non-overridable
 * guardrail blocks are refused, not client-controlled), required reason + risk
 * acknowledgement, durable OverrideRecord persistence, hash-chained audit, and
 * workspace isolation.
 */
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { randomUUID } from "crypto";
import { db } from "@/lib/db";
import { recordOperatorOverride } from "@/services/override/operator-override.service";
import { ForbiddenError, ValidationError, NotFoundError } from "@/infra/errors";

describe("recordOperatorOverride (governed) [db]", () => {
  let workspaceId: string;
  let actorId: string;
  let itemId: string;

  async function makeItem(guardrailResult?: unknown): Promise<string> {
    const item = await db.operatorItem.create({
      data: {
        id: randomUUID(),
        workspaceId,
        problem: "Test problem",
        action: "Original action",
        impactExpected: 50000,
        impactLow: 25000,
        impactHigh: 75000,
        confidence: 0.8,
        priorityScore: 5,
        status: "pending",
        updatedAt: new Date(),
        ...(guardrailResult !== undefined ? { guardrailResult: guardrailResult as object } : {}),
      },
    });
    return item.id;
  }

  beforeEach(async () => {
    workspaceId = randomUUID();
    actorId = randomUUID();
    // SCHEMA-01: override_records.workspace_id now carries a real FK to workspaces(id) (unlike
    // operator_items.workspace_id, which is a bare unscoped column) -- a real Workspace row is
    // required for overrideRecord.create() to succeed.
    await db.workspace.create({
      data: { id: workspaceId, name: "Override Test WS", slug: `override-test-${workspaceId}` },
    });
    await db.user.create({
      data: { id: actorId, email: `${actorId}@test.local`, isActive: true, updatedAt: new Date() },
    });
    itemId = await makeItem();
  });

  afterEach(async () => {
    await db.overrideRecord.deleteMany({ where: { operatorItem: { workspaceId } } }).catch(() => {});
    await db.auditEvent.deleteMany({ where: { workspaceId } }).catch(() => {});
    await db.operatorItem.deleteMany({ where: { workspaceId } }).catch(() => {});
    await db.user.delete({ where: { id: actorId } }).catch(() => {});
    await db.workspace.delete({ where: { id: workspaceId } }).catch(() => {});
  });

  it("applies a valid override: durable record + action change + audit", async () => {
    const res = await recordOperatorOverride({
      operatorItemId: itemId,
      overriddenAction: "Overridden action",
      reason: "Owner judgment: local context differs",
      riskAcknowledged: true,
      workspaceId,
      actorId,
      role: "admin",
    });
    expect(res.success).toBe(true);

    const item = await db.operatorItem.findUnique({ where: { id: itemId } });
    expect(item?.action).toBe("Overridden action");

    const record = await db.overrideRecord.findFirst({ where: { operatorItemId: itemId } });
    expect(record).toBeTruthy();
    expect(record?.reason).toContain("Owner judgment");
    expect(record?.overriddenBy).toBe(actorId);
    // SCHEMA-01: the direct workspace anchor is set from the already-verified parent item's
    // workspace, not merely present via the indirect operatorItemId -> operatorItem.workspaceId chain.
    expect(record?.workspaceId).toBe(workspaceId);

    const audit = await db.auditEvent.findFirst({
      where: { workspaceId, entityId: itemId, eventName: "override.approved" },
    });
    expect(audit).toBeTruthy();
  });

  it("rejects an override with no reason", async () => {
    await expect(
      recordOperatorOverride({
        operatorItemId: itemId,
        overriddenAction: "x",
        reason: "",
        riskAcknowledged: true,
        workspaceId,
        actorId,
        role: "admin",
      }),
    ).rejects.toBeInstanceOf(ValidationError);
  });

  it("rejects an override without an explicit risk acknowledgement", async () => {
    await expect(
      recordOperatorOverride({
        operatorItemId: itemId,
        overriddenAction: "x",
        reason: "some reason",
        riskAcknowledged: false,
        workspaceId,
        actorId,
        role: "admin",
      }),
    ).rejects.toBeInstanceOf(ValidationError);
    // Action must be unchanged.
    const item = await db.operatorItem.findUnique({ where: { id: itemId } });
    expect(item?.action).toBe("Original action");
  });

  it("refuses to override a NON-overridable guardrail block (server-side gate)", async () => {
    const blockedId = await makeItem({
      violations: [
        { ruleId: "NEGATIVE_IMPACT_BLOCK", severity: "block", overrideAllowed: false, message: "no" },
      ],
      warnings: [],
    });
    await expect(
      recordOperatorOverride({
        operatorItemId: blockedId,
        overriddenAction: "sneaky",
        reason: "I really want this",
        riskAcknowledged: true,
        workspaceId,
        actorId,
        role: "admin",
      }),
    ).rejects.toBeInstanceOf(ForbiddenError);

    const item = await db.operatorItem.findUnique({ where: { id: blockedId } });
    expect(item?.action).toBe("Original action"); // unchanged
    const record = await db.overrideRecord.findFirst({ where: { operatorItemId: blockedId } });
    expect(record).toBeNull(); // no durable override created
  });

  it("allows overriding an OVERRIDABLE guardrail block", async () => {
    const overridableId = await makeItem({
      violations: [
        { ruleId: "HIGH_IMPACT_APPROVAL", severity: "block", overrideAllowed: true, message: "approve" },
      ],
      warnings: [],
    });
    const res = await recordOperatorOverride({
      operatorItemId: overridableId,
      overriddenAction: "approved override",
      reason: "owner approved high-impact",
      riskAcknowledged: true,
      workspaceId,
      actorId,
      role: "admin",
    });
    expect(res.success).toBe(true);
  });

  it("enforces workspace isolation (cannot override an item in another workspace)", async () => {
    const otherWorkspace = randomUUID();
    await expect(
      recordOperatorOverride({
        operatorItemId: itemId, // belongs to `workspaceId`
        overriddenAction: "x",
        reason: "cross-tenant",
        riskAcknowledged: true,
        workspaceId: otherWorkspace,
        actorId,
        role: "admin",
      }),
    ).rejects.toBeInstanceOf(NotFoundError);
  });

  it("SCHEMA-01: DB backstop rejects a bare overrideRecord.create with no workspaceId, bypassing the service layer entirely", async () => {
    // Proves the DB-level invariant (src/lib/prisma-workspace-enforcement.ts), not just the
    // service-layer check recordOperatorOverride() already performs -- a caller that skips the
    // service entirely (a future migration script, an ad-hoc admin tool) is still blocked.
    await expect(
      db.overrideRecord.create({
        data: {
          id: randomUUID(),
          operatorItemId: itemId,
          originalAction: "Original action",
          overriddenAction: "unscoped write",
          reason: "hostile: no workspaceId in data",
          overriddenBy: actorId,
        } as never,
      }),
    ).rejects.toThrow(/WORKSPACE ISOLATION VIOLATION/);

    const record = await db.overrideRecord.findFirst({
      where: { operatorItemId: itemId, overriddenAction: "unscoped write" },
    });
    expect(record).toBeNull(); // nothing was persisted
  });
});

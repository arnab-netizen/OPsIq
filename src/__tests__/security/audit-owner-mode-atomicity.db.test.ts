/**
 * AUDIT-CAT2 prevention: owner-mode mutations must commit record + audit atomically.
 *
 * Before the fix, owner-action-outcome.service and owner-approval-resolution.service
 * called emitAuditEvent OUTSIDE a $transaction. If the audit write failed, the primary
 * record was already committed — violating the audit-atomicity invariant.
 *
 * Each test forces emitAuditEvent to reject and asserts the primary record was rolled
 * back (does not exist). Requires TEST_WITH_DB=true.
 */
import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import { randomUUID } from "crypto";
import { db } from "@/lib/db";
import { SHOULD_RUN_DB_TESTS } from "@/__tests__/test-helpers/db-test-gate";

vi.mock("@/infra/audit", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/infra/audit")>();
  return { ...actual, emitAuditEvent: vi.fn().mockRejectedValue(new Error("audit sink down")) };
});

import { recordOwnerActionOutcome } from "@/services/owner-mode/owner-action-outcome.service";
import { resolveOwnerApproval } from "@/services/owner-mode/owner-approval-resolution.service";

const userId = randomUUID();
const ws = randomUUID();
const bizId = randomUUID();
const NOW = new Date("2026-08-01T00:00:00Z");

describe.skipIf(!SHOULD_RUN_DB_TESTS)("[db] AUDIT-CAT2: owner-mode mutation + audit atomicity", () => {
  beforeAll(async () => {
    await db.user.create({
      data: { id: userId, email: `audit-cat2-${userId}@test.local`, name: "AuditCat2User", isActive: true, updatedAt: NOW },
    });
    await db.workspace.create({
      data: { id: ws, name: `Audit CAT2 WS`, slug: `audit-cat2-${ws.slice(0, 8)}`, createdBy: userId },
    });
    await db.clientAccount.create({
      data: { id: ws, workspaceId: ws, name: "Audit CAT2 Client", updatedAt: NOW },
    });
    await db.ownerBusiness.create({
      data: { id: bizId, workspaceId: ws, name: "Audit CAT2 Business", businessType: "retail", updatedAt: NOW },
    });
  });

  afterAll(async () => {
    await db.ownerActionOutcome.deleteMany({ where: { workspaceId: ws } });
    await db.ownerAttentionEvent.deleteMany({ where: { workspaceId: ws } });
    await db.auditEvent.deleteMany({ where: { workspaceId: ws } });
    await db.ownerBusiness.deleteMany({ where: { id: bizId } });
    await db.clientAccount.deleteMany({ where: { id: ws } });
    await db.workspace.deleteMany({ where: { id: ws } });
    await db.user.deleteMany({ where: { id: userId } });
  });

  it("recordOwnerActionOutcome: rolls back outcome record when audit rejects", async () => {
    await expect(
      recordOwnerActionOutcome(ws, userId, {
        businessId: bizId,
        outcomeStatus: "worked",
        evidenceQuality: "strong",
      }),
    ).rejects.toThrow("audit sink down");

    // Primary record must NOT exist — mutation rolled back with the audit.
    const count = await db.ownerActionOutcome.count({ where: { workspaceId: ws } });
    expect(count).toBe(0);
  });

  it("recordOwnerActionOutcome: no orphaned audit event when audit rejects", async () => {
    // Even a partial audit event write would violate atomicity.
    const count = await db.auditEvent.count({ where: { workspaceId: ws } });
    expect(count).toBe(0);
  });

  it("resolveOwnerApproval (auto_handled path): rolls back attention event when audit rejects", async () => {
    // Seed a standing instruction so the auto_allow path is reached.
    await db.ownerStandingInstruction.create({
      data: {
        workspaceId: ws,
        businessId: bizId,
        scope: "pricing.discount",
        allowedActionTypes: ["approve"],
        forbiddenActionTypes: [],
        riskClass: "low",
        status: "active",
        createdByUserId: userId,
      },
    });

    await expect(
      resolveOwnerApproval({
        workspaceId: ws,
        scope: "pricing.discount",
        contentHash: "abc123def456",
        riskClass: "low",
        actionType: "approve",
        amount: null,
      }),
    ).rejects.toThrow("audit sink down");

    // Attention event must NOT exist — rolled back with audit.
    const count = await db.ownerAttentionEvent.count({ where: { workspaceId: ws } });
    expect(count).toBe(0);

    await db.ownerStandingInstruction.deleteMany({ where: { workspaceId: ws } });
  });

  it("resolveOwnerApproval: no audit events created when transaction rolls back", async () => {
    const count = await db.auditEvent.count({ where: { workspaceId: ws } });
    expect(count).toBe(0);
  });

  it("resolveOwnerApproval (needs_owner_approval path): rolls back attention event when audit rejects", async () => {
    // No standing instruction and no approval memory → owner decision required path.
    // recordAttentionEvent is now inside $transaction, so audit failure rolls back the
    // attention event write too.
    await expect(
      resolveOwnerApproval({
        workspaceId: ws,
        scope: "unknown.scope.not.seeded",
        contentHash: "deadbeef1234",
        riskClass: "high",
        actionType: "approve",
        amount: null,
      }),
    ).rejects.toThrow("audit sink down");

    const count = await db.ownerAttentionEvent.count({ where: { workspaceId: ws } });
    expect(count).toBe(0);
  });
});

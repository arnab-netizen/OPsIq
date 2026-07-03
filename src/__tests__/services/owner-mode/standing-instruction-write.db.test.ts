/**
 * Wave 2 (REAL_OWNER_RUNTIME_LOOP) — S1 DB proof: owner standing-instructions write loop.
 *
 * The eval/read side (evaluateRequestAgainstStandingInstructions → resolveOwnerApproval) already
 * existed, but there was no write path reachable in-product, so the resolver always saw zero
 * instructions. These tests drive `recordStandingInstruction` (the service the new
 * POST /api/owner/standing-instructions route calls) against a real DB and prove: the instruction
 * persists active + workspace-scoped; the eval side reads it back (the loop closes → auto_allow);
 * a cross-workspace businessId is rejected; and a non-owner is denied.
 *
 * Run: TEST_WITH_DB=true npx vitest run src/__tests__/services/owner-mode/standing-instruction-write.db.test.ts
 */
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { randomUUID } from "crypto";
import { db } from "@/lib/db";
import {
  recordStandingInstruction,
  evaluateRequestAgainstStandingInstructions,
  StandingInstructionUnauthorizedError,
} from "@/services/owner-mode/owner-load.service";
import { BusinessScopeError } from "@/services/owner-mode/business-scope";
import { SHOULD_RUN_DB_TESTS } from "@/__tests__/test-helpers/db-test-gate";

interface WS { actorId: string; workspaceId: string; businessId: string; }

async function seedWorkspace(tag: string): Promise<WS> {
  const actorId = randomUUID(), workspaceId = randomUUID(), businessId = randomUUID();
  await db.user.create({ data: { id: actorId, email: `si-${tag}-${actorId}@example.com`, isActive: true, updatedAt: new Date() } });
  await db.workspace.create({ data: { id: workspaceId, name: `WS ${tag}`, slug: `si-${workspaceId.substring(0, 8)}` } });
  await db.workspaceMembership.create({ data: { userId: actorId, workspaceId, role: "admin", isActive: true } });
  await db.ownerBusiness.create({ data: { id: businessId, workspaceId, name: `Biz ${tag}`, businessType: "services", updatedAt: new Date() } });
  return { actorId, workspaceId, businessId };
}

async function cleanup(ws: WS) {
  await db.ownerStandingInstruction.deleteMany({ where: { workspaceId: ws.workspaceId } }).catch(() => undefined);
  await db.auditEvent.deleteMany({ where: { workspaceId: ws.workspaceId } }).catch(() => undefined);
  await db.ownerBusiness.deleteMany({ where: { workspaceId: ws.workspaceId } }).catch(() => undefined);
  await db.workspaceMembership.deleteMany({ where: { userId: ws.actorId } }).catch(() => undefined);
  await db.workspace.delete({ where: { id: ws.workspaceId } }).catch(() => undefined);
  await db.user.delete({ where: { id: ws.actorId } }).catch(() => undefined);
}

describe.skipIf(!SHOULD_RUN_DB_TESTS)("[db] Wave 2 S1 — owner standing-instruction write loop", () => {
  let A: WS, B: WS;
  beforeEach(async () => { A = await seedWorkspace("A"); B = await seedWorkspace("B"); });
  afterEach(async () => { await cleanup(A); await cleanup(B); });

  it("[db] records an active, workspace-scoped standing instruction", async () => {
    await recordStandingInstruction({
      workspaceId: A.workspaceId, actorId: A.actorId, actorIsOwner: true, businessId: null,
      scope: "purchase", allowedActionTypes: ["order_supplies"], forbiddenActionTypes: ["refund"],
      maxAmount: 1000, riskClass: "low",
    });
    const rows = await db.ownerStandingInstruction.findMany({ where: { workspaceId: A.workspaceId } });
    expect(rows).toHaveLength(1);
    expect(rows[0].scope).toBe("purchase");
    expect(rows[0].status).toBe("active");
  });

  it("[db] the eval side reads the written instruction back — loop closes (auto_allow / forbidden)", async () => {
    await recordStandingInstruction({
      workspaceId: A.workspaceId, actorId: A.actorId, actorIsOwner: true, businessId: null,
      scope: "purchase", allowedActionTypes: ["order_supplies"], forbiddenActionTypes: ["refund"],
      maxAmount: 1000, riskClass: "low",
    });
    const allow = await evaluateRequestAgainstStandingInstructions({
      workspaceId: A.workspaceId, scope: "purchase", actionType: "order_supplies", amount: 500,
    });
    expect(allow).toBe("auto_allow");
    const forbidden = await evaluateRequestAgainstStandingInstructions({
      workspaceId: A.workspaceId, scope: "purchase", actionType: "refund", amount: 10,
    });
    expect(forbidden).toBe("forbidden");
    // A workspace with no instruction still needs approval (no cross-workspace bleed).
    const other = await evaluateRequestAgainstStandingInstructions({
      workspaceId: B.workspaceId, scope: "purchase", actionType: "order_supplies", amount: 500,
    });
    expect(other).toBe("needs_approval");
  });

  it("[db] rejects a cross-workspace businessId (server-side scope authority)", async () => {
    await expect(
      recordStandingInstruction({
        workspaceId: A.workspaceId, actorId: A.actorId, actorIsOwner: true, businessId: B.businessId,
        scope: "purchase", allowedActionTypes: [], forbiddenActionTypes: [], riskClass: "low",
      })
    ).rejects.toBeInstanceOf(BusinessScopeError);
    const rows = await db.ownerStandingInstruction.findMany({ where: { workspaceId: A.workspaceId } });
    expect(rows).toHaveLength(0); // nothing persisted on rejection
  });

  it("[db] denies a non-owner (owner-only write authority)", async () => {
    await expect(
      recordStandingInstruction({
        workspaceId: A.workspaceId, actorId: A.actorId, actorIsOwner: false, businessId: null,
        scope: "purchase", allowedActionTypes: [], forbiddenActionTypes: [], riskClass: "low",
      })
    ).rejects.toBeInstanceOf(StandingInstructionUnauthorizedError);
  });
});

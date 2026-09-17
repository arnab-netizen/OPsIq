/**
 * POST /api/owner/process-execution — RECORD_OUTCOME businessId, REAL route + REAL
 * canonical-route-enforcement, real Postgres. `[db]`-gated (TEST_WITH_DB=true).
 *
 * ROOT_CAUSE (fix/cockpit-record-outcome-businessid): the Owner Cockpit's client-side POST body
 * for RECORD_OUTCOME never included `businessId`, which `applyProcessExecutionAction`'s
 * RECORD_OUTCOME branch requires (process-execution-bridge.service.ts) -- so every real click on
 * "Record outcome" hit a 400 and the Phase 3 lifecycle could never close. The existing service-level
 * DB test (phase3-execution-lifecycle.db.test.ts, case 22) already proves the service itself
 * correctly rejects a missing businessId by calling `applyProcessExecutionAction` directly; this
 * file instead drives the REAL HTTP route handler end to end (same auth-bypass pattern as
 * pricing-tiers-real-route.db.test.ts), which is the actual code path a browser request goes
 * through and is what the client bug affected.
 *
 * Proves:
 *  1. RECORD_OUTCOME through the real route WITHOUT businessId -> 400 / MISSING_INPUT (reproduces
 *     the original bug at the route level, not just the service level).
 *  2. RECORD_OUTCOME through the real route WITH businessId -> 200, task reaches OUTCOME_RECORDED
 *     in the database (the fix, end to end -- this is also the "solo owner: RECORD_OUTCOME
 *     succeeds" proof; a single actor with OWNER_MANAGE capability plays both "owner" and the only
 *     workspace member here).
 *  3. RECORD_OUTCOME through the real route with a businessId belonging to a DIFFERENT workspace
 *     -> 403 / WRONG_WORKSPACE (a spoofed/foreign businessId is still rejected server-side; proves
 *     the client fix did not open a cross-workspace hole -- businessInWorkspace() in
 *     process-execution-bridge.service.ts is the guard, unchanged by this fix).
 *
 * Run: TEST_WITH_DB=true npx vitest run src/__tests__/execution/process-execution-record-outcome-route.db.test.ts
 */
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { randomUUID } from "crypto";
import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { SHOULD_RUN_DB_TESTS } from "@/__tests__/test-helpers/db-test-gate";

let testActorIdForMock = randomUUID();
let testWorkspaceIdForMock = randomUUID();

// Auth is bypassed the same way pricing-tiers-real-route.db.test.ts / p2b/real-route-tests.test.ts
// do it: @/services/auth is mocked to supply a valid session/policy so the REAL
// canonical-route-enforcement.ts auth-state-build + evaluate + handler + error-classification
// logic all run for real against a real workspace membership row. admin_or_portfolio_manager
// carries OWNER_MANAGE (see src/policies/capability-check.ts), which this route requires.
vi.mock("@/services/auth", () => ({
  getSessionFact: vi.fn(async () => ({
    valid: true,
    session: {
      user: { id: testActorIdForMock, email: "test@example.com", name: "Test User", isActive: true },
      sessionId: "test-session",
      expiresAt: new Date(Date.now() + 86400000),
    },
    invalidReason: undefined,
  })),
  getSession: vi.fn(async () => ({
    user: { id: testActorIdForMock, email: "test@example.com", name: "Test User", isActive: true },
    sessionId: "test-session",
    expiresAt: new Date(Date.now() + 86400000),
  })),
  getPolicyContextFact: vi.fn(async () => ({
    valid: true,
    policy: {
      userId: testActorIdForMock,
      roles: [{ role: "admin_or_portfolio_manager", scope: "workspace", scopeId: testWorkspaceIdForMock }],
      engagementMemberships: [],
    },
    invalidReason: undefined,
  })),
  getPolicyContext: vi.fn(async () => ({
    userId: testActorIdForMock,
    roles: [{ role: "admin_or_portfolio_manager", scope: "workspace", scopeId: testWorkspaceIdForMock }],
    engagementMemberships: [],
  })),
}));

function makePostRequest(body: unknown): NextRequest {
  return new NextRequest("https://example.com/api/owner/process-execution", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

async function seedCompletedTask(workspaceId: string, taskKey: string, businessId: string | null): Promise<string> {
  const id = randomUUID();
  await db.processExecutionTask.create({
    data: {
      id,
      workspaceId,
      businessId,
      taskKey,
      sourceFamily: "PROCESS_CORRECTION",
      sourceFindingKey: "route-test",
      executionRoute: "CREATE_OWNER_APPROVAL_TASK",
      actionOwner: "OWNER",
      approvalLevel: "OWNER_APPROVAL_REQUIRED",
      status: "COMPLETED",
      requiredEvidence: [],
      evidenceRefs: [],
      completionCriteria: "Owner records a decision.",
      reassessmentTrigger: "Re-evaluate at next review.",
      riskIfIgnored: "Risk compounds.",
      ownerVisibleSummary: "Route-level RECORD_OUTCOME test task",
      severity: "HIGH",
      priorityRank: 1,
      updatedAt: new Date(),
    },
  });
  return id;
}

describe.skipIf(!SHOULD_RUN_DB_TESTS)(
  "POST /api/owner/process-execution RECORD_OUTCOME — REAL route + REAL canonical-route-enforcement",
  () => {
    let workspaceId: string;
    let foreignWorkspaceId: string;
    let actorId: string;
    let businessId: string;
    let foreignBusinessId: string;

    beforeEach(async () => {
      actorId = randomUUID();
      workspaceId = randomUUID();
      foreignWorkspaceId = randomUUID();
      testActorIdForMock = actorId;
      testWorkspaceIdForMock = workspaceId;

      await db.user.create({ data: { id: actorId, email: `${actorId}@example.com`, updatedAt: new Date() } });
      await db.workspace.create({ data: { id: workspaceId, name: "WS Record Outcome", slug: `ws-ro-${workspaceId.substring(0, 8)}` } });
      await db.workspaceMembership.create({ data: { userId: actorId, workspaceId, role: "admin", isActive: true } });
      // FK anchor for OwnerActionOutcome.workspaceId (see process-execution-bridge.service.ts /
      // owner-action-outcome.service.ts -- OwnerActionOutcome.workspace references ClientAccount, not Workspace).
      await db.clientAccount.create({ data: { id: workspaceId, name: "WS Record Outcome (client anchor)", status: "active", visibility: "internal", updatedAt: new Date() } });
      const biz = await db.ownerBusiness.create({
        data: { id: randomUUID(), workspaceId, name: "Route Test Business", businessType: "generic_local_service", createdBy: actorId },
      });
      businessId = biz.id;
      // A business that belongs to a DIFFERENT workspace the actor is not a member of -- the
      // spoofed/foreign businessId used in the WRONG_WORKSPACE case below.
      const foreignBiz = await db.ownerBusiness.create({
        data: { id: randomUUID(), workspaceId: foreignWorkspaceId, name: "Foreign Workspace Business", businessType: "generic_local_service" },
      });
      foreignBusinessId = foreignBiz.id;
    });

    afterEach(async () => {
      await db.processExecutionTask.deleteMany({ where: { workspaceId } });
      await db.ownerActionOutcome.deleteMany({ where: { workspaceId } });
      await db.auditEvent.deleteMany({ where: { workspaceId } });
      await db.ownerBusiness.deleteMany({ where: { id: { in: [businessId, foreignBusinessId] } } });
      await db.workspaceMembership.deleteMany({ where: { userId: actorId } });
      await db.clientAccount.deleteMany({ where: { id: workspaceId } });
      await db.workspace.deleteMany({ where: { id: workspaceId } });
      await db.user.deleteMany({ where: { id: actorId } });
    });

    it("1. RECORD_OUTCOME without businessId -> 400 MISSING_INPUT (reproduces the original client bug through the real route)", async () => {
      const { POST } = await import("@/app/api/owner/process-execution/route");
      const key = `ro_missing_${randomUUID().slice(0, 8)}`;
      await seedCompletedTask(workspaceId, key, null);

      const response = await POST(makePostRequest({ taskKey: key, action: "RECORD_OUTCOME", outcomeStatus: "worked" }), {
        params: Promise.resolve({}),
      });
      expect(response.status).toBe(400);
      const body = await response.json();
      expect(body.code).toBe("MISSING_INPUT");
      expect(String(body.error)).toContain("businessId is required to record an outcome");

      const row = await db.processExecutionTask.findFirst({ where: { workspaceId, taskKey: key } });
      expect(row?.status).toBe("COMPLETED"); // unchanged -- nothing was mutated by the rejected call
    });

    it("2. RECORD_OUTCOME WITH businessId -> 200, task reaches OUTCOME_RECORDED (the fix, end to end / solo-owner path)", async () => {
      const { POST } = await import("@/app/api/owner/process-execution/route");
      const key = `ro_fixed_${randomUUID().slice(0, 8)}`;
      await seedCompletedTask(workspaceId, key, businessId);

      const response = await POST(
        makePostRequest({ taskKey: key, action: "RECORD_OUTCOME", outcomeStatus: "worked", businessId }),
        { params: Promise.resolve({}) }
      );
      expect(response.status).toBe(200);
      const body = await response.json();
      expect(body.status).toBe("OUTCOME_RECORDED");
      expect(body.outcomeId).toEqual(expect.any(String));

      const row = await db.processExecutionTask.findFirst({ where: { workspaceId, taskKey: key } });
      expect(row?.status).toBe("OUTCOME_RECORDED");
      expect(row?.outcomeId).toBe(body.outcomeId);

      const outcome = await db.ownerActionOutcome.findUnique({ where: { id: body.outcomeId } });
      expect(outcome?.businessId).toBe(businessId);
      expect(outcome?.workspaceId).toBe(workspaceId);
    });

    it("3. RECORD_OUTCOME with a businessId from a DIFFERENT workspace -> 403 WRONG_WORKSPACE (spoofed businessId still rejected)", async () => {
      const { POST } = await import("@/app/api/owner/process-execution/route");
      const key = `ro_spoofed_${randomUUID().slice(0, 8)}`;
      await seedCompletedTask(workspaceId, key, businessId);

      const response = await POST(
        makePostRequest({ taskKey: key, action: "RECORD_OUTCOME", outcomeStatus: "worked", businessId: foreignBusinessId }),
        { params: Promise.resolve({}) }
      );
      expect(response.status).toBe(403);
      const body = await response.json();
      expect(body.code).toBe("WRONG_WORKSPACE");

      const row = await db.processExecutionTask.findFirst({ where: { workspaceId, taskKey: key } });
      expect(row?.status).toBe("COMPLETED"); // unchanged -- the spoofed call never mutated the task
      expect(row?.outcomeId).toBeNull();
    });
  }
);

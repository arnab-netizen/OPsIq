/**
 * STAGE 12 — integrated core-loop acceptance, REAL route + REAL Postgres, run against the
 * `audit/controlled-beta-remediation-integration-v2` branch (PRs #495/#494/#497/#499[latest fixed
 * head] + #501[corrected green head, subsumes #498] + #500 combined). Uses the same
 * real-route/auth-bypass harness as solo-owner-verify-outcome.db.test.ts (PR #501) and
 * process-execution-record-outcome-route.db.test.ts (PR #498) — @/services/auth is mocked to
 * supply a verified session for a chosen actor; every other layer
 * (canonical-route-enforcement, applyProcessExecutionAction, verifyOwnerActionOutcome,
 * hasEligibleIndependentVerifier, createReassessmentEvent, the DB itself) runs for real.
 *
 * This file proves properties that are only meaningful with #501 AND #500 combined, and that no
 * individual PR's own test suite exercises:
 *
 *  1. Full solo-owner core loop through REQUEST_REASSESSMENT (PR #500) *after* VERIFY_OUTCOME
 *     (PR #501) on the same task — PR #501's own test stops at VERIFY_OUTCOME (PR #500 did not
 *     exist on its branch); PR #500's own test proves REQUEST_REASSESSMENT businessId wiring in
 *     isolation but never chains it after a PR-#501-verified outcome. This proves the two do not
 *     conflict when composed on the same task/business.
 *
 *  2. Two-business scoping: one workspace with TWO OwnerBusiness rows, a task that belongs to
 *     Business A. RECORD_OUTCOME (PR #498 prerequisite, subsumed into #501), VERIFY_OUTCOME
 *     (PR #501), and REQUEST_REASSESSMENT (PR #500) must all reject a businessId belonging to
 *     Business B (a same-workspace, wrong-business id) via the pre-existing task/business
 *     mismatch guard in process-execution-bridge.service.ts (line ~447, predates this program),
 *     and all three must succeed and persist the correct businessId when given Business A's id.
 *     This is the DB-level analogue of what the cockpit's `activeBusinessId`-only wiring
 *     (PR #501/#500, scoped by PR #499's now-view business restriction) relies on client-side
 *     never being able to violate.
 *
 * The solo-owner full loop (PROPOSED..VERIFY_OUTCOME) and the multi-user
 * blocked/independent-verifier scenarios are already proven by
 * solo-owner-verify-outcome.db.test.ts (scenarios A/B/C, CI-proven green on PR #501's corrected
 * head 84950bf74053f6e5cdfb5645c187203db77d22ac — see run 35276106439) and are NOT duplicated
 * here — this file only adds the combined-behavior properties listed above.
 *
 * Run: TEST_WITH_DB=true npx vitest run src/__tests__/owner-mode/integrated-core-loop.db.test.ts
 *
 * NOTE: this sandbox has no TCP:5432 egress to the configured Neon host, so this file could not
 * be executed in this session. It is written strictly per this repo's `.db.test.ts` convention
 * (see the sibling files cited above) and reasoned through by hand against the exact current code
 * on the integration branch. It requires a live CI (LANE_B) retest before the properties above
 * can be considered proven end-to-end — this is called out explicitly in the final report rather
 * than claimed as executed proof.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { randomUUID } from "crypto";
import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { SHOULD_RUN_DB_TESTS } from "@/__tests__/test-helpers/db-test-gate";
import { ROLES } from "@/domain/constants/roles";

let currentActorId = randomUUID();
let currentWorkspaceId = randomUUID();
let currentRole: string = ROLES.ADMIN_OR_PORTFOLIO_MANAGER;
let currentWorkspaceRole: string = "owner";

vi.mock("@/services/auth", () => ({
  getSessionFact: vi.fn(async () => ({
    valid: true,
    session: {
      user: { id: currentActorId, email: "test@example.com", name: "Test User", isActive: true },
      sessionId: "test-session",
      expiresAt: new Date(Date.now() + 86400000),
    },
    invalidReason: undefined,
  })),
  getSession: vi.fn(async () => ({
    user: { id: currentActorId, email: "test@example.com", name: "Test User", isActive: true },
    sessionId: "test-session",
    expiresAt: new Date(Date.now() + 86400000),
  })),
  getPolicyContextFact: vi.fn(async () => ({
    valid: true,
    policy: {
      userId: currentActorId,
      roles: [{ role: currentRole, scope: "workspace", scopeId: currentWorkspaceId }],
      engagementMemberships: [],
      workspaceRole: currentWorkspaceRole,
    },
    invalidReason: undefined,
  })),
  getPolicyContext: vi.fn(async () => ({
    userId: currentActorId,
    roles: [{ role: currentRole, scope: "workspace", scopeId: currentWorkspaceId }],
    engagementMemberships: [],
    workspaceRole: currentWorkspaceRole,
  })),
}));

function actAs(actorId: string, workspaceId: string, workspaceRole: "owner" | "admin") {
  currentActorId = actorId;
  currentWorkspaceId = workspaceId;
  currentRole = ROLES.ADMIN_OR_PORTFOLIO_MANAGER;
  currentWorkspaceRole = workspaceRole;
}

function makePostRequest(body: unknown): NextRequest {
  return new NextRequest("https://example.com/api/owner/process-execution", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

async function post(body: unknown) {
  const { POST } = await import("@/app/api/owner/process-execution/route");
  const response = await POST(makePostRequest(body), { params: Promise.resolve({}) });
  const json = await response.json();
  return { status: response.status, body: json };
}

async function seedProposedTask(workspaceId: string, taskKey: string, businessId: string): Promise<void> {
  await db.processExecutionTask.create({
    data: {
      id: randomUUID(),
      workspaceId,
      businessId,
      taskKey,
      sourceFamily: "PROCESS_CORRECTION",
      sourceFindingKey: "integrated-core-loop-test",
      executionRoute: "CREATE_OWNER_APPROVAL_TASK",
      actionOwner: "OWNER",
      approvalLevel: "OWNER_APPROVAL_REQUIRED",
      status: "PROPOSED",
      requiredEvidence: [],
      evidenceRefs: [],
      completionCriteria: "Owner records a decision.",
      reassessmentTrigger: "Re-evaluate at next review.",
      riskIfIgnored: "Risk compounds.",
      ownerVisibleSummary: "Integrated core-loop test task",
      severity: "HIGH",
      priorityRank: 1,
      updatedAt: new Date(),
    },
  });
}

async function completeTask(workspaceId: string, taskKey: string, actorId: string, workspaceRole: "owner" | "admin") {
  actAs(actorId, workspaceId, workspaceRole);
  const ack = await post({ taskKey, action: "ACKNOWLEDGE" });
  expect(ack.status).toBe(200);
  const start = await post({ taskKey, action: "START" });
  expect(start.status).toBe(200);
  const complete = await post({
    taskKey, action: "COMPLETE",
    evidenceRefs: ["evidence://integrated-core-loop-1"], outcomeNotes: "Completed for integration test",
  });
  expect(complete.status).toBe(200);
}

async function recordOutcome(taskKey: string, businessId: string, actorId: string, workspaceId: string, workspaceRole: "owner" | "admin") {
  actAs(actorId, workspaceId, workspaceRole);
  const r = await post({ taskKey, action: "RECORD_OUTCOME", businessId, outcomeStatus: "worked", outcomeNotes: "Worked well" });
  return r;
}

async function waitForCondition<T>(fn: () => Promise<T | null | undefined>, timeoutMs = 5000, intervalMs = 100): Promise<T> {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    const result = await fn();
    if (result) return result;
    if (Date.now() >= deadline) throw new Error("waitForCondition: timed out waiting for a truthy result");
    await new Promise((r) => setTimeout(r, intervalMs));
  }
}

describe.skipIf(!SHOULD_RUN_DB_TESTS)(
  "[db] STAGE 12 — integrated core loop (PRs #495/#494/#497/#499 + #501 + #500 combined)",
  () => {
    let workspaceId: string;
    let ownerId: string;
    let businessAId: string;
    let businessBId: string;

    async function seedWorkspaceOwnerAndBusinesses() {
      await db.user.create({ data: { id: ownerId, email: `${ownerId}@example.com`, updatedAt: new Date() } });
      await db.workspace.create({ data: { id: workspaceId, name: "Integrated Core Loop WS", slug: `icl-${workspaceId.substring(0, 8)}` } });
      await db.workspaceMembership.create({ data: { userId: ownerId, workspaceId, role: "owner", isActive: true } });
      await db.userRoleAssignment.create({
        data: { id: randomUUID(), userId: ownerId, role: ROLES.ADMIN_OR_PORTFOLIO_MANAGER, scope: "workspace", scopeId: workspaceId, isActive: true },
      });
      await db.clientAccount.create({ data: { id: workspaceId, name: "Integrated Core Loop WS (client anchor)", status: "active", visibility: "internal", updatedAt: new Date() } });
      const bizA = await db.ownerBusiness.create({
        data: { id: randomUUID(), workspaceId, name: "Business A", businessType: "generic_local_service", createdBy: ownerId },
      });
      const bizB = await db.ownerBusiness.create({
        data: { id: randomUUID(), workspaceId, name: "Business B", businessType: "generic_local_service", createdBy: ownerId },
      });
      businessAId = bizA.id as string;
      businessBId = bizB.id as string;
    }

    beforeEach(async () => {
      workspaceId = randomUUID();
      ownerId = randomUUID();
      await seedWorkspaceOwnerAndBusinesses();
    });

    afterEach(async () => {
      await db.processExecutionTask.deleteMany({ where: { workspaceId } });
      await db.ownerActionOutcome.deleteMany({ where: { workspaceId } });
      await db.ownerReassessmentEvent.deleteMany({ where: { workspaceId } }).catch(() => undefined);
      await db.auditEvent.deleteMany({ where: { workspaceId } });
      await db.ownerBusiness.deleteMany({ where: { workspaceId } });
      await db.userRoleAssignment.deleteMany({ where: { scopeId: workspaceId } });
      await db.workspaceMembership.deleteMany({ where: { workspaceId } });
      await db.clientAccount.deleteMany({ where: { id: workspaceId } });
      await db.workspace.deleteMany({ where: { id: workspaceId } });
      await db.user.deleteMany({ where: { id: ownerId } });
    });

    // ── 1. SOLO OWNER — full loop through REQUEST_REASSESSMENT after VERIFY_OUTCOME ──────────

    it("1. solo owner: PROPOSED -> ... -> VERIFY_OUTCOME (PR #501) -> REQUEST_REASSESSMENT (PR #500) composes cleanly on the same task", async () => {
      const key = `icl_solo_${randomUUID().slice(0, 8)}`;
      await seedProposedTask(workspaceId, key, businessAId);
      await completeTask(workspaceId, key, ownerId, "owner");

      const recorded = await recordOutcome(key, businessAId, ownerId, workspaceId, "owner");
      expect(recorded.status).toBe(200);
      const outcomeId = recorded.body.outcomeId as string;

      actAs(ownerId, workspaceId, "owner");
      const verify = await post({ taskKey: key, action: "VERIFY_OUTCOME", businessId: businessAId, reason: "Confirmed by owner" });
      expect(verify.status).toBe(200);
      expect(verify.body.selfVerified).toBe(true);

      let task = await db.processExecutionTask.findFirst({ where: { workspaceId, taskKey: key } });
      expect(task?.status).toBe("OUTCOME_VERIFIED");

      // The best-effort post-verification reassessment side effect (PR #501) fires first...
      const autoReassessment = await waitForCondition(() =>
        db.ownerReassessmentEvent.findFirst({ where: { workspaceId, outcomeId } })
      );
      expect(autoReassessment.businessId).toBe(businessAId);

      // ...and the owner can ALSO explicitly REQUEST_REASSESSMENT (PR #500) on the same
      // now-verified task without it being blocked as an invalid transition (REQUEST_REASSESSMENT
      // is allowed even on a completed/verified task by design — "re-open the question").
      const reassess = await post({ taskKey: key, action: "REQUEST_REASSESSMENT", businessId: businessAId, reason: "Owner wants a second look despite verification" });
      expect(reassess.status).toBe(200);
      expect(reassess.body.reassessmentId).toEqual(expect.any(String));

      task = await db.processExecutionTask.findFirst({ where: { workspaceId, taskKey: key } });
      expect(task?.reassessmentId).toBe(reassess.body.reassessmentId);
      // Task status itself is untouched by REQUEST_REASSESSMENT — it only links a reassessment event.
      expect(task?.status).toBe("OUTCOME_VERIFIED");

      const manualReassessment = await db.ownerReassessmentEvent.findFirst({ where: { id: reassess.body.reassessmentId } });
      expect(manualReassessment?.businessId).toBe(businessAId);
      expect(manualReassessment?.trigger).toBe("owner_dispute");
    });

    // ── 2. TWO-BUSINESS SCOPING ──────────────────────────────────────────────────────────────

    it("2. two-business scoping: RECORD_OUTCOME/VERIFY_OUTCOME/REQUEST_REASSESSMENT all reject Business B's id on a Business A task, and persist correctly with Business A's id", async () => {
      const key = `icl_scope_${randomUUID().slice(0, 8)}`;
      await seedProposedTask(workspaceId, key, businessAId);
      await completeTask(workspaceId, key, ownerId, "owner");

      // RECORD_OUTCOME with the WRONG (but same-workspace) business is rejected by the
      // pre-existing task/business mismatch guard, identically to "not found" (never reveals
      // that the task belongs to a different business).
      actAs(ownerId, workspaceId, "owner");
      const wrongRecord = await post({ taskKey: key, action: "RECORD_OUTCOME", businessId: businessBId, outcomeStatus: "worked" });
      expect(wrongRecord.status).toBe(400); // NOT_FOUND_OR_FORBIDDEN maps to 400, not 404 -- see route.ts's own comment ("WRONG_WORKSPACE and UNAUTHORIZED map to 403; all other failures are 400").
      expect(wrongRecord.body.code).toBe("NOT_FOUND_OR_FORBIDDEN");
      let task = await db.processExecutionTask.findFirst({ where: { workspaceId, taskKey: key } });
      expect(task?.status).toBe("COMPLETED");
      expect(task?.outcomeId).toBeNull();

      // Correct business succeeds.
      const rightRecord = await recordOutcome(key, businessAId, ownerId, workspaceId, "owner");
      expect(rightRecord.status).toBe(200);
      const outcomeId = rightRecord.body.outcomeId as string;

      // VERIFY_OUTCOME with the wrong business is likewise rejected before verification logic runs.
      actAs(ownerId, workspaceId, "owner");
      const wrongVerify = await post({ taskKey: key, action: "VERIFY_OUTCOME", businessId: businessBId, reason: "wrong business" });
      expect(wrongVerify.status).toBe(400); // see NOT_FOUND_OR_FORBIDDEN note above
      expect(wrongVerify.body.code).toBe("NOT_FOUND_OR_FORBIDDEN");
      const outcomeAfterWrongVerify = await db.ownerActionOutcome.findFirst({ where: { id: outcomeId } });
      expect(outcomeAfterWrongVerify?.verificationStatus).not.toBe("verified");

      // Correct business succeeds.
      const rightVerify = await post({ taskKey: key, action: "VERIFY_OUTCOME", businessId: businessAId, reason: "Confirmed by owner" });
      expect(rightVerify.status).toBe(200);
      task = await db.processExecutionTask.findFirst({ where: { workspaceId, taskKey: key } });
      expect(task?.status).toBe("OUTCOME_VERIFIED");

      // REQUEST_REASSESSMENT with the wrong business is rejected the same way.
      const wrongReassess = await post({ taskKey: key, action: "REQUEST_REASSESSMENT", businessId: businessBId, reason: "wrong business" });
      expect(wrongReassess.status).toBe(400); // see NOT_FOUND_OR_FORBIDDEN note above
      expect(wrongReassess.body.code).toBe("NOT_FOUND_OR_FORBIDDEN");

      // Correct business succeeds and the persisted event is attributed to Business A, never B.
      const rightReassess = await post({ taskKey: key, action: "REQUEST_REASSESSMENT", businessId: businessAId, reason: "correct business" });
      expect(rightReassess.status).toBe(200);
      const reassessment = await db.ownerReassessmentEvent.findFirst({ where: { id: rightReassess.body.reassessmentId } });
      expect(reassessment?.businessId).toBe(businessAId);
      expect(reassessment?.businessId).not.toBe(businessBId);
    });
  }
);

/**
 * PR G — solo-owner VERIFY_OUTCOME semantics, REAL route + REAL Postgres.
 * `[db]`-gated (TEST_WITH_DB=true). Drives the actual production HTTP handler
 * (POST /api/owner/process-execution) end to end, the same auth-bypass pattern as
 * process-execution-record-outcome-route.db.test.ts (PR #498) and
 * pricing-tiers-real-route.db.test.ts — @/services/auth is mocked to supply a
 * verified session/policy for a chosen actor before each call, but every other
 * layer (canonical-route-enforcement, applyProcessExecutionAction,
 * verifyOwnerActionOutcome, hasEligibleIndependentVerifier, the DB itself) runs for
 * real.
 *
 * ROOT_CAUSE under investigation (PR G): before this change,
 * assertVerificationSeparationOfDuty() unconditionally threw whenever the
 * verifying actor equalled task.completedByUserId, with no notion of whether any
 * OTHER eligible verifier existed in the workspace. A workspace with exactly one
 * real member (a genuine solo owner) could COMPLETE and RECORD_OUTCOME but could
 * never successfully VERIFY_OUTCOME — the loop could never close. The fix adds
 * hasEligibleIndependentVerifier() (src/services/workspace/verifier-eligibility.
 * service.ts): only when NO other active workspace member holds a capability that
 * would let them reach this same endpoint (CAPABILITIES.OWNER_MANAGE) may the
 * recorder verify their own outcome, and that verification is truthfully marked
 * `selfVerified: true` in both the response and the audit event payload — never
 * as an independently verified outcome.
 *
 * Proves (per the PR G test matrix):
 *  A. SOLO OWNER — one workspace, one member: COMPLETE -> RECORD_OUTCOME ->
 *     VERIFY_OUTCOME succeeds, selfVerified:true, verified state persists,
 *     truthful audit payload, reassessment side effect fires.
 *  B. MULTI-USER, BLOCKED — a second eligible (OWNER_MANAGE-capable) active
 *     member exists: the recorder's own VERIFY_OUTCOME attempt is still blocked
 *     (separation of duty preserved exactly as before this change).
 *  C. MULTI-USER, INDEPENDENT VERIFIER — the second eligible actor verifies the
 *     SAME outcome successfully; selfVerified is falsy; regression check.
 *  D. SAFETY REGRESSIONS — foreign workspace, wrong business, already-verified,
 *     insufficient evidence, observation window, no state mutation on any
 *     rejected attempt. All unchanged by this PR.
 *
 * Run: TEST_WITH_DB=true npx vitest run src/__tests__/owner-mode/solo-owner-verify-outcome.db.test.ts
 *
 * NOTE (per task instructions): this sandbox has no TCP:5432 egress to the
 * configured Neon host, so this file could not be executed in this session. It
 * is written strictly per this repo's `.db.test.ts` convention (see the sibling
 * files cited above) and reasoned through by hand against the exact current
 * code in owner-outcome-verification.service.ts / process-execution-bridge.
 * service.ts / verifier-eligibility.service.ts. It requires a live-retest before
 * this PR can be considered proven end-to-end.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { randomUUID } from "crypto";
import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { SHOULD_RUN_DB_TESTS } from "@/__tests__/test-helpers/db-test-gate";
import { ROLES } from "@/domain/constants/roles";

// ── Mutable "current caller" state consumed by the @/services/auth mock below ──

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

/** Point the auth mock at a given actor for the next real route call(s). */
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
      sourceFindingKey: "solo-owner-verify-test",
      executionRoute: "CREATE_OWNER_APPROVAL_TASK",
      actionOwner: "OWNER",
      approvalLevel: "OWNER_APPROVAL_REQUIRED",
      status: "PROPOSED",
      requiredEvidence: [],
      evidenceRefs: [],
      completionCriteria: "Owner records a decision.",
      reassessmentTrigger: "Re-evaluate at next review.",
      riskIfIgnored: "Risk compounds.",
      ownerVisibleSummary: "PR G solo-owner verify test task",
      severity: "HIGH",
      priorityRank: 1,
      updatedAt: new Date(),
    },
  });
}

/** Drive a task from PROPOSED to COMPLETED via the real route, as `actorId`. */
async function completeTask(workspaceId: string, taskKey: string, actorId: string, workspaceRole: "owner" | "admin") {
  actAs(actorId, workspaceId, workspaceRole);
  const ack = await post({ taskKey, action: "ACKNOWLEDGE" });
  expect(ack.status).toBe(200);
  const start = await post({ taskKey, action: "START" });
  expect(start.status).toBe(200);
  const complete = await post({
    taskKey, action: "COMPLETE",
    evidenceRefs: ["evidence://solo-owner-verify-test-1"], outcomeNotes: "Completed for PR G test",
  });
  expect(complete.status).toBe(200);
}

async function recordOutcome(workspaceId: string, taskKey: string, businessId: string, actorId: string, workspaceRole: "owner" | "admin") {
  actAs(actorId, workspaceId, workspaceRole);
  const r = await post({ taskKey, action: "RECORD_OUTCOME", businessId, outcomeStatus: "worked", outcomeNotes: "Worked well" });
  expect(r.status).toBe(200);
  expect(r.body.outcomeId).toEqual(expect.any(String));
  return r.body.outcomeId as string;
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
  "[db] PR G — solo-owner VERIFY_OUTCOME semantics (REAL route + REAL Postgres)",
  () => {
    // Two independent workspaces so scenario A (solo) and scenarios B/C (multi-user) never interact.
    let soloWorkspaceId: string;
    let soloOwnerId: string;
    let soloBusinessId: string;

    let multiWorkspaceId: string;
    let recorderId: string;
    let secondEligibleVerifierId: string;
    let multiBusinessId: string;

    let foreignWorkspaceId: string;

    async function seedWorkspaceAndOwner(workspaceId: string, ownerId: string, businessName: string) {
      await db.user.create({ data: { id: ownerId, email: `${ownerId}@example.com`, updatedAt: new Date() } });
      await db.workspace.create({ data: { id: workspaceId, name: `PR-G ${businessName}`, slug: `pr-g-${workspaceId.substring(0, 8)}` } });
      await db.workspaceMembership.create({ data: { userId: ownerId, workspaceId, role: "owner", isActive: true } });
      await db.userRoleAssignment.create({
        data: { id: randomUUID(), userId: ownerId, role: ROLES.ADMIN_OR_PORTFOLIO_MANAGER, scope: "workspace", scopeId: workspaceId, isActive: true },
      });
      // FK anchor for OwnerActionOutcome.workspaceId (OwnerActionOutcome.workspace references ClientAccount, not Workspace).
      await db.clientAccount.create({ data: { id: workspaceId, name: `${businessName} (client anchor)`, status: "active", visibility: "internal", updatedAt: new Date() } });
      const biz = await db.ownerBusiness.create({
        data: { id: randomUUID(), workspaceId, name: businessName, businessType: "generic_local_service", createdBy: ownerId },
      });
      return biz.id as string;
    }

    beforeEach(async () => {
      soloWorkspaceId = randomUUID();
      soloOwnerId = randomUUID();
      soloBusinessId = await seedWorkspaceAndOwner(soloWorkspaceId, soloOwnerId, "Solo Owner Business");

      multiWorkspaceId = randomUUID();
      recorderId = randomUUID();
      secondEligibleVerifierId = randomUUID();
      multiBusinessId = await seedWorkspaceAndOwner(multiWorkspaceId, recorderId, "Multi User Business");
      // Second ACTIVE member who holds a workspace-scoped capability grant that includes
      // CAPABILITIES.OWNER_MANAGE (ADMIN_OR_PORTFOLIO_MANAGER, non-"owner" workspaceRole so the
      // full bundle applies, unnarrowed) — a genuinely eligible independent verifier.
      await db.user.create({ data: { id: secondEligibleVerifierId, email: `${secondEligibleVerifierId}@example.com`, updatedAt: new Date() } });
      await db.workspaceMembership.create({ data: { userId: secondEligibleVerifierId, workspaceId: multiWorkspaceId, role: "admin", isActive: true } });
      await db.userRoleAssignment.create({
        data: { id: randomUUID(), userId: secondEligibleVerifierId, role: ROLES.ADMIN_OR_PORTFOLIO_MANAGER, scope: "workspace", scopeId: multiWorkspaceId, isActive: true },
      });

      foreignWorkspaceId = randomUUID();
      await db.workspace.create({ data: { id: foreignWorkspaceId, name: "PR-G Foreign WS", slug: `pr-g-foreign-${foreignWorkspaceId.substring(0, 8)}` } });
      await db.clientAccount.create({ data: { id: foreignWorkspaceId, name: "Foreign WS (client anchor)", status: "active", visibility: "internal", updatedAt: new Date() } });
    });

    afterEach(async () => {
      for (const workspaceId of [soloWorkspaceId, multiWorkspaceId, foreignWorkspaceId]) {
        await db.processExecutionTask.deleteMany({ where: { workspaceId } });
        await db.ownerActionOutcome.deleteMany({ where: { workspaceId } });
        await db.ownerReassessmentEvent.deleteMany({ where: { workspaceId } }).catch(() => undefined);
        await db.auditEvent.deleteMany({ where: { workspaceId } });
        await db.ownerBusiness.deleteMany({ where: { workspaceId } });
        await db.userRoleAssignment.deleteMany({ where: { scopeId: workspaceId } });
        await db.workspaceMembership.deleteMany({ where: { workspaceId } });
        await db.clientAccount.deleteMany({ where: { id: workspaceId } });
        await db.workspace.deleteMany({ where: { id: workspaceId } });
      }
      await db.user.deleteMany({ where: { id: { in: [soloOwnerId, recorderId, secondEligibleVerifierId] } } });
    });

    // ── A. SOLO OWNER ──────────────────────────────────────────────────────

    it("A. solo owner: COMPLETE -> RECORD_OUTCOME -> VERIFY_OUTCOME (same actor) succeeds, honestly self-verified", async () => {
      const key = `solo_${randomUUID().slice(0, 8)}`;
      await seedProposedTask(soloWorkspaceId, key, soloBusinessId);
      await completeTask(soloWorkspaceId, key, soloOwnerId, "owner");
      const outcomeId = await recordOutcome(soloWorkspaceId, key, soloBusinessId, soloOwnerId, "owner");

      // Same actor (soloOwnerId) verifies their own outcome — the ONLY member of this workspace.
      actAs(soloOwnerId, soloWorkspaceId, "owner");
      const verify = await post({ taskKey: key, action: "VERIFY_OUTCOME", reason: "Confirmed by owner" });

      expect(verify.status).toBe(200);
      expect(verify.body.verificationClassification).toBe("SUCCESS");
      // Truthful distinction: self-verified, NEVER fabricated as an independent verification.
      expect(verify.body.selfVerified).toBe(true);

      // Verified state persists.
      const task = await db.processExecutionTask.findFirst({ where: { workspaceId: soloWorkspaceId, taskKey: key } });
      expect(task?.status).toBe("OUTCOME_VERIFIED");
      const outcome = await db.ownerActionOutcome.findFirst({ where: { id: outcomeId } });
      expect(outcome?.verificationStatus).toBe("verified");
      expect(outcome?.verificationClassification).toBe("SUCCESS");
      expect(outcome?.verifiedByActorId).toBe(soloOwnerId);

      // Correct, truthful audit event — selfVerified:true, never claiming independence.
      const auditEvent = await db.auditEvent.findFirst({
        where: { workspaceId: soloWorkspaceId, entityType: "owner_action_outcome", entityId: outcomeId, eventName: "owner.process_execution_outcome_verified" },
        orderBy: { occurredAt: "desc" },
      });
      expect(auditEvent).toBeTruthy();
      expect((auditEvent?.payload as Record<string, unknown> | null)?.selfVerified).toBe(true);

      // Task-lifecycle audit event mirrors the same truthful distinction.
      const taskAuditEvent = await db.auditEvent.findFirst({
        where: { workspaceId: soloWorkspaceId, entityType: "process_execution_task", entityId: task!.id, eventName: "owner.process_execution_outcome_verified" },
        orderBy: { occurredAt: "desc" },
      });
      expect((taskAuditEvent?.payload as Record<string, unknown> | null)?.selfVerified).toBe(true);

      // Reassessment/next-priority side effect fires (best-effort, fire-and-forget — poll for it).
      const reassessment = await waitForCondition(() =>
        db.ownerReassessmentEvent.findFirst({ where: { workspaceId: soloWorkspaceId, outcomeId } })
      );
      expect(reassessment).toBeTruthy();
    });

    // ── B. MULTI-USER, BLOCKED ─────────────────────────────────────────────

    it("B. multi-user: recorder cannot verify their own outcome when another eligible verifier exists (separation of duty preserved)", async () => {
      const key = `multi_blocked_${randomUUID().slice(0, 8)}`;
      await seedProposedTask(multiWorkspaceId, key, multiBusinessId);
      await completeTask(multiWorkspaceId, key, recorderId, "owner");
      await recordOutcome(multiWorkspaceId, key, multiBusinessId, recorderId, "owner");

      // Same actor who completed/recorded now tries to verify — but secondEligibleVerifierId is
      // an active, OWNER_MANAGE-capable member of this same workspace, so this must still be blocked.
      actAs(recorderId, multiWorkspaceId, "owner");
      const verify = await post({ taskKey: key, action: "VERIFY_OUTCOME", reason: "Self-approving" });

      expect(verify.status).toBe(403);
      expect(verify.body.code).toBe("UNAUTHORIZED");

      // No mutation from the rejected attempt.
      const task = await db.processExecutionTask.findFirst({ where: { workspaceId: multiWorkspaceId, taskKey: key } });
      expect(task?.status).toBe("OUTCOME_RECORDED");
      const outcome = await db.ownerActionOutcome.findFirst({ where: { id: task?.outcomeId ?? undefined } });
      expect(outcome?.verificationClassification).toBeNull();
      expect(outcome?.verifiedByActorId).toBeNull();
    });

    // ── C. MULTI-USER, INDEPENDENT VERIFIER (regression) ────────────────────

    it("C. multi-user: the second eligible actor verifies successfully (regression, unchanged by PR G)", async () => {
      const key = `multi_indep_${randomUUID().slice(0, 8)}`;
      await seedProposedTask(multiWorkspaceId, key, multiBusinessId);
      await completeTask(multiWorkspaceId, key, recorderId, "owner");
      const outcomeId = await recordOutcome(multiWorkspaceId, key, multiBusinessId, recorderId, "owner");

      // First, prove B's block still holds for this exact outcome (defense in depth for this test).
      actAs(recorderId, multiWorkspaceId, "owner");
      const blocked = await post({ taskKey: key, action: "VERIFY_OUTCOME" });
      expect(blocked.status).toBe(403);

      // Now the SECOND, genuinely independent eligible actor verifies.
      actAs(secondEligibleVerifierId, multiWorkspaceId, "admin");
      const verify = await post({ taskKey: key, action: "VERIFY_OUTCOME", reason: "Independently confirmed" });

      expect(verify.status).toBe(200);
      expect(verify.body.verificationClassification).toBe("SUCCESS");
      // Never marked self-verified for a genuine independent verification.
      expect(verify.body.selfVerified).toBeFalsy();

      const outcome = await db.ownerActionOutcome.findFirst({ where: { id: outcomeId } });
      expect(outcome?.verificationStatus).toBe("verified");
      expect(outcome?.verifiedByActorId).toBe(secondEligibleVerifierId);

      const auditEvent = await db.auditEvent.findFirst({
        where: { workspaceId: multiWorkspaceId, entityType: "owner_action_outcome", entityId: outcomeId, eventName: "owner.process_execution_outcome_verified" },
        orderBy: { occurredAt: "desc" },
      });
      expect((auditEvent?.payload as Record<string, unknown> | null)?.selfVerified).toBeFalsy();
    });

    // ── D. SAFETY REGRESSIONS ────────────────────────────────────────────────

    it("D1. VERIFY_OUTCOME against a foreign workspace is rejected (workspace isolation unchanged)", async () => {
      const key = `d1_foreign_${randomUUID().slice(0, 8)}`;
      await seedProposedTask(soloWorkspaceId, key, soloBusinessId); // seeded in soloWorkspaceId
      await completeTask(soloWorkspaceId, key, soloOwnerId, "owner");
      await recordOutcome(soloWorkspaceId, key, soloBusinessId, soloOwnerId, "owner");

      // Act as a member of the FOREIGN workspace attempting to verify a task that lives in soloWorkspaceId.
      const foreignActorId = randomUUID();
      await db.user.create({ data: { id: foreignActorId, email: `${foreignActorId}@example.com`, updatedAt: new Date() } });
      await db.workspaceMembership.create({ data: { userId: foreignActorId, workspaceId: foreignWorkspaceId, role: "owner", isActive: true } });
      await db.userRoleAssignment.create({
        data: { id: randomUUID(), userId: foreignActorId, role: ROLES.ADMIN_OR_PORTFOLIO_MANAGER, scope: "workspace", scopeId: foreignWorkspaceId, isActive: true },
      });
      actAs(foreignActorId, foreignWorkspaceId, "owner");
      const verify = await post({ taskKey: key, action: "VERIFY_OUTCOME" });
      expect(verify.status).toBe(400);
      expect(verify.body.code).toBe("NOT_FOUND_OR_FORBIDDEN");

      // CI ROOT CAUSE (fixed here, test-only): the real POST route unconditionally calls
      // persistProcessExecutionRoutes(ctx.verifiedWorkspaceId, ..., ctx.verifiedActorId) BEFORE
      // applyProcessExecutionAction runs (see route.ts) -- a pre-existing, correct
      // "server-authoritative route materialisation" step from an earlier PASS, unrelated to this
      // PR's diff. It writes an OWNER_PROCESS_EXECUTION_TASK_UPSERTED AuditEvent for
      // (workspaceId: foreignWorkspaceId, actorId: foreignActorId) regardless of whether the
      // caller's actual action (VERIFY_OUTCOME here) is subsequently accepted or rejected. The
      // shared afterEach below does clean up audit_events for foreignWorkspaceId, but it runs
      // AFTER this it() body -- deleting the User row first (as this cleanup previously did)
      // violates audit_events_actor_id_fkey. Delete that actor's own audit events first.
      await db.auditEvent.deleteMany({ where: { actorId: foreignActorId } });
      await db.userRoleAssignment.deleteMany({ where: { userId: foreignActorId } });
      await db.workspaceMembership.deleteMany({ where: { userId: foreignActorId } });
      await db.user.deleteMany({ where: { id: foreignActorId } });
    });

    it("D2. VERIFY_OUTCOME with a businessId belonging to a DIFFERENT business is rejected (wrong-business guard unchanged)", async () => {
      const key = `d2_wrong_biz_${randomUUID().slice(0, 8)}`;
      await seedProposedTask(soloWorkspaceId, key, soloBusinessId);
      await completeTask(soloWorkspaceId, key, soloOwnerId, "owner");
      await recordOutcome(soloWorkspaceId, key, soloBusinessId, soloOwnerId, "owner");

      const otherBiz = await db.ownerBusiness.create({
        data: { id: randomUUID(), workspaceId: soloWorkspaceId, name: "A different business in the same workspace", businessType: "generic_local_service", createdBy: soloOwnerId },
      });

      actAs(soloOwnerId, soloWorkspaceId, "owner");
      const verify = await post({ taskKey: key, action: "VERIFY_OUTCOME", businessId: otherBiz.id });
      expect(verify.status).toBe(400);
      expect(verify.body.code).toBe("NOT_FOUND_OR_FORBIDDEN");

      const task = await db.processExecutionTask.findFirst({ where: { workspaceId: soloWorkspaceId, taskKey: key } });
      expect(task?.status).toBe("OUTCOME_RECORDED"); // unchanged

      await db.ownerBusiness.deleteMany({ where: { id: otherBiz.id } });
    });

    it("D3. an already-verified outcome cannot be improperly re-verified (idempotency/terminal-state guard unchanged)", async () => {
      const key = `d3_reverify_${randomUUID().slice(0, 8)}`;
      await seedProposedTask(soloWorkspaceId, key, soloBusinessId);
      await completeTask(soloWorkspaceId, key, soloOwnerId, "owner");
      await recordOutcome(soloWorkspaceId, key, soloBusinessId, soloOwnerId, "owner");

      actAs(soloOwnerId, soloWorkspaceId, "owner");
      const first = await post({ taskKey: key, action: "VERIFY_OUTCOME" });
      expect(first.status).toBe(200);

      const second = await post({ taskKey: key, action: "VERIFY_OUTCOME" });
      expect(second.status).toBe(400);
      expect(second.body.code).toBe("INVALID_TRANSITION");
    });

    it("D4. insufficient evidence is still rejected identically (no state mutation)", async () => {
      const key = `d4_insufficient_${randomUUID().slice(0, 8)}`;
      await seedProposedTask(soloWorkspaceId, key, soloBusinessId);
      actAs(soloOwnerId, soloWorkspaceId, "owner");
      await post({ taskKey: key, action: "ACKNOWLEDGE" });
      await post({ taskKey: key, action: "START" });
      await post({ taskKey: key, action: "COMPLETE", evidenceRefs: ["evidence://d4-1"], outcomeNotes: "done" });
      // not_measurable with evidenceQuality "weak"/no evidenceRefs recorded still classifies past
      // INSUFFICIENT_EVIDENCE (that rule only fires for evidenceQuality:"none" AND no reported
      // result) — force the true insufficient-evidence case directly on the outcome row so this
      // regression check is unambiguous.
      const recorded = await post({ taskKey: key, action: "RECORD_OUTCOME", businessId: soloBusinessId, outcomeStatus: "worked" });
      expect(recorded.status).toBe(200);
      await db.ownerActionOutcome.updateMany({
        where: { id: recorded.body.outcomeId },
        data: { evidenceQuality: "none", ownerReportedResult: null },
      });

      const verify = await post({ taskKey: key, action: "VERIFY_OUTCOME" });
      expect(verify.status).toBe(400);
      expect(verify.body.code).toBe("INVALID_TRANSITION");

      const task = await db.processExecutionTask.findFirst({ where: { workspaceId: soloWorkspaceId, taskKey: key } });
      expect(task?.status).toBe("OUTCOME_RECORDED"); // unchanged — no mutation on the rejected attempt
      const outcome = await db.ownerActionOutcome.findFirst({ where: { id: recorded.body.outcomeId } });
      expect(outcome?.verificationClassification).toBeNull();
    });

    it("D5. observation window still enforced identically (no state mutation)", async () => {
      const key = `d5_window_${randomUUID().slice(0, 8)}`;
      await seedProposedTask(soloWorkspaceId, key, soloBusinessId);
      actAs(soloOwnerId, soloWorkspaceId, "owner");
      await post({ taskKey: key, action: "ACKNOWLEDGE" });
      await post({ taskKey: key, action: "START" });
      await post({ taskKey: key, action: "COMPLETE", evidenceRefs: ["evidence://d5-1"], outcomeNotes: "done" });
      const recorded = await post({ taskKey: key, action: "RECORD_OUTCOME", businessId: soloBusinessId, outcomeStatus: "worked" });
      expect(recorded.status).toBe(200);
      // Force a still-open observation window on the outcome directly.
      await db.ownerActionOutcome.updateMany({
        where: { id: recorded.body.outcomeId },
        data: { observationWindowDays: 30, measurementPeriodEnd: new Date(Date.now() + 20 * 24 * 60 * 60 * 1000) },
      });

      const verify = await post({ taskKey: key, action: "VERIFY_OUTCOME" });
      expect(verify.status).toBe(400);
      expect(verify.body.code).toBe("INVALID_TRANSITION");

      const task = await db.processExecutionTask.findFirst({ where: { workspaceId: soloWorkspaceId, taskKey: key } });
      expect(task?.status).toBe("OUTCOME_RECORDED"); // unchanged
      const outcome = await db.ownerActionOutcome.findFirst({ where: { id: recorded.body.outcomeId } });
      expect(outcome?.verificationClassification).toBeNull();
      expect(outcome?.verifiedAt).toBeNull();
    });
  }
);

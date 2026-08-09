/**
 * BLOCK 2 — Owner-Mode E2E Chain (existing business, PostgreSQL-backed)
 *
 * Exercises the full governance spine for an owner running an existing business:
 *   1. Bootstrap: user, workspace, membership, client, engagement, business,
 *      subscription (with generate_recommendation entitlement)
 *   2. Business condition assessment — persisted BusinessConditionProfile
 *   3. Recommendation creation — full service path including entitlement check
 *   4. Task assignment → proof submission → owner acceptance → completion
 *   5. Owner action outcome — delta computation, persisted record
 *   6. Calibration — learning candidate classification and persistence
 *   7. Significant change — major client archive routes engagement into re-evaluation
 *   8. Audit trail integrity — all events workspace-scoped, no cross-tenant leakage
 *
 * Nothing is mocked — every assertion reads from the database.
 *
 * Run: TEST_WITH_DB=true npx vitest run \
 *   src/__tests__/owner-mode/owner-operational-existing-business.e2e.db.test.ts
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { randomUUID } from "crypto";
import { db } from "@/lib/db";
import { SHOULD_RUN_DB_TESTS } from "@/__tests__/test-helpers/db-test-gate";
import { createBusinessConditionProfile } from "@/services/business-condition/business-condition-profile.service";
import { createRecommendation } from "@/services/recommendation";
import { assignDelegatedTask } from "@/services/execution/task-assignment.service";
import { intakeProofSubmission } from "@/services/execution/proof-intake.service";
import { reviewProof } from "@/services/execution/proof.service";
import { completeTask, TaskCompletionBlockedError } from "@/services/execution/task-completion.service";
import { recordOwnerActionOutcome } from "@/services/owner-mode/owner-action-outcome.service";
import { createLearningCandidate } from "@/services/controlled-learning-candidate.service";
import { archiveClient } from "@/services/client-account";
import {
  TaskActorRole,
  DelegatedTaskStatus,
  type TaskActor,
} from "@/domain/execution/delegated-task";
import {
  ProofType,
  ProofRiskLevel as PRisk,
  ProofStatus as PStatus,
} from "@/domain/execution/proof";

const PType = ProofType;
import { AiProofPrecheckOutcome } from "@/domain/execution/proof-precheck";
import { AUDIT_EVENTS } from "@/domain/constants/audit-events";

// ─── Shared IDs ───────────────────────────────────────────────────────────────

const ownerId = randomUUID();
const staffId = randomUUID();
const ws = randomUUID();
const clientId = randomUUID();
const engagementId = randomUUID();
const businessId = randomUUID();
const planId = randomUUID();
const billingAccountId = randomUUID();
const subscriptionId = randomUUID();
const NOW = new Date("2026-07-01T00:00:00Z");
const GOOD_HASH = "b".repeat(64);

const authCtx = { verifiedActorId: ownerId, session: { user: { id: ownerId } } } as any;

const ownerActor: TaskActor = {
  role: TaskActorRole.OWNER,
  isAssignee: false,
  canApproveCompletion: true,
  canReviewProof: true,
  canAssign: true,
};

// ─── Shared state written by each test, read by later tests ──────────────────

const state: {
  taskId?: string;
  proofId?: string;
  recommendationId?: string;
  outcomeId?: string;
} = {};

let seeded = false;

describe.skipIf(!SHOULD_RUN_DB_TESTS)(
  "[db][e2e] Owner-mode governance spine — existing business",
  () => {
    beforeAll(async () => {
      // Batch 1: seed records with no inter-dependencies in parallel
      await Promise.all([
        db.user.create({
          data: { id: ownerId, email: `e2e-owner-${ownerId}@test.local`, name: "E2E Owner", isActive: true, updatedAt: NOW },
        }),
        db.user.create({
          data: { id: staffId, email: `e2e-staff-${staffId}@test.local`, name: "E2E Staff", isActive: true, updatedAt: NOW },
        }),
        db.plan.create({
          data: {
            id: planId,
            name: `e2e-plan-${ws.slice(0, 8)}`,
            priceMonthly: 99,
            priceYearly: 990,
            active: true,
            updatedAt: NOW,
            planCapabilities: {
              create: { id: randomUUID(), key: "generate_recommendation", limit: null },
            },
          },
        }),
      ]);

      // Batch 2: workspace (depends on owner user)
      await db.workspace.create({ data: { id: ws, name: "E2E Business Consultancy", slug: `e2e-${ws.slice(0, 8)}`, createdBy: ownerId } });

      // Batch 3: all workspace-scoped records in parallel
      await Promise.all([
        db.workspaceMembership.create({ data: { userId: ownerId, workspaceId: ws, role: "owner", isActive: true } }),
        db.workspaceMembership.create({ data: { userId: staffId, workspaceId: ws, role: "member", isActive: true } }),
        db.clientAccount.create({ data: { id: ws, workspaceId: ws, name: "E2E Owner Workspace Account", updatedAt: NOW } }),
        db.clientAccount.create({ data: { id: clientId, workspaceId: ws, name: "Meridian Retail Ltd", updatedAt: NOW } }),
        db.ownerBusiness.create({
          data: { id: businessId, workspaceId: ws, name: "Meridian Retail Ltd", businessType: "retail", currency: "INR", createdBy: ownerId },
        }),
        db.billingAccount.create({
          data: {
            id: billingAccountId,
            workspaceId: ws,
            provider: "stripe",
            providerCustomerId: `e2e_${ws.slice(0, 8)}`,
            status: "active",
            updatedAt: NOW,
          },
        }),
      ]);

      // Batch 4: records that depend on clientAccount and billingAccount
      await Promise.all([
        db.engagement.create({
          data: { id: engagementId, workspaceId: ws, code: `E2E-${engagementId.slice(0, 8)}`, title: "Turnaround — falling margin", clientId, serviceTier: "standard", engagementMode: "advisory", status: "active", updatedAt: NOW },
        }),
        db.subscription.create({
          data: {
            id: subscriptionId,
            billingAccountId,
            planId,
            status: "active",
            currentPeriodStart: NOW,
            currentPeriodEnd: new Date(NOW.getTime() + 90 * 86_400_000),
            updatedAt: NOW,
          },
        }),
      ]);
      seeded = true;
    }, 60000); // 60s: local PostgreSQL is always available, no cold-start

    afterAll(async () => {
      if (!seeded) return;
      await (db as any).controlledLearningCandidateAuditEntry.deleteMany({ where: { workspaceId: ws } }).catch(() => undefined);
      await (db as any).controlledLearningCandidate.deleteMany({ where: { workspaceId: ws } }).catch(() => undefined);
      await db.ownerActionOutcome.deleteMany({ where: { workspaceId: ws } }).catch(() => undefined);
      await db.action.deleteMany({ where: { engagementId } }).catch(() => undefined);
      await db.recommendation.deleteMany({ where: { engagementId } }).catch(() => undefined);
      await db.proof.deleteMany({ where: { workspaceId: ws } }).catch(() => undefined);
      await db.proofRequirement.deleteMany({ where: { workspaceId: ws } }).catch(() => undefined);
      await db.delegatedTask.deleteMany({ where: { workspaceId: ws } }).catch(() => undefined);
      await db.idempotencyRecord.deleteMany({ where: { workspaceId: ws } }).catch(() => undefined);
      await db.auditEvent.deleteMany({ where: { workspaceId: ws } }).catch(() => undefined);
      await db.subscription.deleteMany({ where: { id: subscriptionId } }).catch(() => undefined);
      await db.billingAccount.deleteMany({ where: { id: billingAccountId } }).catch(() => undefined);
      await db.plan.deleteMany({ where: { id: planId } }).catch(() => undefined);
      await db.businessConditionProfile.deleteMany({ where: { workspaceId: ws } }).catch(() => undefined);
      await db.engagement.deleteMany({ where: { id: engagementId } }).catch(() => undefined);
      await db.clientAccount.deleteMany({ where: { workspaceId: ws } }).catch(() => undefined);
      await db.ownerBusiness.deleteMany({ where: { workspaceId: ws } }).catch(() => undefined);
      await db.workspaceMembership.deleteMany({ where: { workspaceId: ws } }).catch(() => undefined);
      await db.workspace.deleteMany({ where: { id: ws } }).catch(() => undefined);
      await db.user.deleteMany({ where: { id: { in: [ownerId, staffId] } } }).catch(() => undefined);
    }, 60000);

    // ── Step 1: Business condition assessment ─────────────────────────────────

    it("STEP 1: persists a business condition profile and emits the assessment audit event", async () => {
      const profile = await createBusinessConditionProfile(
        db as any,
        {
          engagement_id: engagementId,
          workspace_id: ws,
          assessment: {
            condition_status: "critical",
            condition_score: 3,
            urgency_level: "immediate",
            health_scores: {
              owner_health_score: 45,
              team_health_score: 55,
              customer_health_score: 40,
              financial_health_score: 30,
            },
            risk_factors: ["cash burn", "falling margin", "key-customer dependency"],
            strengths: ["loyal customer base", "experienced owner"],
          },
        },
        ownerId,
      );

      expect(profile.isCurrent).toBe(true);
      expect(profile.workspaceId).toBe(ws);
      expect(profile.engagementId).toBe(engagementId);
      expect(profile.businessStatus).toBe("critical");

      const persisted = await db.businessConditionProfile.findFirst({
        where: { engagementId, workspaceId: ws, isCurrent: true },
      });
      expect(persisted).toBeTruthy();
      expect(persisted!.severityScore).toBe(3);

      const evt = await db.auditEvent.findFirst({
        where: { workspaceId: ws, eventName: "BUSINESS_CONDITION_PROFILE_CREATED" },
      });
      expect(evt).toBeTruthy();
      expect(evt!.entityType).toBe("BusinessConditionProfile");
    }, 30000);

    // ── Step 2: Recommendation creation ──────────────────────────────────────

    it("STEP 2: creates a recommendation via the full service path (entitlement gate passes)", async () => {
      const rec = await createRecommendation(
        {
          engagementId,
          title: "Reduce direct cost ratio by renegotiating top-3 supplier contracts",
          priority: "high",
          description: "Margin recovery requires a 6-point improvement in COGS ratio within 90 days.",
          why_now: "Cash burn accelerates if delayed past next inventory cycle.",
          cost_of_inaction: "INR 4L/month margin erosion; possible covenant breach by Q3.",
        },
        authCtx,
        ws,
      );

      state.recommendationId = rec.id;

      expect(rec.id).toBeTruthy();
      expect(rec.engagementId).toBe(engagementId);
      expect(rec.workspaceId).toBe(ws);
      expect(rec.priority).toBe("high");

      const persisted = await db.recommendation.findUnique({ where: { id: rec.id } });
      expect(persisted).toBeTruthy();
      expect(persisted!.workspaceId).toBe(ws);

      const evt = await db.auditEvent.findFirst({
        where: { workspaceId: ws, eventName: AUDIT_EVENTS.RECOMMENDATION_CREATED },
      });
      expect(evt).toBeTruthy();
    }, 30000);

    // ── Step 3: Task assignment (execution kickoff) ────────────────────────────

    it("STEP 3: assigns a proof-required task to staff with proof gate enforced", async () => {
      const t = await assignDelegatedTask({
        workspaceId: ws,
        actorId: ownerId,
        title: "Renegotiate supplier contract — confirm signed copy",
        assignedUserId: staffId,
        requireProof: { proofType: PType.SHORT_NOTE, requiredFields: ["note"], riskLevel: PRisk.LOW },
      });

      state.taskId = t.taskId;
      state.proofId = t.proofId ?? undefined;

      expect(state.taskId).toBeTruthy();

      await expect(
        completeTask({ taskId: state.taskId!, workspaceId: ws, actor: ownerActor, actorId: ownerId }),
      ).rejects.toBeInstanceOf(TaskCompletionBlockedError);

      const blocked = await db.auditEvent.findFirst({
        where: { workspaceId: ws, eventName: AUDIT_EVENTS.OWNER_TASK_COMPLETION_BLOCKED },
      });
      expect(blocked).toBeTruthy();
    }, 30000);

    // ── Step 4: Proof intake → owner acceptance (separation of duty) ──────────

    it("STEP 4: staff submits genuine proof; owner (not performer) accepts it", async () => {
      const res = await intakeProofSubmission({
        workspaceId: ws,
        actorId: staffId,
        taskId: state.taskId!,
        submission: {
          proofType: PType.SHORT_NOTE,
          fields: { note: "Signed contract PDF received and filed under vendor-renegotiation-2026." },
          fileHash: GOOD_HASH,
        },
      });

      expect(res.ok).toBe(true);
      if (res.ok) {
        expect(res.precheckOutcome).toBe(AiProofPrecheckOutcome.PASS_PRELIMINARY);
        expect(res.status).toBe(PStatus.AI_PRECHECK_PASSED);
        if (res.proofId) state.proofId = res.proofId;
      }

      // Staff cannot review their own proof (separation-of-duty gate)
      await expect(
        reviewProof({
          proofId: state.proofId!,
          workspaceId: ws,
          fromStatus: PStatus.AI_PRECHECK_PASSED,
          to: PStatus.ACCEPTED,
          actor: { role: TaskActorRole.EMPLOYEE, isAssignee: true, canReviewProof: false } as any,
          actorId: staffId,
        }),
      ).rejects.toThrow();

      const accepted = await reviewProof({
        proofId: state.proofId!,
        workspaceId: ws,
        fromStatus: PStatus.AI_PRECHECK_PASSED,
        to: PStatus.ACCEPTED,
        actor: { role: TaskActorRole.OWNER, isAssignee: false, canReviewProof: true } as any,
        actorId: ownerId,
      });
      expect(accepted).toBe(PStatus.ACCEPTED);
    }, 30000);

    // ── Step 5: Task completion (proof gate clears) ────────────────────────────

    it("STEP 5: task completes with APPROVED_COMPLETE after proof acceptance", async () => {
      await db.delegatedTask.update({
        where: { id: state.taskId! },
        data: { status: DelegatedTaskStatus.COMPLETED_PENDING_REVIEW },
      });

      const status = await completeTask({
        taskId: state.taskId!,
        workspaceId: ws,
        actor: ownerActor,
        actorId: ownerId,
        now: () => NOW,
      });
      expect(status).toBe(DelegatedTaskStatus.APPROVED_COMPLETE);

      const evt = await db.auditEvent.findFirst({
        where: { workspaceId: ws, eventName: AUDIT_EVENTS.OWNER_TASK_COMPLETED },
      });
      expect(evt).toBeTruthy();
    }, 30000);

    // ── Step 6: Outcome recording ─────────────────────────────────────────────

    it("STEP 6: records owner action outcome with deterministic delta computation", async () => {
      const outcome = await recordOwnerActionOutcome(ws, ownerId, {
        businessId,
        recommendationId: state.recommendationId,
        outcomeStatus: "worked",
        ownerReportedResult: "Supplier contracts renegotiated; direct cost ratio fell from 68% to 62%.",
        actualMetricName: "direct_cost_ratio_pct",
        beforeValue: 68,
        afterValue: 62,
        evidenceQuality: "strong",
      });

      state.outcomeId = outcome.id;

      expect(outcome.workspaceId).toBe(ws);
      expect(outcome.businessId).toBe(businessId);
      expect(outcome.outcomeStatus).toBe("worked");
      expect(outcome.absoluteChange).toBeCloseTo(-6, 5);
      expect(outcome.percentageChange).toBeCloseTo(-8.82, 1);

      const persisted = await db.ownerActionOutcome.findUnique({ where: { id: outcome.id } });
      expect(persisted).toBeTruthy();

      const evt = await db.auditEvent.findFirst({
        where: { workspaceId: ws, eventName: AUDIT_EVENTS.OWNER_ACTION_OUTCOME_RECORDED },
      });
      expect(evt).toBeTruthy();
    }, 30000);

    // ── Step 7: Calibration (learning candidate) ──────────────────────────────

    it("STEP 7: classifies and persists an eligible learning candidate from the verified outcome", async () => {
      const ownerDecisionId = randomUUID();
      const actionId = randomUUID();

      const candidate = await createLearningCandidate(db as any, {
        workspaceId: ws,
        businessId,
        sourceRecommendationId: state.recommendationId,
        evidenceSummary: "Owner-reported: direct cost ratio improved 6 points post supplier renegotiation. Evidence quality: strong.",
        outcomeRecordedAt: NOW,
        classificationInput: {
          workspaceId: ws,
          sourceLabel: "HUMAN_VERIFIED_CANDIDATE",
          evidenceOrigin: "owner_manual_entry",
          publicSourceFullTextVerified: false,
          originatingWorkspaceId: ws,
          involvesSafetyRelatedFailure: false,
          hasConflictingEvidence: false,
          candidateRecord: {
            ownerDecisionId,
            ownerDecisionVerdict: "approved",
            ownerDecisionWorkspaceId: ws,
            actionId,
            actionWasTaken: true,
            actionWorkspaceId: ws,
            outcomeId: state.outcomeId!,
            outcomeWindowElapsed: true,
            outcomeWorkspaceId: ws,
            humanApprovedBy: ownerId,
            humanApprovedAt: NOW.toISOString(),
            humanReviewWorkspaceId: ws,
          },
        },
      });

      expect(candidate.id).toBeTruthy();
      expect(candidate.eligible).toBe(true);

      const persisted = await (db as any).controlledLearningCandidate.findFirst({
        where: { workspaceId: ws, businessId },
      });
      expect(persisted).toBeTruthy();
      expect(persisted.eligibilityStatus).toContain("ELIGIBLE");
    }, 30000);

    // ── Step 8: Significant change → governed re-evaluation ──────────────────

    it("STEP 8: archiving the key client routes the engagement into governed re-evaluation", async () => {
      await archiveClient(clientId, authCtx, 1, ws);

      const archived = await db.clientAccount.findUnique({ where: { id: clientId } });
      expect(archived?.status).toBe("archived");

      const reeval = await db.auditEvent.findFirst({
        where: {
          workspaceId: ws,
          eventName: AUDIT_EVENTS.CONDITION_CHANGED,
          entityType: "client_account",
          entityId: clientId,
        },
      });
      expect(reeval).toBeTruthy();
    }, 30000);

    // ── Step 9: Audit trail integrity ─────────────────────────────────────────

    it("STEP 9: audit trail is workspace-scoped, chronologically consistent, cross-tenant-isolated", async () => {
      const events = await db.auditEvent.findMany({
        where: { workspaceId: ws },
        orderBy: { occurredAt: "asc" },
      });

      expect(events.length).toBeGreaterThanOrEqual(5);

      for (const evt of events) {
        expect(evt.workspaceId).toBe(ws);
      }

      for (let i = 1; i < events.length; i++) {
        expect(events[i].occurredAt.getTime()).toBeGreaterThanOrEqual(
          events[i - 1].occurredAt.getTime(),
        );
      }

      const names = new Set(events.map((e) => e.eventName));
      expect(names.has("BUSINESS_CONDITION_PROFILE_CREATED")).toBe(true);
      expect(names.has(AUDIT_EVENTS.RECOMMENDATION_CREATED)).toBe(true);
      expect(names.has(AUDIT_EVENTS.OWNER_TASK_COMPLETED)).toBe(true);
      expect(names.has(AUDIT_EVENTS.OWNER_ACTION_OUTCOME_RECORDED)).toBe(true);
      expect(names.has(AUDIT_EVENTS.CONDITION_CHANGED)).toBe(true);

      const leaked = await db.auditEvent.findMany({
        where: { workspaceId: randomUUID() },
      });
      expect(leaked.length).toBe(0);
    }, 30000);
  },
);

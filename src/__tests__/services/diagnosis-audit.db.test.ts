import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { diagnoseBusiness, type BusinessProblemInput } from "@/services/diagnosis";
import { db } from "@/lib/db";
import { v4 as uuidv4 } from "uuid";
import type { CanonicalAuthContext } from "@/lib/canonical-route-enforcement";
import { SHOULD_RUN_DB_TESTS } from "@/__tests__/test-helpers/db-test-gate";
import { AUDIT_EVENTS } from "@/domain/constants/audit-events";
import { seedPlanEntitlement, cleanupPlanEntitlement, type PlanEntitlementFixture } from "@/__tests__/test-helpers/plan-entitlement";

/**
 * Phase 6G — F-G1 regression guard.
 *
 * Proves that diagnoseBusiness emits a persisted DIAGNOSIS_COMPLETED audit event.
 * Before the F-G1 fix, emitAuditEvent was called without await, making the call
 * fire-and-forget: errors were silently dropped and the event may not have been
 * written before the function returned.
 */
describe.skipIf(!SHOULD_RUN_DB_TESTS)(
  "diagnoseBusiness — DIAGNOSIS_COMPLETED audit event (F-G1 regression guard)",
  () => {
    const workspaceId = uuidv4();
    const userId = uuidv4();
    const stamp = uuidv4();
    const createdEngagementIds: string[] = [];
    let plan: PlanEntitlementFixture | undefined;

    const authContext = {
      verifiedActorId: userId,
      verifiedActorType: "user",
      verifiedActor: null,
      verifiedWorkspaceId: workspaceId,
      verifiedCapabilities: ["DIAGNOSIS_CREATE"],
      verifiedSessionSnapshot: {
        snapshotId: uuidv4(),
        snapshotTimestamp: new Date(),
        snapshotHash: "test-hash",
        actorId: userId,
        workspaceId,
        capabilities: ["DIAGNOSIS_CREATE"],
      },
      session: {
        user: {
          id: userId,
          email: `6g-fg1-audit-${stamp}@test.local`,
          name: null,
          isActive: true,
        },
        sessionId: uuidv4(),
        expiresAt: new Date(Date.now() + 60 * 60 * 1000),
      },
      // The authorized policy (the route wrapper supplies it): workspace admin.
      policy: {
        userId,
        roles: [{ role: "admin_or_portfolio_manager", scope: "workspace", scopeId: workspaceId }],
        engagementMemberships: [],
        workspaceRole: "admin",
      },
    } as unknown as CanonicalAuthContext;

    beforeAll(async () => {
      await db.user.create({
        data: {
          id: userId,
          email: `6g-fg1-audit-${stamp}@test.local`,
          updatedAt: new Date(),
        },
      });
      await db.workspace.create({
        data: {
          id: workspaceId,
          name: "6G F-G1 Audit WS",
          slug: `6g-fg1-audit-${stamp}`,
        },
      });
      await db.workspaceMembership.create({ data: { userId, workspaceId, role: "admin", isActive: true } });
      await db.userRoleAssignment.create({
        data: { id: uuidv4(), userId, role: "admin_or_portfolio_manager", scope: "workspace", scopeId: workspaceId, isActive: true },
      });
      plan = await seedPlanEntitlement([workspaceId], ["create_engagement"]);
    });

    afterAll(async () => {
      try {
        if (createdEngagementIds.length > 0) {
          await db.recommendation.deleteMany({
            where: { engagementId: { in: createdEngagementIds } },
          });
          await db.finding.deleteMany({
            where: { engagementId: { in: createdEngagementIds } },
          });
          await db.action.deleteMany({ where: { engagementId: { in: createdEngagementIds } } });
          await db.evidence.deleteMany({ where: { engagementId: { in: createdEngagementIds } } });
          await db.engagementMembership.deleteMany({ where: { engagementId: { in: createdEngagementIds } } });
          await db.interventionState.deleteMany({ where: { engagementId: { in: createdEngagementIds } } });
        }
        await db.recommendation.deleteMany({ where: { workspaceId } });
        await db.auditEvent.deleteMany({ where: { workspaceId } });
        await db.usageEvent.deleteMany({ where: { workspaceId } });
        await db.engagement.deleteMany({ where: { workspaceId } });
        await db.clientAccount.deleteMany({ where: { workspaceId } });
        await cleanupPlanEntitlement(plan);
        await db.userRoleAssignment.deleteMany({ where: { userId } });
        await db.workspaceMembership.deleteMany({ where: { userId } });
        await db.workspace.deleteMany({ where: { id: workspaceId } });
        await db.auditEvent.deleteMany({ where: { actorId: userId } });
        await db.user.deleteMany({ where: { id: userId } });
      } catch {
        // best-effort cleanup
      }
    });

    it("persists a DIAGNOSIS_COMPLETED audit event after diagnoseBusiness returns", async () => {
      const input: BusinessProblemInput = {
        businessName: `6G Audit Retailer ${stamp}`,
        businessType: "retail",
        problemStatement: "Revenue declining month over month",
        mainIssue: "low_sales",
        monthlyRevenue: 80000,
        monthlyCosts: 60000,
      };

      const result = await diagnoseBusiness(input, authContext, workspaceId);
      createdEngagementIds.push(result.engagementId);

      const auditEvent = await db.auditEvent.findFirst({
        where: {
          workspaceId,
          entityId: result.engagementId,
          eventName: AUDIT_EVENTS.DIAGNOSIS_COMPLETED,
        },
      });

      expect(auditEvent).not.toBeNull();
      expect(auditEvent?.eventName).toBe(AUDIT_EVENTS.DIAGNOSIS_COMPLETED);
      expect(auditEvent?.entityId).toBe(result.engagementId);
      expect(auditEvent?.workspaceId).toBe(workspaceId);
    });

    it("DIAGNOSIS_COMPLETED event is scoped to the caller's workspace", async () => {
      const input: BusinessProblemInput = {
        businessName: `6G Scoped Retailer ${stamp}`,
        businessType: "services",
        problemStatement: "Operational bottleneck in delivery pipeline",
        mainIssue: "operations",
        monthlyRevenue: 50000,
        monthlyCosts: 40000,
      };

      const result = await diagnoseBusiness(input, authContext, workspaceId);
      createdEngagementIds.push(result.engagementId);

      // Event must be scoped to this workspace, not another
      const wrongWorkspace = uuidv4();
      const eventInWrongWorkspace = await db.auditEvent.findFirst({
        where: {
          workspaceId: wrongWorkspace,
          entityId: result.engagementId,
          eventName: AUDIT_EVENTS.DIAGNOSIS_COMPLETED,
        },
      });
      expect(eventInWrongWorkspace).toBeNull();

      const eventInCorrectWorkspace = await db.auditEvent.findFirst({
        where: {
          workspaceId,
          entityId: result.engagementId,
          eventName: AUDIT_EVENTS.DIAGNOSIS_COMPLETED,
        },
      });
      expect(eventInCorrectWorkspace).not.toBeNull();
    });
  }
);

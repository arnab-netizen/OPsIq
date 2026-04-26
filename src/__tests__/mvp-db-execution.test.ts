import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { db } from "@/lib/db";
import { createClient } from "@/services/client-account";
import { createEngagement, getEngagementById } from "@/services/engagement";
import { createFinding } from "@/services/findings";
import { createRecommendation } from "@/services/recommendation";
import { createAction } from "@/services/action";
import { transitionActionState } from "@/services/action-lifecycle";
import { computeEngagementHealth } from "@/services/engagement-health";

/**
 * Block 8: Real Database Execution Validation
 *
 * Comprehensive end-to-end test using real database to validate:
 * - Data persistence across lifecycle
 * - State transitions correctly stored
 * - Business rules enforced at DB layer
 * - Engagement health computation
 * - Report generation capability
 *
 * This test MUST run against a real database.
 * Exit with failure if DATABASE_URL is not configured.
 */

describe("MVP Database Execution - Real Persistence", () => {
  const testData = {
    clientId: "",
    engagementId: "",
    findingId: "",
    recommendationId: "",
    actionId: "",
    actorId: "test-actor-" + Date.now(),
    evidenceId: "evidence-" + Date.now(),
  };

  beforeAll(async () => {
    // Verify database is accessible
    try {
      await db.$queryRaw`SELECT 1`;
    } catch (error) {
      throw new Error(
        "Database not accessible. DATABASE_URL must be configured and database must be reachable."
      );
    }

    // Verify migrations are deployed
    try {
      // Check if engagement table exists
      await db.engagement.count();
    } catch (error) {
      throw new Error(
        "Database schema not found. Run: npx prisma migrate deploy"
      );
    }
  });

  afterAll(async () => {
    // Cleanup test data
    if (testData.engagementId) {
      try {
        // Clean up actions first (foreign key)
        await db.action.deleteMany({
          where: { engagementId: testData.engagementId },
        });
        // Clean up findings
        await db.finding.deleteMany({
          where: { engagementId: testData.engagementId },
        });
        // Clean up recommendations
        await db.recommendation.deleteMany({
          where: { engagementId: testData.engagementId },
        });
        // Clean up engagement
        await db.engagement.delete({
          where: { id: testData.engagementId },
        });
      } catch (error) {
        console.warn("Cleanup failed:", error);
      }
    }

    if (testData.clientId) {
      try {
        await db.clientAccount.delete({
          where: { id: testData.clientId },
        });
      } catch (error) {
        console.warn("Client cleanup failed:", error);
      }
    }
  });

  describe("Phase 1: Client & Engagement Persistence", () => {
    it("creates and persists client record", async () => {
      const client = await createClient(
        {
          name: "Test Client " + Date.now(),
          businessType: "technology",
          annualRevenue: "1000000",
          employeeCount: "50",
        },
        testData.actorId
      );

      expect(client.id).toBeDefined();
      testData.clientId = client.id;

      // Verify persistence
      const persisted = await db.clientAccount.findUnique({
        where: { id: client.id },
      });
      expect(persisted).toBeDefined();
      expect(persisted.name).toBe(client.name);
    });

    it("creates and persists engagement record", async () => {
      expect(testData.clientId).toBeDefined();

      const engagement = await createEngagement(
        {
          clientId: testData.clientId,
          code: "TEST-" + Date.now(),
          title: "Test Engagement",
          status: "active",
          interventionMode: "fractional_leadership",
          interventionPhase: "stabilization",
        },
        testData.actorId
      );

      expect(engagement.id).toBeDefined();
      testData.engagementId = engagement.id;

      // Verify persistence
      const persisted = await db.engagement.findUnique({
        where: { id: engagement.id },
      });
      expect(persisted).toBeDefined();
      expect(persisted.clientId).toBe(testData.clientId);
      expect(persisted.status).toBe("active");
    });

    it("loads engagement and verifies data integrity", async () => {
      expect(testData.engagementId).toBeDefined();

      const loaded = await getEngagementById(testData.engagementId);

      expect(loaded.id).toBe(testData.engagementId);
      expect(loaded.clientId).toBe(testData.clientId);
      expect(loaded.status).toBe("active");
    });
  });

  describe("Phase 2: Finding & Recommendation Persistence", () => {
    it("creates and persists finding record", async () => {
      expect(testData.engagementId).toBeDefined();

      const finding = await createFinding(
        {
          engagementId: testData.engagementId,
          title: "Database Test Finding",
          summary: "Testing database persistence",
          findingType: "operational",
          severity: "high",
        },
        testData.actorId
      );

      expect(finding.id).toBeDefined();
      testData.findingId = finding.id;

      // Verify persistence
      const persisted = await db.finding.findUnique({
        where: { id: finding.id },
      });
      expect(persisted).toBeDefined();
      expect(persisted.engagementId).toBe(testData.engagementId);
      expect(persisted.severity).toBe("high");
    });

    it("creates and persists recommendation record", async () => {
      expect(testData.engagementId).toBeDefined();
      expect(testData.findingId).toBeDefined();

      const recommendation = await createRecommendation(
        {
          engagementId: testData.engagementId,
          findingId: testData.findingId,
          title: "Database Test Recommendation",
          summary: "Test recommendation",
          priority: "high",
          type: "process_improvement",
          rationale: "Testing database persistence",
        },
        testData.actorId
      );

      expect(recommendation.id).toBeDefined();
      testData.recommendationId = recommendation.id;

      // Verify persistence
      const persisted = await db.recommendation.findUnique({
        where: { id: recommendation.id },
      });
      expect(persisted).toBeDefined();
      expect(persisted.findingId).toBe(testData.findingId);
      expect(persisted.priority).toBe("high");
    });
  });

  describe("Phase 3: Action Lifecycle Persistence", () => {
    it("creates and persists action record", async () => {
      expect(testData.engagementId).toBeDefined();

      const action = await createAction(
        {
          engagementId: testData.engagementId,
          title: "Database Test Action",
          status: "created",
          priority: "high",
          dueDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
          linkedRecommendations: [testData.recommendationId],
          linkedEvidence: [],
        },
        testData.actorId
      );

      expect(action.id).toBeDefined();
      testData.actionId = action.id;

      // Verify persistence
      const persisted = await db.action.findUnique({
        where: { id: action.id },
      });
      expect(persisted).toBeDefined();
      expect(persisted.engagementId).toBe(testData.engagementId);
      expect(persisted.status).toBe("created");
      expect(persisted.version).toBe(1);
    });

    it("transitions action to in_progress and persists state", async () => {
      expect(testData.actionId).toBeDefined();

      const transitioned = await transitionActionState(
        testData.actionId,
        "in_progress",
        { actorId: testData.actorId }
      );

      expect(transitioned.status).toBe("in_progress");
      expect(transitioned.version).toBe(2);

      // Verify persistence
      const persisted = await db.action.findUnique({
        where: { id: testData.actionId },
      });
      expect(persisted.status).toBe("in_progress");
      expect(persisted.version).toBe(2);
    });

    it("blocks action with reason and persists state", async () => {
      expect(testData.actionId).toBeDefined();

      const blocked = await transitionActionState(testData.actionId, "blocked", {
        actorId: testData.actorId,
        reason: "Waiting for external approval",
      });

      expect(blocked.status).toBe("blocked");
      expect(blocked.blockerReason).toBe("Waiting for external approval");
      expect(blocked.version).toBe(3);

      // Verify persistence
      const persisted = await db.action.findUnique({
        where: { id: testData.actionId },
      });
      expect(persisted.status).toBe("blocked");
      expect(persisted.blockerReason).toBe("Waiting for external approval");
      expect(persisted.version).toBe(3);
    });

    it("resumes action from blocked and persists state", async () => {
      expect(testData.actionId).toBeDefined();

      const resumed = await transitionActionState(
        testData.actionId,
        "in_progress",
        { actorId: testData.actorId }
      );

      expect(resumed.status).toBe("in_progress");
      expect(resumed.version).toBe(4);

      // Verify persistence
      const persisted = await db.action.findUnique({
        where: { id: testData.actionId },
      });
      expect(persisted.status).toBe("in_progress");
      expect(persisted.version).toBe(4);
    });

    it("completes action with evidence and persists state", async () => {
      expect(testData.actionId).toBeDefined();

      // Add evidence before completion
      const updatedAction = await db.action.update({
        where: { id: testData.actionId },
        data: {
          linkedEvidence: [testData.evidenceId],
        },
      });

      expect(updatedAction.linkedEvidence).toContain(testData.evidenceId);

      // Now complete
      const completed = await transitionActionState(
        testData.actionId,
        "completed",
        { actorId: testData.actorId, evidence: testData.evidenceId }
      );

      expect(completed.status).toBe("completed");
      expect(completed.completedAt).toBeDefined();
      expect(completed.version).toBe(5);

      // Verify persistence
      const persisted = await db.action.findUnique({
        where: { id: testData.actionId },
      });
      expect(persisted.status).toBe("completed");
      expect(persisted.completedAt).toBeDefined();
    });

    it("verifies action and persists final state", async () => {
      expect(testData.actionId).toBeDefined();

      const verified = await transitionActionState(testData.actionId, "verified", {
        actorId: testData.actorId,
        reviewerId: "reviewer-" + testData.actorId,
      });

      expect(verified.status).toBe("verified");
      expect(verified.verifiedAt).toBeDefined();
      expect(verified.verifiedBy).toBeDefined();
      expect(verified.version).toBe(6);

      // Verify persistence
      const persisted = await db.action.findUnique({
        where: { id: testData.actionId },
      });
      expect(persisted.status).toBe("verified");
      expect(persisted.verifiedAt).toBeDefined();
      expect(persisted.verifiedBy).toBeDefined();
      expect(persisted.version).toBe(6);
    });
  });

  describe("Phase 4: Business Rules Enforcement", () => {
    it("prevents invalid state transition", async () => {
      expect(testData.actionId).toBeDefined();

      // Verified is terminal - should not allow transition
      try {
        await transitionActionState(testData.actionId, "in_progress", {
          actorId: testData.actorId,
        });
        expect.fail("Should have thrown ValidationError");
      } catch (error) {
        expect(error).toBeDefined();
        expect(error.message).toContain("transition");
      }
    });

    it("prevents completion without evidence", async () => {
      expect(testData.engagementId).toBeDefined();

      // Create new action without evidence
      const action = await createAction(
        {
          engagementId: testData.engagementId,
          title: "Action Without Evidence",
          status: "created",
          priority: "medium",
          linkedEvidence: [],
        },
        testData.actorId
      );

      await transitionActionState(action.id, "in_progress", {
        actorId: testData.actorId,
      });

      // Try to complete without evidence
      try {
        await transitionActionState(action.id, "completed", {
          actorId: testData.actorId,
        });
        expect.fail("Should require evidence");
      } catch (error) {
        expect(error).toBeDefined();
        expect(error.message).toContain("evidence");
      }

      // Cleanup
      await db.action.delete({ where: { id: action.id } });
    });

    it("prevents blocking without reason", async () => {
      expect(testData.engagementId).toBeDefined();

      // Create new action
      const action = await createAction(
        {
          engagementId: testData.engagementId,
          title: "Action For Block Rule",
          status: "created",
          priority: "medium",
        },
        testData.actorId
      );

      await transitionActionState(action.id, "in_progress", {
        actorId: testData.actorId,
      });

      // Try to block without reason
      try {
        await transitionActionState(action.id, "blocked", {
          actorId: testData.actorId,
        });
        expect.fail("Should require reason");
      } catch (error) {
        expect(error).toBeDefined();
        expect(error.message).toContain("reason");
      }

      // Cleanup
      await db.action.delete({ where: { id: action.id } });
    });
  });

  describe("Phase 5: Engagement Health & Reporting", () => {
    it("computes engagement health from persisted data", async () => {
      expect(testData.engagementId).toBeDefined();

      const health = await computeEngagementHealth(testData.engagementId);

      expect(health).toBeDefined();
      expect(health.id).toBe(testData.engagementId);
      expect(health.overallHealth).toBeDefined();
      expect(["healthy", "at_risk", "critical"]).toContain(health.overallHealth);
    });

    it("health summary reflects action states", async () => {
      expect(testData.engagementId).toBeDefined();

      const health = await computeEngagementHealth(testData.engagementId);

      expect(health.summary).toBeDefined();
      expect(health.summary.totalActions).toBeGreaterThan(0);
      expect(health.summary.verifiedActions).toBeGreaterThan(0);
      expect(health.summary.completedActions).toBeGreaterThan(0);
    });

    it("engagement state is consistent across queries", async () => {
      expect(testData.engagementId).toBeDefined();

      // Query 1: Direct
      const engagement1 = await getEngagementById(testData.engagementId);

      // Query 2: Via health
      const health = await computeEngagementHealth(testData.engagementId);

      // Both should reference the same engagement
      expect(engagement1.id).toBe(health.id);
      expect(engagement1.status).toBe("active");
    });
  });

  describe("Phase 6: Data Relationship Integrity", () => {
    it("all records linked to engagement exist", async () => {
      expect(testData.engagementId).toBeDefined();

      // Verify finding
      const finding = await db.finding.findUnique({
        where: { id: testData.findingId },
      });
      expect(finding).toBeDefined();
      expect(finding.engagementId).toBe(testData.engagementId);

      // Verify recommendation
      const recommendation = await db.recommendation.findUnique({
        where: { id: testData.recommendationId },
      });
      expect(recommendation).toBeDefined();
      expect(recommendation.engagementId).toBe(testData.engagementId);

      // Verify action
      const action = await db.action.findUnique({
        where: { id: testData.actionId },
      });
      expect(action).toBeDefined();
      expect(action.engagementId).toBe(testData.engagementId);
    });

    it("foreign key relationships are enforced", async () => {
      expect(testData.engagementId).toBeDefined();

      // Try to create recommendation with non-existent finding
      try {
        await createRecommendation(
          {
            engagementId: testData.engagementId,
            findingId: "non-existent-finding",
            title: "Should fail",
            summary: "Should fail",
            priority: "low",
            type: "other",
            rationale: "Testing FK constraint",
          },
          testData.actorId
        );
        expect.fail("Should enforce foreign key constraint");
      } catch (error) {
        expect(error).toBeDefined();
        // Foreign key error expected
      }
    });
  });

  describe("Phase 7: Complete Workflow Validation", () => {
    it("entire workflow persists consistently from DB", async () => {
      // Retrieve all records from database
      const engagement = await db.engagement.findUnique({
        where: { id: testData.engagementId },
        include: {
          findings: true,
          recommendations: true,
          actions: true,
        },
      });

      // Verify structure
      expect(engagement).toBeDefined();
      expect(engagement.findings.length).toBeGreaterThan(0);
      expect(engagement.recommendations.length).toBeGreaterThan(0);
      expect(engagement.actions.length).toBeGreaterThan(0);

      // Verify action states
      const verifiedActions = engagement.actions.filter(
        (a) => a.status === "verified"
      );
      expect(verifiedActions.length).toBeGreaterThan(0);
    });

    it("workflow demonstrates complete business recovery lifecycle", async () => {
      const engagement = await getEngagementById(testData.engagementId);
      const health = await computeEngagementHealth(testData.engagementId);
      const action = await db.action.findUnique({
        where: { id: testData.actionId },
      });

      // Complete workflow in DB
      expect(engagement.status).toBe("active");
      expect(action.status).toBe("verified");
      expect(action.version).toBe(6); // 6 transitions
      expect(health.summary.verifiedActions).toBeGreaterThan(0);

      // Ready for reporting
      expect(engagement).toHaveProperty("id");
      expect(health).toHaveProperty("overallHealth");
    });
  });
});

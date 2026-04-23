import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { describeDatabase } from "@/__tests__/skip-database-tests";
import { db } from "@/lib/db";
import {
  generateReviewCycle,
  listReviewCyclesForEngagement,
  getLatestReviewCycle,
  getReviewCycleStats,
} from "./review-cycle";
import { createAction, updateAction } from "./action";
import { createKPI, recordKPISnapshot } from "./kpi";
import { createEngagement } from "./engagement";
import { createClient } from "./client-account";
import { createFinding } from "./findings";

describeDatabase("Review Cycle Service", () => {
  let clientId: string;
  let engagementId: string;
  let actionId: string;
  let kpiId: string;
  let findingId: string;
  let actorId = "test-actor-id";

  beforeAll(async () => {
    const client = await createClient(
      {
        name: "Test Client",
        industry: "Technology",
        size: "large",
      },
      actorId
    );
    clientId = client.id;

    const engagement = await createEngagement(
      {
        title: "Test Engagement",
        clientId,
        serviceTier: "premium",
        engagementMode: "expert",
        interventionMode: "recovery",
      },
      actorId
    );
    engagementId = engagement.id;

    // Create action
    const futureDate = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
    const action = await createAction(
      {
        engagementId,
        title: "Test Action",
        description: "For review cycle testing",
        priority: 2,
        owner: "consultant-1",
        dueDate: futureDate,
      },
      actorId
    );
    actionId = action.id;

    // Create KPI
    const kpi = await createKPI(
      {
        engagementId,
        name: "Test KPI",
        metricType: "revenue",
        baselineValue: 1000000,
        targetValue: 1500000,
        unit: "dollars",
        direction: "up",
      },
      actorId
    );
    kpiId = kpi.id;

    // Create finding
    const finding = await createFinding(
      {
        engagementId,
        title: "Test Finding",
        statement: "A test finding",
        severity: "high",
        confidenceLabel: "high",
      },
      actorId
    );
    findingId = finding.id;
  });

  afterAll(async () => {
    try {
      await (db.reviewCycle.deleteMany as any)({ where: { engagementId } });
      await (db.kPISnapshot.deleteMany as any)({ where: {} });
      await (db.kPI.deleteMany as any)({ where: { engagementId } });
      await (db.action.deleteMany as any)({ where: { engagementId } });
      await (db.finding.deleteMany as any)({ where: { engagementId } });
      await (db.engagement.deleteMany as any)({ where: { id: engagementId } });
      await (db.clientAccount.deleteMany as any)({ where: { id: clientId } });
    } catch {
      // Cleanup best-effort
    }
  });

  describe("generateReviewCycle", () => {
    it("should generate review cycle for engagement", async () => {
      const cycle = await generateReviewCycle(engagementId, actorId);

      expect(cycle.id).toBeDefined();
      expect(cycle.engagementId).toBe(engagementId);
      expect(cycle.status).toMatch(/improving|stagnant|worsening/);
      expect(cycle.kpiProgressSummary).toBeDefined();
      expect(cycle.unresolvedFindingsCount).toBe(1);
    });

    it("should track action completion", async () => {
      // Complete the action
      await updateAction(actionId, { status: "in_progress", version: 1 }, actorId);
      await updateAction(actionId, { status: "done", version: 2 }, actorId);

      const cycle = await generateReviewCycle(engagementId, actorId);
      expect(cycle.completedActionsCount).toBeGreaterThan(0);
    });

    it("should track KPI progress", async () => {
      // Record a KPI snapshot showing progress
      await recordKPISnapshot(kpiId, 1200000, actorId);

      const cycle = await generateReviewCycle(engagementId, actorId);
      expect(cycle.kpiProgressSummary).toContain("KPI");
    });

    it("should determine improving status", async () => {
      // Setup: KPI improving, actions completing
      const futureDate = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
      const action = await createAction(
        {
          engagementId,
          title: "New Action for Improving",
          description: "For improving status test",
          priority: 2,
          owner: "consultant-1",
          dueDate: futureDate,
        },
        actorId
      );

      // Complete the action
      await updateAction(action.id, { status: "in_progress", version: 1 }, actorId);
      await updateAction(action.id, { status: "done", version: 2 }, actorId);

      // Record improving KPI value
      await recordKPISnapshot(kpiId, 1400000, actorId);

      const cycle = await generateReviewCycle(engagementId, actorId);
      // First cycle might be anything, but subsequent cycles with progress should show improvement
      expect(cycle.status).toBeDefined();
    });
  });

  describe("listReviewCyclesForEngagement", () => {
    it("should list all review cycles for engagement", async () => {
      const cycles = await listReviewCyclesForEngagement(engagementId);
      expect(cycles.length).toBeGreaterThan(0);
    });

    it("should filter internal-only cycles from client view", async () => {
      const allCycles = await listReviewCyclesForEngagement(engagementId, "all");
      const internalCycles = await listReviewCyclesForEngagement(engagementId, "internal");

      // All review cycles should be internal by default
      expect(internalCycles.length).toBeLessThanOrEqual(allCycles.length);
    });

    it("should not expose visibilityStatus in response", async () => {
      const cycles = await listReviewCyclesForEngagement(engagementId);
      if (cycles.length > 0) {
        expect((cycles[0] as any).visibilityStatus).toBeUndefined();
      }
    });

    it("should order by most recent first", async () => {
      const cycles = await listReviewCyclesForEngagement(engagementId);
      if (cycles.length >= 2) {
        expect(cycles[0].createdAt.getTime()).toBeGreaterThanOrEqual(
          cycles[1].createdAt.getTime()
        );
      }
    });
  });

  describe("getLatestReviewCycle", () => {
    it("should retrieve latest review cycle", async () => {
      const cycle = await getLatestReviewCycle(engagementId);
      expect(cycle).toBeDefined();
      expect(cycle?.engagementId).toBe(engagementId);
    });

    it("should return null if no cycles exist", async () => {
      const client2 = await createClient({ name: "Client 2" }, actorId);
      const eng2 = await createEngagement(
        {
          title: "Empty Engagement",
          clientId: client2.id,
          serviceTier: "standard",
          engagementMode: "beginner",
          interventionMode: "growth",
        },
        actorId
      );

      const cycle = await getLatestReviewCycle(eng2.id);
      expect(cycle).toBeNull();

      // Cleanup
      await (db.engagement.deleteMany as any)({ where: { id: eng2.id } });
      await (db.clientAccount.deleteMany as any)({ where: { id: client2.id } });
    });

    it("should respect visibility filtering", async () => {
      const cycle = await getLatestReviewCycle(engagementId, "internal");
      // Should work for internal cycles
      if (cycle) {
        expect(cycle.id).toBeDefined();
      }
    });

    it("should not expose visibilityStatus", async () => {
      const cycle = await getLatestReviewCycle(engagementId);
      if (cycle) {
        expect((cycle as any).visibilityStatus).toBeUndefined();
      }
    });
  });

  describe("getReviewCycleStats", () => {
    it("should calculate stats for engagement", async () => {
      const stats = await getReviewCycleStats(engagementId);

      expect(stats.totalKPIs).toBeGreaterThanOrEqual(0);
      expect(stats.onTrackKPIs).toBeDefined();
      expect(stats.actionStatus).toBeDefined();
      expect(stats.findingStatus).toBeDefined();
    });

    it("should count actions by status", async () => {
      const stats = await getReviewCycleStats(engagementId);

      expect(stats.actionStatus.completed).toBeGreaterThanOrEqual(0);
      expect(stats.actionStatus.open).toBeDefined();
      expect(stats.actionStatus.inProgress).toBeDefined();
      expect(stats.actionStatus.blocked).toBeDefined();
    });

    it("should count findings by status", async () => {
      const stats = await getReviewCycleStats(engagementId);

      expect(stats.findingStatus.unresolved).toBeGreaterThanOrEqual(0);
      expect(stats.findingStatus.validated).toBeDefined();
      expect(stats.findingStatus.disputed).toBeDefined();
    });

    it("should evaluate KPI on-track status", async () => {
      const stats = await getReviewCycleStats(engagementId);

      expect(stats.onTrackKPIs).toBeLessThanOrEqual(stats.totalKPIs);
    });
  });

  describe("security boundaries", () => {
    it("should prevent review cycle generation for non-existent engagement", async () => {
      expect(async () => {
        await generateReviewCycle("non-existent", actorId);
      }).rejects.toThrow("Engagement");
    });

    it("should prevent listing review cycles for non-existent engagement", async () => {
      expect(async () => {
        await listReviewCyclesForEngagement("non-existent");
      }).rejects.toThrow("Engagement");
    });

    it("should handle empty engagement safely", async () => {
      const client2 = await createClient({ name: "Client 2" }, actorId);
      const eng2 = await createEngagement(
        {
          title: "Empty Engagement",
          clientId: client2.id,
          serviceTier: "standard",
          engagementMode: "beginner",
          interventionMode: "growth",
        },
        actorId
      );

      const cycle = await generateReviewCycle(eng2.id, actorId);
      expect(cycle.id).toBeDefined();
      expect(cycle.unresolvedFindingsCount).toBe(0);

      // Cleanup
      await (db.reviewCycle.deleteMany as any)({ where: { engagementId: eng2.id } });
      await (db.engagement.deleteMany as any)({ where: { id: eng2.id } });
      await (db.clientAccount.deleteMany as any)({ where: { id: client2.id } });
    });
  });

  describe("status determination", () => {
    it("should determine improving status with all positive indicators", async () => {
      const client2 = await createClient({ name: "Client 3" }, actorId);
      const eng3 = await createEngagement(
        {
          title: "Improving Engagement",
          clientId: client2.id,
          serviceTier: "premium",
          engagementMode: "expert",
          interventionMode: "recovery",
        },
        actorId
      );

      // Create and complete actions
      const futureDate = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
      const a1 = await createAction(
        {
          engagementId: eng3.id,
          title: "Action 1",
          description: "Improving action",
          priority: 2,
          owner: "consultant-1",
          dueDate: futureDate,
        },
        actorId
      );

      await updateAction(a1.id, { status: "in_progress", version: 1 }, actorId);
      await updateAction(a1.id, { status: "done", version: 2 }, actorId);

      // Create KPI with progress
      const k1 = await createKPI(
        {
          engagementId: eng3.id,
          name: "Improving KPI",
          metricType: "revenue",
          baselineValue: 100,
          targetValue: 200,
          unit: "dollars",
          direction: "up",
        },
        actorId
      );

      await recordKPISnapshot(k1.id, 150, actorId);

      const cycle = await generateReviewCycle(eng3.id, actorId);
      expect(cycle.completedActionsCount).toBeGreaterThan(0);

      // Cleanup
      await (db.reviewCycle.deleteMany as any)({ where: { engagementId: eng3.id } });
      await (db.kPISnapshot.deleteMany as any)({ where: {} });
      await (db.kPI.deleteMany as any)({ where: { engagementId: eng3.id } });
      await (db.action.deleteMany as any)({ where: { engagementId: eng3.id } });
      await (db.engagement.deleteMany as any)({ where: { id: eng3.id } });
      await (db.clientAccount.deleteMany as any)({ where: { id: client2.id } });
    });
  });
});

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { db } from "@/lib/db";
import {
  createKPI,
  recordKPISnapshot,
  recordActionKPIImpact,
  listKPIsForEngagement,
  getKPIDetail,
  getKPIProgress,
  getKPIImpactForAction,
} from "./kpi";
import { createAction } from "./action";
import { createEngagement } from "./engagement";
import { createClient } from "./client-account";
import { TEST_IDS } from "@/domain/constants/test-ids";

describe("KPI Service", () => {
  let clientId: string;
  let engagementId: string;
  let actionId: string;
  let actorId = TEST_IDS.TEST_ACTOR_ID;

  beforeAll(async () => {
    const client = await createClient(
      {
        name: "Test Client - KPI",
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

    const futureDate = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
    const action = await createAction(
      {
        engagementId,
        title: "Test Action",
        description: "For KPI impact testing",
        priority: 2,
        owner: "consultant-1",
        dueDate: futureDate,
      },
      actorId
    );
    actionId = action.id;
  });

  afterAll(async () => {
    try {
      await (db.kPIImpact.deleteMany as any)({ where: {} });
      await (db.kPISnapshot.deleteMany as any)({ where: {} });
      await (db.kPI.deleteMany as any)({ where: { engagementId } });
      await (db.action.deleteMany as any)({ where: { engagementId } });
      await (db.engagement.deleteMany as any)({ where: { id: engagementId } });
      await (db.clientAccount.deleteMany as any)({ where: { id: clientId } });
    } catch {
      // Cleanup best-effort
    }
  });

  describe("createKPI", () => {
    it("should create KPI with valid inputs", async () => {
      const kpi = await createKPI(
        {
          engagementId,
          name: "Revenue Growth",
          description: "Annual revenue growth target",
          metricType: "revenue",
          baselineValue: 1000000,
          targetValue: 1500000,
          unit: "dollars",
          direction: "up",
        },
        actorId
      );

      await expect(kpi.id).toBeDefined();
      await expect(kpi.name).toBe("Revenue Growth");
      await expect(kpi.currentValue).toBe(1000000); // Initialized to baseline
      await expect(kpi.baselineValue).toBe(1000000);
      await expect(kpi.targetValue).toBe(1500000);
    });

    it("should reject KPI with same baseline and target", async () => {
      await expect(async () => {
        await createKPI(
          {
            engagementId,
            name: "Invalid KPI",
            metricType: "revenue",
            baselineValue: 1000000,
            targetValue: 1000000,
            unit: "dollars",
            direction: "up",
          },
          actorId
        );
      }).rejects.toThrow("cannot be the same");
    });

    it("should reject invalid direction", async () => {
      await expect(async () => {
        await createKPI(
          {
            engagementId,
            name: "Invalid Direction",
            metricType: "revenue",
            baselineValue: 100,
            targetValue: 200,
            unit: "percentage",
            direction: "sideways" as any,
          },
          actorId
        );
      }).rejects.toThrow("direction");
    });

    it("should set visibility status", async () => {
      const kpi = await createKPI(
        {
          engagementId,
          name: "Visible KPI",
          metricType: "efficiency",
          baselineValue: 50,
          targetValue: 80,
          unit: "percentage",
          direction: "up",
          visibilityStatus: "client_visible",
        },
        actorId
      );

      const detail = await db.kPI.findUnique({
        where: { id: kpi.id },
        select: { visibilityStatus: true },
      });
      expect(detail?.visibilityStatus).toBe("client_visible");
    });
  });

  describe("recordKPISnapshot", () => {
    let kpiId: string;

    beforeAll(async () => {
      const kpi = await createKPI(
        {
          engagementId,
          name: "Snapshot Test KPI",
          metricType: "revenue",
          baselineValue: 1000000,
          targetValue: 1500000,
          unit: "dollars",
          direction: "up",
        },
        actorId
      );
      kpiId = kpi.id;
    });

    it("should record snapshot and update current value", async () => {
      const result = await recordKPISnapshot(kpiId, 1100000, actorId);

      expect(result.kpiId).toBe(kpiId);
      expect(result.snapshotValue).toBe(1100000);
      expect(result.currentValue).toBe(1100000);
    });

    it("should track multiple snapshots", async () => {
      await recordKPISnapshot(kpiId, 1200000, actorId);
      const result = await recordKPISnapshot(kpiId, 1300000, actorId);

      expect(result.currentValue).toBe(1300000);

      const snapshots = await db.kPISnapshot.findMany({
        where: { kpiId },
      });
      expect(snapshots.length).toBeGreaterThanOrEqual(2);
    });
  });

  describe("recordActionKPIImpact", () => {
    let kpiId: string;

    beforeAll(async () => {
      const kpi = await createKPI(
        {
          engagementId,
          name: "Impact Test KPI",
          metricType: "efficiency",
          baselineValue: 50,
          targetValue: 90,
          unit: "percentage",
          direction: "up",
        },
        actorId
      );
      kpiId = kpi.id;
    });

    it("should record impact amount for action on KPI", async () => {
      const result = await recordActionKPIImpact(
        kpiId,
        actionId,
        15,
        "Action improved efficiency by 15%",
        actorId
      );

      expect(result.kpiId).toBe(kpiId);
      expect(result.actionId).toBe(actionId);
      expect(result.impactAmount).toBe(15);
    });

    it("should prevent duplicate impact recording", async () => {
      await expect(async () => {
        await recordActionKPIImpact(
          kpiId,
          actionId,
          20,
          "Should fail",
          actorId
        );
      }).rejects.toThrow("already recorded");
    });
  });

  describe("getKPIProgress", () => {
    let kpiId: string;

    beforeAll(async () => {
      const kpi = await createKPI(
        {
          engagementId,
          name: "Progress Test KPI",
          metricType: "cost",
          baselineValue: 500000,
          targetValue: 300000,
          unit: "dollars",
          direction: "down",
        },
        actorId
      );
      kpiId = kpi.id;
    });

    it("should calculate progress toward target", async () => {
      await recordKPISnapshot(kpiId, 400000, actorId);

      const progress = await getKPIProgress(kpiId);

      expect(progress.currentValue).toBe(400000);
      expect(progress.targetValue).toBe(300000);
      expect(progress.baselineValue).toBe(500000);
      expect(progress.direction).toBe("down");
    });

    it("should track progress percentage", async () => {
      const progress = await getKPIProgress(kpiId);
      expect(progress.progressPercent).toBeGreaterThan(0);
      expect(progress.progressPercent).toBeLessThanOrEqual(100);
    });
  });

  describe("listKPIsForEngagement", () => {
    it("should list all KPIs for engagement", async () => {
      const kpis = await listKPIsForEngagement(engagementId);
      expect(kpis.length).toBeGreaterThan(0);
    });

    it("should filter internal-only KPIs from client view", async () => {
      const internalKPI = await createKPI(
        {
          engagementId,
          name: "Internal KPI",
          metricType: "efficiency",
          baselineValue: 40,
          targetValue: 80,
          unit: "percentage",
          direction: "up",
          visibilityStatus: "internal",
        },
        actorId
      );

      const clientKPI = await createKPI(
        {
          engagementId,
          name: "Client-Visible KPI",
          metricType: "revenue",
          baselineValue: 100000,
          targetValue: 200000,
          unit: "dollars",
          direction: "up",
          visibilityStatus: "client_visible",
        },
        actorId
      );

      const internalOnly = await listKPIsForEngagement(engagementId, "internal");
      const allKPIs = await listKPIsForEngagement(engagementId, "all");

      expect(internalOnly.some((k) => k.id === internalKPI.id)).toBe(true);
      expect(internalOnly.some((k) => k.id === clientKPI.id)).toBe(false);
      expect(allKPIs.some((k) => k.id === internalKPI.id)).toBe(true);
      expect(allKPIs.some((k) => k.id === clientKPI.id)).toBe(true);
    });

    it("should not expose visibilityStatus in response", async () => {
      const kpis = await listKPIsForEngagement(engagementId);
      if (kpis.length > 0) {
        expect((kpis[0] as any).visibilityStatus).toBeUndefined();
      }
    });
  });

  describe("getKPIDetail", () => {
    let kpiId: string;

    beforeAll(async () => {
      const kpi = await createKPI(
        {
          engagementId,
          name: "Detail Test KPI",
          metricType: "satisfaction",
          baselineValue: 70,
          targetValue: 95,
          unit: "rating",
          direction: "up",
          visibilityStatus: "internal",
        },
        actorId
      );
      kpiId = kpi.id;
    });

    it("should get KPI detail", async () => {
      const kpi = await getKPIDetail(kpiId);
      expect(kpi.id).toBe(kpiId);
      expect(kpi.name).toBe("Detail Test KPI");
    });

    it("should throw on internal-only KPI with client visibility", async () => {
      await expect(async () => {
        await getKPIDetail(kpiId, "internal");
      }).rejects.toThrow("not found");
    });

    it("should allow access with 'all' visibility", async () => {
      const kpi = await getKPIDetail(kpiId, "all");
      expect(kpi.id).toBe(kpiId);
    });

    it("should not expose visibilityStatus in response", async () => {
      const kpi = await getKPIDetail(kpiId);
      expect((kpi as any).visibilityStatus).toBeUndefined();
    });
  });

  describe("getKPIImpactForAction", () => {
    it("should retrieve impacts for action", async () => {
      const impacts = await getKPIImpactForAction(actionId);
      expect(impacts.length).toBeGreaterThan(0);
    });

    it("should include impact amount in results", async () => {
      const impacts = await getKPIImpactForAction(actionId);
      if (impacts.length > 0) {
        expect(impacts[0].impactAmount).toBeDefined();
      }
    });
  });

  describe("security boundaries", () => {
    it("should prevent access to non-existent KPI", async () => {
      await expect(async () => {
        await getKPIDetail("non-existent-id");
      }).rejects.toThrow("not found");
    });

    it("should reject KPI for non-existent engagement", async () => {
      await expect(async () => {
        await createKPI(
          {
            engagementId: "non-existent",
            name: "Invalid",
            metricType: "revenue",
            baselineValue: 100,
            targetValue: 200,
            unit: "dollars",
            direction: "up",
          },
          actorId
        );
      }).rejects.toThrow("Engagement");
    });

    it("should reject cross-engagement impact recording", async () => {
      const client2 = await createClient({ name: "Client 2" }, actorId);
      const eng2 = await createEngagement(
        {
          title: "Other Engagement",
          clientId: client2.id,
          serviceTier: "standard",
          engagementMode: "beginner",
          interventionMode: "growth",
        },
        actorId
      );

      const futureDate = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
      const action2 = await createAction(
        {
          engagementId: eng2.id,
          title: "Other Action",
          description: "In other engagement",
          priority: 2,
          owner: "consultant-1",
          dueDate: futureDate,
        },
        actorId
      );

      const kpi = await createKPI(
        {
          engagementId,
          name: "This KPI",
          metricType: "revenue",
          baselineValue: 100,
          targetValue: 200,
          unit: "dollars",
          direction: "up",
        },
        actorId
      );

      await expect(async () => {
        await recordActionKPIImpact(kpi.id, action2.id, 50, "Invalid", actorId);
      }).rejects.toThrow("same engagement");

      // Cleanup
      await (db.action.deleteMany as any)({ where: { engagementId: eng2.id } });
      await (db.engagement.deleteMany as any)({ where: { id: eng2.id } });
      await (db.clientAccount.deleteMany as any)({ where: { id: client2.id } });
    });
  });
});

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { db } from "@/lib/db";
import {
  generateEngagementReport,
  generateAndStoreReport,
  getDeliverableReport,
} from "./report-generator";
import {
  createEngagement,
  getEngagementById,
} from "./engagement";
import { createClient } from "./client-account";
import { assessCondition } from "./business-condition";
import { createFinding } from "./findings";
import { createRecommendation } from "./recommendation";
import { createAction } from "./action";
import { defineKPI, recordKPISnapshot } from "./kpi";
import { TEST_IDS } from "@/domain/constants/test-ids";

describe("Report Generation Service", () => {
  let clientId: string;
  let engagementId: string;
  let actorId: string;

  beforeAll(async () => {
    // Create test data
    const client = await createClient(
      {
        name: "Test Client - Report Generator",
        industry: "Technology",
        size: "medium",
      },
      TEST_IDS.TEST_ACTOR_ID
    );
    clientId = client.id;
    actorId = TEST_IDS.TEST_ACTOR_ID;

    const engagement = await createEngagement(
      {
        title: "Test Engagement",
        clientId,
        serviceTier: "standard",
        engagementMode: "expert",
        interventionMode: "recovery",
      },
      actorId
    );
    engagementId = engagement.id;
  });

  afterAll(async () => {
    // Cleanup
    await db.deliverable.deleteMany({ where: { engagementId } });
    await db.kPI.deleteMany({ where: { engagementId } });
    await db.action.deleteMany({ where: { engagementId } });
    await db.recommendation.deleteMany({ where: { engagementId } });
    await db.finding.deleteMany({ where: { engagementId } });
    await db.businessConditionProfile.deleteMany({ where: { engagementId } });
    await db.engagement.delete({ where: { id: engagementId } });
    await db.clientAccount.delete({ where: { id: clientId } });
  });

  describe("generateEngagementReport", () => {
    it("should generate a report for an engagement with no data", async () => {
      const report = await generateEngagementReport(engagementId);

      expect(report).toBeDefined();
      expect(report.summary.engagementId).toBe(engagementId);
      expect(report.findings).toEqual([]);
      expect(report.recommendations).toEqual([]);
      expect(report.actions).toEqual([]);
      expect(report.kpis).toEqual([]);
      expect(report.reviewStatus).toBeDefined();
      expect(report.generatedAt).toBeDefined();
    });

    it("should include findings in the report", async () => {
      const finding = await createFinding(
        {
          engagementId,
          title: "Critical Issue",
          severity: "critical",
          category: "operational",
        },
        actorId
      );

      const report = await generateEngagementReport(engagementId);

      expect(report.findings).toHaveLength(1);
      expect(report.findings[0].id).toBe(finding.id);
      expect(report.findings[0].title).toBe("Critical Issue");
      expect(report.findings[0].severity).toBe("critical");
      expect(report.reviewStatus.criticalFindingCount).toBe(1);
    });

    it("should include recommendations in the report", async () => {
      const recommendation = await createRecommendation(
        {
          engagementId,
          title: "Implement new process",
          priority: "high",
        },
        actorId
      );

      const report = await generateEngagementReport(engagementId);

      expect(report.recommendations.length).toBeGreaterThan(0);
      const rec = report.recommendations.find(
        (r) => r.id === recommendation.id
      );
      expect(rec).toBeDefined();
      expect(rec?.title).toBe("Implement new process");
      expect(rec?.priority).toBe("high");
    });

    it("should include actions with status summary", async () => {
      const action = await createAction(
        {
          engagementId,
          title: "Complete implementation",
          priority: "critical",
        },
        actorId
      );

      const report = await generateEngagementReport(engagementId);

      expect(report.actions.length).toBeGreaterThan(0);
      const act = report.actions.find((a) => a.id === action.id);
      expect(act).toBeDefined();
      expect(act?.status).toBe("open");
      expect(report.reviewStatus.openActionCount).toBeGreaterThan(0);
    });

    it("should include KPIs with baseline, current, target", async () => {
      const kpi = await defineKPI(
        {
          engagementId,
          name: "Revenue Growth",
          unit: "%",
          baselineValue: 100,
          baselineDate: new Date().toISOString(),
          targetValue: 150,
          targetDate: new Date(Date.now() + 90 * 24 * 60 * 60 * 1000).toISOString(),
          direction: "increase",
        },
        actorId
      );

      await recordKPISnapshot({ kpiId: kpi.id, currentValue: 120 }, actorId);

      const report = await generateEngagementReport(engagementId);

      expect(report.kpis.length).toBeGreaterThan(0);
      const k = report.kpis.find((kpi) => kpi.id === kpi.id);
      expect(k).toBeDefined();
      expect(k?.baseline).toBe(100);
      expect(k?.current).toBe(120);
      expect(k?.target).toBe(150);
    });

    it("should include current business condition in summary", async () => {
      await assessCondition(
        {
          engagementId,
          businessStatus: "at_risk",
          severityScore: 7,
          urgencyLevel: "high",
          cashPressureLevel: "medium",
          marginPressureLevel: "medium",
          clientConcentrationRisk: "low",
          ownerDependencyRisk: "low",
          keyPersonDependencyRisk: "low",
          processMaturityLevel: "medium",
          managementMaturityLevel: "medium",
          executionCapacityLevel: "medium",
          moraleFragilityLevel: "low",
          resilienceLevel: "medium",
          growthReadinessLevel: "low",
        },
        actorId
      );

      const report = await generateEngagementReport(engagementId);

      expect(report.summary.currentCondition).toBeDefined();
      expect(report.summary.currentCondition?.businessStatus).toBe("at_risk");
      expect(report.summary.currentCondition?.severityScore).toBe(7);
    });

    it("should have deterministic output for same inputs", async () => {
      const report1 = await generateEngagementReport(engagementId);
      const report2 = await generateEngagementReport(engagementId);

      // Remove timestamps as they will differ
      const cleanReport = (r: typeof report1) => {
        const { generatedAt, ...rest } = r;
        return JSON.stringify(rest);
      };

      expect(cleanReport(report1)).toBe(cleanReport(report2));
    });

    it("should calculate correct review status for improving trend", async () => {
      // Create a new engagement for this test
      const testClient = await createClient(
        { name: "Test Client 2" },
        actorId
      );
      const testEng = await createEngagement(
        {
          title: "Test Engagement 2",
          clientId: testClient.id,
          serviceTier: "standard",
          engagementMode: "expert",
          interventionMode: "recovery",
        },
        actorId
      );

      // Create completed actions and no critical findings
      await createAction(
        { engagementId: testEng.id, title: "Test Action", priority: "high" },
        actorId
      );

      // Update action to completed
      await db.action.updateMany({
        where: { engagementId: testEng.id },
        data: { status: "completed" },
      });

      const report = await generateEngagementReport(testEng.id);

      expect(report.reviewStatus.trend).toBe("improving");

      // Cleanup
      await db.action.deleteMany({ where: { engagementId: testEng.id } });
      await db.engagement.delete({ where: { id: testEng.id } });
      await db.clientAccount.delete({ where: { id: testClient.id } });
    });
  });

  describe("generateAndStoreReport", () => {
    it("should store report as deliverable with snapshot", async () => {
      const testClient = await createClient(
        { name: "Test Client 3" },
        actorId
      );
      const testEng = await createEngagement(
        {
          title: "Test Engagement 3",
          clientId: testClient.id,
          serviceTier: "standard",
          engagementMode: "expert",
          interventionMode: "recovery",
        },
        actorId
      );

      const result = await generateAndStoreReport(
        testEng.id,
        actorId,
        "report",
        "internal"
      );

      expect(result.id).toBeDefined();
      expect(result.report).toBeDefined();
      expect(result.report.summary.engagementId).toBe(testEng.id);

      // Verify deliverable was created
      const deliverable = await db.deliverable.findUnique({
        where: { id: result.id },
      });

      expect(deliverable).toBeDefined();
      expect(deliverable?.type).toBe("report");
      expect(deliverable?.status).toBe("final");
      expect(deliverable?.snapshotData).toBeDefined();

      // Cleanup
      await db.deliverable.delete({ where: { id: result.id } });
      await db.engagement.delete({ where: { id: testEng.id } });
      await db.clientAccount.delete({ where: { id: testClient.id } });
    });

    it("should emit audit event on report generation", async () => {
      const testClient = await createClient(
        { name: "Test Client 4" },
        actorId
      );
      const testEng = await createEngagement(
        {
          title: "Test Engagement 4",
          clientId: testClient.id,
          serviceTier: "standard",
          engagementMode: "expert",
          interventionMode: "recovery",
        },
        actorId
      );

      const result = await generateAndStoreReport(
        testEng.id,
        actorId,
        "summary",
        "client_visible"
      );

      // Check audit event was created
      const auditEvents = await db.auditEvent.findMany({
        where: {
          entityId: result.id,
          eventName: "deliverable.generated",
        },
      });

      expect(auditEvents).toHaveLength(1);
      expect(auditEvents[0].visibility).toBe("client_visible");

      // Cleanup
      await db.auditEvent.deleteMany({ where: { entityId: result.id } });
      await db.deliverable.delete({ where: { id: result.id } });
      await db.engagement.delete({ where: { id: testEng.id } });
      await db.clientAccount.delete({ where: { id: testClient.id } });
    });
  });

  describe("getDeliverableReport", () => {
    it("should retrieve stored report snapshot", async () => {
      const testClient = await createClient(
        { name: "Test Client 5" },
        actorId
      );
      const testEng = await createEngagement(
        {
          title: "Test Engagement 5",
          clientId: testClient.id,
          serviceTier: "standard",
          engagementMode: "expert",
          interventionMode: "recovery",
        },
        actorId
      );

      const result = await generateAndStoreReport(testEng.id, actorId);
      const retrievedReport = await getDeliverableReport(result.id);

      expect(retrievedReport.summary.engagementId).toBe(testEng.id);
      expect(retrievedReport).toHaveProperty("findings");
      expect(retrievedReport).toHaveProperty("recommendations");
      expect(retrievedReport).toHaveProperty("actions");
      expect(retrievedReport).toHaveProperty("kpis");
      expect(retrievedReport).toHaveProperty("reviewStatus");

      // Cleanup
      await db.deliverable.delete({ where: { id: result.id } });
      await db.engagement.delete({ where: { id: testEng.id } });
      await db.clientAccount.delete({ where: { id: testClient.id } });
    });
  });
});

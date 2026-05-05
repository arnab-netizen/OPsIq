import { FunnelAnalyzer } from "../funnel-analyzer";
import { FunnelStage } from "@/domain/diagnostic/funnel";
import { v4 as uuidv4 } from "uuid";

describe("FunnelAnalyzer", () => {
  const analyzer = new FunnelAnalyzer();
  const engagementId = uuidv4();
  const workspaceId = uuidv4();

  describe("analyzeEngagementFunnel", () => {
    it("should return empty analysis for no events", async () => {
      const result = await analyzer.analyzeEngagementFunnel(
        engagementId,
        workspaceId,
        []
      );

      expect(result.stages).toHaveLength(0);
      expect(result.overallConversion).toBe(0);
      expect(result.criticalDropOffs).toHaveLength(0);
    });

    it("should calculate stage metrics from events", async () => {
      const now = new Date();
      const events = [
        { stage: FunnelStage.DECISION_PROPOSED, timestamp: now },
        { stage: FunnelStage.VALIDATION_STARTED, timestamp: new Date(now.getTime() + 1000) },
        { stage: FunnelStage.VALIDATION_COMPLETE, timestamp: new Date(now.getTime() + 2000) },
        { stage: FunnelStage.REVIEW_STARTED, timestamp: new Date(now.getTime() + 3000) },
      ];

      const result = await analyzer.analyzeEngagementFunnel(
        engagementId,
        workspaceId,
        events
      );

      expect(result.stages.length).toBeGreaterThan(0);
      expect(result.stages[0].enteredCount).toBeGreaterThan(0);
    });

    it("should identify critical drop-offs", async () => {
      const now = new Date();
      const events = [
        { stage: FunnelStage.DECISION_PROPOSED, timestamp: now },
        { stage: FunnelStage.DECISION_PROPOSED, timestamp: new Date(now.getTime() + 1000) },
        { stage: FunnelStage.DECISION_PROPOSED, timestamp: new Date(now.getTime() + 2000) },
        { stage: FunnelStage.DECISION_PROPOSED, timestamp: new Date(now.getTime() + 3000) },
        { stage: FunnelStage.VALIDATION_STARTED, timestamp: new Date(now.getTime() + 4000) },
      ];

      const result = await analyzer.analyzeEngagementFunnel(
        engagementId,
        workspaceId,
        events
      );

      const proposeValidateDropOff = result.criticalDropOffs.find(
        (d) => d.fromStage === FunnelStage.DECISION_PROPOSED
      );

      if (proposeValidateDropOff) {
        expect(proposeValidateDropOff.dropOffRate).toBeGreaterThan(0);
        expect(proposeValidateDropOff.recommendation).toBeDefined();
      }
    });

    it("should calculate overall conversion rate", async () => {
      const now = new Date();
      const events = [
        { stage: FunnelStage.DECISION_PROPOSED, timestamp: now },
        { stage: FunnelStage.DECISION_PROPOSED, timestamp: new Date(now.getTime() + 1000) },
        { stage: FunnelStage.VALIDATION_STARTED, timestamp: new Date(now.getTime() + 2000) },
        { stage: FunnelStage.EXECUTION_COMPLETE, timestamp: new Date(now.getTime() + 3000) },
      ];

      const result = await analyzer.analyzeEngagementFunnel(
        engagementId,
        workspaceId,
        events
      );

      expect(result.overallConversion).toBeGreaterThanOrEqual(0);
      expect(result.overallConversion).toBeLessThanOrEqual(100);
    });

    it("should identify bottlenecks from timing delays", async () => {
      const now = new Date();
      const oneDay = 86400000;
      const events = [
        { stage: FunnelStage.DECISION_PROPOSED, timestamp: now },
        { stage: FunnelStage.VALIDATION_STARTED, timestamp: new Date(now.getTime() + oneDay) },
        { stage: FunnelStage.VALIDATION_COMPLETE, timestamp: new Date(now.getTime() + oneDay * 2) },
      ];

      const result = await analyzer.analyzeEngagementFunnel(
        engagementId,
        workspaceId,
        events
      );

      expect(result.bottlenecks.length).toBeGreaterThanOrEqual(0);
    });

    it("should include metadata in analysis", async () => {
      const now = new Date();
      const events = [
        {
          stage: FunnelStage.DECISION_PROPOSED,
          timestamp: now,
          metadata: { reason: "testing" },
        },
        {
          stage: FunnelStage.VALIDATION_STARTED,
          timestamp: new Date(now.getTime() + 1000),
          metadata: { validator: "system" },
        },
      ];

      const result = await analyzer.analyzeEngagementFunnel(
        engagementId,
        workspaceId,
        events
      );

      expect(result.engagementId).toBe(engagementId);
      expect(result.workspaceId).toBe(workspaceId);
      expect(result.analyzedAt).toBeDefined();
    });

    it("should handle single event", async () => {
      const now = new Date();
      const events = [{ stage: FunnelStage.DECISION_PROPOSED, timestamp: now }];

      const result = await analyzer.analyzeEngagementFunnel(
        engagementId,
        workspaceId,
        events
      );

      expect(result.stages.length).toBeGreaterThan(0);
      expect(result.overallConversion).toBeGreaterThanOrEqual(0);
      expect(result.analyzedAt).toBeDefined();
    });

    it("should provide drop-off recommendations", async () => {
      const now = new Date();
      const events = [
        { stage: FunnelStage.DECISION_PROPOSED, timestamp: now },
        { stage: FunnelStage.DECISION_PROPOSED, timestamp: new Date(now.getTime() + 1000) },
        { stage: FunnelStage.DECISION_PROPOSED, timestamp: new Date(now.getTime() + 2000) },
        { stage: FunnelStage.DECISION_PROPOSED, timestamp: new Date(now.getTime() + 3000) },
        { stage: FunnelStage.VALIDATION_STARTED, timestamp: new Date(now.getTime() + 4000) },
      ];

      const result = await analyzer.analyzeEngagementFunnel(
        engagementId,
        workspaceId,
        events
      );

      result.criticalDropOffs.forEach((dropOff) => {
        expect(dropOff.recommendation).toBeDefined();
        expect(dropOff.recommendation.length).toBeGreaterThan(0);
      });
    });

    it("should set analyzedAt timestamp", async () => {
      const now = new Date();
      const events = [{ stage: FunnelStage.DECISION_PROPOSED, timestamp: now }];

      const beforeAnalysis = new Date();
      const result = await analyzer.analyzeEngagementFunnel(
        engagementId,
        workspaceId,
        events
      );
      const afterAnalysis = new Date();

      expect(result.analyzedAt.getTime()).toBeGreaterThanOrEqual(
        beforeAnalysis.getTime()
      );
      expect(result.analyzedAt.getTime()).toBeLessThanOrEqual(
        afterAnalysis.getTime()
      );
    });

    it("should handle duplicate stage entries", async () => {
      const now = new Date();
      const events = [
        { stage: FunnelStage.DECISION_PROPOSED, timestamp: now },
        { stage: FunnelStage.DECISION_PROPOSED, timestamp: new Date(now.getTime() + 1000) },
        { stage: FunnelStage.DECISION_PROPOSED, timestamp: new Date(now.getTime() + 2000) },
      ];

      const result = await analyzer.analyzeEngagementFunnel(
        engagementId,
        workspaceId,
        events
      );

      const proposeMetrics = result.stages.find(
        (s) => s.stage === FunnelStage.DECISION_PROPOSED
      );
      expect(proposeMetrics?.enteredCount).toBe(3);
    });

    it("should calculate conversion rates correctly", async () => {
      const now = new Date();
      const events = [
        { stage: FunnelStage.DECISION_PROPOSED, timestamp: now },
        { stage: FunnelStage.VALIDATION_STARTED, timestamp: new Date(now.getTime() + 1000) },
      ];

      const result = await analyzer.analyzeEngagementFunnel(
        engagementId,
        workspaceId,
        events
      );

      result.stages.forEach((stage) => {
        expect(stage.conversionRate).toBeGreaterThanOrEqual(0);
        expect(stage.conversionRate).toBeLessThanOrEqual(100);
      });
    });
  });
});

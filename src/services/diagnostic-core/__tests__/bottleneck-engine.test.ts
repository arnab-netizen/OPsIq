import { BottleneckEngine } from "../bottleneck-engine";
import { v4 as uuidv4 } from "uuid";

describe("BottleneckEngine (STRICT CONSTRAINT MODE)", () => {
  const engine = new BottleneckEngine();
  const engagementId = uuidv4();
  const workspaceId = uuidv4();

  describe("Data Sufficiency Gate (FAIL CLOSED)", () => {
    it("should FAIL on insufficient metrics (< 2)", async () => {
      const result = await engine.analyzeBottleneck(
        engagementId,
        workspaceId,
        { utilization_pct: 85 }, // Only 1 metric
        {
          baseline: { value: 80, timestamp: new Date(Date.now() - 86400000) },
          current: { value: 85, timestamp: new Date() },
        },
        { revenue: 1000000 }
      );

      expect(result).toBeNull();
    });

    it("should FAIL on insufficient timeline data (< 2)", async () => {
      const result = await engine.analyzeBottleneck(
        engagementId,
        workspaceId,
        {
          utilization_pct: 85,
          conversion_rate: 0.25,
        },
        {
          baseline: { value: 80, timestamp: new Date(Date.now() - 86400000) }, // Only 1 point
        },
        { revenue: 1000000 }
      );

      expect(result).toBeNull();
    });

    it("should FAIL on missing affected KPIs", async () => {
      const result = await engine.analyzeBottleneck(
        engagementId,
        workspaceId,
        {
          utilization_pct: 85,
          conversion_rate: 0.25,
        },
        {
          baseline: { value: 80, timestamp: new Date(Date.now() - 86400000) },
          current: { value: 85, timestamp: new Date() },
        },
        {} // No KPIs
      );

      expect(result).toBeNull();
    });
  });

  describe("Bottleneck Identification (STRICT)", () => {
    const validMetrics = {
      utilization_pct: 85,
      conversion_rate: 0.25,
      cost_per_unit: 60,
      cycle_time_days: 35,
      defect_rate_pct: 6,
    };
    const validTimeline = {
      baseline: {
        value: 70,
        timestamp: new Date(Date.now() - 86400000 * 7),
      },
      current: {
        value: 85,
        timestamp: new Date(),
      },
    };
    const validKpis = {
      revenue: 1000000,
      throughput: 5000,
    };

    it("should identify capacity bottleneck", async () => {
      const result = await engine.analyzeBottleneck(
        engagementId,
        workspaceId,
        validMetrics,
        validTimeline,
        validKpis
      );

      expect(result).not.toBeNull();
      if (result) {
        const capacityBottleneck = result.alternativeBottlenecks.find(
          (b) => b.constraintType === "capacity"
        );
        expect(capacityBottleneck).toBeDefined();
      }
    });

    it("should identify conversion bottleneck", async () => {
      const result = await engine.analyzeBottleneck(
        engagementId,
        workspaceId,
        validMetrics,
        validTimeline,
        validKpis
      );

      expect(result).not.toBeNull();
      if (result) {
        const allBottlenecks = [
          result.primaryBottleneck,
          ...result.alternativeBottlenecks,
        ];
        const conversionBottleneck = allBottlenecks.find(
          (b) => b.constraintType === "conversion"
        );
        expect(conversionBottleneck).toBeDefined();
      }
    });

    it("should identify cost bottleneck", async () => {
      const result = await engine.analyzeBottleneck(
        engagementId,
        workspaceId,
        validMetrics,
        validTimeline,
        validKpis
      );

      expect(result).not.toBeNull();
      if (result) {
        const costBottleneck = result.alternativeBottlenecks.find(
          (b) => b.constraintType === "cost"
        );
        expect(costBottleneck).toBeDefined();
      }
    });

    it("should identify time bottleneck", async () => {
      const result = await engine.analyzeBottleneck(
        engagementId,
        workspaceId,
        validMetrics,
        validTimeline,
        validKpis
      );

      expect(result).not.toBeNull();
      if (result) {
        const timeBottleneck = result.alternativeBottlenecks.find(
          (b) => b.constraintType === "time"
        );
        expect(timeBottleneck).toBeDefined();
      }
    });

    it("should identify quality bottleneck", async () => {
      const result = await engine.analyzeBottleneck(
        engagementId,
        workspaceId,
        validMetrics,
        validTimeline,
        validKpis
      );

      expect(result).not.toBeNull();
      if (result) {
        const qualityBottleneck = result.alternativeBottlenecks.find(
          (b) => b.constraintType === "quality"
        );
        expect(qualityBottleneck).toBeDefined();
      }
    });
  });

  describe("Metric Quantification (STRICT)", () => {
    const metricsCapacity = {
      utilization_pct: 90,
      conversion_rate: 0.4, // Higher so capacity is primary
    };
    const timeline = {
      baseline: { value: 70, timestamp: new Date(Date.now() - 86400000) },
      current: { value: 90, timestamp: new Date() },
    };
    const kpis = { revenue: 1000000 };

    it("should calculate metric delta correctly", async () => {
      const result = await engine.analyzeBottleneck(
        engagementId,
        workspaceId,
        metricsCapacity,
        timeline,
        kpis
      );

      expect(result).not.toBeNull();
      if (result) {
        const bottleneck = result.primaryBottleneck;
        expect(bottleneck.constraintType).toBe("capacity");
        expect(bottleneck.metricDelta.baseline).toEqual(70);
        expect(bottleneck.metricDelta.current).toEqual(90);
        expect(bottleneck.metricDelta.changePercent).toBeCloseTo(28.57, 1);
      }
    });

    it("should quantify throughput impact", async () => {
      const result = await engine.analyzeBottleneck(
        engagementId,
        workspaceId,
        metricsCapacity,
        timeline,
        kpis
      );

      expect(result).not.toBeNull();
      if (result) {
        const bottleneck = result.primaryBottleneck;
        expect(bottleneck.throughputImpact.affectedVolume).toBeGreaterThan(0);
        expect(bottleneck.throughputImpact.percentageImpact).toBeGreaterThan(0);
      }
    });

    it("should link downstream KPI impact", async () => {
      const result = await engine.analyzeBottleneck(
        engagementId,
        workspaceId,
        metricsCapacity,
        timeline,
        kpis
      );

      expect(result).not.toBeNull();
      if (result) {
        const bottleneck = result.primaryBottleneck;
        expect(bottleneck.downstreamImpact.affectedKpi).toBe("revenue");
        expect(bottleneck.downstreamImpact.projectedChange).toBeDefined();
      }
    });
  });

  describe("Bottleneck Ranking (STRICT)", () => {
    const metrics = {
      utilization_pct: 95, // High capacity constraint
      conversion_rate: 0.1, // Lower conversion constraint
      cost_per_unit: 80,
      cycle_time_days: 45,
      defect_rate_pct: 8,
    };
    const timeline = {
      baseline: { value: 60, timestamp: new Date(Date.now() - 604800000) },
      current: { value: 95, timestamp: new Date() },
    };
    const kpis = { revenue: 1000000, throughput: 5000 };

    it("should rank bottlenecks by impact score", async () => {
      const result = await engine.analyzeBottleneck(
        engagementId,
        workspaceId,
        metrics,
        timeline,
        kpis
      );

      expect(result).not.toBeNull();
      if (result) {
        expect(result.primaryBottleneck).toBeDefined();
        expect(result.primaryBottleneck.confidenceScore).toBeGreaterThan(0);
        if (result.alternativeBottlenecks.length > 0) {
          expect(result.primaryBottleneck.confidenceScore).toBeGreaterThanOrEqual(
            result.alternativeBottlenecks[0].confidenceScore
          );
        }
      }
    });

    it("should select primary bottleneck with highest confidence", async () => {
      const result = await engine.analyzeBottleneck(
        engagementId,
        workspaceId,
        metrics,
        timeline,
        kpis
      );

      expect(result).not.toBeNull();
      if (result) {
        const scores = [result.primaryBottleneck, ...result.alternativeBottlenecks].map(
          (b) => b.confidenceScore
        );
        const maxScore = Math.max(...scores);
        expect(result.primaryBottleneck.confidenceScore).toEqual(maxScore);
      }
    });

    it("should include confidence reason", async () => {
      const result = await engine.analyzeBottleneck(
        engagementId,
        workspaceId,
        metrics,
        timeline,
        kpis
      );

      expect(result).not.toBeNull();
      if (result) {
        expect(result.primaryBottleneck.confidenceReason).toBeDefined();
        expect(result.primaryBottleneck.confidenceReason.length).toBeGreaterThan(0);
      }
    });
  });

  describe("Evidence Linking (STRICT)", () => {
    const metrics = {
      utilization_pct: 88,
      conversion_rate: 0.28,
    };
    const timeline = {
      baseline: { value: 75, timestamp: new Date(Date.now() - 86400000) },
      current: { value: 88, timestamp: new Date() },
    };
    const kpis = { revenue: 1000000 };

    it("should link bottleneck to evidence source", async () => {
      const result = await engine.analyzeBottleneck(
        engagementId,
        workspaceId,
        metrics,
        timeline,
        kpis
      );

      expect(result).not.toBeNull();
      if (result) {
        expect(result.primaryBottleneck.evidenceLink).toBeDefined();
        expect(result.primaryBottleneck.evidenceLink).toContain("metric:");
      }
    });

    it("should include metric baseline in evidence", async () => {
      const result = await engine.analyzeBottleneck(
        engagementId,
        workspaceId,
        metrics,
        timeline,
        kpis
      );

      expect(result).not.toBeNull();
      if (result) {
        expect(result.primaryBottleneck.metricDelta.baseline).toEqual(75);
      }
    });

    it("should reference constraint type in evidence", async () => {
      const result = await engine.analyzeBottleneck(
        engagementId,
        workspaceId,
        metrics,
        timeline,
        kpis
      );

      expect(result).not.toBeNull();
      if (result) {
        const validTypes = ["capacity", "conversion", "cost", "time", "quality"];
        expect(validTypes).toContain(result.primaryBottleneck.constraintType);
      }
    });
  });

  describe("Uncertainty Exposure (MANDATORY)", () => {
    const metrics = {
      utilization_pct: 82,
      conversion_rate: 0.32,
    };
    const timeline = {
      baseline: { value: 70, timestamp: new Date(Date.now() - 86400000) },
      current: { value: 82, timestamp: new Date() },
    };
    const kpis = { revenue: 1000000 };

    it("should expose uncertainty with risk assessment", async () => {
      const result = await engine.analyzeBottleneck(
        engagementId,
        workspaceId,
        metrics,
        timeline,
        kpis
      );

      expect(result).not.toBeNull();
      if (result) {
        expect(result.uncertaintyExposure.riskOfMisdiagnosis).toBeDefined();
        expect(result.uncertaintyExposure.missingDataList).toBeDefined();
        expect(result.uncertaintyExposure.assumptionsList).toBeDefined();
      }
    });

    it("should include alternative bottlenecks in uncertainty message", async () => {
      const result = await engine.analyzeBottleneck(
        engagementId,
        workspaceId,
        {
          utilization_pct: 85,
          conversion_rate: 0.25,
          cost_per_unit: 55,
        },
        timeline,
        kpis
      );

      expect(result).not.toBeNull();
      if (result) {
        expect(result.uncertaintyExposure.riskOfMisdiagnosis).toContain(
          "Alternative bottlenecks"
        );
      }
    });

    it("should list assumptions explicitly", async () => {
      const result = await engine.analyzeBottleneck(
        engagementId,
        workspaceId,
        metrics,
        timeline,
        kpis
      );

      expect(result).not.toBeNull();
      if (result) {
        expect(result.uncertaintyExposure.assumptionsList.length).toBeGreaterThan(0);
        expect(result.uncertaintyExposure.assumptionsList[0]).toContain(
          "baseline"
        );
      }
    });
  });

  describe("Workspace Isolation", () => {
    it("should preserve workspace context", async () => {
      const metrics = {
        utilization_pct: 85,
        conversion_rate: 0.25,
      };
      const timeline = {
        baseline: { value: 70, timestamp: new Date(Date.now() - 86400000) },
        current: { value: 85, timestamp: new Date() },
      };
      const kpis = { revenue: 1000000 };

      const result = await engine.analyzeBottleneck(
        engagementId,
        workspaceId,
        metrics,
        timeline,
        kpis
      );

      expect(result).not.toBeNull();
      if (result) {
        expect(result.workspaceId).toBe(workspaceId);
        expect(result.engagementId).toBe(engagementId);
      }
    });
  });
});

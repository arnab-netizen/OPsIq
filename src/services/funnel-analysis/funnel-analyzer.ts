import { logger } from "@/infra/logger";
import {
  FunnelStage,
  FunnelAnalysis,
  FunnelMetrics,
  CriticalDropOff,
  Bottleneck,
} from "@/domain/diagnostic/funnel";

export class FunnelAnalyzer {
  async analyzeEngagementFunnel(
    engagementId: string,
    workspaceId: string,
    events: Array<{
      stage: FunnelStage;
      timestamp: Date;
      metadata?: Record<string, unknown>;
    }>
  ): Promise<FunnelAnalysis> {
    if (!events || events.length === 0) {
      return this.createEmptyFunnelAnalysis(engagementId, workspaceId);
    }

    const stages = this.calculateStageMetrics(events);
    const criticalDropOffs = this.identifyDropOffs(stages);
    const bottlenecks = this.identifyBottlenecks(events);
    const overallConversion = this.calculateOverallConversion(stages);

    logger.info("Funnel analysis complete", {
      engagementId,
      stageCount: stages.length,
      dropOffCount: criticalDropOffs.length,
      bottleneckCount: bottlenecks.length,
    });

    return {
      engagementId,
      workspaceId,
      stages,
      overallConversion,
      criticalDropOffs,
      bottlenecks,
      analyzedAt: new Date(),
    };
  }

  private calculateStageMetrics(
    events: Array<{
      stage: FunnelStage;
      timestamp: Date;
      metadata?: Record<string, unknown>;
    }>
  ): FunnelMetrics[] {
    const stageMap = new Map<FunnelStage, FunnelMetrics>();

    // Initialize metrics for all stages
    Object.values(FunnelStage).forEach((stage) => {
      stageMap.set(stage, {
        stage,
        enteredCount: 0,
        completedCount: 0,
        dropOffCount: 0,
        conversionRate: 0,
        averageTimeInStageMs: 0,
      });
    });

    // Count stage entries
    const stageCounts = new Map<FunnelStage, number>();
    events.forEach((event) => {
      stageCounts.set(event.stage, (stageCounts.get(event.stage) || 0) + 1);
    });

    // Update metrics
    stageCounts.forEach((count, stage) => {
      const metrics = stageMap.get(stage)!;
      metrics.enteredCount = count;
      metrics.completedCount = Math.max(0, count - 1); // Conservative estimate
    });

    // Calculate conversion rates
    let prevCount = events.length;
    Object.values(FunnelStage).forEach((stage) => {
      const metrics = stageMap.get(stage)!;
      metrics.conversionRate =
        prevCount > 0 ? (metrics.enteredCount / prevCount) * 100 : 0;
      metrics.dropOffCount = Math.max(0, prevCount - metrics.enteredCount);
      prevCount = metrics.enteredCount;
    });

    return Array.from(stageMap.values());
  }

  private identifyDropOffs(stages: FunnelMetrics[]): CriticalDropOff[] {
    const dropOffs: CriticalDropOff[] = [];

    for (let i = 0; i < stages.length - 1; i++) {
      const current = stages[i];
      const next = stages[i + 1];

      const dropOffRate =
        current.enteredCount > 0
          ? ((current.enteredCount - next.enteredCount) / current.enteredCount) *
            100
          : 0;

      if (dropOffRate > 25) {
        // More than 25% drop-off is critical
        dropOffs.push({
          fromStage: current.stage,
          toStage: next.stage,
          dropOffRate: Math.round(dropOffRate * 100) / 100,
          estimatedLostCount: current.enteredCount - next.enteredCount,
          recommendation: this.getDropOffRecommendation(
            current.stage,
            dropOffRate
          ),
        });
      }
    }

    return dropOffs;
  }

  private getDropOffRecommendation(stage: FunnelStage, dropOffRate: number): string {
    if (stage === FunnelStage.VALIDATION_STARTED) {
      return "Strengthen validation process or reduce validation complexity";
    } else if (stage === FunnelStage.REVIEW_STARTED) {
      return "Improve review process clarity or reduce approval bottlenecks";
    } else if (stage === FunnelStage.EXECUTION_STARTED) {
      return "Address execution readiness or increase resource allocation";
    }
    return "Investigate and address root causes of high drop-off";
  }

  private identifyBottlenecks(
    events: Array<{
      stage: FunnelStage;
      timestamp: Date;
      metadata?: Record<string, unknown>;
    }>
  ): Bottleneck[] {
    const bottlenecks: Bottleneck[] = [];
    const stageTimings = new Map<FunnelStage, number[]>();

    // Group events by stage and calculate timing
    events.forEach((event, idx) => {
      if (idx < events.length - 1) {
        const nextEvent = events[idx + 1];
        const delayMs = nextEvent.timestamp.getTime() - event.timestamp.getTime();
        const timings = stageTimings.get(event.stage) || [];
        timings.push(delayMs);
        stageTimings.set(event.stage, timings);
      }
    });

    // Analyze timings for bottlenecks
    stageTimings.forEach((timings, stage) => {
      const avgDelay = timings.reduce((a, b) => a + b, 0) / timings.length;
      if (avgDelay > 86400000) {
        // More than 1 day average
        bottlenecks.push({
          stage,
          delayMs: Math.round(avgDelay),
          severity: this.calculateSeverity(avgDelay),
          description: `Average delay: ${this.formatDuration(avgDelay)}`,
        });
      }
    });

    return bottlenecks;
  }

  private calculateSeverity(
    delayMs: number
  ): "LOW" | "MEDIUM" | "HIGH" | "CRITICAL" {
    if (delayMs > 604800000) return "CRITICAL"; // > 7 days
    if (delayMs > 259200000) return "HIGH"; // > 3 days
    if (delayMs > 86400000) return "MEDIUM"; // > 1 day
    return "LOW";
  }

  private formatDuration(ms: number): string {
    const seconds = Math.round(ms / 1000);
    const minutes = Math.round(seconds / 60);
    const hours = Math.round(minutes / 60);
    const days = Math.round(hours / 24);

    if (days > 0) return `${days} days`;
    if (hours > 0) return `${hours} hours`;
    if (minutes > 0) return `${minutes} minutes`;
    return `${seconds} seconds`;
  }

  private calculateOverallConversion(stages: FunnelMetrics[]): number {
    if (stages.length === 0) return 0;
    const firstStage = stages[0];
    const lastStage = stages[stages.length - 1];
    return firstStage.enteredCount > 0
      ? Math.round((lastStage.enteredCount / firstStage.enteredCount) * 10000) /
          100
      : 0;
  }

  private createEmptyFunnelAnalysis(
    engagementId: string,
    workspaceId: string
  ): FunnelAnalysis {
    return {
      engagementId,
      workspaceId,
      stages: [],
      overallConversion: 0,
      criticalDropOffs: [],
      bottlenecks: [],
      analyzedAt: new Date(),
    };
  }
}

export const funnelAnalyzer = new FunnelAnalyzer();

export enum FunnelStage {
  DECISION_PROPOSED = "DECISION_PROPOSED",
  VALIDATION_STARTED = "VALIDATION_STARTED",
  VALIDATION_COMPLETE = "VALIDATION_COMPLETE",
  REVIEW_STARTED = "REVIEW_STARTED",
  REVIEW_APPROVED = "REVIEW_APPROVED",
  EXECUTION_STARTED = "EXECUTION_STARTED",
  EXECUTION_COMPLETE = "EXECUTION_COMPLETE",
}

export interface FunnelEvent {
  engagementId: string;
  stage: FunnelStage;
  timestamp: Date;
  metadata?: Record<string, unknown>;
}

export interface FunnelMetrics {
  stage: FunnelStage;
  enteredCount: number;
  completedCount: number;
  dropOffCount: number;
  conversionRate: number;
  averageTimeInStageMs: number;
}

export interface FunnelAnalysis {
  engagementId: string;
  workspaceId: string;
  stages: FunnelMetrics[];
  overallConversion: number;
  criticalDropOffs: CriticalDropOff[];
  bottlenecks: Bottleneck[];
  analyzedAt: Date;
}

export interface CriticalDropOff {
  fromStage: FunnelStage;
  toStage: FunnelStage;
  dropOffRate: number;
  estimatedLostCount: number;
  recommendation: string;
}

export interface Bottleneck {
  stage: FunnelStage;
  delayMs: number;
  severity: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
  description: string;
}

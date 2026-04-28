"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Badge } from "@/ui/primitives";

interface DashboardAction {
  id: string;
  title: string;
  priority: string;
  status: string;
  dueDate?: string;
  urgency?: "overdue" | "due-soon" | "on-track";
}

interface DashboardRecommendation {
  id: string;
  title: string;
  priority: string;
  status: string;
}

interface NextBestAction {
  type: "action" | "recommendation" | "finding";
  id: string;
  title: string;
  reason: string;
  priority: string;
}

interface BusinessImpact {
  summary: string;
  keyRisks: string[];
  opportunities: string[];
}

interface ExecutionCertaintyResult {
  engagementId: string;
  generatedAt: string;
  score: number;
  level: "blocked" | "low" | "medium" | "high" | "certain";
  blockers: string[];
  risks: string[];
  reasons: string[];
}

interface ActionCommitment {
  status: "pending" | "acknowledged" | "in_progress" | "completed";
  acknowledgedAt?: string;
  startedAt?: string;
  completedAt?: string;
}

interface RequiredAction {
  type: string;
  entityId: string;
  label: string;
  urgency: "high" | "critical";
  reason: string;
}

interface RequiredActionWithCommitment {
  action: RequiredAction;
  commitment: ActionCommitment;
}

interface DriftDetectionResult {
  engagementId: string;
  driftDetected: boolean;
  severity: "low" | "medium" | "high" | "critical";
  reasons: string[];
  affectedActions: string[];
  requiredAttention: boolean;
  requiredAction: RequiredActionWithCommitment | null;
  detectedAt: string;
}

interface BusinessImpactLevel {
  engagementId: string;
  generatedAt: string;
  impactLevel: "low" | "medium" | "high" | "critical" | "existential";
  estimatedLoss: number | null;
  timeImpact: {
    timelineToFailure: number | null;
    urgencyWindow: "immediate" | "days" | "weeks" | "months" | "unknown";
  };
  recoveryImpact: {
    recoveryProbability: "low" | "medium" | "high";
    recoveryTimeline: number | null;
  };
  ownerDecision: {
    required: boolean;
    reason?: string;
    decision?: string;
    decidedAt?: string;
  };
  topImpactDrivers: string[];
}

interface DecisionConfidenceResult {
  score: number;
  level: "low" | "medium" | "high" | "very_high";
  factors: string[];
  deductions: { reason: string; points: number }[];
}

interface FinancialImpactNormalized {
  revenueAtRiskPct: number | null;
  monthlyImpact: number | null;
  marginImpactPct: number | null;
  burnRateImpact: number | null;
  normalizedLevel: "unknown" | "low" | "medium" | "high" | "critical";
  reasons: string[];
}

interface OwnerDashboardData {
  engagementId: string;
  engagementCode: string;
  engagementTitle: string;
  status: string;
  healthStatus: string;
  interventionMode: string;
  executionCertainty: ExecutionCertaintyResult;
  drift: DriftDetectionResult;
  criticalBlockers: string[];
  overdueActions: DashboardAction[];
  criticalActions: DashboardAction[];
  openRecommendations: DashboardRecommendation[];
  nextBestAction: NextBestAction | null;
  businessImpact: BusinessImpact | BusinessImpactLevel;
  decisionConfidence?: DecisionConfidenceResult;
  financialImpactNormalized?: FinancialImpactNormalized;
  generatedAt: string;
}

interface OwnerDashboardProps {
  engagementId: string;
}

const PRIORITY_COLORS: Record<string, "default" | "success" | "warning" | "destructive" | "muted"> = {
  critical: "destructive",
  high: "warning",
  medium: "warning",
  low: "muted",
};

const HEALTH_COLORS: Record<string, "default" | "success" | "warning" | "destructive" | "muted"> = {
  healthy: "success",
  stable: "success",
  at_risk: "warning",
  critical: "destructive",
};

const EXECUTION_CERTAINTY_COLORS: Record<string, "default" | "success" | "warning" | "destructive" | "muted"> = {
  certain: "success",
  high: "success",
  medium: "warning",
  low: "destructive",
  blocked: "destructive",
};

export function OwnerDashboard({ engagementId }: OwnerDashboardProps) {
  const router = useRouter();
  const [data, setData] = useState<OwnerDashboardData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isMutating, setIsMutating] = useState(false);
  const [actionDelta, setActionDelta] = useState<any>(null);

  const fetchDashboard = async () => {
    try {
      setError(null);
      const response = await fetch(
        `/api/engagements/${engagementId}/dashboard`
      );
      if (!response.ok) {
        throw new Error("Failed to load dashboard");
      }
      const dashboardData = await response.json();
      setData(dashboardData);
    } catch (err) {
      setError(err instanceof Error ? err.message : "An error occurred");
    }
  };

  useEffect(() => {
    async function initialFetch() {
      try {
        setIsLoading(true);
        await fetchDashboard();
      } finally {
        setIsLoading(false);
      }
    }

    initialFetch();
  }, [engagementId]);

  useEffect(() => {
    async function fetchImpactDelta() {
      const actionId = data?.nextBestAction?.id;
      if (!actionId) {
        setActionDelta(null);
        return;
      }
      try {
        const response = await fetch(`/api/actions/${actionId}/impact-delta`);
        if (!response.ok) {
          return; // Silently fail - delta is optional
        }
        const result = await response.json();
        setActionDelta(result.data);
      } catch (err) {
        // Silently fail - delta is optional enhancement
      }
    }

    fetchImpactDelta();
  }, [data?.nextBestAction?.id]);

  const handleAcknowledge = async () => {
    if (!data) return;
    try {
      setIsMutating(true);
      const response = await fetch(
        `/api/engagements/${engagementId}/acknowledge`,
        { method: "POST" }
      );
      if (!response.ok) {
        throw new Error("Failed to acknowledge");
      }
      await fetchDashboard();
    } catch (err) {
      setError(err instanceof Error ? err.message : "An error occurred");
    } finally {
      setIsMutating(false);
    }
  };

  const handleStartAction = async () => {
    if (!data?.drift.requiredAction?.action) return;
    try {
      setIsMutating(true);
      const actionId = data.drift.requiredAction.action.entityId;
      const response = await fetch(`/api/actions/${actionId}/start`, {
        method: "PATCH",
      });
      if (!response.ok) {
        throw new Error("Failed to start action");
      }
      await fetchDashboard();
    } catch (err) {
      setError(err instanceof Error ? err.message : "An error occurred");
    } finally {
      setIsMutating(false);
    }
  };

  const handleMarkComplete = async () => {
    if (!data?.drift.requiredAction?.action) return;
    try {
      setIsMutating(true);
      const actionId = data.drift.requiredAction.action.entityId;
      const response = await fetch(`/api/actions/${actionId}/complete`, {
        method: "PATCH",
      });
      if (!response.ok) {
        throw new Error("Failed to complete action");
      }
      await fetchDashboard();
    } catch (err) {
      setError(err instanceof Error ? err.message : "An error occurred");
    } finally {
      setIsMutating(false);
    }
  };

  if (isLoading) {
    return (
      <div className="space-y-4">
        <div className="rounded-lg border border-border bg-muted/10 p-6">
          <div className="animate-pulse space-y-3">
            <div className="h-6 w-32 rounded bg-muted"></div>
            <div className="h-10 w-20 rounded bg-muted"></div>
          </div>
        </div>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-6">
        <p className="text-sm font-medium text-destructive">Unable to Load Dashboard</p>
        <p className="mt-2 text-xs text-destructive">{error || "An error occurred"}</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Mutation Error Alert */}
      {error && isMutating === false && (
        <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-4">
          <p className="text-sm font-medium text-destructive">Error</p>
          <p className="mt-1 text-xs text-destructive">{error}</p>
        </div>
      )}

      {/* Header */}
      <div className="space-y-2">
        <h1 className="text-2xl font-bold">{data.engagementTitle}</h1>
        <div className="flex items-center gap-3 text-xs text-muted-foreground">
          <span>{data.engagementCode}</span>
          <span>•</span>
          <span>{data.interventionMode}</span>
          <span>•</span>
          <span>Generated {new Date(data.generatedAt).toLocaleString()}</span>
        </div>
      </div>

      {/* Top Row: Engagement Health, Execution Certainty, Decision Confidence, Financial Impact */}
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-4">
        {/* Health Card */}
        <div className="rounded-lg border border-border bg-card p-4">
          <p className="text-xs font-medium uppercase text-muted-foreground">
            Engagement Health
          </p>
          <div className="mt-3 flex items-baseline gap-2">
            <Badge
              variant={HEALTH_COLORS[data.healthStatus] ?? "muted"}
              className="text-sm"
            >
              {data.healthStatus}
            </Badge>
          </div>
          <p className="mt-3 text-xs text-muted-foreground">
            Intervention: <span className="font-medium">{data.interventionMode}</span>
          </p>
        </div>

        {/* Execution Certainty Card */}
        <div className="rounded-lg border border-border bg-card p-4">
          <p className="text-xs font-medium uppercase text-muted-foreground">
            Execution Certainty
          </p>
          <div className="mt-3 flex items-baseline gap-2">
            <p className="text-2xl font-bold">{data.executionCertainty.score}</p>
            <Badge
              variant={EXECUTION_CERTAINTY_COLORS[data.executionCertainty.level] ?? "muted"}
              className="text-xs"
            >
              {data.executionCertainty.level}
            </Badge>
          </div>
          {data.executionCertainty.blockers.length > 0 && (
            <p className="mt-2 text-xs text-destructive">
              {data.executionCertainty.blockers.length} blocker(s)
            </p>
          )}
          {data.executionCertainty.risks.length > 0 && (
            <p className="text-xs text-warning">
              {data.executionCertainty.risks.length} risk(s)
            </p>
          )}
        </div>

        {/* Decision Confidence Card */}
        {data.decisionConfidence && (
          <div className="rounded-lg border border-border bg-card p-4">
            <p className="text-xs font-medium uppercase text-muted-foreground">
              Decision Confidence
            </p>
            <div className="mt-3 flex items-baseline gap-2">
              <p className="text-2xl font-bold">{data.decisionConfidence.score}</p>
              <Badge
                variant={
                  data.decisionConfidence.level === "very_high"
                    ? "success"
                    : data.decisionConfidence.level === "high"
                      ? "default"
                      : data.decisionConfidence.level === "medium"
                        ? "warning"
                        : "destructive"
                }
                className="text-xs"
              >
                {data.decisionConfidence.level}
              </Badge>
            </div>
            {data.decisionConfidence.factors.length > 0 && (
              <p className="mt-2 text-xs text-muted-foreground">
                {data.decisionConfidence.factors[0]}
              </p>
            )}
          </div>
        )}

        {/* Financial Impact Card */}
        {data.financialImpactNormalized && (
          <div className="rounded-lg border border-border bg-card p-4">
            <p className="text-xs font-medium uppercase text-muted-foreground">
              Financial Exposure
            </p>
            <div className="mt-3 space-y-2">
              {data.financialImpactNormalized.revenueAtRiskPct !== null ? (
                <div>
                  <p className="text-xs text-muted-foreground">Revenue at Risk</p>
                  <p className="text-lg font-bold">
                    {data.financialImpactNormalized.revenueAtRiskPct}%
                  </p>
                </div>
              ) : (
                <p className="text-xs text-muted-foreground">Revenue unavailable</p>
              )}
              {data.financialImpactNormalized.monthlyImpact !== null && (
                <p className="text-xs text-muted-foreground">
                  Monthly: <span className="font-medium">${data.financialImpactNormalized.monthlyImpact.toLocaleString()}</span>
                </p>
              )}
              <Badge
                variant={
                  data.financialImpactNormalized.normalizedLevel === "critical"
                    ? "destructive"
                    : data.financialImpactNormalized.normalizedLevel === "high"
                      ? "warning"
                      : data.financialImpactNormalized.normalizedLevel === "medium"
                        ? "default"
                        : "muted"
                }
                className="mt-2 text-xs"
              >
                {data.financialImpactNormalized.normalizedLevel}
              </Badge>
            </div>
          </div>
        )}
      </div>

      {/* Required Next Action (if drift detected) */}
      {data.drift.driftDetected && data.drift.requiredAction && (
        <div className="rounded-lg border border-destructive/50 bg-destructive/10 p-5">
          <div className="flex items-start justify-between">
            <div className="flex-1">
              <div className="flex items-center gap-2">
                <p className="text-sm font-bold text-destructive">🎯 Required Next Action</p>
                <Badge
                  variant={
                    data.drift.requiredAction.commitment.status === "completed"
                      ? "default"
                      : data.drift.requiredAction.commitment.status === "in_progress"
                      ? "warning"
                      : "destructive"
                  }
                  className="text-xs"
                >
                  {data.drift.requiredAction.commitment.status}
                </Badge>
              </div>
              <p className="mt-2 text-base font-semibold text-foreground">
                {data.drift.requiredAction.action.label}
              </p>
              <p className="mt-1 text-xs text-muted-foreground">
                {data.drift.requiredAction.action.reason}
              </p>
              {data.drift.requiredAttention && (
                <p className="mt-2 text-xs font-semibold uppercase text-destructive">
                  ⚡ Critical Priority — Immediate Attention Required
                </p>
              )}
            </div>
            <Badge
              variant={data.drift.requiredAction.action.urgency === "critical" ? "destructive" : "warning"}
              className="ml-3"
            >
              {data.drift.requiredAction.action.urgency}
            </Badge>
          </div>

          {/* Commitment Status Details */}
          <div className="mt-4 rounded bg-white/30 p-3">
            <p className="text-xs font-medium text-foreground">Commitment Status</p>
            <p className="mt-1 text-xs text-muted-foreground">
              {data.drift.requiredAction.commitment.status === "pending" &&
                "Awaiting acknowledgment and action start"}
              {data.drift.requiredAction.commitment.status === "acknowledged" &&
                "Acknowledged - ready to start"}
              {data.drift.requiredAction.commitment.status === "in_progress" &&
                "Currently in progress"}
              {data.drift.requiredAction.commitment.status === "completed" &&
                "Completed"}
            </p>
            {data.drift.requiredAction.commitment.startedAt && (
              <p className="mt-1 text-xs text-muted-foreground">
                Started: {new Date(data.drift.requiredAction.commitment.startedAt).toLocaleDateString()}
              </p>
            )}
            {data.drift.requiredAction.commitment.completedAt && (
              <p className="mt-1 text-xs text-muted-foreground">
                Completed: {new Date(data.drift.requiredAction.commitment.completedAt).toLocaleDateString()}
              </p>
            )}
          </div>

          {/* Action Buttons */}
          <div className="mt-4 flex flex-wrap gap-2">
            {data.drift.requiredAction.commitment.status === "pending" && (
              <button
                disabled={isMutating}
                className="rounded bg-destructive px-3 py-2 text-xs font-medium text-white hover:bg-destructive/90 disabled:opacity-50"
                onClick={handleAcknowledge}
              >
                {isMutating ? "⏳ Acknowledging..." : "👋 Acknowledge"}
              </button>
            )}
            {(data.drift.requiredAction.commitment.status === "pending" ||
              data.drift.requiredAction.commitment.status === "acknowledged") && (
              <button
                disabled={isMutating}
                className="rounded bg-warning px-3 py-2 text-xs font-medium text-white hover:bg-warning/90 disabled:opacity-50"
                onClick={handleStartAction}
              >
                {isMutating ? "⏳ Starting..." : "▶️ Start Action"}
              </button>
            )}
            {data.drift.requiredAction.commitment.status === "in_progress" && (
              <button
                disabled={isMutating}
                className="rounded bg-success px-3 py-2 text-xs font-medium text-white hover:bg-success/90 disabled:opacity-50"
                onClick={handleMarkComplete}
              >
                {isMutating ? "⏳ Completing..." : "✓ Mark Complete"}
              </button>
            )}
            <button
              disabled={isMutating}
              className="rounded border border-border bg-background px-3 py-2 text-xs font-medium text-foreground hover:bg-muted disabled:opacity-50"
              onClick={() => window.location.href = `/actions/${data.drift.requiredAction!.action.entityId}`}
            >
              📋 View Details
            </button>
          </div>

          {/* Action Metadata */}
          <div className="mt-3 space-y-1 rounded bg-white/50 p-2">
            <p className="text-xs font-medium text-muted-foreground">Type: {data.drift.requiredAction.action.type}</p>
            <p className="text-xs font-medium text-muted-foreground">ID: {data.drift.requiredAction.action.entityId}</p>
          </div>
        </div>
      )}

      {/* Drift Detection */}
      {data.drift.driftDetected && (
        <div
          className={`rounded-lg border p-4 ${
            data.drift.severity === "critical"
              ? "border-destructive/30 bg-destructive/5"
              : data.drift.severity === "high"
              ? "border-destructive/30 bg-destructive/5"
              : data.drift.severity === "medium"
              ? "border-warning/30 bg-warning/5"
              : "border-muted/30 bg-muted/5"
          }`}
        >
          <div className="flex items-start justify-between">
            <div className="flex-1">
              <p
                className={`text-sm font-medium ${
                  data.drift.severity === "critical" || data.drift.severity === "high"
                    ? "text-destructive"
                    : "text-warning"
                }`}
              >
                ⚠️ Needs Attention — Execution Drift Detected
              </p>
              {data.drift.requiredAttention && (
                <p className="mt-1 text-xs font-semibold text-destructive">
                  Immediate action required
                </p>
              )}
            </div>
            <Badge
              variant={
                data.drift.severity === "critical" || data.drift.severity === "high"
                  ? "destructive"
                  : "warning"
              }
            >
              {data.drift.severity}
            </Badge>
          </div>
          <div className="mt-3 space-y-2">
            {data.drift.reasons.map((reason, i) => (
              <p key={i} className="text-xs text-muted-foreground">
                • {reason}
              </p>
            ))}
          </div>
        </div>
      )}

      {/* Critical Blockers */}
      {data.criticalBlockers.length > 0 && (
        <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-4">
          <p className="text-sm font-medium text-destructive">
            🚫 {data.criticalBlockers.length} Critical Blocker(s)
          </p>
          <div className="mt-3 space-y-2">
            {data.criticalBlockers.slice(0, 3).map((blocker, i) => (
              <p key={i} className="text-xs text-destructive">
                • {blocker}
              </p>
            ))}
          </div>
        </div>
      )}

      {/* Next Best Action */}
      {data.nextBestAction && (
        <div className="rounded-lg border border-border bg-card p-4">
          <p className="text-xs font-medium uppercase text-muted-foreground">
            Next Best Action
          </p>
          <div className="mt-3 space-y-2">
            <p className="text-sm font-semibold">{data.nextBestAction.title}</p>
            <p className="text-xs text-muted-foreground">{data.nextBestAction.reason}</p>
            <div className="flex items-center gap-2">
              <Badge variant={PRIORITY_COLORS[data.nextBestAction.priority] ?? "muted"}>
                {data.nextBestAction.priority}
              </Badge>
              <span className="text-xs text-muted-foreground capitalize">
                {data.nextBestAction.type}
              </span>
            </div>
          </div>

          {actionDelta && (
            <div className="mt-4 border-t border-border pt-3">
              <p className="text-xs font-medium text-success">What happens if you act:</p>
              <div className="mt-2 flex items-center gap-3">
                <div>
                  <p className="text-xs text-muted-foreground">Impact Level</p>
                  <p className="text-sm font-semibold capitalize">
                    {actionDelta.current.impactLevel} →{" "}
                    <span className="text-success">{actionDelta.ifCompleted.impactLevel}</span>
                  </p>
                </div>
                {actionDelta.ifCompleted.estimatedLossReduction && (
                  <div>
                    <p className="text-xs text-muted-foreground">Loss Reduction</p>
                    <p className="text-sm font-semibold text-success">
                      -${(actionDelta.ifCompleted.estimatedLossReduction / 1000).toFixed(0)}K
                    </p>
                  </div>
                )}
              </div>
              <button
                onClick={() => {
                  if (data?.nextBestAction?.id) {
                    router.push(
                      `/engagements/${engagementId}/business-impact?action=${data.nextBestAction.id}`
                    );
                  }
                }}
                className="mt-2 text-xs text-primary underline hover:no-underline"
              >
                See consequences →
              </button>
            </div>
          )}
        </div>
      )}

      {/* Business Impact Level */}
      {data.businessImpact && "impactLevel" in data.businessImpact && (
        <div
          onClick={() => router.push(`/engagements/${engagementId}/business-impact`)}
          className={`cursor-pointer rounded-lg border p-4 transition-opacity hover:opacity-80 ${
            data.businessImpact.impactLevel === "existential"
              ? "border-destructive/50 bg-destructive/10"
              : data.businessImpact.impactLevel === "critical"
                ? "border-destructive/30 bg-destructive/5"
                : data.businessImpact.impactLevel === "high"
                  ? "border-warning/30 bg-warning/5"
                  : "border-border bg-card"
          }`}
        >
          <div className="flex items-start justify-between">
            <div className="flex-1">
              <p className="text-sm font-medium">📊 Business Impact Assessment</p>
              <p className="mt-1 text-xs text-muted-foreground">
                {data.businessImpact.impactLevel === "existential"
                  ? "Existential Risk"
                  : data.businessImpact.impactLevel === "critical"
                    ? "Critical Impact"
                    : data.businessImpact.impactLevel === "high"
                      ? "High Impact"
                      : data.businessImpact.impactLevel === "medium"
                        ? "Medium Impact"
                        : "Low Impact"}
              </p>
            </div>
            <Badge
              variant={
                data.businessImpact.impactLevel === "existential" ||
                data.businessImpact.impactLevel === "critical"
                  ? "destructive"
                  : data.businessImpact.impactLevel === "high"
                    ? "warning"
                    : "default"
              }
            >
              {String(data.businessImpact.impactLevel)}
            </Badge>
          </div>

          <div className="mt-4 grid grid-cols-2 gap-4 md:grid-cols-4">
            {data.businessImpact.estimatedLoss !== null && (
              <div>
                <p className="text-xs font-medium uppercase text-muted-foreground">Estimated Loss</p>
                <p className="mt-1 text-lg font-bold text-destructive">
                  ${(data.businessImpact.estimatedLoss / 1000).toFixed(0)}K
                </p>
              </div>
            )}

            <div>
              <p className="text-xs font-medium uppercase text-muted-foreground">Recovery Probability</p>
              <p
                className={`mt-1 text-lg font-bold ${
                  data.businessImpact.recoveryImpact.recoveryProbability === "high"
                    ? "text-success"
                    : data.businessImpact.recoveryImpact.recoveryProbability === "medium"
                      ? "text-warning"
                      : "text-destructive"
                }`}
              >
                {data.businessImpact.recoveryImpact.recoveryProbability}
              </p>
            </div>

            {data.businessImpact.timeImpact.timelineToFailure !== null && (
              <div>
                <p className="text-xs font-medium uppercase text-muted-foreground">Timeline to Failure</p>
                <p className="mt-1 text-lg font-bold">{data.businessImpact.timeImpact.timelineToFailure} days</p>
              </div>
            )}

            <div>
              <p className="text-xs font-medium uppercase text-muted-foreground">Urgency Window</p>
              <p className="mt-1 text-sm font-medium capitalize">{data.businessImpact.timeImpact.urgencyWindow}</p>
            </div>
          </div>

          {data.businessImpact.topImpactDrivers.length > 0 && (
            <div className="mt-4">
              <p className="text-xs font-medium uppercase text-muted-foreground">Top Impact Drivers</p>
              <ul className="mt-2 space-y-1">
                {data.businessImpact.topImpactDrivers.map((driver, i) => (
                  <li key={i} className="text-xs text-muted-foreground">
                    • {driver}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {data.businessImpact.ownerDecision.required && (
            <div className="mt-4 rounded bg-destructive/5 p-2">
              <p className="text-xs font-medium text-destructive">⚠️ Decision Required</p>
              <p className="mt-1 text-xs text-destructive">{data.businessImpact.ownerDecision.reason}</p>
              {data.businessImpact.ownerDecision.decision && (
                <p className="mt-1 text-xs font-medium text-foreground">
                  Decision: {data.businessImpact.ownerDecision.decision}
                </p>
              )}
            </div>
          )}

          {data.businessImpact.recoveryImpact.recoveryTimeline !== null && (
            <div className="mt-3">
              <p className="text-xs text-muted-foreground">
                Estimated recovery timeline: <span className="font-medium">{data.businessImpact.recoveryImpact.recoveryTimeline} days</span>
              </p>
            </div>
          )}
        </div>
      )}

      {/* Business Impact - Summary */}
      {data.businessImpact && "summary" in data.businessImpact && (
        <div className="rounded-lg border border-border bg-card p-4">
          <p className="text-sm font-medium">💼 Why This Matters</p>
          <p className="mt-2 text-sm text-muted-foreground">{data.businessImpact.summary}</p>

          {data.businessImpact.keyRisks.length > 0 && (
            <div className="mt-4">
              <p className="text-xs font-medium uppercase text-destructive">Key Risks</p>
              <ul className="mt-2 space-y-1">
                {data.businessImpact.keyRisks.map((risk, i) => (
                  <li key={i} className="text-xs text-muted-foreground">
                    ⚠️ {risk}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {data.businessImpact.opportunities.length > 0 && (
            <div className="mt-4">
              <p className="text-xs font-medium uppercase text-success">Opportunities</p>
              <ul className="mt-2 space-y-1">
                {data.businessImpact.opportunities.map((opp, i) => (
                  <li key={i} className="text-xs text-muted-foreground">
                    ✓ {opp}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}

      {/* Overdue Actions */}
      {data.overdueActions.length > 0 && (
        <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-4">
          <p className="text-sm font-medium text-destructive">
            ⏰ {data.overdueActions.length} Overdue Action(s)
          </p>
          <div className="mt-3 space-y-2">
            {data.overdueActions.slice(0, 3).map((action) => (
              <div key={action.id} className="flex items-start justify-between rounded bg-white p-2">
                <div className="flex-1">
                  <p className="text-xs font-medium">{action.title}</p>
                  {action.dueDate && (
                    <p className="text-xs text-muted-foreground">
                      Due: {new Date(action.dueDate).toLocaleDateString()}
                    </p>
                  )}
                </div>
                <Badge variant={PRIORITY_COLORS[action.priority] ?? "muted"} className="ml-2">
                  {action.priority}
                </Badge>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Critical Actions */}
      {data.criticalActions.length > 0 && (
        <div className="rounded-lg border border-warning/30 bg-warning/5 p-4">
          <p className="text-sm font-medium text-warning">
            🔥 {data.criticalActions.length} Critical Action(s)
          </p>
          <div className="mt-3 space-y-2">
            {data.criticalActions.slice(0, 3).map((action) => (
              <div key={action.id} className="flex items-start justify-between rounded bg-white p-2">
                <div className="flex-1">
                  <p className="text-xs font-medium">{action.title}</p>
                  <p className="text-xs text-muted-foreground capitalize">{action.status}</p>
                </div>
                <span className="ml-2 text-xs font-medium text-warning">Critical</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Open Recommendations */}
      {data.openRecommendations.length > 0 && (
        <div className="rounded-lg border border-border bg-card p-4">
          <p className="text-sm font-medium">
            💡 {data.openRecommendations.length} Open Recommendation(s)
          </p>
          <div className="mt-3 space-y-2">
            {data.openRecommendations.slice(0, 3).map((rec) => (
              <div key={rec.id} className="flex items-start justify-between rounded bg-muted/20 p-2">
                <div className="flex-1">
                  <p className="text-xs font-medium">{rec.title}</p>
                  <p className="text-xs text-muted-foreground capitalize">{rec.status}</p>
                </div>
                <Badge variant={PRIORITY_COLORS[rec.priority] ?? "muted"} className="ml-2">
                  {rec.priority}
                </Badge>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Empty State */}
      {data.overdueActions.length === 0 &&
        data.criticalActions.length === 0 &&
        data.openRecommendations.length === 0 && (
          <div className="rounded-lg border border-border bg-muted/10 p-6 text-center">
            <p className="text-sm text-muted-foreground">
              ✓ No overdue actions or critical items pending
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              Engagement tracking well — continue current activities
            </p>
          </div>
        )}
    </div>
  );
}

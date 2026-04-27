"use client";

import { useState, useEffect } from "react";
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

interface OwnerDashboardData {
  engagementId: string;
  engagementCode: string;
  engagementTitle: string;
  status: string;
  healthStatus: string;
  interventionMode: string;
  executionCertainty: ExecutionCertaintyResult;
  criticalBlockers: string[];
  overdueActions: DashboardAction[];
  criticalActions: DashboardAction[];
  openRecommendations: DashboardRecommendation[];
  nextBestAction: NextBestAction | null;
  businessImpact: BusinessImpact;
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
  const [data, setData] = useState<OwnerDashboardData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function fetchDashboard() {
      try {
        setIsLoading(true);
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
      } finally {
        setIsLoading(false);
      }
    }

    fetchDashboard();
  }, [engagementId]);

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

      {/* Top Row: Engagement Health & Execution Certainty */}
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
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
      </div>

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
        </div>
      )}

      {/* Business Impact */}
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

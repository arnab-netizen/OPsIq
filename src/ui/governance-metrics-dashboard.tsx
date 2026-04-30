"use client";

import { useEffect, useState } from "react";
import { Badge } from "@/ui/primitives";

interface GovernanceMetrics {
  workspace: { workspaceId: string };
  period: {
    days: number;
    startDate: string;
    endDate: string;
  };
  summary: {
    totalDecisions: number;
    approvedCount: number;
    blockedCount: number;
  };
  blockRates: {
    overallBlockRate: number;
    guardrailBlockRate: number;
    decisionGateBlockRate: number;
    dependencyValidationBlockRate: number;
  };
  confidence: {
    avgConfidenceApproved: number | null;
    avgConfidenceBlocked: number | null;
  };
  impact: {
    approvedExpectedImpact: number;
    blockedExpectedImpact: number;
    realizedImpact: number;
    lossFromMisses: number;
  };
}

interface ObservabilitySummary {
  workspace: { workspaceId: string };
  period: {
    last24h: {
      lifecycleCounts: Array<{ stage: string; status: string; count: number }>;
      errorCount: number;
      blockCount: number;
      blockReasons: Array<{ reason: string; count: number }>;
      stageDurations: Array<{
        stage: string;
        avgDurationMs: number;
        minDurationMs: number;
        maxDurationMs: number;
        count: number;
      }>;
      slowestStage: {
        stage: string;
        avgDurationMs: number;
        minDurationMs: number;
        maxDurationMs: number;
        count: number;
      } | null;
      recentFailures: Array<{
        id: string;
        stage: string;
        status: string;
        reason: string | null;
        occurredAt: string;
        durationMs: number | null;
      }>;
    };
    last7d: any;
  };
}

interface GovernanceAlerts {
  workspace: { workspaceId: string };
  period: {
    timeRange: "last24h" | "last7d";
    alerts: Array<{
      id: string;
      severity: "info" | "warning" | "critical";
      rule: string;
      title: string;
      message: string;
      metric: string;
      current: number;
      threshold: number;
      timestamp: string;
    }>;
    hasAlerts: boolean;
    alertCount: number;
    criticalCount: number;
    warningCount: number;
  };
}

const ALERT_VARIANTS: Record<string, "default" | "success" | "warning" | "destructive" | "muted"> = {
  info: "default",
  warning: "warning",
  critical: "destructive",
};

const DECISION_STATUS_COLORS: Record<string, string> = {
  healthy: "text-green-600",
  warning: "text-yellow-600",
  critical: "text-red-600",
};

export function GovernanceMetricsDashboard() {
  const [metrics, setMetrics] = useState<GovernanceMetrics | null>(null);
  const [summary, setSummary] = useState<ObservabilitySummary | null>(null);
  const [alerts, setAlerts] = useState<GovernanceAlerts | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchData = async () => {
      try {
        setLoading(true);
        setError(null);

        const [metricsRes, summaryRes, alertsRes] = await Promise.all([
          fetch("/api/governance/metrics?days=7"),
          fetch("/api/observability/summary"),
          fetch("/api/governance/alerts?period=last24h"),
        ]);

        if (!metricsRes.ok) throw new Error("Failed to fetch governance metrics");
        if (!summaryRes.ok) throw new Error("Failed to fetch observability summary");
        if (!alertsRes.ok) throw new Error("Failed to fetch governance alerts");

        const [metricsData, summaryData, alertsData] = await Promise.all([
          metricsRes.json(),
          summaryRes.json(),
          alertsRes.json(),
        ]);

        setMetrics(metricsData);
        setSummary(summaryData);
        setAlerts(alertsData);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Unknown error");
      } finally {
        setLoading(false);
      }
    };

    fetchData();
    const interval = setInterval(fetchData, 30000); // Refresh every 30 seconds
    return () => clearInterval(interval);
  }, []);

  if (loading) {
    return (
      <div className="rounded-lg border border-border p-6">
        <p className="text-sm text-muted-foreground">Loading governance metrics...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-lg border border-destructive/50 bg-destructive/5 p-6">
        <p className="text-sm text-destructive">Error: {error}</p>
      </div>
    );
  }

  if (!metrics || !summary || !alerts) {
    return (
      <div className="rounded-lg border border-border p-6">
        <p className="text-sm text-muted-foreground">No governance data available.</p>
      </div>
    );
  }

  const blockRateStatus =
    metrics.blockRates.overallBlockRate > 20
      ? "critical"
      : metrics.blockRates.overallBlockRate > 10
        ? "warning"
        : "healthy";

  const confidenceStatus =
    metrics.confidence.avgConfidenceBlocked !== null &&
    metrics.confidence.avgConfidenceBlocked < 0.3
      ? "critical"
      : "healthy";

  const errorRate =
    summary.period.last24h.lifecycleCounts.reduce((sum, c) => sum + c.count, 0) > 0
      ? (summary.period.last24h.errorCount /
          summary.period.last24h.lifecycleCounts.reduce((sum, c) => sum + c.count, 0)) *
        100
      : 0;

  const errorStatus = errorRate > 5 ? "critical" : "healthy";

  return (
    <div className="space-y-6">
      {/* Governance Alerts */}
      {alerts.period.hasAlerts && (
        <div className="rounded-lg border border-destructive/50 bg-destructive/5 p-6">
          <h3 className="font-semibold text-destructive">⚠️ Active Governance Alerts ({alerts.period.alertCount})</h3>
          <div className="mt-3 space-y-2">
            {alerts.period.alerts.slice(0, 3).map((alert) => (
              <div key={alert.id} className="rounded-md bg-background p-3">
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <p className="text-sm font-medium text-foreground">{alert.title}</p>
                    <p className="mt-1 text-xs text-muted-foreground">{alert.message}</p>
                  </div>
                  <Badge variant={ALERT_VARIANTS[alert.severity] ?? "muted"}>
                    {alert.severity}
                  </Badge>
                </div>
              </div>
            ))}
            {alerts.period.alerts.length > 3 && (
              <p className="text-xs text-muted-foreground">
                ... and {alerts.period.alerts.length - 3} more alerts
              </p>
            )}
          </div>
        </div>
      )}

      {/* KPI Grid */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {/* Approved vs Blocked */}
        <div className="rounded-lg border border-border p-4">
          <p className="text-xs font-medium uppercase text-muted-foreground">Approved Decisions</p>
          <p className="mt-2 text-2xl font-bold text-green-600">{metrics.summary.approvedCount}</p>
          <p className="mt-1 text-xs text-muted-foreground">of {metrics.summary.totalDecisions} total</p>
        </div>

        <div className="rounded-lg border border-border p-4">
          <p className="text-xs font-medium uppercase text-muted-foreground">Blocked Decisions</p>
          <p className={`mt-2 text-2xl font-bold ${blockRateStatus === "critical" ? "text-red-600" : "text-yellow-600"}`}>
            {metrics.summary.blockedCount}
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            {metrics.blockRates.overallBlockRate.toFixed(1)}% block rate
          </p>
        </div>

        {/* Guardrail Rate */}
        <div className="rounded-lg border border-border p-4">
          <p className="text-xs font-medium uppercase text-muted-foreground">Guardrail Rate</p>
          <p className="mt-2 text-2xl font-bold text-blue-600">
            {metrics.blockRates.guardrailBlockRate.toFixed(1)}%
          </p>
          <p className="mt-1 text-xs text-muted-foreground">of blocked decisions</p>
        </div>

        {/* Confidence Risk */}
        <div className="rounded-lg border border-border p-4">
          <p className="text-xs font-medium uppercase text-muted-foreground">Blocked Confidence</p>
          <p
            className={`mt-2 text-2xl font-bold ${confidenceStatus === "critical" ? "text-red-600" : "text-green-600"}`}
          >
            {metrics.confidence.avgConfidenceBlocked !== null
              ? metrics.confidence.avgConfidenceBlocked.toFixed(2)
              : "N/A"}
          </p>
          <p className="mt-1 text-xs text-muted-foreground">avg confidence</p>
        </div>
      </div>

      {/* Block Impact */}
      <div className="rounded-lg border border-border p-6">
        <h3 className="font-semibold text-foreground">Decision Impact</h3>
        <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-3">
          <div>
            <p className="text-xs text-muted-foreground">Approved Expected Impact</p>
            <p className="mt-1 text-lg font-bold text-green-600">
              ₹{(metrics.impact.approvedExpectedImpact / 1000).toFixed(0)}k
            </p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Blocked Expected Impact</p>
            <p className="mt-1 text-lg font-bold text-red-600">
              ₹{(metrics.impact.blockedExpectedImpact / 1000).toFixed(0)}k
            </p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Realized Impact</p>
            <p className="mt-1 text-lg font-bold text-blue-600">
              ₹{(metrics.impact.realizedImpact / 1000).toFixed(0)}k
            </p>
          </div>
        </div>
      </div>

      {/* Recent Failures */}
      {summary.period.last24h.recentFailures.length > 0 && (
        <div className="rounded-lg border border-border p-6">
          <h3 className="font-semibold text-foreground">Recent Failures (24h)</h3>
          <div className="mt-4 space-y-2">
            {summary.period.last24h.recentFailures.slice(0, 5).map((failure) => (
              <div key={failure.id} className="rounded-md border border-border p-3">
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <p className="text-sm font-medium text-foreground">{failure.stage}</p>
                    {failure.reason && (
                      <p className="mt-1 text-xs text-muted-foreground">{failure.reason}</p>
                    )}
                    <p className="mt-1 text-xs text-muted-foreground">
                      {new Date(failure.occurredAt).toLocaleTimeString()}
                    </p>
                  </div>
                  <Badge variant={failure.status === "error" ? "destructive" : "warning"}>
                    {failure.status}
                  </Badge>
                </div>
              </div>
            ))}
            {summary.period.last24h.recentFailures.length > 5 && (
              <p className="text-xs text-muted-foreground">
                ... and {summary.period.last24h.recentFailures.length - 5} more failures
              </p>
            )}
          </div>
        </div>
      )}

      {/* Error Rate */}
      <div className="rounded-lg border border-border p-6">
        <h3 className="font-semibold text-foreground">System Health (24h)</h3>
        <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <p className="text-xs text-muted-foreground">Error Rate</p>
            <p className={`mt-1 text-lg font-bold ${errorStatus === "critical" ? "text-red-600" : "text-green-600"}`}>
              {errorRate.toFixed(2)}%
            </p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Total Events</p>
            <p className="mt-1 text-lg font-bold text-foreground">
              {summary.period.last24h.lifecycleCounts.reduce((sum, c) => sum + c.count, 0)}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

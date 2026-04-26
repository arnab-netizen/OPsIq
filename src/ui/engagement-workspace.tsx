"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { Badge, Button } from "@/ui/primitives";
import { FindingsManager } from "@/ui/findings-manager";
import { RecommendationsManager } from "@/ui/recommendations-manager";
import { ActionCenter } from "@/ui/action-center";
import { KPITrend } from "@/ui/kpi-trend";

interface EngagementWorkspaceProps {
  engagement: any;
  initialFindings?: any[];
  initialRecommendations?: any[];
  initialActions?: any[];
  initialKPIs?: any[];
  initialEvidence?: any[];
}

const STATUS_VARIANTS: Record<string, "default" | "success" | "warning" | "destructive" | "muted"> = {
  draft: "muted",
  active: "success",
  paused: "warning",
  completed: "default",
  cancelled: "destructive",
  archived: "muted",
};

const SEVERITY_VARIANTS: Record<string, "default" | "success" | "warning" | "destructive" | "muted"> = {
  critical: "destructive",
  high: "warning",
  medium: "default",
  low: "muted",
};

const ACTION_STATUS_VARIANTS: Record<string, "default" | "success" | "warning" | "destructive" | "muted"> = {
  open: "warning",
  in_progress: "warning",
  completed: "success",
  assigned: "default",
  blocked: "destructive",
  verified: "success",
  cancelled: "muted",
};

export function EngagementWorkspace({
  engagement,
  initialFindings = [],
  initialRecommendations = [],
  initialActions = [],
  initialKPIs = [],
  initialEvidence = [],
}: EngagementWorkspaceProps) {
  const [tab, setTab] = useState<"overview" | "findings" | "recommendations" | "actions" | "evidence" | "review">("overview");
  const [findings, setFindings] = useState(initialFindings);
  const [recommendations, setRecommendations] = useState(initialRecommendations);
  const [actions, setActions] = useState(initialActions);
  const [kpis, setKPIs] = useState(initialKPIs);
  const [evidence, setEvidence] = useState(initialEvidence);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const openActions = actions.filter((a) => a.status === "open" || a.status === "in_progress");
  const completedActions = actions.filter((a) => a.status === "completed");
  const blockedActions = actions.filter((a) => a.status === "blocked");
  const criticalFindings = findings.filter((f) => f.severity === "critical");

  async function refreshData() {
    setIsLoading(true);
    setError(null);
    try {
      const [findingsRes, recsRes, actionsRes, kpisRes, evidenceRes] = await Promise.all([
        fetch(`/api/engagements/${engagement.id}/findings`),
        fetch(`/api/engagements/${engagement.id}/recommendations`),
        fetch(`/api/engagements/${engagement.id}/actions`),
        fetch(`/api/engagements/${engagement.id}/kpis`),
        fetch(`/api/evidence?engagementId=${engagement.id}&limit=100`),
      ]);

      if (!findingsRes.ok || !recsRes.ok || !actionsRes.ok || !kpisRes.ok || !evidenceRes.ok) {
        throw new Error("Failed to load workspace data");
      }

      const [findingsData, recsData, actionsData, kpisData, evidenceData] = await Promise.all([
        findingsRes.json(),
        recsRes.json(),
        actionsRes.json(),
        kpisRes.json(),
        evidenceRes.json(),
      ]);

      setFindings(findingsData);
      setRecommendations(recsData);
      setActions(actionsData);
      setKPIs(kpisData);
      setEvidence(evidenceData.items ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "An error occurred");
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <div className="space-y-6">
      {/* Header with Report Button */}
      <div className="flex items-center justify-end">
        <Link href={`/engagements/${engagement.id}/report`}>
          <Button size="sm" variant="outline">
            View Report
          </Button>
        </Link>
      </div>

      {/* Error State */}
      {error && (
        <div className="rounded-lg border border-destructive/20 bg-destructive/5 p-4">
          <p className="text-sm text-destructive">{error}</p>
          <Button size="sm" variant="outline" onClick={refreshData} className="mt-2">
            Retry
          </Button>
        </div>
      )}

      {/* Tab Navigation */}
      <div className="flex gap-2 overflow-x-auto border-b border-border pb-4">
        {(["overview", "findings", "recommendations", "actions", "evidence", "review"] as const).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`whitespace-nowrap px-3 py-2 text-sm font-medium border-b-2 transition-colors ${
              tab === t
                ? "border-primary text-foreground"
                : "border-transparent text-muted-foreground hover:text-foreground"
            }`}
          >
            {t.charAt(0).toUpperCase() + t.slice(1)}
          </button>
        ))}
      </div>

      {isLoading && tab !== "overview" && (
        <div className="rounded-lg border border-border p-8 text-center">
          <p className="text-sm text-muted-foreground">Loading {tab}...</p>
        </div>
      )}

      {/* Overview Tab */}
      {tab === "overview" && (
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
            <div className="rounded-lg border border-border bg-muted/10 p-4">
              <p className="text-xs font-medium uppercase text-muted-foreground">Findings</p>
              <p className="mt-2 text-2xl font-bold">{findings.length}</p>
              {criticalFindings.length > 0 && (
                <p className="mt-1 text-xs text-destructive">
                  {criticalFindings.length} critical
                </p>
              )}
            </div>
            <div className="rounded-lg border border-border bg-muted/10 p-4">
              <p className="text-xs font-medium uppercase text-muted-foreground">Recommendations</p>
              <p className="mt-2 text-2xl font-bold">{recommendations.length}</p>
            </div>
            <div className="rounded-lg border border-border bg-muted/10 p-4">
              <p className="text-xs font-medium uppercase text-muted-foreground">Actions</p>
              <p className="mt-2 text-2xl font-bold">{openActions.length}</p>
              <p className="mt-1 text-xs text-muted-foreground">open/in progress</p>
            </div>
            <div className="rounded-lg border border-border bg-muted/10 p-4">
              <p className="text-xs font-medium uppercase text-muted-foreground">Evidence</p>
              <p className="mt-2 text-2xl font-bold">{evidence.length}</p>
            </div>
          </div>

          <div className="rounded-lg border border-border p-6">
            <h3 className="font-semibold">Engagement Details</h3>
            <dl className="mt-4 space-y-3">
              <div>
                <dt className="text-sm text-muted-foreground">Client</dt>
                <dd>
                  <Link href={`/clients/${engagement.client.id}`} className="text-primary hover:underline">
                    {engagement.client.name}
                  </Link>
                </dd>
              </div>
              <div>
                <dt className="text-sm text-muted-foreground">Status</dt>
                <dd>
                  <Badge variant={STATUS_VARIANTS[engagement.status] ?? "muted"}>
                    {engagement.status}
                  </Badge>
                </dd>
              </div>
              <div>
                <dt className="text-sm text-muted-foreground">Intervention Mode</dt>
                <dd className="capitalize">{engagement.interventionMode?.replace("_", " ") ?? "Not set"}</dd>
              </div>
              <div>
                <dt className="text-sm text-muted-foreground">Intervention Phase</dt>
                <dd className="capitalize">{engagement.interventionPhase?.replace("_", " ") ?? "Not set"}</dd>
              </div>
            </dl>
          </div>
        </div>
      )}

      {/* Findings Tab */}
      {tab === "findings" && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-lg font-semibold">Findings ({findings.length})</h3>
            <Button size="sm" onClick={refreshData} disabled={isLoading}>
              Refresh
            </Button>
          </div>
          <FindingsManager
            findings={findings}
            engagementId={engagement.id}
            onFindingUpdated={refreshData}
          />
        </div>
      )}

      {/* Recommendations Tab */}
      {tab === "recommendations" && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-lg font-semibold">Recommendations ({recommendations.length})</h3>
            <Button size="sm" onClick={refreshData} disabled={isLoading}>
              Refresh
            </Button>
          </div>
          <RecommendationsManager
            recommendations={recommendations}
            engagementId={engagement.id}
            onRecommendationUpdated={refreshData}
          />
        </div>
      )}

      {/* Actions Tab */}
      {tab === "actions" && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-lg font-semibold">Actions ({actions.length})</h3>
            <Button size="sm" onClick={refreshData} disabled={isLoading}>
              Refresh
            </Button>
          </div>
          {actions.length > 0 ? (
            <ActionCenter
              actions={actions}
              engagementId={engagement.id}
              onActionUpdated={refreshData}
            />
          ) : (
            <div className="rounded-lg border border-border p-8 text-center">
              <p className="text-muted-foreground">No actions defined yet.</p>
            </div>
          )}
        </div>
      )}

      {/* Evidence Tab */}
      {tab === "evidence" && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-lg font-semibold">Evidence ({evidence.length})</h3>
            <div className="flex gap-2">
              <Link href={`/engagements/${engagement.id}/evidence`}>
                <Button size="sm" variant="outline">
                  Manage Evidence
                </Button>
              </Link>
              <Button size="sm" onClick={refreshData} disabled={isLoading}>
                Refresh
              </Button>
            </div>
          </div>
          {evidence.length > 0 ? (
            <div className="space-y-2">
              {evidence.map((e) => (
                <div key={e.id} className="rounded-lg border border-border p-4">
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <h4 className="font-medium">{e.sourceLabel || e.title}</h4>
                      <div className="mt-2 flex gap-2">
                        <Badge variant="outline" className="text-xs">
                          {e.category}
                        </Badge>
                        <Badge variant="outline" className="text-xs">
                          {e.sourceType}
                        </Badge>
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="rounded-lg border border-border p-8 text-center">
              <p className="text-muted-foreground">No evidence collected yet.</p>
              <Link href={`/engagements/${engagement.id}/evidence`}>
                <Button size="sm" className="mt-4">
                  Add Evidence
                </Button>
              </Link>
            </div>
          )}
        </div>
      )}

      {/* Review Tab */}
      {tab === "review" && (
        <div className="space-y-4">
          <h3 className="text-lg font-semibold">Review & Closure</h3>
          <div className="rounded-lg border border-border p-6">
            <div className="space-y-4">
              <div>
                <p className="text-sm text-muted-foreground">Open Actions</p>
                <p className="mt-1 text-2xl font-bold">{openActions.length}</p>
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Completed Actions</p>
                <p className="mt-1 text-2xl font-bold">{completedActions.length}</p>
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Blocked Actions</p>
                <p className="mt-1 text-2xl font-bold">{blockedActions.length}</p>
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Unresolved Findings</p>
                <p className="mt-1 text-2xl font-bold">{findings.length}</p>
              </div>
            </div>
            {openActions.length === 0 && blockedActions.length === 0 && findings.length === 0 && (
              <div className="mt-6 rounded-lg border border-success/20 bg-success/5 p-4">
                <p className="text-sm text-success">Engagement is ready for closure review.</p>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

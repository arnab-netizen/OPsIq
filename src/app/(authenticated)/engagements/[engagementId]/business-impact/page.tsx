"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { classifyOperatorError } from "@/lib/operator-error-governance";
import { toHttpResponseError } from "@/lib/operator-safe-errors";
import { DetailPageSkeleton } from "@/ui/primitives";

interface DetailData {
  impactLevel: string;
  reasoning: string[];
  financialExplanation: string[];
  timeExplanation: string[];
  recoveryExplanation: string[];
  drivers: string[];
  actionsAffectingImpact: Array<{
    actionId: string;
    title: string;
    status: string;
    priority: string;
    impactContribution: string;
  }>;
}

interface ImpactDeltaData {
  actionTitle: string;
  current: { impactLevel: string; estimatedLoss: number | null };
  ifCompleted: { impactLevel: string; estimatedLoss: number | null; estimatedLossReduction: number | null };
  ifDelayed: { impactLevel: string; estimatedLoss: number | null; additionalLoss: number | null; delayPenaltyDays: number };
  ifIgnored: { impactLevel: string; estimatedLoss: number | null; lossEscalation: number | null; projectedFailureDays: number | null };
}

export default function BusinessImpactPage() {
  const router = useRouter();
  const params = useParams();
  const searchParams = useSearchParams();
  const engagementId = params.engagementId as string;
  const actionId = searchParams.get("action");

  const [data, setData] = useState<DetailData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [deltaData, setDeltaData] = useState<ImpactDeltaData | null>(null);

  useEffect(() => {
    async function fetchDetail() {
      try {
        setError(null);
        const response = await fetch(
          `/api/engagements/${engagementId}/business-impact/detail`
        );
        if (!response.ok) {
          throw await toHttpResponseError(response);
        }
        const result = await response.json();
        setData(result.data);
      } catch (err) {
        const governed = classifyOperatorError(err instanceof Error ? err : new Error(String(err)), { context: 'load' });
        setError(governed.operatorMessage);
      } finally {
        setIsLoading(false);
      }
    }

    if (engagementId) {
      fetchDetail();
    }
  }, [engagementId]);

  useEffect(() => {
    async function fetchDelta() {
      if (!actionId) {
        setDeltaData(null);
        return;
      }
      try {
        const response = await fetch(`/api/actions/${actionId}/impact-delta`);
        if (!response.ok) {
          return; // Silently fail - delta is optional
        }
        const result = await response.json();
        setDeltaData(result.data);
      } catch (err) {
        // Silently fail - delta is optional
      }
    }

    fetchDelta();
  }, [actionId]);

  if (isLoading) {
    return <DetailPageSkeleton label="Loading business impact analysis" />;
  }

  if (error) {
    return (
      <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-4">
        <p className="text-sm text-destructive">{error}</p>
        <button
          onClick={() => router.back()}
          className="mt-2 text-sm text-[var(--primary-text)] underline"
        >
          Go back
        </button>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="flex items-center justify-center p-8">
        <p className="text-muted-foreground">No data available</p>
      </div>
    );
  }

  const colorMap: Record<string, string> = {
    existential: "text-destructive",
    critical: "text-destructive",
    high: "text-[var(--warning-text)]",
    medium: "text-muted-foreground",
    low: "text-muted-foreground",
  };

  const bgColorMap: Record<string, string> = {
    existential: "bg-destructive/10 border-destructive/30",
    critical: "bg-destructive/5 border-destructive/20",
    high: "bg-warning/5 border-warning/20",
    medium: "bg-muted/5 border-muted/20",
    low: "bg-card border-border",
  };

  const impactLevelColor = colorMap[data.impactLevel] || "text-muted-foreground";
  const impactBgColor = bgColorMap[data.impactLevel] || "bg-card border-border";

  return (
    <div className="space-y-6 p-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Business Impact Analysis</h1>
        <button
          onClick={() => router.back()}
          className="text-sm text-[var(--primary-text)] underline"
        >
          ← Back to Dashboard
        </button>
      </div>

      {/* Impact Summary */}
      <div className={`rounded-lg border p-4 ${impactBgColor}`}>
        <h2 className="text-lg font-semibold">Impact Summary</h2>
        <div className="mt-3 grid grid-cols-2 gap-4 md:grid-cols-3">
          <div>
            <p className="text-xs font-medium uppercase text-muted-foreground">
              Impact Level
            </p>
            <p className={`mt-1 text-lg font-bold capitalize ${impactLevelColor}`}>
              {data.impactLevel}
            </p>
          </div>
        </div>
      </div>

      {/* Why This Impact */}
      {data.reasoning.length > 0 && (
        <div className="rounded-lg border border-border bg-card p-4">
          <h2 className="text-lg font-semibold">Why This Impact</h2>
          <ul className="mt-3 space-y-2">
            {data.reasoning.map((reason, i) => (
              <li key={i} className="text-sm text-foreground">
                • {reason}
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Financial Impact */}
      {data.financialExplanation.length > 0 && (
        <div className="rounded-lg border border-border bg-card p-4">
          <h2 className="text-lg font-semibold">Financial Impact</h2>
          <ul className="mt-3 space-y-2">
            {data.financialExplanation.map((exp, i) => (
              <li key={i} className="text-sm text-foreground">
                • {exp}
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Time Impact */}
      {data.timeExplanation.length > 0 && (
        <div className="rounded-lg border border-border bg-card p-4">
          <h2 className="text-lg font-semibold">Time Impact</h2>
          <ul className="mt-3 space-y-2">
            {data.timeExplanation.map((exp, i) => (
              <li key={i} className="text-sm text-foreground">
                • {exp}
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Recovery Impact */}
      {data.recoveryExplanation.length > 0 && (
        <div className="rounded-lg border border-border bg-card p-4">
          <h2 className="text-lg font-semibold">Recovery Impact</h2>
          <ul className="mt-3 space-y-2">
            {data.recoveryExplanation.map((exp, i) => (
              <li key={i} className="text-sm text-foreground">
                • {exp}
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Top Drivers */}
      {data.drivers.length > 0 && (
        <div className="rounded-lg border border-border bg-card p-4">
          <h2 className="text-lg font-semibold">Top Impact Drivers</h2>
          <ul className="mt-3 space-y-2">
            {data.drivers.map((driver, i) => (
              <li key={i} className="text-sm text-foreground">
                • {driver}
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Actions Affecting Impact */}
      {data.actionsAffectingImpact.length > 0 && (
        <div className="rounded-lg border border-border bg-card p-4">
          <h2 className="text-lg font-semibold">Actions Affecting Impact</h2>
          <div className="mt-3 space-y-3">
            {data.actionsAffectingImpact.map((action) => (
              <div
                key={action.actionId}
                className="rounded border border-muted bg-muted/5 p-3"
              >
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <p className="font-medium text-foreground">{action.title}</p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {action.impactContribution}
                    </p>
                  </div>
                  <div className="ml-4 text-right">
                    <p className="text-xs font-medium uppercase text-muted-foreground">
                      Status
                    </p>
                    <p className="mt-1 text-sm capitalize">{action.status}</p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Decision Impact */}
      {deltaData && (
        <div className="rounded-lg border border-border bg-card p-4">
          <h2 className="text-lg font-semibold">Decision Impact: {deltaData.actionTitle}</h2>
          <div className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-3">
            {/* If Completed */}
            <div className="rounded border border-success/30 bg-success/5 p-3">
              <p className="text-sm font-semibold text-[var(--success-text)]">If Completed ✓</p>
              <div className="mt-2 space-y-2 text-xs">
                <div>
                  <p className="text-muted-foreground">Impact Level</p>
                  <p className="font-medium">
                    {deltaData.current.impactLevel} →{" "}
                    <span className="text-[var(--success-text)]">{deltaData.ifCompleted.impactLevel}</span>
                  </p>
                </div>
                {deltaData.ifCompleted.estimatedLossReduction && (
                  <div>
                    <p className="text-muted-foreground">Loss Reduction</p>
                    <p className="font-medium text-[var(--success-text)]">
                      -${(deltaData.ifCompleted.estimatedLossReduction / 1000).toFixed(0)}K
                    </p>
                  </div>
                )}
                {deltaData.ifCompleted.estimatedLoss !== null && (
                  <div>
                    <p className="text-muted-foreground">Remaining Loss</p>
                    <p className="font-medium">
                      ${(deltaData.ifCompleted.estimatedLoss / 1000).toFixed(0)}K
                    </p>
                  </div>
                )}
              </div>
            </div>

            {/* If Delayed */}
            <div className="rounded border border-warning/30 bg-warning/5 p-3">
              <p className="text-sm font-semibold text-[var(--warning-text)]">If Delayed ⏳</p>
              <div className="mt-2 space-y-2 text-xs">
                <div>
                  <p className="text-muted-foreground">Impact Level</p>
                  <p className="font-medium">
                    {deltaData.current.impactLevel} →{" "}
                    <span className="text-[var(--warning-text)]">{deltaData.ifDelayed.impactLevel}</span>
                  </p>
                </div>
                <div>
                  <p className="text-muted-foreground">Delay Penalty</p>
                  <p className="font-medium">{deltaData.ifDelayed.delayPenaltyDays} days</p>
                </div>
                {deltaData.ifDelayed.additionalLoss && (
                  <div>
                    <p className="text-muted-foreground">Additional Loss</p>
                    <p className="font-medium text-[var(--warning-text)]">
                      +${(deltaData.ifDelayed.additionalLoss / 1000).toFixed(0)}K
                    </p>
                  </div>
                )}
              </div>
            </div>

            {/* If Ignored */}
            <div className="rounded border border-destructive/30 bg-destructive/5 p-3">
              <p className="text-sm font-semibold text-destructive">If Ignored ✗</p>
              <div className="mt-2 space-y-2 text-xs">
                <div>
                  <p className="text-muted-foreground">Impact Level</p>
                  <p className="font-medium">
                    {deltaData.current.impactLevel} →{" "}
                    <span className="text-destructive">{deltaData.ifIgnored.impactLevel}</span>
                  </p>
                </div>
                {deltaData.ifIgnored.projectedFailureDays && (
                  <div>
                    <p className="text-muted-foreground">Days to Failure</p>
                    <p className="font-medium text-destructive">
                      {deltaData.ifIgnored.projectedFailureDays} days
                    </p>
                  </div>
                )}
                {deltaData.ifIgnored.lossEscalation && (
                  <div>
                    <p className="text-muted-foreground">Loss Escalation</p>
                    <p className="font-medium text-destructive">
                      +${(deltaData.ifIgnored.lossEscalation / 1000).toFixed(0)}K
                    </p>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

"use client";

import { useState, useEffect } from "react";
import { Badge, DetailPageSkeleton } from "@/ui/primitives";
import { classifyOperatorError } from "@/lib/operator-error-governance";
import { toHttpResponseError } from "@/lib/operator-safe-errors";

interface DecisionEvidencePage {
  params: {
    engagementId: string;
  };
}

interface DecisionEvidenceData {
  decisionId: string;
  engagementId: string;
  engagementCode: string;
  decisionType: "immediate" | "urgent" | "recommended";
  generatedAt: string;
  inputs: {
    actions: {
      total: number;
      overdue: number;
      blocked: number;
      critical: number;
      items: Array<{
        id: string;
        title: string;
        priority: string;
        status: string;
        dueDate?: string;
        isOverdue?: boolean;
        isBlocked?: boolean;
      }>;
    };
    findings: {
      total: number;
      critical: number;
      unresolved: number;
      items: Array<{
        id: string;
        title: string;
        severity: string;
        status: string;
        verified: boolean;
      }>;
    };
    recommendations: {
      total: number;
      open: number;
      highPriority: number;
      items: Array<{
        id: string;
        title: string;
        priority: string;
        status: string;
      }>;
    };
    metrics: {
      executionCertaintyScore: number;
      driftDetected: boolean;
      driftSeverity: string | null;
      healthStatus: string;
      decisionConfidenceScore: number;
      businessImpactLevel: string;
      revenueAtRiskPct: number | null;
    };
  };
  reasoning: {
    triggers: string[];
    rulesApplied: string[];
    priorityLogic: string;
  };
  confidenceBreakdown: {
    executionCertainty: number;
    dataCompleteness: number;
    riskLevel: number;
    overallScore: number;
  };
  impactBasis: {
    financial: number | null;
    timelineToFailureHours: number | null;
    recoveryProbabilityPct: number;
    driftSeverityScore: number;
  };
}

export default function DecisionEvidencePage({ params }: DecisionEvidencePage) {
  const { engagementId } = params;
  const [evidence, setEvidence] = useState<DecisionEvidenceData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchEvidence = async () => {
      try {
        setIsLoading(true);
        const response = await fetch(`/api/engagements/${engagementId}/decision-evidence`);
        if (!response.ok) {
          throw await toHttpResponseError(response);
        }
        const data = await response.json();
        setEvidence(data.data);
      } catch (err) {
        const governed = classifyOperatorError(err instanceof Error ? err : new Error(String(err)), { context: 'load' });
        setError(governed.operatorMessage);
      } finally {
        setIsLoading(false);
      }
    };

    fetchEvidence();
  }, [engagementId]);

  if (isLoading) {
    return <DetailPageSkeleton label="Loading decision evidence" />;
  }

  if (error) {
    return (
      <div className="p-6">
        <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-4">
          <p className="text-sm font-medium text-destructive">Error</p>
          <p className="mt-1 text-xs text-destructive">{error}</p>
        </div>
      </div>
    );
  }

  if (!evidence) {
    return <div className="p-6 text-center">No evidence available</div>;
  }

  return (
    <div className="space-y-6 p-6">
      {/* Header */}
      <div className="space-y-2">
        <h1 className="text-2xl font-bold">Decision Evidence</h1>
        <div className="flex items-center gap-3 text-xs text-muted-foreground">
          <span>{evidence.engagementCode}</span>
          <span>•</span>
          <span>Decision ID: {evidence.decisionId}</span>
          <span>•</span>
          <span>Generated {new Date(evidence.generatedAt).toLocaleString()}</span>
        </div>
      </div>

      {/* Decision Summary */}
      <div className="rounded-lg border border-border bg-card p-4">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold">Decision Summary</h2>
          <Badge
            variant={
              evidence.decisionType === "immediate"
                ? "destructive"
                : evidence.decisionType === "urgent"
                  ? "warning"
                  : "default"
            }
          >
            {evidence.decisionType}
          </Badge>
        </div>
        <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
          <div>
            <p className="text-xs font-medium uppercase text-muted-foreground">Decision Type</p>
            <p className="mt-2 text-sm font-semibold capitalize">{evidence.decisionType}</p>
          </div>
          <div>
            <p className="text-xs font-medium uppercase text-muted-foreground">Overall Confidence</p>
            <p className="mt-2 text-sm font-semibold">{evidence.confidenceBreakdown.overallScore}%</p>
          </div>
          <div>
            <p className="text-xs font-medium uppercase text-muted-foreground">Risk Level</p>
            <p className="mt-2 text-sm font-semibold">{evidence.confidenceBreakdown.riskLevel}%</p>
          </div>
        </div>
      </div>

      {/* Inputs Section */}
      <div className="rounded-lg border border-border bg-card p-4">
        <h2 className="mb-4 text-lg font-semibold">Inputs Used</h2>

        <div className="space-y-4">
          {/* Actions Summary */}
          <div>
            <p className="text-sm font-medium">Actions ({evidence.inputs.actions.total})</p>
            <div className="mt-2 grid grid-cols-4 gap-2 text-xs">
              <div className="rounded bg-muted p-2">
                <p className="text-muted-foreground">Critical</p>
                <p className="font-semibold">{evidence.inputs.actions.critical}</p>
              </div>
              <div className="rounded bg-muted p-2">
                <p className="text-muted-foreground">Overdue</p>
                <p className="font-semibold">{evidence.inputs.actions.overdue}</p>
              </div>
              <div className="rounded bg-muted p-2">
                <p className="text-muted-foreground">Blocked</p>
                <p className="font-semibold">{evidence.inputs.actions.blocked}</p>
              </div>
              <div className="rounded bg-muted p-2">
                <p className="text-muted-foreground">Total</p>
                <p className="font-semibold">{evidence.inputs.actions.total}</p>
              </div>
            </div>
          </div>

          {/* Findings Summary */}
          <div>
            <p className="text-sm font-medium">Findings ({evidence.inputs.findings.total})</p>
            <div className="mt-2 grid grid-cols-3 gap-2 text-xs">
              <div className="rounded bg-muted p-2">
                <p className="text-muted-foreground">Critical</p>
                <p className="font-semibold">{evidence.inputs.findings.critical}</p>
              </div>
              <div className="rounded bg-muted p-2">
                <p className="text-muted-foreground">Unresolved</p>
                <p className="font-semibold">{evidence.inputs.findings.unresolved}</p>
              </div>
              <div className="rounded bg-muted p-2">
                <p className="text-muted-foreground">Total</p>
                <p className="font-semibold">{evidence.inputs.findings.total}</p>
              </div>
            </div>
          </div>

          {/* Recommendations Summary */}
          <div>
            <p className="text-sm font-medium">Recommendations ({evidence.inputs.recommendations.total})</p>
            <div className="mt-2 grid grid-cols-3 gap-2 text-xs">
              <div className="rounded bg-muted p-2">
                <p className="text-muted-foreground">High Priority</p>
                <p className="font-semibold">{evidence.inputs.recommendations.highPriority}</p>
              </div>
              <div className="rounded bg-muted p-2">
                <p className="text-muted-foreground">Open</p>
                <p className="font-semibold">{evidence.inputs.recommendations.open}</p>
              </div>
              <div className="rounded bg-muted p-2">
                <p className="text-muted-foreground">Total</p>
                <p className="font-semibold">{evidence.inputs.recommendations.total}</p>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Reasoning Section */}
      <div className="rounded-lg border border-border bg-card p-4">
        <h2 className="mb-4 text-lg font-semibold">Reasoning</h2>

        <div className="space-y-4">
          {/* Triggers */}
          <div>
            <p className="text-sm font-medium">What Triggered This Decision</p>
            <ul className="mt-2 space-y-1">
              {evidence.reasoning.triggers.map((trigger, idx) => (
                <li key={idx} className="text-xs text-muted-foreground">
                  • {trigger}
                </li>
              ))}
            </ul>
          </div>

          {/* Rules Applied */}
          <div>
            <p className="text-sm font-medium">Rules Applied</p>
            <ul className="mt-2 space-y-1">
              {evidence.reasoning.rulesApplied.map((rule, idx) => (
                <li key={idx} className="text-xs text-muted-foreground">
                  {rule}
                </li>
              ))}
            </ul>
          </div>

          {/* Priority Logic */}
          <div>
            <p className="text-sm font-medium">Priority Logic</p>
            <p className="mt-2 text-xs text-muted-foreground">{evidence.reasoning.priorityLogic}</p>
          </div>
        </div>
      </div>

      {/* Confidence Breakdown Section */}
      <div className="rounded-lg border border-border bg-card p-4">
        <h2 className="mb-4 text-lg font-semibold">Confidence Breakdown</h2>

        <div className="grid grid-cols-1 gap-4 md:grid-cols-4">
          <div className="rounded bg-muted p-3">
            <p className="text-xs font-medium text-muted-foreground">Execution Certainty</p>
            <p className="mt-2 text-2xl font-bold">{evidence.confidenceBreakdown.executionCertainty}%</p>
          </div>
          <div className="rounded bg-muted p-3">
            <p className="text-xs font-medium text-muted-foreground">Data Completeness</p>
            <p className="mt-2 text-2xl font-bold">{evidence.confidenceBreakdown.dataCompleteness}%</p>
          </div>
          <div className="rounded bg-muted p-3">
            <p className="text-xs font-medium text-muted-foreground">Risk Level</p>
            <p className="mt-2 text-2xl font-bold">{evidence.confidenceBreakdown.riskLevel}%</p>
          </div>
          <div className="rounded bg-muted p-3">
            <p className="text-xs font-medium text-muted-foreground">Overall Score</p>
            <p className="mt-2 text-2xl font-bold">{evidence.confidenceBreakdown.overallScore}%</p>
          </div>
        </div>
      </div>

      {/* Impact Basis Section */}
      <div className="rounded-lg border border-border bg-card p-4">
        <h2 className="mb-4 text-lg font-semibold">Impact Basis</h2>

        <div className="grid grid-cols-1 gap-4 md:grid-cols-4">
          {evidence.impactBasis.financial !== null && (
            <div className="rounded bg-muted p-3">
              <p className="text-xs font-medium text-muted-foreground">Financial Impact</p>
              <p className="mt-2 text-sm font-semibold">
                ${(evidence.impactBasis.financial / 1000).toFixed(0)}K
              </p>
            </div>
          )}
          {evidence.impactBasis.timelineToFailureHours !== null && (
            <div className="rounded bg-muted p-3">
              <p className="text-xs font-medium text-muted-foreground">Timeline to Failure</p>
              <p className="mt-2 text-sm font-semibold">
                {evidence.impactBasis.timelineToFailureHours} hours
              </p>
            </div>
          )}
          <div className="rounded bg-muted p-3">
            <p className="text-xs font-medium text-muted-foreground">Recovery Probability</p>
            <p className="mt-2 text-sm font-semibold">{evidence.impactBasis.recoveryProbabilityPct}%</p>
          </div>
          <div className="rounded bg-muted p-3">
            <p className="text-xs font-medium text-muted-foreground">Drift Severity Score</p>
            <p className="mt-2 text-sm font-semibold">{evidence.impactBasis.driftSeverityScore}%</p>
          </div>
        </div>
      </div>

      {/* Metrics Section */}
      <div className="rounded-lg border border-border bg-card p-4">
        <h2 className="mb-4 text-lg font-semibold">Key Metrics</h2>

        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <div className="rounded bg-muted p-3">
            <p className="text-xs font-medium text-muted-foreground">Execution Certainty</p>
            <p className="mt-2 text-sm font-semibold">{evidence.inputs.metrics.executionCertaintyScore}/100</p>
          </div>
          <div className="rounded bg-muted p-3">
            <p className="text-xs font-medium text-muted-foreground">Decision Confidence</p>
            <p className="mt-2 text-sm font-semibold">{evidence.inputs.metrics.decisionConfidenceScore}/100</p>
          </div>
          <div className="rounded bg-muted p-3">
            <p className="text-xs font-medium text-muted-foreground">Health Status</p>
            <p className="mt-2 text-sm font-semibold capitalize">{evidence.inputs.metrics.healthStatus}</p>
          </div>
          <div className="rounded bg-muted p-3">
            <p className="text-xs font-medium text-muted-foreground">Business Impact</p>
            <p className="mt-2 text-sm font-semibold capitalize">{evidence.inputs.metrics.businessImpactLevel}</p>
          </div>
          {evidence.inputs.metrics.driftDetected && (
            <div className="rounded bg-muted p-3">
              <p className="text-xs font-medium text-muted-foreground">Drift Status</p>
              <p className="mt-2 text-sm font-semibold capitalize">{evidence.inputs.metrics.driftSeverity}</p>
            </div>
          )}
          {evidence.inputs.metrics.revenueAtRiskPct !== null && (
            <div className="rounded bg-muted p-3">
              <p className="text-xs font-medium text-muted-foreground">Revenue at Risk</p>
              <p className="mt-2 text-sm font-semibold">{evidence.inputs.metrics.revenueAtRiskPct}%</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

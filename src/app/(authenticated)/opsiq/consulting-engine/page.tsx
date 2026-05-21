"use client";

import { useState } from "react";
import Link from "next/link";
import { Button, Input, Badge } from "@/ui/primitives";
import { classifyOperatorError } from "@/lib/operator-error-governance";

interface ConsultingEngineResponse {
  success: boolean;
  status: "SUCCESS" | "INSUFFICIENT_DATA" | "ERROR";
  data: {
    decisionMemo: {
      id: string;
      engagementId: string;
      timestamp: string;
      businessProblem: string;
      rootCauseDiagnosis: {
        id: string;
        type: string;
        description: string;
        mechanismDescription: string;
        evidenceIds: string[];
        confidence: string;
        alternativeExplanations?: string[];
        missingEvidenceFor?: string[];
      };
      diagnosisConfidence: string;
      criticalConstraints: Array<{
        id: string;
        type: string;
        description: string;
        severity: string;
        blocksActions: string[];
        releasableVia: string[];
      }>;
      recommendedInterventions: Array<{
        intervention: {
          id: string;
          title: string;
          class: string;
          objective: string;
          rationale: string;
          whyThisNow: string;
          ownerRole: string;
          steps: Array<{
            sequence: number;
            title: string;
            description: string;
            ownerRole: string;
            estimatedDays: number;
            successCriteria: string;
          }>;
          estimatedCostBand: string;
          expectedImpactOnRevenue: string;
          successMetrics: string[];
          failureRisks: string[];
          fallbackPlan: string;
          evidenceBasis: string[];
          estimatedTotalDays: number;
          priorityScore: number;
        };
        priorityScore: number;
        factors: Array<{
          factor: string;
          score: number;
          rationale: string;
        }>;
        sequencingReason: string;
      }>;
      scenarios?: Array<{
        id: string;
        name: string;
        description: string;
        assumptions: string[];
        interventionSubset: string[];
        expectedOutcome: string;
        risks: string[];
        likelihood: string;
      }>;
      implementation: {
        firstInterventionId: string;
        totalEstimatedDays: number;
        criticalPathInterventions: string[];
        contingencyRequired: boolean;
      };
      limitations: string[];
      nextReviewTriggers: string[];
    } | null;
    recommendations: Array<{ id: string; title: string; priority: string }>;
    actions: Array<{ id: string; title: string; priority: string }>;
  };
  warnings: string[];
}

const SEVERITY_COLORS: Record<string, "default" | "success" | "warning" | "destructive"> = {
  low: "success",
  medium: "default",
  high: "warning",
  critical: "destructive",
};

const CONFIDENCE_COLORS: Record<string, "default" | "success" | "warning" | "destructive"> = {
  definitive: "success",
  high: "success",
  moderate: "default",
  provisional: "warning",
  insufficient_evidence: "destructive",
};

export default function ConsultingEnginePage() {
  const [engagementId, setEngagementId] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<ConsultingEngineResponse | null>(null);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setIsSubmitting(true);
    setError(null);
    setResult(null);

    if (!engagementId.trim()) {
      setError("Please enter an engagement ID");
      setIsSubmitting(false);
      return;
    }

    try {
      const res = await fetch("/api/opsiq/consulting-engine/run", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ engagementId: engagementId.trim() }),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(
          data.error?.message || data.warnings?.[0] || "Failed to run consulting engine"
        );
      }

      setResult(data);
    } catch (err) {
      const governed = classifyOperatorError(err instanceof Error ? err : new Error(String(err)), { context: 'action' });
      setError(governed.operatorMessage);
    } finally {
      setIsSubmitting(false);
    }
  }

  if (result) {
    const memo = result.data.decisionMemo;

    if (result.status === "INSUFFICIENT_DATA") {
      return (
        <div className="mx-auto max-w-4xl py-8 px-4">
          <Link href="/opsiq/consulting-engine" className="text-sm text-blue-600 hover:underline mb-4 inline-block">
            ← Back
          </Link>

          <div className="border rounded-lg p-6 bg-white shadow-sm">
            <h1 className="text-3xl font-bold text-foreground mb-4">Insufficient Data</h1>
            <div className="bg-amber-50 border border-amber-200 rounded-lg p-4">
              <p className="text-amber-900 font-semibold mb-2">Cannot run consulting engine</p>
              <ul className="space-y-1 text-sm text-amber-800">
                {result.warnings.map((warning, idx) => (
                  <li key={idx}>• {warning}</li>
                ))}
              </ul>
              <p className="text-sm text-amber-700 mt-3">
                Please gather findings for this engagement before running the consulting engine.
              </p>
            </div>

            <button
              onClick={() => setResult(null)}
              className="mt-6 px-4 py-2 bg-gray-500 text-white rounded hover:bg-gray-600"
            >
              Run Another Analysis
            </button>
          </div>
        </div>
      );
    }

    return (
      <div className="mx-auto max-w-4xl py-8 px-4">
        <Link href="/opsiq/consulting-engine" className="text-sm text-blue-600 hover:underline mb-4 inline-block">
          ← Back
        </Link>

        <div className="border rounded-lg p-6 bg-white shadow-sm mb-6">
          <h1 className="text-3xl font-bold text-foreground mb-2">Decision Memo</h1>
          {memo && <p className="text-sm text-muted-foreground mb-4">ID: {memo.engagementId}</p>}

          {result.warnings.length > 0 && (
            <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 mb-6">
              <h3 className="font-semibold text-amber-900 mb-2">⚠ Warnings</h3>
              <ul className="space-y-1 text-sm text-amber-800">
                {result.warnings.map((warning, idx) => (
                  <li key={idx}>• {warning}</li>
                ))}
              </ul>
            </div>
          )}

          {memo && (
            <>
              <div className="grid grid-cols-3 gap-4 mb-6">
                <div className="border rounded p-3">
                  <div className="text-xs text-muted-foreground font-semibold uppercase">Root Cause</div>
                  <div className="text-sm font-medium text-foreground mt-1 truncate" title={memo.rootCauseDiagnosis.type}>
                    {memo.rootCauseDiagnosis.type.replace(/_/g, " ")}
                  </div>
                </div>
                <div className="border rounded p-3">
                  <div className="text-xs text-muted-foreground font-semibold uppercase">Confidence</div>
                  <Badge variant={CONFIDENCE_COLORS[memo.diagnosisConfidence.toLowerCase()]}>
                    {memo.diagnosisConfidence.replace(/_/g, " ")}
                  </Badge>
                </div>
                <div className="border rounded p-3">
                  <div className="text-xs text-muted-foreground font-semibold uppercase">Total Duration</div>
                  <div className="text-sm font-medium text-foreground mt-1">
                    {memo.implementation.totalEstimatedDays} days
                  </div>
                </div>
              </div>

              <div className="border-t pt-4">
                <h2 className="text-lg font-semibold text-foreground mb-2">Business Problem</h2>
                <p className="text-foreground text-sm leading-relaxed">{memo.businessProblem}</p>
              </div>

              <div className="border-t pt-4 mt-4">
                <h2 className="text-lg font-semibold text-foreground mb-2">Root Cause Diagnosis</h2>
                <div className="space-y-3">
                  <p>
                    <strong>Type:</strong> {memo.rootCauseDiagnosis.type.replace(/_/g, " ")}
                  </p>
                  <p>
                    <strong>Description:</strong> {memo.rootCauseDiagnosis.description}
                  </p>
                  <p>
                    <strong>Mechanism:</strong> {memo.rootCauseDiagnosis.mechanismDescription}
                  </p>
                  {memo.rootCauseDiagnosis.alternativeExplanations &&
                    memo.rootCauseDiagnosis.alternativeExplanations.length > 0 && (
                      <div>
                        <strong>Alternative Explanations:</strong>
                        <ul className="list-disc list-inside text-sm text-muted-foreground">
                          {memo.rootCauseDiagnosis.alternativeExplanations.map((alt, idx) => (
                            <li key={idx}>{alt}</li>
                          ))}
                        </ul>
                      </div>
                    )}
                </div>
              </div>
            </>
          )}
        </div>

        {result.data.recommendations.length > 0 && (
          <div className="border rounded-lg p-6 bg-white shadow-sm mb-6">
            <h2 className="text-xl font-bold text-foreground mb-4">
              Recommendations ({result.data.recommendations.length})
            </h2>
            <div className="space-y-3">
              {result.data.recommendations.map((rec) => (
                <div key={rec.id} className="border-l-4 border-blue-500 pl-4 py-2">
                  <div className="flex items-start justify-between">
                    <h3 className="font-semibold text-foreground">{rec.title}</h3>
                    <Badge variant={SEVERITY_COLORS[rec.priority.toLowerCase()] as any}>
                      {rec.priority}
                    </Badge>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {result.data.actions.length > 0 && (
          <div className="border rounded-lg p-6 bg-white shadow-sm mb-6">
            <h2 className="text-xl font-bold text-foreground mb-4">
              Actions ({result.data.actions.length})
            </h2>
            <div className="space-y-3">
              {result.data.actions.map((action) => (
                <div key={action.id} className="border-l-4 border-green-500 pl-4 py-2">
                  <div className="flex items-start justify-between">
                    <h3 className="font-semibold text-foreground">{action.title}</h3>
                    <Badge variant={SEVERITY_COLORS[action.priority.toLowerCase()] as any}>
                      {action.priority}
                    </Badge>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {memo && memo.limitations.length > 0 && (
          <div className="border rounded-lg p-6 bg-amber-50 border-amber-200 shadow-sm mb-6">
            <h2 className="text-lg font-semibold text-amber-900 mb-3">Limitations & Caveats</h2>
            <ul className="space-y-2">
              {memo.limitations.map((limitation, idx) => (
                <li key={idx} className="text-sm text-amber-800">
                  ⚠ {limitation}
                </li>
              ))}
            </ul>
          </div>
        )}

        <button
          onClick={() => setResult(null)}
          className="px-4 py-2 bg-gray-500 text-white rounded hover:bg-gray-600"
        >
          Run Another Analysis
        </button>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-2xl py-8 px-4">
      <div className="border rounded-lg p-6 bg-white shadow-sm">
        <h1 className="text-3xl font-bold text-foreground mb-2">Consulting Engine</h1>
        <p className="text-muted-foreground text-sm mb-6">
          Run the consulting engine analysis on an existing engagement. Requires at least one approved finding.
        </p>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label htmlFor="engagementId" className="block text-sm font-medium text-foreground mb-2">
              Engagement ID
            </label>
            <Input
              id="engagementId"
              type="text"
              placeholder="Enter engagement UUID"
              value={engagementId}
              onChange={(e) => setEngagementId(e.target.value)}
              disabled={isSubmitting}
              className="w-full"
            />
            <p className="text-xs text-muted-foreground mt-1">
              Copy the engagement ID from the engagement details page
            </p>
          </div>

          {error && (
            <div className="bg-red-50 border border-red-200 text-red-900 px-4 py-3 rounded-lg text-sm">
              {error}
            </div>
          )}

          <div className="flex gap-2">
            <Button type="submit" disabled={isSubmitting} className="flex-1">
              {isSubmitting ? "Running..." : "Run Analysis"}
            </Button>
            <Link href="/engagements" className="px-4 py-2 border rounded hover:bg-gray-50 text-center text-sm">
              Browse Engagements
            </Link>
          </div>
        </form>
      </div>

      <div className="border rounded-lg p-6 bg-gray-50 shadow-sm mt-6">
        <h2 className="text-lg font-semibold text-foreground mb-3">About Consulting Engine</h2>
        <ul className="space-y-2 text-sm text-muted-foreground list-disc list-inside">
          <li>Analyzes approved findings from your engagement</li>
          <li>Diagnoses root causes with confidence levels</li>
          <li>Generates prioritized intervention recommendations</li>
          <li>Creates actionable next steps</li>
          <li>Flags limitations and risk factors</li>
        </ul>
      </div>
    </div>
  );
}

"use client";

import { useState } from "react";
import Link from "next/link";
import { Button, Input, Textarea, Select, Badge } from "@/ui/primitives";
import { classifyOperatorError } from "@/lib/operator-error-governance";
import { createClientIdempotencyKey } from "@/lib/client-idempotency";
import DiagnosisBetaNotice from "@/components/diagnosis/DiagnosisBetaNotice";
import DiagnosisEvidenceScopeNotice from "@/components/diagnosis/DiagnosisEvidenceScopeNotice";

interface DiagnosisResult {
  id: string;
  diagnosisSummary: string;
  primaryProblemCategory: string;
  severity: string;
  interventionPhase: string;
  findings: Array<{ id: string; title: string; severity: string; description: string; evidence?: string }>;
  recommendations: Array<{ id: string; title: string; priority: string; description: string; whyFirst?: string }>;
  actionPlan: Array<{
    title: string;
    description: string;
    priority: string;
    ownerRole: string;
    dueInDays: number;
    successMetric: string;
    urgency?: "immediate" | "next";
    bottleneck?: string;
  }>;
  engagementId: string;
  createdAt: string;
  executiveBrief?: { title: string; summary: string; warnings: string[] };
  confidence?: "low" | "medium" | "high";
  dataWarnings?: string[];
  whyThisMattersNow?: string;
  whatNotToDoYet?: string[];
}

const SEVERITY_COLORS: Record<string, "default" | "success" | "warning" | "destructive" | "muted"> = {
  low: "success",
  medium: "default",
  high: "warning",
  critical: "destructive",
};

const PHASE_COLORS: Record<string, "default" | "success" | "warning" | "destructive" | "muted"> = {
  triage: "destructive",
  stabilize: "warning",
  repair: "default",
  strengthen: "default",
  grow: "success",
  protect: "success",
};

const PRIORITY_COLORS: Record<string, "default" | "success" | "warning" | "destructive" | "muted"> = {
  low: "muted",
  medium: "default",
  high: "warning",
};

export default function DiagnosisPage() {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<DiagnosisResult | null>(null);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setIsSubmitting(true);
    setError(null);
    setResult(null);

    const formData = new FormData(e.currentTarget);
    const body = {
      businessName: formData.get("businessName"),
      businessType: formData.get("businessType"),
      problemStatement: formData.get("problemStatement"),
      mainIssue: formData.get("mainIssue"),
    };

    const revenue = formData.get("monthlyRevenue");
    const costs = formData.get("monthlyCosts");
    const customers = formData.get("customerCount");

    if (revenue && typeof revenue === "string" && revenue.trim()) {
      Object.assign(body, { monthlyRevenue: parseFloat(revenue) });
    }
    if (costs && typeof costs === "string" && costs.trim()) {
      Object.assign(body, { monthlyCosts: parseFloat(costs) });
    }
    if (customers && typeof customers === "string" && customers.trim()) {
      Object.assign(body, { customerCount: parseInt(customers, 10) });
    }

    try {
      const idempotencyKey = createClientIdempotencyKey("diagnosis");
      const res = await fetch("/api/diagnosis", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "idempotency-key": idempotencyKey,
        },
        body: JSON.stringify(body),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error?.message ?? "Failed to run diagnosis");
      }

      const data = await res.json();
      setResult(data);
    } catch (err) {
      const governed = classifyOperatorError(err instanceof Error ? err : new Error(String(err)), { context: 'action' });
      setError(governed.operatorMessage);
      setIsSubmitting(false);
    }
  }

  if (result) {
    return (
      <div className="mx-auto max-w-4xl py-8">
        <Link href="/diagnosis" className="text-sm text-blue-600 hover:underline mb-4 inline-block">
          ← Back to Diagnosis
        </Link>

        <div className="border rounded-lg p-6 bg-card shadow-sm mb-6">
          <h1 className="text-3xl font-bold text-foreground mb-2">Diagnosis Results</h1>
          <p className="text-muted-foreground text-sm mb-4">
            Engagement ID: {result.engagementId}
          </p>

          <DiagnosisEvidenceScopeNotice placement="result" />

          {result.executiveBrief && (
            <div className={`rounded-lg p-4 mb-6 ${result.severity === "critical" ? "bg-red-50 border border-red-200" : "bg-amber-50 border border-amber-200"}`}>
              <h2 className={`font-bold text-lg mb-2 ${result.severity === "critical" ? "text-red-900" : "text-amber-900"}`}>
                {result.executiveBrief.title}
              </h2>
              <p className={`text-sm leading-relaxed mb-3 ${result.severity === "critical" ? "text-red-800" : "text-amber-800"}`}>
                {result.executiveBrief.summary}
              </p>
              {result.executiveBrief.warnings.length > 0 && (
                <div className="space-y-1">
                  <p className={`text-xs font-semibold ${result.severity === "critical" ? "text-red-900" : "text-amber-900"}`}>
                    DATA ISSUES DETECTED:
                  </p>
                  {result.executiveBrief.warnings.map((warning, idx) => (
                    <p key={idx} className={`text-xs ${result.severity === "critical" ? "text-red-700" : "text-amber-700"}`}>
                      • {warning}
                    </p>
                  ))}
                </div>
              )}
              {result.confidence && (
                <div className="mt-3 flex items-center gap-2">
                  <span className="text-xs text-muted-foreground">Confidence:</span>
                  <Badge variant={result.confidence === "high" ? "success" : result.confidence === "medium" ? "default" : "warning"}>
                    {result.confidence.toUpperCase()}
                  </Badge>
                </div>
              )}
            </div>
          )}

          <div className="grid grid-cols-4 gap-4 mb-6">
            <div className="border rounded p-3">
              <div className="text-xs text-muted-foreground font-semibold uppercase">Severity</div>
              <Badge variant={SEVERITY_COLORS[result.severity]}>
                {result.severity.toUpperCase()}
              </Badge>
            </div>
            <div className="border rounded p-3">
              <div className="text-xs text-muted-foreground font-semibold uppercase">Phase</div>
              <Badge variant={PHASE_COLORS[result.interventionPhase]}>
                {result.interventionPhase.replace(/_/g, " ").toUpperCase()}
              </Badge>
            </div>
            <div className="border rounded p-3">
              <div className="text-xs text-muted-foreground font-semibold uppercase">Category</div>
              <div className="text-sm font-medium text-foreground mt-1">
                {result.primaryProblemCategory.replace(/_/g, " ")}
              </div>
            </div>
            <div className="border rounded p-3">
              <div className="text-xs text-muted-foreground font-semibold uppercase">Created</div>
              <div className="text-sm font-medium text-foreground mt-1">
                {new Date(result.createdAt).toLocaleDateString()}
              </div>
            </div>
          </div>

          <div className="border-t pt-4">
            <h2 className="text-lg font-semibold text-foreground mb-2">Diagnosis Summary</h2>
            <p className="text-foreground text-sm leading-relaxed">{result.diagnosisSummary}</p>
          </div>
        </div>

        {result.findings.length > 0 && (
          <div className="border rounded-lg p-6 bg-card shadow-sm mb-6">
            <h2 className="text-xl font-bold text-foreground mb-4">Key Findings ({result.findings.length})</h2>
            <div className="space-y-3">
              {result.findings.map((finding) => (
                <div key={finding.id} className="border-l-4 border-orange-500 pl-4 py-2">
                  <div className="flex items-start justify-between mb-1">
                    <h3 className="font-semibold text-foreground">{finding.title}</h3>
                    <Badge variant={SEVERITY_COLORS[finding.severity]}>
                      {finding.severity}
                    </Badge>
                  </div>
                  <p className="text-sm text-muted-foreground">{finding.description}</p>
                  {finding.evidence && (
                    <p className="mt-1 text-xs text-muted-foreground">
                      <strong className="text-foreground">Evidence:</strong> {finding.evidence}
                    </p>
                  )}
                </div>
              ))}
            </div>
            {result.whyThisMattersNow && (
              <div className="mt-4 rounded-md border border-border bg-muted/40 p-3 text-sm">
                <strong className="text-foreground">Why this matters now:</strong>{" "}
                <span className="text-muted-foreground">{result.whyThisMattersNow}</span>
              </div>
            )}
          </div>
        )}

        {result.recommendations.length > 0 && (
          <div className="border rounded-lg p-6 bg-card shadow-sm mb-6">
            <h2 className="text-xl font-bold text-foreground mb-4">
              Recommendations ({result.recommendations.length})
            </h2>
            <div className="space-y-3">
              {result.recommendations.map((rec) => (
                <div key={rec.id} className="border-l-4 border-blue-500 pl-4 py-2">
                  <div className="flex items-start justify-between mb-1">
                    <h3 className="font-semibold text-foreground">{rec.title}</h3>
                    <Badge variant={PRIORITY_COLORS[rec.priority]}>
                      {rec.priority}
                    </Badge>
                  </div>
                  <p className="text-sm text-muted-foreground">{rec.description}</p>
                  {rec.whyFirst && (
                    <p className="mt-1 text-xs text-muted-foreground">
                      <strong className="text-foreground">Why this is first:</strong> {rec.whyFirst}
                    </p>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {result.actionPlan.length > 0 && (
          <div className="border rounded-lg p-6 bg-card shadow-sm mb-6">
            <h2 className="text-xl font-bold text-foreground mb-4">Action Plan ({result.actionPlan.length})</h2>

            {result.actionPlan.filter(a => a.urgency === "immediate").length > 0 && (
              <div className="mb-6">
                <h3 className="text-lg font-semibold text-red-900 mb-3 pb-2 border-b-2 border-red-200">🚨 IMMEDIATE ACTIONS</h3>
                <div className="space-y-4">
                  {result.actionPlan
                    .filter(a => a.urgency === "immediate")
                    .map((action, idx) => (
                      <div key={idx} className="border rounded p-3 bg-red-50 border-red-200">
                        <div className="flex items-start justify-between mb-2">
                          <div>
                            <h3 className="font-semibold text-foreground">{action.title}</h3>
                            <p className="text-xs text-muted-foreground mt-1">
                              Owner: {action.ownerRole} • Due in {action.dueInDays} days
                            </p>
                          </div>
                          <Badge variant={PRIORITY_COLORS[action.priority]}>
                            {action.priority}
                          </Badge>
                        </div>
                        <p className="text-sm text-muted-foreground mb-2">{action.description}</p>
                        {action.bottleneck && (
                          <p className="text-xs text-muted-foreground mb-2">
                            <strong className="text-foreground">Bottleneck:</strong> {action.bottleneck}
                          </p>
                        )}
                        <div className="text-xs bg-card border rounded p-2">
                          <strong>Success metric:</strong> {action.successMetric}
                        </div>
                      </div>
                    ))}
                </div>
              </div>
            )}

            {result.actionPlan.filter(a => a.urgency === "next").length > 0 && (
              <div>
                <h3 className="text-lg font-semibold text-amber-900 mb-3 pb-2 border-b-2 border-amber-200">📋 NEXT ACTIONS</h3>
                <div className="space-y-4">
                  {result.actionPlan
                    .filter(a => a.urgency === "next")
                    .map((action, idx) => (
                      <div key={idx} className="border rounded p-3 bg-gray-50">
                        <div className="flex items-start justify-between mb-2">
                          <div>
                            <h3 className="font-semibold text-foreground">{action.title}</h3>
                            <p className="text-xs text-muted-foreground mt-1">
                              Owner: {action.ownerRole} • Due in {action.dueInDays} days
                            </p>
                          </div>
                          <Badge variant={PRIORITY_COLORS[action.priority]}>
                            {action.priority}
                          </Badge>
                        </div>
                        <p className="text-sm text-muted-foreground mb-2">{action.description}</p>
                        {action.bottleneck && (
                          <p className="text-xs text-muted-foreground mb-2">
                            <strong className="text-foreground">Bottleneck:</strong> {action.bottleneck}
                          </p>
                        )}
                        <div className="text-xs bg-card border rounded p-2">
                          <strong>Success metric:</strong> {action.successMetric}
                        </div>
                      </div>
                    ))}
                </div>
              </div>
            )}
          </div>
        )}

        {result.whatNotToDoYet && result.whatNotToDoYet.length > 0 && (
          <div className="border rounded-lg p-6 bg-card shadow-sm mb-6">
            <h2 className="text-xl font-bold text-foreground mb-3">What not to do yet</h2>
            <ul className="space-y-2">
              {result.whatNotToDoYet.map((item, idx) => (
                <li key={idx} className="text-sm text-muted-foreground">
                  &bull; {item}
                </li>
              ))}
            </ul>
          </div>
        )}

        <div className="flex gap-2 justify-center mt-6">
          <Link href={`/engagements/${result.engagementId}`}>
            <Button>View Engagement</Button>
          </Link>
          <button
            onClick={() => {
              setResult(null);
              setError(null);
            }}
            className="px-4 py-2 border rounded text-foreground hover:bg-gray-50"
          >
            Run Another Diagnosis
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-2xl py-8">
      <h1 className="text-3xl font-bold text-foreground mb-2">Business Diagnosis</h1>
      <p className="text-muted-foreground mb-6">
        Describe your business challenge and receive a diagnosis with a recommended action plan.
      </p>

      <DiagnosisEvidenceScopeNotice placement="form" />
      <DiagnosisBetaNotice />

      {error && (
        <div className="mb-4 rounded-md border border-destructive/20 bg-destructive/5 p-4 text-sm text-destructive">
          {error}
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-4">
        <Input
          name="businessName"
          label="Business Name"
          placeholder="Acme Corp"
          required
          disabled={isSubmitting}
        />

        <Input
          name="businessType"
          label="Business Type"
          placeholder="e.g., SaaS, Retail, Manufacturing"
          required
          disabled={isSubmitting}
        />

        <Textarea
          name="problemStatement"
          label="Problem Statement"
          placeholder="Describe the main challenge your business is facing..."
          required
          disabled={isSubmitting}
          rows={4}
        />

        <Select
          name="mainIssue"
          label="Primary Issue"
          required
          disabled={isSubmitting}
          options={[
            { value: "low_sales", label: "Low Sales / Revenue" },
            { value: "high_costs", label: "High Costs" },
            { value: "cash_flow", label: "Cash Flow Issues" },
            { value: "customer_retention", label: "Customer Retention" },
            { value: "operations", label: "Operations & Efficiency" },
            { value: "unclear", label: "Unclear / Multiple Issues" },
          ]}
        />

        <div className="grid grid-cols-3 gap-4">
          <Input
            name="monthlyRevenue"
            label="Monthly Revenue (optional)"
            placeholder="e.g., 50000"
            type="number"
            disabled={isSubmitting}
          />
          <Input
            name="monthlyCosts"
            label="Monthly Costs (optional)"
            placeholder="e.g., 40000"
            type="number"
            disabled={isSubmitting}
          />
          <Input
            name="customerCount"
            label="Customer Count (optional)"
            placeholder="e.g., 100"
            type="number"
            disabled={isSubmitting}
          />
        </div>

        <Button
          type="submit"
          disabled={isSubmitting}
          className="w-full bg-blue-600 hover:bg-blue-700 text-white"
        >
          {isSubmitting ? "Running Diagnosis..." : "Run Diagnosis"}
        </Button>
      </form>
    </div>
  );
}

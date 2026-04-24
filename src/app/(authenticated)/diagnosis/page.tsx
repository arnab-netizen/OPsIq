"use client";

import { useState } from "react";
import Link from "next/link";
import { Button, Input, Textarea, Select, Badge } from "@/ui/primitives";

interface DiagnosisResult {
  id: string;
  diagnosisSummary: string;
  primaryProblemCategory: string;
  severity: string;
  interventionPhase: string;
  findings: Array<{ id: string; title: string; severity: string; description: string }>;
  recommendations: Array<{ id: string; title: string; priority: string; description: string }>;
  actionPlan: Array<{
    title: string;
    description: string;
    priority: string;
    ownerRole: string;
    dueInDays: number;
    successMetric: string;
  }>;
  engagementId: string;
  createdAt: string;
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
      const res = await fetch("/api/diagnosis", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error?.message ?? "Failed to run diagnosis");
      }

      const data = await res.json();
      setResult(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "An error occurred");
      setIsSubmitting(false);
    }
  }

  if (result) {
    return (
      <div className="mx-auto max-w-4xl py-8">
        <Link href="/diagnosis" className="text-sm text-blue-600 hover:underline mb-4 inline-block">
          ← Back to Diagnosis
        </Link>

        <div className="border rounded-lg p-6 bg-white shadow-sm mb-6">
          <h1 className="text-3xl font-bold text-foreground mb-2">Diagnosis Results</h1>
          <p className="text-muted-foreground text-sm mb-4">
            Engagement ID: {result.engagementId}
          </p>

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
          <div className="border rounded-lg p-6 bg-white shadow-sm mb-6">
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
                </div>
              ))}
            </div>
          </div>
        )}

        {result.recommendations.length > 0 && (
          <div className="border rounded-lg p-6 bg-white shadow-sm mb-6">
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
                </div>
              ))}
            </div>
          </div>
        )}

        {result.actionPlan.length > 0 && (
          <div className="border rounded-lg p-6 bg-white shadow-sm mb-6">
            <h2 className="text-xl font-bold text-foreground mb-4">Action Plan ({result.actionPlan.length})</h2>
            <div className="space-y-4">
              {result.actionPlan.map((action, idx) => (
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
                  <div className="text-xs bg-white border rounded p-2">
                    <strong>Success metric:</strong> {action.successMetric}
                  </div>
                </div>
              ))}
            </div>
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

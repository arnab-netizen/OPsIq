"use client";

import { useState } from "react";
import type {
  ConsultingEngineInput,
  ConsultingEngineOutput,
} from "@/domain/consulting-engine/types";
import { ConfidenceLevel } from "@/domain/consulting-engine/types";
import { v4 as uuidv4 } from "uuid";

/**
 * Consulting Engine UI: Display-only interface for decision memo
 *
 * No business logic here; all logic in consulting-engine services.
 * This page is for demonstration/testing of the consulting engine.
 */

export default function ConsultingEnginePage() {
  const [decisionMemo, setDecisionMemo] =
    useState<ConsultingEngineOutput | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleRunExample = async (caseType: "laundry" | "quality" | "retention") => {
    setLoading(true);
    setError(null);

    try {
      const input = generateExampleInput(caseType);
      const response = await fetch("/api/opsiq/consulting-engine/run", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(input),
      });

      if (!response.ok) {
        throw new Error(`API error: ${response.statusText}`);
      }

      const output: ConsultingEngineOutput = await response.json();
      setDecisionMemo(output);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Unknown error"
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="p-8 max-w-4xl mx-auto">
      <h1 className="text-3xl font-bold mb-6">Consulting Engine</h1>

      {!decisionMemo && (
        <div className="space-y-4">
          <p className="text-gray-600">
            Run the consulting engine on example cases:
          </p>
          <div className="flex gap-4">
            <button
              onClick={() => handleRunExample("laundry")}
              disabled={loading}
              className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50"
            >
              Case 1: Laundry Bottleneck
            </button>
            <button
              onClick={() => handleRunExample("quality")}
              disabled={loading}
              className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50"
            >
              Case 2: Quality Issues
            </button>
            <button
              onClick={() => handleRunExample("retention")}
              disabled={loading}
              className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50"
            >
              Case 3: Low Retention
            </button>
          </div>
        </div>
      )}

      {loading && <div className="text-center py-8">Running consulting engine...</div>}

      {error && (
        <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded">
          Error: {error}
        </div>
      )}

      {decisionMemo && (
        <div className="space-y-6 mt-8">
          <div className="bg-blue-50 border-l-4 border-blue-600 p-4">
            <h2 className="font-bold">Status: {decisionMemo.status}</h2>
            {decisionMemo.warnings.length > 0 && (
              <div className="mt-2 space-y-1">
                {decisionMemo.warnings.map((w, i) => (
                  <p key={i} className="text-sm text-blue-900">
                    ⚠ {w}
                  </p>
                ))}
              </div>
            )}
          </div>

          <section>
            <h2 className="text-2xl font-bold mb-4">Problem</h2>
            <p>{decisionMemo.decisionMemo.businessProblem}</p>
          </section>

          <section>
            <h2 className="text-2xl font-bold mb-4">Root Cause Diagnosis</h2>
            <div className="space-y-2">
              <p>
                <strong>Primary:</strong>{" "}
                {decisionMemo.decisionMemo.rootCauseDiagnosis.primary}
              </p>
              <p>
                <strong>Confidence:</strong>{" "}
                {decisionMemo.decisionMemo.diagnosisConfidence}
              </p>
              <p>
                <strong>Mechanism:</strong>{" "}
                {decisionMemo.decisionMemo.rootCauseDiagnosis.mechanismDescription}
              </p>
            </div>
          </section>

          {decisionMemo.decisionMemo.criticalConstraints.length > 0 && (
            <section>
              <h2 className="text-2xl font-bold mb-4">Constraints</h2>
              <div className="space-y-2">
                {decisionMemo.decisionMemo.criticalConstraints.map((c, i) => (
                  <div key={i} className="border-l-4 border-yellow-400 pl-4">
                    <p className="font-semibold">{c.description}</p>
                    <p className="text-sm text-gray-600">
                      [{c.severity}] Blocks: {c.blocksActions.join(", ")}
                    </p>
                  </div>
                ))}
              </div>
            </section>
          )}

          <section>
            <h2 className="text-2xl font-bold mb-4">
              Recommended Interventions (
              {decisionMemo.decisionMemo.recommendedInterventions.length})
            </h2>
            <div className="space-y-4">
              {decisionMemo.decisionMemo.recommendedInterventions.map(
                (item, i) => (
                  <div
                    key={i}
                    className="border rounded p-4 space-y-3"
                  >
                    <div className="flex justify-between items-start">
                      <h3 className="font-bold text-lg">
                        {i + 1}. {item.intervention.title}
                      </h3>
                      <span className="bg-blue-100 px-2 py-1 rounded text-sm font-semibold">
                        Priority {item.priorityScore}/100
                      </span>
                    </div>

                    <p className="text-sm text-gray-600">
                      {item.sequencingReason}
                    </p>

                    <div className="grid grid-cols-2 gap-2 text-sm">
                      <p>
                        <strong>Class:</strong> {item.intervention.class}
                      </p>
                      <p>
                        <strong>Owner:</strong> {item.intervention.ownerRole}
                      </p>
                      <p>
                        <strong>Duration:</strong>{" "}
                        {item.intervention.estimatedTotalDays} days
                      </p>
                      <p>
                        <strong>Cost:</strong> {item.intervention.estimatedCostBand}
                      </p>
                    </div>

                    <div>
                      <strong className="text-sm">Objective:</strong>
                      <p className="text-sm">{item.intervention.objective}</p>
                    </div>

                    <div>
                      <strong className="text-sm">Why This Now:</strong>
                      <p className="text-sm">{item.intervention.whyThisNow}</p>
                    </div>

                    <div>
                      <strong className="text-sm">Success Metrics:</strong>
                      <ul className="text-sm list-disc list-inside">
                        {item.intervention.successMetrics.map((m, j) => (
                          <li key={j}>{m}</li>
                        ))}
                      </ul>
                    </div>

                    <div>
                      <strong className="text-sm">Risks:</strong>
                      <ul className="text-sm list-disc list-inside text-red-700">
                        {item.intervention.failureRisks.map((r, j) => (
                          <li key={j}>{r}</li>
                        ))}
                      </ul>
                    </div>

                    <div className="bg-green-50 p-2 rounded">
                      <strong className="text-sm">Fallback Plan:</strong>
                      <p className="text-sm">{item.intervention.fallbackPlan}</p>
                    </div>
                  </div>
                )
              )}
            </div>
          </section>

          {decisionMemo.decisionMemo.scenarios &&
            decisionMemo.decisionMemo.scenarios.length > 0 && (
              <section>
                <h2 className="text-2xl font-bold mb-4">Scenarios</h2>
                <div className="space-y-3">
                  {decisionMemo.decisionMemo.scenarios.map((s, i) => (
                    <div key={i} className="border rounded p-4">
                      <h3 className="font-bold">{s.name}</h3>
                      <p className="text-sm text-gray-600">
                        Likelihood: {s.likelihood}
                      </p>
                      <p className="text-sm mt-2">{s.description}</p>
                    </div>
                  ))}
                </div>
              </section>
            )}

          {decisionMemo.decisionMemo.limitations.length > 0 && (
            <section className="bg-yellow-50 border border-yellow-200 rounded p-4">
              <h2 className="font-bold mb-2">Limitations</h2>
              <ul className="space-y-1 text-sm">
                {decisionMemo.decisionMemo.limitations.map((l, i) => (
                  <li key={i}>⚠ {l}</li>
                ))}
              </ul>
            </section>
          )}

          <button
            onClick={() => setDecisionMemo(null)}
            className="px-4 py-2 bg-gray-400 text-white rounded hover:bg-gray-500"
          >
            Clear & Run Another Case
          </button>
        </div>
      )}
    </div>
  );
}

function generateExampleInput(
  caseType: "laundry" | "quality" | "retention"
): ConsultingEngineInput {
  const engagementId = uuidv4();

  if (caseType === "laundry") {
    return {
      engagementId,
      businessProblem:
        "Low revenue - laundry store has declining repeat customers despite good service quality",
      evidence: [
        {
          id: uuidv4(),
          dimension: "operational_efficiency",
          finding:
            "High turnaround time: average 7-10 days vs competitor 2-3 days",
          confidence: ConfidenceLevel.HIGH,
          source: "Customer interviews and competitor mystery shopping",
          timestamp: new Date(),
          isCritical: true,
          supportingData: {
            avgTurnaroundDays: 8.5,
            competitorDays: 2.5,
          },
        },
        {
          id: uuidv4(),
          dimension: "customer_retention",
          finding: "Low repeat customers: only 20% use service twice",
          confidence: ConfidenceLevel.HIGH,
          source: "Transaction analysis over 12 months",
          timestamp: new Date(),
          isCritical: true,
          supportingData: {
            repeatRate: 0.2,
            industryAverage: 0.45,
          },
        },
        {
          id: uuidv4(),
          dimension: "quality_delivery",
          finding: "High complaint rate: 15% of orders",
          confidence: ConfidenceLevel.MEDIUM,
          source: "Complaint log review",
          timestamp: new Date(),
          isCritical: true,
          supportingData: {
            complaintRate: 0.15,
            mainComplaint: "Damage during processing",
          },
        },
      ],
      clientContext: {
        industry: "retail",
        size: "small",
        revenueImpactUrgency: "HIGH",
      },
    };
  }

  if (caseType === "quality") {
    return {
      engagementId,
      businessProblem:
        "Revenue declining due to quality issues and high complaint rate",
      evidence: [
        {
          id: uuidv4(),
          dimension: "quality_delivery",
          finding: "High complaint rate: 18% of customers complain",
          confidence: ConfidenceLevel.HIGH,
          source: "Customer feedback survey",
          timestamp: new Date(),
          isCritical: true,
        },
        {
          id: uuidv4(),
          dimension: "process_maturity",
          finding: "No documented quality control process",
          confidence: ConfidenceLevel.HIGH,
          source: "Process audit",
          timestamp: new Date(),
          isCritical: false,
        },
        {
          id: uuidv4(),
          dimension: "customer_retention",
          finding: "Repeat customer rate only 25%",
          confidence: ConfidenceLevel.MEDIUM,
          source: "Transaction data",
          timestamp: new Date(),
          isCritical: true,
        },
      ],
      clientContext: {
        industry: "manufacturing",
        size: "small",
        revenueImpactUrgency: "HIGH",
      },
    };
  }

  // retention case
  return {
    engagementId,
    businessProblem: "Revenue plateaued - customer acquisition costs rising",
    evidence: [
      {
        id: uuidv4(),
        dimension: "customer_retention",
        finding: "One-time customer ratio: 75% of customers never return",
        confidence: ConfidenceLevel.HIGH,
        source: "Customer lifecycle analysis",
        timestamp: new Date(),
        isCritical: true,
      },
      {
        id: uuidv4(),
        dimension: "financial_health",
        finding: "Customer acquisition cost trending up 20% YoY",
        confidence: ConfidenceLevel.HIGH,
        source: "Marketing spend analysis",
        timestamp: new Date(),
        isCritical: true,
      },
    ],
    clientContext: {
      industry: "retail",
      size: "small",
      revenueImpactUrgency: "MEDIUM",
    },
  };
}

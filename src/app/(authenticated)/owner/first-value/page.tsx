"use client";

import { useEffect, useState } from "react";
import { FirstValueDTO } from "@/lib/first-value/first-value.dto";
import { toOperatorSafeError } from "@/lib/operator-safe-errors";
import { CardDashboardSkeleton } from "@/ui/primitives";

export default function FirstValuePage() {
  const [firstValue, setFirstValue] = useState<FirstValueDTO | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function fetchFirstValue() {
      try {
        const response = await fetch("/api/owner/first-value");
        if (!response.ok) {
          throw new Error(`Failed to load first-value: ${response.status}`);
        }
        const data = await response.json();
        setFirstValue(data);
      } catch (err) {
        const safeError = toOperatorSafeError(err, "load");
        setError(safeError.error);
      } finally {
        setLoading(false);
      }
    }

    fetchFirstValue();
  }, []);

  if (loading) {
    return <CardDashboardSkeleton sections={4} label="Loading first-value visibility" />;
  }

  if (error) {
    return (
      <div className="p-6 bg-red-50 border border-red-200 rounded-lg">
        <h1 className="text-xl font-bold text-red-800">Error</h1>
        <p className="text-red-700">{error}</p>
      </div>
    );
  }

  if (!firstValue) {
    return (
      <div className="p-6 bg-gray-50 border border-gray-200 rounded-lg">
        <h1 className="text-xl font-bold">No data available</h1>
      </div>
    );
  }

  const handleExport = () => {
    const exportData = {
      type: "PILOT_PROOF_PACKET",
      ...firstValue,
    };
    const json = JSON.stringify(exportData, null, 2);
    const blob = new Blob([json], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `first-value-${firstValue.workspaceId}-${new Date().toISOString().split("T")[0]}.json`;
    link.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="max-w-4xl mx-auto p-6 space-y-8">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">First-Value Visibility</h1>
          {firstValue.isDemo && (
            <span className="inline-block mt-2 px-3 py-1 bg-yellow-100 text-yellow-800 text-sm font-medium rounded-full">
              🔵 DEMO Workspace
            </span>
          )}
        </div>
        <button
          onClick={handleExport}
          className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
        >
          📥 Export Proof Packet
        </button>
      </div>

      {/* State and Confidence */}
      <div className="grid grid-cols-2 gap-4">
        <div className="p-4 bg-blue-50 border border-blue-200 rounded-lg">
          <p className="text-sm text-gray-600">Readiness State</p>
          <p className="text-lg font-bold text-blue-900">{firstValue.state}</p>
        </div>
        <div className="p-4 bg-purple-50 border border-purple-200 rounded-lg">
          <p className="text-sm text-gray-600">Confidence</p>
          <p className="text-lg font-bold text-purple-900">
            {firstValue.confidence}
          </p>
        </div>
      </div>

      {/* Business Snapshot */}
      {firstValue.businessSnapshot && (
        <div className="p-6 bg-card border border-gray-200 rounded-lg">
          <h2 className="text-xl font-bold mb-4">Business Snapshot</h2>
          <div className="grid grid-cols-2 gap-4 text-sm">
            <div>
              <p className="text-gray-600">Consulting Stage</p>
              <p className="font-semibold">
                {firstValue.businessSnapshot.consultingLifecycleStage}
              </p>
            </div>
            <div>
              <p className="text-gray-600">Business Condition</p>
              <p className="font-semibold">
                {firstValue.businessSnapshot.businessCondition}
              </p>
            </div>
            <div>
              <p className="text-gray-600">Intervention Mode</p>
              <p className="font-semibold">
                {firstValue.businessSnapshot.interventionMode}
              </p>
            </div>
            <div>
              <p className="text-gray-600">Health Status</p>
              <p className="font-semibold">
                {firstValue.businessSnapshot.healthStatus}
              </p>
            </div>
            <div>
              <p className="text-gray-600">Blocked Actions</p>
              <p className="font-semibold">
                {firstValue.businessSnapshot.blockedActionCount}
              </p>
            </div>
            <div>
              <p className="text-gray-600">Overdue Actions</p>
              <p className="font-semibold">
                {firstValue.businessSnapshot.overdueActionCount}
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Top Risks */}
      {firstValue.topRisks.length > 0 && (
        <div className="p-6 bg-card border border-gray-200 rounded-lg">
          <h2 className="text-xl font-bold mb-4">Top Risks</h2>
          <div className="space-y-3">
            {firstValue.topRisks.map((risk) => (
              <div
                key={risk.id}
                className={`p-4 border-l-4 rounded-lg ${
                  risk.severity === "CRITICAL"
                    ? "border-red-500 bg-red-50"
                    : risk.severity === "HIGH"
                      ? "border-orange-500 bg-orange-50"
                      : "border-yellow-500 bg-yellow-50"
                }`}
              >
                <p className="font-semibold text-gray-900">{risk.description}</p>
                <p className="text-sm text-gray-700 mt-1">{risk.impact}</p>
                <p className="text-xs text-gray-600 mt-2">
                  Confidence: {risk.confidenceState}
                </p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Top Opportunities */}
      {firstValue.topOpportunities.length > 0 && (
        <div className="p-6 bg-card border border-gray-200 rounded-lg">
          <h2 className="text-xl font-bold mb-4">Top Opportunities</h2>
          <div className="space-y-3">
            {firstValue.topOpportunities.map((opp) => (
              <div key={opp.id} className="p-4 border-l-4 border-green-500 bg-green-50 rounded-lg">
                <p className="font-semibold text-gray-900">
                  {opp.description}
                </p>
                <p className="text-sm text-gray-700 mt-1">
                  Expected Value: {opp.expectedValue}
                </p>
                <p className="text-xs text-gray-600 mt-2">
                  Confidence: {opp.confidenceState}
                </p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Recommended First Action */}
      {firstValue.recommendedFirstAction ? (
        <div className="p-6 bg-gradient-to-r from-green-50 to-blue-50 border-2 border-green-500 rounded-lg">
          <h2 className="text-xl font-bold mb-4 text-green-900">
            ✓ Recommended First Action
          </h2>
          <div className="space-y-3">
            <div>
              <p className="text-sm text-gray-600">Action</p>
              <p className="text-lg font-bold text-gray-900">
                {firstValue.recommendedFirstAction.action}
              </p>
            </div>
            <div>
              <p className="text-sm text-gray-600">Why This Action</p>
              <p className="text-gray-800">
                {firstValue.recommendedFirstAction.reason}
              </p>
            </div>
            <div className="grid grid-cols-2 gap-4 pt-3">
              <div>
                <p className="text-xs text-gray-600">Expected Impact</p>
                <p className="font-semibold">
                  {firstValue.recommendedFirstAction.expectedImpact}
                </p>
              </div>
              <div>
                <p className="text-xs text-gray-600">Effort Required</p>
                <p className="font-semibold">
                  {firstValue.recommendedFirstAction.effort}
                </p>
              </div>
              <div>
                <p className="text-xs text-gray-600">Risk Level</p>
                <p className="font-semibold">
                  {firstValue.recommendedFirstAction.risk}
                </p>
              </div>
              <div>
                <p className="text-xs text-gray-600">Confidence</p>
                <p className="font-semibold">
                  {firstValue.recommendedFirstAction.confidenceState}
                </p>
              </div>
            </div>
            <div className="pt-3 border-t border-gray-300">
              <p className="text-sm text-gray-600">First Step</p>
              <p className="font-semibold text-gray-900">
                {firstValue.recommendedFirstAction.firstStep}
              </p>
            </div>
            <div>
              <p className="text-sm text-gray-600">Stop Condition</p>
              <p className="font-semibold text-gray-900">
                {firstValue.recommendedFirstAction.stopCondition}
              </p>
            </div>
          </div>
        </div>
      ) : (
        <div className="p-6 bg-gray-50 border border-gray-300 rounded-lg">
          <p className="text-gray-700">
            <span className="font-bold">No action recommended yet.</span> Reason:{" "}
            {firstValue.recommendedFirstActionReason}
          </p>
        </div>
      )}

      {/* Missing Data */}
      {firstValue.missingDataAreas.length > 0 && (
        <div className="p-6 bg-blue-50 border border-blue-300 rounded-lg">
          <h3 className="font-bold text-blue-900 mb-3">📋 Missing Data Areas</h3>
          <ul className="space-y-2">
            {firstValue.missingDataAreas.map((area, idx) => (
              <li key={idx} className="text-blue-800">
                • {area}
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Safety Warnings */}
      {firstValue.safetyWarnings.length > 0 && (
        <div className="p-6 bg-amber-50 border border-amber-300 rounded-lg">
          <h3 className="font-bold text-amber-900 mb-3">⚠️ Safety Warnings</h3>
          <ul className="space-y-2">
            {firstValue.safetyWarnings.map((warning, idx) => (
              <li key={idx} className="text-amber-800">
                • {warning}
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Data Readiness */}
      <div className="p-6 bg-card border border-gray-200 rounded-lg">
        <h3 className="font-bold mb-4">Data Readiness</h3>
        <div className="space-y-2 text-sm">
          <div className="flex items-center justify-between">
            <span>Engagement Profile</span>
            <span
              className={
                firstValue.dataReadiness.hasEngagement
                  ? "text-green-600 font-bold"
                  : "text-gray-400"
              }
            >
              {firstValue.dataReadiness.hasEngagement ? "✓" : "○"}
            </span>
          </div>
          <div className="flex items-center justify-between">
            <span>Risk/Opportunity Findings</span>
            <span
              className={
                firstValue.dataReadiness.hasFinding
                  ? "text-green-600 font-bold"
                  : "text-gray-400"
              }
            >
              {firstValue.dataReadiness.hasFinding ? "✓" : "○"}
            </span>
          </div>
          <div className="flex items-center justify-between">
            <span>Recommended Actions</span>
            <span
              className={
                firstValue.dataReadiness.hasAction
                  ? "text-green-600 font-bold"
                  : "text-gray-400"
              }
            >
              {firstValue.dataReadiness.hasAction ? "✓" : "○"}
            </span>
          </div>
          <div className="flex items-center justify-between">
            <span>KPI Baselines</span>
            <span
              className={
                firstValue.dataReadiness.hasKPI
                  ? "text-green-600 font-bold"
                  : "text-gray-400"
              }
            >
              {firstValue.dataReadiness.hasKPI ? "✓" : "○"}
            </span>
          </div>
        </div>
      </div>

      {/* Footer */}
      <div className="text-xs text-gray-500 text-center border-t pt-6">
        Generated: {new Date(firstValue.generatedAt).toLocaleString()}
      </div>
    </div>
  );
}

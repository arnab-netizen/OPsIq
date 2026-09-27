"use client";

import { useEffect, useState } from "react";
import { FirstValueDTO } from "@/lib/first-value/first-value.dto";
import { toOperatorSafeError } from "@/lib/operator-safe-errors";
import { CardDashboardSkeleton, PageContainer } from "@/ui/primitives";
import Link from "next/link";
import { OwnerDecisionCard } from "@/components/owner/OwnerDecisionCard";
import type { CurrentOwnerDecision } from "@/domain/owner-spine/owner-decision";

// Verified against src/lib/first-value/first-value.dto.ts -- every FirstValueDTO field below is a
// closed SCREAMING_SNAKE_CASE union with no plain-language map anywhere on this page before now.
const STATE_LABEL: Record<string, string> = {
  NO_WORKSPACE: "No workspace",
  EMPTY_WORKSPACE: "Empty workspace",
  DEMO_WORKSPACE_ACTIVE: "Demo workspace active",
  MINIMUM_DATA_PRESENT: "Minimum data present",
  NEED_MORE_DATA: "Needs more data",
  FIRST_VALUE_READY: "First value ready",
  FIRST_ACTION_READY: "First action ready",
  CANNOT_DETERMINE: "Cannot determine",
};
const CONFIDENCE_LABEL: Record<string, string> = {
  HIGH_CONFIDENCE: "High confidence",
  MEDIUM_CONFIDENCE: "Medium confidence",
  LOW_CONFIDENCE: "Low confidence",
  NEED_MORE_DATA: "Needs more data",
  CANNOT_DETERMINE: "Cannot determine",
  DANGER_DO_NOT_ACT: "Danger — do not act",
};
const HEALTH_STATUS_LABEL: Record<string, string> = {
  CRITICAL: "Critical",
  AT_RISK: "At risk",
  STABLE: "Stable",
  THRIVING: "Thriving",
};
// businessSnapshot.consultingLifecycleStage/interventionMode/interventionPhase all draw from the
// same governed intervention-mode/phase enums (src/domain/constants/statuses.ts INTERVENTION_MODES
// / INTERVENTION_PHASES) -- confirmed via src/services/first-value.service.ts, which sets
// consultingLifecycleStage directly from engagement.interventionPhase. One map covers all three;
// the service's own "UNKNOWN" fallback (and any other unmapped value) renders as-is via `?? value`.
const INTERVENTION_LABEL: Record<string, string> = {
  recovery: "Recovery",
  stabilization: "Stabilization",
  growth: "Growth",
  shock_response: "Shock response",
  mixed: "Mixed",
  triage: "Triage",
};

export default function FirstValuePage() {
  const [firstValue, setFirstValue] = useState<FirstValueDTO | null>(null);
  const [ownerDecision, setOwnerDecision] = useState<CurrentOwnerDecision | null>(null);
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
        // The canonical owner decision (read-only). A failure here only hides the target card.
        const home = await fetch("/api/owner/home").then((r) => (r.ok ? r.json() : null)).catch(() => null);
        setOwnerDecision((home?.currentOwnerDecision as CurrentOwnerDecision | null | undefined) ?? null);
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
    <PageContainer>
      <div className="space-y-8">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-2">
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
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="p-4 bg-blue-50 border border-blue-200 rounded-lg">
          <p className="text-sm text-gray-600">Readiness State</p>
          <p className="text-lg font-bold text-blue-900">{STATE_LABEL[firstValue.state] ?? firstValue.state}</p>
        </div>
        <div className="p-4 bg-purple-50 border border-purple-200 rounded-lg">
          <p className="text-sm text-gray-600">Confidence</p>
          <p className="text-lg font-bold text-purple-900">
            {CONFIDENCE_LABEL[firstValue.confidence] ?? firstValue.confidence}
          </p>
        </div>
      </div>

      {/* Business Snapshot */}
      {firstValue.businessSnapshot && (
        <div className="p-6 bg-card border border-gray-200 rounded-lg">
          <h2 className="text-xl font-bold mb-4">Business Snapshot</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm">
            <div>
              <p className="text-gray-600">Consulting Stage</p>
              <p className="font-semibold">
                {INTERVENTION_LABEL[firstValue.businessSnapshot.consultingLifecycleStage] ?? firstValue.businessSnapshot.consultingLifecycleStage}
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
                {INTERVENTION_LABEL[firstValue.businessSnapshot.interventionMode] ?? firstValue.businessSnapshot.interventionMode}
              </p>
            </div>
            <div>
              <p className="text-gray-600">Health Status</p>
              <p className="font-semibold">
                {HEALTH_STATUS_LABEL[firstValue.businessSnapshot.healthStatus] ?? firstValue.businessSnapshot.healthStatus}
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
                  Confidence: {CONFIDENCE_LABEL[risk.confidenceState] ?? risk.confidenceState}
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
                  Confidence: {CONFIDENCE_LABEL[opp.confidenceState] ?? opp.confidenceState}
                </p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* The ONE canonical owner decision — this page never elects its own "first action". The
          first-value data above (engagement findings) is context; what to do first comes only from
          the canonical owner decision, the same answer Home, Cockpit and Priorities show. */}
      {ownerDecision ? (
        <OwnerDecisionCard decision={ownerDecision} detail="compact" />
      ) : (
        <div className="p-6 rounded-lg border border-border bg-card" data-testid="first-value-no-decision">
          <p className="text-muted-foreground">
            <span className="font-bold text-foreground">No main target yet.</span> OpsIQ picks one main target from your business numbers.{" "}
            <Link href="/owner/data" className="text-[var(--primary-text)] underline">Add your business information</Link>
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
    </PageContainer>
  );
}

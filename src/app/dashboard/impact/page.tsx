"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  classifyOperatorError,
  type ErrorGovernanceContext,
} from "@/lib/operator-error-governance";

interface Metrics {
  summary: {
    totalDecisions: number;
    approvedCount: number;
    blockedCount: number;
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

interface Decision {
  id: string;
  title: string;
  status: string;
  impact: number;
  confidence: number;
  blockStage?: string | null;
  blockReason?: string | null;
  createdAt: string;
}

export default function DashboardImpactPage() {
  const [metrics, setMetrics] = useState<Metrics | null>(null);
  const [blockedDecisions, setBlockedDecisions] = useState<Decision[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchData = async () => {
      try {
        setLoading(true);
        setError(null);

        // Fetch metrics
        const metricsRes = await fetch("/api/governance/metrics?days=30");
        if (!metricsRes.ok) throw new Error("Failed to fetch metrics");
        const metricsData = await metricsRes.json();
        setMetrics(metricsData);

        // Fetch blocked decisions
        const decisionsRes = await fetch("/api/decisions/list?status=blocked&limit=50");
        if (!decisionsRes.ok) throw new Error("Failed to fetch blocked decisions");
        const decisionsData = await decisionsRes.json();
        setBlockedDecisions(decisionsData.decisions || []);
      } catch (err) {
        const ctx: ErrorGovernanceContext = { context: 'load' };
        const govErr = classifyOperatorError(err, ctx);
        setError(govErr.operatorMessage);
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, []);

  if (loading) {
    return (
      <div className="p-6">
        <h1 className="text-2xl font-bold text-gray-900 mb-4">Impact Dashboard</h1>
        <div className="bg-blue-50 border border-blue-200 rounded p-6 text-center">
          <div className="text-gray-600 mb-2">Loading impact metrics...</div>
          <div className="text-xs text-gray-500">This includes decision history and governance data. Should complete in a few seconds.</div>
        </div>
      </div>
    );
  }

  if (error || !metrics) {
    return (
      <div className="p-6">
        <h1 className="text-2xl font-bold text-gray-900 mb-4">Impact Dashboard</h1>
        <div className="bg-red-50 border border-red-200 rounded p-4">
          <p className="text-red-800 font-medium text-sm mb-2">{error || "Unable to load metrics"}</p>
          <p className="text-red-700 text-xs">Try refreshing the page. If the problem continues, contact support.</p>
        </div>
      </div>
    );
  }

  const approvedImpact = metrics.impact.approvedExpectedImpact;
  const blockedImpact = metrics.impact.blockedExpectedImpact;
  const totalImpact = approvedImpact + blockedImpact;

  return (
    <div className="p-6 max-w-7xl mx-auto">
      <h1 className="text-2xl font-bold text-gray-900 mb-6">Impact Dashboard</h1>

      {/* Summary Cards */}
      <div className="grid grid-cols-2 gap-6 mb-6">
        {/* Approved Impact */}
        <div className="bg-white border rounded-lg p-6">
          <div className="text-xs font-semibold text-gray-500 uppercase mb-2">
            Total Approved Impact
          </div>
          <div className="text-3xl font-bold text-green-600 mb-2">
            ₹{(approvedImpact / 1000000).toFixed(2)}M
          </div>
          <div className="text-sm text-gray-600">
            {metrics.summary.approvedCount} approved decision{metrics.summary.approvedCount !== 1 ? "s" : ""}
          </div>
          {metrics.confidence.avgConfidenceApproved !== null && (
            <div className="text-xs text-gray-500 mt-2">
              Avg Confidence: {(metrics.confidence.avgConfidenceApproved * 100).toFixed(0)}%
            </div>
          )}
        </div>

        {/* Blocked Impact */}
        <div className="bg-white border rounded-lg p-6">
          <div className="text-xs font-semibold text-gray-500 uppercase mb-2">
            Total Blocked Impact
          </div>
          <div className="text-3xl font-bold text-red-600 mb-2">
            ₹{(blockedImpact / 1000000).toFixed(2)}M
          </div>
          <div className="text-sm text-gray-600">
            {metrics.summary.blockedCount} blocked decision{metrics.summary.blockedCount !== 1 ? "s" : ""}
          </div>
          {metrics.confidence.avgConfidenceBlocked !== null && (
            <div className="text-xs text-gray-500 mt-2">
              Avg Confidence: {(metrics.confidence.avgConfidenceBlocked * 100).toFixed(0)}%
            </div>
          )}
        </div>
      </div>

      {/* Metrics Row */}
      <div className="grid grid-cols-3 gap-6 mb-6">
        {/* Decision Counts */}
        <div className="bg-white border rounded-lg p-6">
          <div className="text-xs font-semibold text-gray-500 uppercase mb-4">
            Decision Counts
          </div>
          <div className="space-y-3">
            <div className="flex justify-between items-center">
              <span className="text-gray-700">Total</span>
              <span className="font-bold text-gray-900">{metrics.summary.totalDecisions}</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-green-700">Approved</span>
              <span className="font-bold text-green-600">{metrics.summary.approvedCount}</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-red-700">Blocked</span>
              <span className="font-bold text-red-600">{metrics.summary.blockedCount}</span>
            </div>
            {metrics.summary.totalDecisions > 0 && (
              <div className="flex justify-between items-center pt-3 border-t">
                <span className="text-gray-700">Block Rate</span>
                <span className="font-bold text-gray-900">
                  {((metrics.summary.blockedCount / metrics.summary.totalDecisions) * 100).toFixed(1)}%
                </span>
              </div>
            )}
          </div>
        </div>

        {/* Average Confidence */}
        <div className="bg-white border rounded-lg p-6">
          <div className="text-xs font-semibold text-gray-500 uppercase mb-4">
            Average Confidence
          </div>
          <div className="space-y-3">
            <div>
              <div className="text-xs text-gray-600 mb-1">Approved Decisions</div>
              <div className="text-2xl font-bold text-green-600">
                {metrics.confidence.avgConfidenceApproved !== null
                  ? `${(metrics.confidence.avgConfidenceApproved * 100).toFixed(0)}%`
                  : "—"}
              </div>
            </div>
            <div>
              <div className="text-xs text-gray-600 mb-1">Blocked Decisions</div>
              <div className="text-2xl font-bold text-red-600">
                {metrics.confidence.avgConfidenceBlocked !== null
                  ? `${(metrics.confidence.avgConfidenceBlocked * 100).toFixed(0)}%`
                  : "—"}
              </div>
            </div>
          </div>
        </div>

        {/* Total Expected Impact */}
        <div className="bg-white border rounded-lg p-6">
          <div className="text-xs font-semibold text-gray-500 uppercase mb-4">
            Total Expected Impact
          </div>
          <div className="text-2xl font-bold text-gray-900 mb-4">
            ₹{(totalImpact / 1000000).toFixed(2)}M
          </div>
          <div className="space-y-2 text-sm">
            <div className="flex items-center gap-2">
              <div className="w-3 h-3 bg-green-600 rounded-full"></div>
              <span className="text-gray-700">Approved</span>
              <span className="text-gray-600">
                {totalImpact > 0 ? ((approvedImpact / totalImpact) * 100).toFixed(0) : 0}%
              </span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-3 h-3 bg-red-600 rounded-full"></div>
              <span className="text-gray-700">Blocked</span>
              <span className="text-gray-600">
                {totalImpact > 0 ? ((blockedImpact / totalImpact) * 100).toFixed(0) : 0}%
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Blocked Decisions (Critical) */}
      <div className="bg-white border rounded-lg p-6">
        <h2 className="text-lg font-bold text-red-900 mb-4">
          ⚠️ Blocked Decisions (Critical)
        </h2>

        {blockedDecisions.length === 0 ? (
          <div className="text-gray-500 py-8 text-center">No blocked decisions</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-red-50 border-b">
                <tr>
                  <th className="px-4 py-3 text-left font-semibold text-red-900">Decision</th>
                  <th className="px-4 py-3 text-center font-semibold text-red-900">Confidence</th>
                  <th className="px-4 py-3 text-right font-semibold text-red-900">
                    Impact (₹)
                  </th>
                  <th className="px-4 py-3 text-left font-semibold text-red-900">Block Stage</th>
                  <th className="px-4 py-3 text-left font-semibold text-red-900">Reason</th>
                  <th className="px-4 py-3 text-left font-semibold text-red-900">Action</th>
                </tr>
              </thead>
              <tbody>
                {blockedDecisions.map((decision) => (
                  <tr key={decision.id} className="border-b hover:bg-red-50">
                    <td className="px-4 py-3 text-gray-900 max-w-xs truncate font-medium">
                      {decision.title}
                    </td>
                    <td className="px-4 py-3 text-center text-gray-700">
                      {(decision.confidence * 100).toFixed(0)}%
                    </td>
                    <td className="px-4 py-3 text-right font-mono text-gray-700">
                      ₹{(decision.impact / 1000000).toFixed(2)}M
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-700">
                      {decision.blockStage || "—"}
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-700 max-w-xs truncate">
                      {decision.blockReason || "—"}
                    </td>
                    <td className="px-4 py-3">
                      <Link
                        href={`/dashboard/decision/${decision.id}`}
                        className="text-blue-600 hover:text-blue-800 text-sm font-medium"
                      >
                        Review →
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <div className="mt-4 text-xs text-gray-600 pt-4 border-t">
          Showing {blockedDecisions.length} blocked decision{blockedDecisions.length !== 1 ? "s" : ""}
        </div>
      </div>
    </div>
  );
}

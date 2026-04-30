import Link from "next/link";
import { ImpactChart } from "@/components/decisions/ImpactChart";

export const metadata = {
  title: "Decision Impact Dashboard | OPsIQ",
  description: "View decision outcomes and governance metrics",
};

async function fetchMetrics() {
  // In production, fetch from /api/governance/metrics?days=7
  return {
    summary: {
      approvedCount: 42,
      blockedCount: 8,
      totalDecisions: 50,
    },
    blockRates: {
      overallBlockRate: 16,
    },
    impact: {
      approvedExpectedImpact: 25000000,
      blockedExpectedImpact: 8500000,
      realizedImpact: 18200000,
    },
  };
}

export default async function ImpactDashboardPage() {
  const metrics = await fetchMetrics();

  return (
    <div className="min-h-screen bg-white">
      <div className="max-w-6xl mx-auto px-4 py-8 sm:px-6 lg:px-8">
        {/* Header */}
        <div className="mb-8 flex justify-between items-start">
          <div>
            <h1 className="text-3xl font-bold text-gray-900">Decision Impact Dashboard</h1>
            <p className="text-gray-600 mt-2">
              Measure the real-world impact of governance decisions
            </p>
          </div>
          <Link href="/decisions" className="text-blue-600 hover:text-blue-700 font-medium">
            Back to Inbox →
          </Link>
        </div>

        {/* Charts */}
        <ImpactChart metrics={metrics} />

        {/* Footer Info */}
        <div className="mt-8 border-t pt-8">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">How This Works</h2>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3 text-sm text-gray-600">
            <div>
              <p className="font-medium text-gray-900 mb-1">📋 Governance</p>
              <p>
                Every decision is evaluated against guardrails. Risky decisions are blocked or
                require override with audit trail.
              </p>
            </div>
            <div>
              <p className="font-medium text-gray-900 mb-1">📊 Measurement</p>
              <p>
                Expected impact is captured at decision time. Actual impact is measured as
                outcomes occur.
              </p>
            </div>
            <div>
              <p className="font-medium text-gray-900 mb-1">✅ Proof</p>
              <p>
                Compare actual vs expected to prove what decisions worked, which failed, and
                calibrate for next time.
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

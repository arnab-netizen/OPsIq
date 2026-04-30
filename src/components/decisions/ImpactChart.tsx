"use client";

interface MetricsData {
  summary?: {
    approvedCount: number;
    blockedCount: number;
    totalDecisions: number;
  };
  blockRates?: {
    overallBlockRate: number;
  };
  impact?: {
    approvedExpectedImpact: number;
    blockedExpectedImpact: number;
    realizedImpact: number;
  };
}

export function ImpactChart({ metrics }: { metrics: MetricsData }) {
  const approved = metrics.summary?.approvedCount || 0;
  const blocked = metrics.summary?.blockedCount || 0;
  const total = metrics.summary?.totalDecisions || 0;
  const blockRate = metrics.blockRates?.overallBlockRate || 0;
  const approvedImpact = metrics.impact?.approvedExpectedImpact || 0;
  const blockedImpact = metrics.impact?.blockedExpectedImpact || 0;
  const realizedImpact = metrics.impact?.realizedImpact || 0;

  const approvedPercent = total > 0 ? (approved / total) * 100 : 0;
  const blockedPercent = total > 0 ? (blocked / total) * 100 : 0;

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        {/* Decision Count */}
        <div className="border rounded-lg p-4 bg-white">
          <p className="text-xs text-gray-600 font-medium mb-1">TOTAL DECISIONS</p>
          <p className="text-2xl font-bold text-gray-900">{total}</p>
          <div className="mt-3 space-y-1">
            <div className="flex justify-between text-xs">
              <span>Approved: {approved}</span>
              <span className="text-green-600 font-medium">{approvedPercent.toFixed(0)}%</span>
            </div>
            <div className="flex justify-between text-xs">
              <span>Blocked: {blocked}</span>
              <span className="text-red-600 font-medium">{blockedPercent.toFixed(0)}%</span>
            </div>
          </div>
          <div className="mt-3 w-full bg-gray-200 rounded-full h-2">
            <div
              className="bg-green-600 h-2 rounded-full"
              style={{ width: `${approvedPercent}%` }}
            ></div>
          </div>
        </div>

        {/* Block Rate */}
        <div className="border rounded-lg p-4 bg-white">
          <p className="text-xs text-gray-600 font-medium mb-1">BLOCK RATE</p>
          <p className="text-2xl font-bold text-gray-900">{blockRate.toFixed(1)}%</p>
          <p className="text-xs text-gray-600 mt-2">
            {blockRate > 20 ? "⚠️ High" : blockRate > 10 ? "Yellow" : "✓ Healthy"}
          </p>
          <div className="mt-3 relative">
            <div className="w-full bg-gray-200 rounded-full h-2">
              <div
                className={`h-2 rounded-full ${
                  blockRate > 20
                    ? "bg-red-600"
                    : blockRate > 10
                      ? "bg-yellow-600"
                      : "bg-green-600"
                }`}
                style={{ width: `${Math.min(blockRate, 100)}%` }}
              ></div>
            </div>
            <div className="flex justify-between text-xs text-gray-500 mt-1">
              <span>0%</span>
              <span>50%</span>
              <span>100%</span>
            </div>
          </div>
        </div>

        {/* Realized Impact */}
        <div className="border rounded-lg p-4 bg-white">
          <p className="text-xs text-gray-600 font-medium mb-1">REALIZED IMPACT</p>
          <p className="text-2xl font-bold text-blue-600">
            ₹{(realizedImpact / 1_000_000).toFixed(1)}M
          </p>
          <p className="text-xs text-gray-600 mt-2">Measured from approved decisions</p>
        </div>
      </div>

      {/* Impact Breakdown */}
      <div className="border rounded-lg p-4 bg-gray-50">
        <h3 className="font-semibold text-gray-900 mb-4">DECISION IMPACT BREAKDOWN</h3>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <div>
            <p className="text-xs text-gray-600 font-medium mb-2">Approved Expected Impact</p>
            <div className="bg-green-100 rounded p-3">
              <p className="text-lg font-bold text-green-800">
                ₹{(approvedImpact / 1_000_000).toFixed(1)}M
              </p>
              <p className="text-xs text-green-700 mt-1">If all succeed</p>
            </div>
          </div>
          <div>
            <p className="text-xs text-gray-600 font-medium mb-2">Blocked Expected Impact</p>
            <div className="bg-red-100 rounded p-3">
              <p className="text-lg font-bold text-red-800">
                ₹{(blockedImpact / 1_000_000).toFixed(1)}M
              </p>
              <p className="text-xs text-red-700 mt-1">Prevented from executing</p>
            </div>
          </div>
          <div>
            <p className="text-xs text-gray-600 font-medium mb-2">Protection Ratio</p>
            <div className="bg-blue-100 rounded p-3">
              <p className="text-lg font-bold text-blue-800">
                {blockedImpact > 0 && approvedImpact > 0
                  ? ((blockedImpact / (blockedImpact + approvedImpact)) * 100).toFixed(0)
                  : 0}
                %
              </p>
              <p className="text-xs text-blue-700 mt-1">Risk filtered</p>
            </div>
          </div>
        </div>
      </div>

      {/* Summary */}
      <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 text-sm text-blue-900">
        <p className="font-semibold mb-2">📊 Decision Governance Summary</p>
        <ul className="space-y-1 text-xs">
          <li>
            ✓ {approved} decisions approved with ₹{(approvedImpact / 1_000_000).toFixed(1)}M total expected impact
          </li>
          <li>
            🛑 {blocked} decisions blocked, preventing ₹{(blockedImpact / 1_000_000).toFixed(1)}M in potential losses
          </li>
          <li>✓ Realized ₹{(realizedImpact / 1_000_000).toFixed(1)}M actual impact from approved decisions</li>
          <li>📈 Block rate: {blockRate.toFixed(1)}% (governance is working)</li>
        </ul>
      </div>
    </div>
  );
}

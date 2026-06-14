/**
 * Review Summary — displays overview of fact approval/correction status.
 *
 * Shows counts: approved, corrected, rejected, marked unknown, total.
 * Helps owner understand review progress at a glance.
 */
"use client";

export interface ReviewSummaryProps {
  totalFacts: number;
  approvedCount: number;
  correctedCount: number;
  rejectedCount: number;
  markedUnknownCount: number;
}

export function ReviewSummary({
  totalFacts,
  approvedCount,
  correctedCount,
  rejectedCount,
  markedUnknownCount,
}: ReviewSummaryProps) {
  const reviewedCount = approvedCount + correctedCount + rejectedCount + markedUnknownCount;
  const pendingCount = totalFacts - reviewedCount;
  const progressPercent = totalFacts > 0 ? Math.round((reviewedCount / totalFacts) * 100) : 0;

  return (
    <div className="rounded-lg border border-gray-300 bg-gray-50 p-4">
      <h2 className="mb-4 text-lg font-semibold">Review Summary</h2>

      <div className="mb-4 grid grid-cols-2 gap-4 sm:grid-cols-5">
        <div className="rounded bg-white p-3 text-center">
          <div className="text-2xl font-bold text-blue-600">{totalFacts}</div>
          <div className="text-xs text-gray-600">Total Facts</div>
        </div>
        <div className="rounded bg-white p-3 text-center">
          <div className="text-2xl font-bold text-green-600">{approvedCount}</div>
          <div className="text-xs text-gray-600">Approved</div>
        </div>
        <div className="rounded bg-white p-3 text-center">
          <div className="text-2xl font-bold text-blue-600">{correctedCount}</div>
          <div className="text-xs text-gray-600">Corrected</div>
        </div>
        <div className="rounded bg-white p-3 text-center">
          <div className="text-2xl font-bold text-red-600">{rejectedCount}</div>
          <div className="text-xs text-gray-600">Rejected</div>
        </div>
        <div className="rounded bg-white p-3 text-center">
          <div className="text-2xl font-bold text-gray-600">{markedUnknownCount}</div>
          <div className="text-xs text-gray-600">Unknown</div>
        </div>
      </div>

      <div className="mb-4">
        <div className="mb-2 flex justify-between text-sm">
          <span className="font-medium">Progress</span>
          <span className="text-gray-600">
            {reviewedCount} of {totalFacts} ({progressPercent}%)
          </span>
        </div>
        <div className="h-3 rounded-full bg-gray-300">
          <div
            className="h-full rounded-full bg-blue-500 transition-all duration-300"
            style={{ width: `${progressPercent}%` }}
          />
        </div>
      </div>

      {pendingCount > 0 && (
        <div className="text-sm text-gray-700">
          <strong>{pendingCount} fact(s)</strong> still pending review
        </div>
      )}

      {pendingCount === 0 && reviewedCount > 0 && (
        <div className="text-sm text-green-700">
          ✓ All facts reviewed
        </div>
      )}
    </div>
  );
}

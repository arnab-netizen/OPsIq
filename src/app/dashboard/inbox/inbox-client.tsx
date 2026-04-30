"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";

interface Decision {
  id: string;
  title: string;
  status: string;
  impact: number;
  confidence: number;
  blockStage?: string;
  blockReason?: string;
  createdAt: string;
  updatedAt: string;
}

interface InboxResponse {
  decisions: Decision[];
  total: number;
  limit: number;
  offset: number;
}

const STATUS_COLORS: Record<string, string> = {
  pending: "bg-blue-100 text-blue-900",
  blocked: "bg-red-100 text-red-900",
  approved: "bg-green-100 text-green-900",
  overridden: "bg-purple-100 text-purple-900",
  done: "bg-gray-100 text-gray-900",
  failed: "bg-orange-100 text-orange-900",
};

const DECISION_TYPES = ["pending", "blocked", "approved", "overridden", "done", "failed"];

export function InboxClient({ workspaceId }: { workspaceId: string }) {
  const searchParams = useSearchParams();
  const [decisions, setDecisions] = useState<Decision[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedStatus, setSelectedStatus] = useState(searchParams.get("status") || "");
  const [page, setPage] = useState(0);
  const [total, setTotal] = useState(0);

  const limit = 20;
  const offset = page * limit;

  useEffect(() => {
    fetchDecisions();
  }, [selectedStatus, page]);

  async function fetchDecisions() {
    setLoading(true);
    setError(null);

    try {
      const params = new URLSearchParams({
        workspaceId,
        limit: limit.toString(),
        offset: offset.toString(),
      });

      if (selectedStatus) {
        params.append("status", selectedStatus);
      }

      const response = await fetch(`/api/decisions/list?${params.toString()}`);

      if (!response.ok) {
        throw new Error(`API error: ${response.status}`);
      }

      const data: InboxResponse = await response.json();
      setDecisions(data.decisions);
      setTotal(data.total);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to fetch decisions");
    } finally {
      setLoading(false);
    }
  }

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: "USD",
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(value);
  };

  const formatPercent = (value: number) => {
    return `${Math.round(value * 100)}%`;
  };

  const totalPages = Math.ceil(total / limit);

  return (
    <div className="min-h-screen bg-white">
      {/* Header */}
      <div className="bg-white border-b border-gray-200 sticky top-0 z-10">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <div>
              <h1 className="text-2xl sm:text-3xl font-bold text-gray-900">
                Decision Inbox
              </h1>
              <p className="mt-1 text-sm text-gray-500">
                {total} decision{total !== 1 ? "s" : ""}
              </p>
            </div>

            {/* Status Filter */}
            <div className="flex gap-2 flex-wrap">
              <button
                onClick={() => {
                  setSelectedStatus("");
                  setPage(0);
                }}
                className={`px-3 py-1 rounded-full text-sm font-medium transition-colors ${
                  selectedStatus === ""
                    ? "bg-blue-600 text-white"
                    : "bg-gray-200 text-gray-800 hover:bg-gray-300"
                }`}
              >
                All
              </button>
              {DECISION_TYPES.map((status) => (
                <button
                  key={status}
                  onClick={() => {
                    setSelectedStatus(status);
                    setPage(0);
                  }}
                  className={`px-3 py-1 rounded-full text-sm font-medium transition-colors ${
                    selectedStatus === status
                      ? "bg-blue-600 text-white"
                      : "bg-gray-200 text-gray-800 hover:bg-gray-300"
                  }`}
                >
                  {status}
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
        {error && (
          <div className="bg-red-50 border border-red-200 rounded-lg p-4 mb-6">
            <p className="text-red-800 text-sm">{error}</p>
          </div>
        )}

        {loading ? (
          <div className="flex justify-center items-center py-12">
            <div className="text-gray-500">Loading decisions...</div>
          </div>
        ) : decisions.length === 0 ? (
          <div className="text-center py-12">
            <p className="text-gray-500 text-lg">No decisions found</p>
            {selectedStatus && (
              <button
                onClick={() => {
                  setSelectedStatus("");
                  setPage(0);
                }}
                className="mt-4 text-blue-600 hover:text-blue-800 text-sm font-medium"
              >
                Clear filters
              </button>
            )}
          </div>
        ) : (
          <>
            {/* Decision List - Mobile/Tablet/Desktop */}
            <div className="space-y-3 sm:space-y-4">
              {decisions.map((decision) => (
                <Link
                  key={decision.id}
                  href={`/dashboard/decision/${decision.id}`}
                  className="block bg-white border border-gray-200 rounded-lg p-4 hover:shadow-md transition-shadow"
                >
                  {/* Mobile: Stacked Layout */}
                  <div className="sm:hidden space-y-2">
                    <div className="flex items-start justify-between gap-2">
                      <h3 className="text-sm font-semibold text-gray-900 flex-1 line-clamp-2">
                        {decision.title}
                      </h3>
                      <span
                        className={`px-2 py-1 rounded text-xs font-medium whitespace-nowrap ${
                          STATUS_COLORS[decision.status] || STATUS_COLORS.pending
                        }`}
                      >
                        {decision.status}
                      </span>
                    </div>

                    <div className="grid grid-cols-2 gap-2 text-xs text-gray-600">
                      <div>
                        <span className="font-medium">Impact:</span> {formatCurrency(decision.impact)}
                      </div>
                      <div>
                        <span className="font-medium">Confidence:</span>{" "}
                        {formatPercent(decision.confidence)}
                      </div>
                    </div>

                    {decision.blockReason && (
                      <div className="text-xs text-gray-600">
                        <span className="font-medium">Reason:</span> {decision.blockReason}
                      </div>
                    )}

                    <div className="text-xs text-gray-500 pt-2 border-t border-gray-100">
                      {formatDate(decision.createdAt)}
                    </div>
                  </div>

                  {/* Tablet/Desktop: Table-like Layout */}
                  <div className="hidden sm:grid sm:grid-cols-12 sm:gap-4 sm:items-center">
                    {/* Title */}
                    <div className="sm:col-span-4">
                      <h3 className="text-sm font-semibold text-gray-900 line-clamp-2">
                        {decision.title}
                      </h3>
                    </div>

                    {/* Status Badge */}
                    <div className="sm:col-span-1">
                      <span
                        className={`inline-block px-2 py-1 rounded text-xs font-medium ${
                          STATUS_COLORS[decision.status] || STATUS_COLORS.pending
                        }`}
                      >
                        {decision.status}
                      </span>
                    </div>

                    {/* Impact */}
                    <div className="sm:col-span-2">
                      <p className="text-sm text-gray-900 font-medium">
                        {formatCurrency(decision.impact)}
                      </p>
                      <p className="text-xs text-gray-500">Impact</p>
                    </div>

                    {/* Confidence */}
                    <div className="sm:col-span-1">
                      <p className="text-sm text-gray-900 font-medium">
                        {formatPercent(decision.confidence)}
                      </p>
                      <p className="text-xs text-gray-500">Confidence</p>
                    </div>

                    {/* Block Reason (if applicable) */}
                    <div className="sm:col-span-2">
                      {decision.blockReason ? (
                        <>
                          <p className="text-sm text-gray-900 truncate">
                            {decision.blockReason}
                          </p>
                          <p className="text-xs text-gray-500">Block reason</p>
                        </>
                      ) : (
                        <p className="text-sm text-gray-500">—</p>
                      )}
                    </div>

                    {/* Date */}
                    <div className="sm:col-span-2">
                      <p className="text-sm text-gray-900">{formatDate(decision.createdAt)}</p>
                      <p className="text-xs text-gray-500">Created</p>
                    </div>
                  </div>
                </Link>
              ))}
            </div>

            {/* Pagination */}
            {totalPages > 1 && (
              <div className="mt-8 flex items-center justify-center gap-2 flex-wrap">
                <button
                  onClick={() => setPage(Math.max(0, page - 1))}
                  disabled={page === 0}
                  className="px-3 py-2 rounded text-sm font-medium bg-gray-200 text-gray-800 hover:bg-gray-300 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  Previous
                </button>

                <div className="text-sm text-gray-600">
                  Page {page + 1} of {totalPages}
                </div>

                <button
                  onClick={() => setPage(Math.min(totalPages - 1, page + 1))}
                  disabled={page >= totalPages - 1}
                  className="px-3 py-2 rounded text-sm font-medium bg-gray-200 text-gray-800 hover:bg-gray-300 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  Next
                </button>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { OperatorReviewQueue, OperatorReviewItem } from "@/services/operator-review/operator-review.service";

export default function OperatorReviewQueuePage() {
  const [queue, setQueue] = useState<OperatorReviewQueue | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchQueue = async () => {
      try {
        setIsLoading(true);
        const res = await fetch("/api/operator/review-queue");
        if (!res.ok) {
          throw new Error(`Failed to fetch review queue: ${res.status}`);
        }
        const data = await res.json();
        setQueue(data.data);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Unknown error");
      } finally {
        setIsLoading(false);
      }
    };

    fetchQueue();
  }, []);

  const getPriorityColor = (priority: string): string => {
    switch (priority) {
      case "critical":
        return "bg-red-100 border-red-300 text-red-900";
      case "high":
        return "bg-orange-100 border-orange-300 text-orange-900";
      case "medium":
        return "bg-yellow-100 border-yellow-300 text-yellow-900";
      case "low":
        return "bg-blue-100 border-blue-300 text-blue-900";
      default:
        return "bg-gray-100 border-gray-300 text-gray-900";
    }
  };

  const getPriorityBadgeColor = (priority: string): string => {
    switch (priority) {
      case "critical":
        return "bg-red-600 text-white";
      case "high":
        return "bg-orange-600 text-white";
      case "medium":
        return "bg-yellow-600 text-white";
      case "low":
        return "bg-blue-600 text-white";
      default:
        return "bg-gray-600 text-white";
    }
  };

  const formatCurrency = (value: number | null): string => {
    if (value === null) return "—";
    return `₹${(value / 100000).toFixed(1)}L`;
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-lg text-gray-600">Loading review queue...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-lg text-red-600">Error: {error}</div>
      </div>
    );
  }

  if (!queue) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-lg text-gray-600">No queue data available</div>
      </div>
    );
  }

  return (
    <div className="container mx-auto px-4 py-8">
      <h1 className="text-3xl font-bold mb-8">Operator Review Queue</h1>

      {/* Counts Summary */}
      <div className="grid grid-cols-5 gap-4 mb-8">
        <div className="bg-red-50 border border-red-200 rounded-lg p-4">
          <div className="text-2xl font-bold text-red-600">{queue.counts.critical}</div>
          <div className="text-sm text-red-700">Critical</div>
        </div>
        <div className="bg-orange-50 border border-orange-200 rounded-lg p-4">
          <div className="text-2xl font-bold text-orange-600">{queue.counts.high}</div>
          <div className="text-sm text-orange-700">High</div>
        </div>
        <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
          <div className="text-2xl font-bold text-yellow-600">{queue.counts.medium}</div>
          <div className="text-sm text-yellow-700">Medium</div>
        </div>
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
          <div className="text-2xl font-bold text-blue-600">{queue.counts.low}</div>
          <div className="text-sm text-blue-700">Low</div>
        </div>
        <div className="bg-gray-50 border border-gray-200 rounded-lg p-4">
          <div className="text-2xl font-bold text-gray-600">{queue.counts.total}</div>
          <div className="text-sm text-gray-700">Total</div>
        </div>
      </div>

      {/* Items List */}
      {queue.items.length === 0 ? (
        <div className="bg-green-50 border border-green-200 rounded-lg p-6 text-center">
          <p className="text-green-700 font-medium">No items in review queue</p>
        </div>
      ) : (
        <div className="space-y-4">
          {queue.items.map((item: OperatorReviewItem) => (
            <div
              key={item.engagementId}
              className={`border rounded-lg p-6 ${getPriorityColor(item.priority)}`}
            >
              <div className="flex items-start justify-between gap-4">
                <div className="flex-1">
                  <div className="flex items-center gap-3 mb-2">
                    <Link
                      href={`/engagements/${item.engagementId}`}
                      className="text-lg font-semibold hover:underline"
                    >
                      {item.clientName}
                    </Link>
                    <span className={`px-3 py-1 rounded-full text-xs font-bold ${getPriorityBadgeColor(item.priority)}`}>
                      {item.priority.toUpperCase()}
                    </span>
                  </div>

                  <p className="text-sm mb-3">{item.reason}</p>

                  {item.requiredAction && (
                    <div className="bg-white bg-opacity-60 rounded px-3 py-2 mb-3 text-sm">
                      <div className="font-medium mb-1">Required Action:</div>
                      <div>{item.requiredAction}</div>
                    </div>
                  )}

                  <div className="grid grid-cols-3 gap-4 text-sm">
                    <div>
                      <div className="font-medium">Execution Certainty</div>
                      <div>{item.executionCertainty}%</div>
                    </div>
                    <div>
                      <div className="font-medium">Business Impact</div>
                      <div>{item.businessImpactLevel}</div>
                    </div>
                    <div>
                      <div className="font-medium">Value at Risk</div>
                      <div>{formatCurrency(item.valueAtRiskINR)}</div>
                    </div>
                  </div>
                </div>

                <div className="flex-shrink-0">
                  <Link
                    href={`/engagements/${item.engagementId}`}
                    className="inline-block px-4 py-2 bg-white bg-opacity-70 hover:bg-opacity-100 rounded font-medium text-sm transition"
                  >
                    View Details
                  </Link>
                </div>
              </div>

              <div className="text-xs opacity-70 mt-3">
                Last updated: {new Date(item.lastUpdatedAt).toLocaleString()}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

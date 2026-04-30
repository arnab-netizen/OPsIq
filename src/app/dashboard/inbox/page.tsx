"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

interface Decision {
  id: string;
  title: string;
  status: "pending" | "approved" | "blocked" | "done" | "failed";
  impact: number;
  confidence: number;
  blockStage?: string | null;
  blockReason?: string | null;
  createdAt: string;
  assignedTo?: string | null;
}

export default function DashboardInboxPage() {
  const [decisions, setDecisions] = useState<Decision[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<"all" | "pending" | "blocked" | "approved">("all");

  useEffect(() => {
    const fetchDecisions = async () => {
      try {
        setLoading(true);
        const params = new URLSearchParams();
        if (filter !== "all") {
          params.set("status", filter);
        }
        params.set("limit", "100");

        const res = await fetch(`/api/decisions/list?${params.toString()}`);
        if (!res.ok) {
          throw new Error("Failed to fetch decisions");
        }

        const data = await res.json();
        setDecisions(data.decisions);
        setError(null);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Error fetching decisions");
        setDecisions([]);
      } finally {
        setLoading(false);
      }
    };

    fetchDecisions();
  }, [filter]);

  const statusColor = (status: string) => {
    switch (status) {
      case "pending":
        return "bg-yellow-50 text-yellow-900";
      case "approved":
        return "bg-green-50 text-green-900";
      case "blocked":
        return "bg-red-50 text-red-900";
      case "done":
        return "bg-blue-50 text-blue-900";
      default:
        return "bg-gray-50 text-gray-900";
    }
  };

  const statusBadge = (status: string) => {
    switch (status) {
      case "pending":
        return "bg-yellow-200 text-yellow-800";
      case "approved":
        return "bg-green-200 text-green-800";
      case "blocked":
        return "bg-red-200 text-red-800";
      case "done":
        return "bg-blue-200 text-blue-800";
      default:
        return "bg-gray-200 text-gray-800";
    }
  };

  return (
    <div className="p-6">
      <h1 className="text-2xl font-bold text-gray-900 mb-4">Decision Inbox</h1>

      {error && (
        <div className="bg-red-50 border border-red-200 rounded p-4 mb-4 text-sm text-red-800">
          {error}
        </div>
      )}

      <div className="mb-4 flex gap-2">
        {(["all", "pending", "blocked", "approved"] as const).map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={`px-4 py-2 rounded text-sm font-medium ${
              filter === f
                ? "bg-blue-600 text-white"
                : "bg-gray-200 text-gray-900 hover:bg-gray-300"
            }`}
          >
            {f.charAt(0).toUpperCase() + f.slice(1)}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="p-8 text-center text-gray-500">Loading...</div>
      ) : decisions.length === 0 ? (
        <div className="p-8 text-center text-gray-500">No decisions found</div>
      ) : (
        <div className="border rounded-lg overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-gray-100 border-b">
              <tr>
                <th className="px-4 py-3 text-left font-semibold text-gray-900">Title</th>
                <th className="px-4 py-3 text-left font-semibold text-gray-900">Assigned To</th>
                <th className="px-4 py-3 text-right font-semibold text-gray-900">Impact (₹)</th>
                <th className="px-4 py-3 text-center font-semibold text-gray-900">Confidence</th>
                <th className="px-4 py-3 text-center font-semibold text-gray-900">Status</th>
              </tr>
            </thead>
            <tbody>
              {decisions.map((decision) => (
                <tr
                  key={decision.id}
                  className="border-b hover:bg-gray-50 cursor-pointer"
                  onClick={() => (window.location.href = `/decisions/${decision.id}`)}
                >
                  <td className="px-4 py-3 text-gray-900 max-w-xs truncate font-medium">
                    {decision.title}
                  </td>
                  <td className="px-4 py-3 text-gray-700 text-xs">
                    {decision.assignedTo ? (
                      <span className="font-mono">{decision.assignedTo.slice(0, 8)}</span>
                    ) : (
                      <span className="text-gray-400 italic">Unassigned</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-right font-mono text-gray-700">
                    {(decision.impact / 1000000).toFixed(2)}M
                  </td>
                  <td className="px-4 py-3 text-center text-gray-700">
                    {(decision.confidence * 100).toFixed(0)}%
                  </td>
                  <td className="px-4 py-3 text-center">
                    <span
                      className={`inline-block px-3 py-1 rounded text-xs font-medium ${statusBadge(
                        decision.status
                      )}`}
                    >
                      {decision.status}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div className="mt-4 text-xs text-gray-500">
        Showing {decisions.length} decision{decisions.length !== 1 ? "s" : ""}
      </div>
    </div>
  );
}

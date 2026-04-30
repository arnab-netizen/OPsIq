"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Badge } from "@/ui/primitives";

interface Decision {
  id: string;
  problem: string;
  action: string;
  impactExpected: number;
  confidence: number;
  status: "pending" | "approved" | "blocked" | "done" | "failed";
  blockStage?: string;
  createdAt: string;
}

export function DecisionInboxTable() {
  const [decisions, setDecisions] = useState<Decision[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<"all" | "pending" | "blocked" | "approved">("pending");

  useEffect(() => {
    const fetchDecisions = async () => {
      try {
        const res = await fetch("/api/governance/metrics?days=1");
        if (!res.ok) throw new Error("Failed to fetch decisions");

        const data = await res.json();
        // Extract decisions from metrics response
        // Note: This assumes the API returns decision list or we need a separate endpoint
        setDecisions([]);
      } catch (err) {
        console.error("Error fetching decisions:", err);
      } finally {
        setLoading(false);
      }
    };

    fetchDecisions();
  }, []);

  const filtered = filter === "all"
    ? decisions
    : decisions.filter(d => d.status === filter || (filter === "blocked" && d.blockStage));

  const statusColor = (status: string) => {
    if (status === "pending") return "bg-yellow-100 text-yellow-800";
    if (status === "approved") return "bg-green-100 text-green-800";
    if (status === "blocked") return "bg-red-100 text-red-800";
    return "bg-gray-100 text-gray-800";
  };

  if (loading) return <div className="p-4">Loading decisions...</div>;

  return (
    <div className="space-y-4">
      <div className="flex gap-2 mb-4">
        <button
          onClick={() => setFilter("all")}
          className={`px-3 py-1 rounded text-sm ${filter === "all" ? "bg-blue-500 text-white" : "bg-gray-200"}`}
        >
          All
        </button>
        <button
          onClick={() => setFilter("pending")}
          className={`px-3 py-1 rounded text-sm ${filter === "pending" ? "bg-blue-500 text-white" : "bg-gray-200"}`}
        >
          Pending
        </button>
        <button
          onClick={() => setFilter("approved")}
          className={`px-3 py-1 rounded text-sm ${filter === "approved" ? "bg-blue-500 text-white" : "bg-gray-200"}`}
        >
          Approved
        </button>
        <button
          onClick={() => setFilter("blocked")}
          className={`px-3 py-1 rounded text-sm ${filter === "blocked" ? "bg-blue-500 text-white" : "bg-gray-200"}`}
        >
          Blocked
        </button>
      </div>

      <div className="border rounded-lg overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 border-b">
            <tr>
              <th className="px-4 py-2 text-left font-medium">Decision</th>
              <th className="px-4 py-2 text-left font-medium">Problem</th>
              <th className="px-4 py-2 text-right font-medium">Impact</th>
              <th className="px-4 py-2 text-center font-medium">Confidence</th>
              <th className="px-4 py-2 text-center font-medium">Status</th>
              <th className="px-4 py-2 text-left font-medium">Created</th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-4 py-4 text-center text-gray-500">
                  No decisions found
                </td>
              </tr>
            ) : (
              filtered.map((decision) => (
                <tr key={decision.id} className="border-b hover:bg-gray-50">
                  <td className="px-4 py-2">
                    <Link
                      href={`/decisions/${decision.id}`}
                      className="text-blue-600 hover:underline font-mono text-xs"
                    >
                      {decision.id.slice(0, 8)}...
                    </Link>
                  </td>
                  <td className="px-4 py-2 text-xs max-w-xs truncate">{decision.problem}</td>
                  <td className="px-4 py-2 text-right font-mono">
                    ₹{(decision.impactExpected / 1000).toFixed(0)}k
                  </td>
                  <td className="px-4 py-2 text-center text-xs">
                    {(decision.confidence * 100).toFixed(0)}%
                  </td>
                  <td className="px-4 py-2 text-center">
                    <Badge className={statusColor(decision.status)}>
                      {decision.status}
                    </Badge>
                  </td>
                  <td className="px-4 py-2 text-xs text-gray-500">
                    {new Date(decision.createdAt).toLocaleDateString()}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <div className="text-xs text-gray-500 p-4 bg-gray-50 rounded">
        Showing {filtered.length} of {decisions.length} decisions
      </div>
    </div>
  );
}

"use client";

import { useState } from "react";
import {
  classifyOperatorError,
  type ErrorGovernanceContext,
} from "@/src/lib/operator-error-governance";
import { useRouter } from "next/navigation";
import {
  classifyOperatorError,
  type ErrorGovernanceContext,
} from "@/src/lib/operator-error-governance";

export function CreateDecisionForm() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [formData, setFormData] = useState({
    title: "",
    description: "",
    confidence: 0.5,
    risk: "medium" as const,
    revenue: 0,
    cost: 0,
  });

  const handleChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>
  ) => {
    const { name, value, type } = e.target;
    setFormData((prev) => ({
      ...prev,
      [name]: type === "number" ? parseFloat(value) : value,
    }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    try {
      const response = await fetch("/api/decisions/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: formData.title,
          description: formData.description,
          confidence: formData.confidence,
          risk: formData.risk,
          financialInputs: {
            revenue: formData.revenue,
            cost: formData.cost,
          },
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(
          data.error || `Error: ${response.statusText}`
        );
      }

      // Redirect to new decision detail page
      router.push(`/decisions/${data.decisionId}`);
    } catch (err) {
      const ctx: ErrorGovernanceContext = { context: "load" };
      const govErr = classifyOperatorError(err, ctx);
      setError(govErr.operatorMessage);
      setLoading(false);
    }
  };

  return (
    <div className="max-w-2xl mx-auto">
      <div className="bg-white rounded-lg border p-6">
        <h2 className="text-2xl font-bold text-gray-900 mb-6">Create New Decision</h2>

        {error && (
          <div className="bg-red-50 border border-red-200 rounded p-4 mb-6 text-sm text-red-800">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-6">
          {/* Title */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Decision Title *
            </label>
            <input
              type="text"
              name="title"
              value={formData.title}
              onChange={handleChange}
              placeholder="e.g., Approve $5M investment in new market"
              required
              minLength={5}
              maxLength={200}
              className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            <p className="text-xs text-gray-500 mt-1">5-200 characters</p>
          </div>

          {/* Description */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Description *
            </label>
            <textarea
              name="description"
              value={formData.description}
              onChange={handleChange}
              placeholder="Detailed explanation of the decision, context, and rationale..."
              required
              minLength={10}
              maxLength={2000}
              rows={5}
              className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            <p className="text-xs text-gray-500 mt-1">10-2000 characters</p>
          </div>

          {/* Financial Inputs */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Expected Revenue (₹)
              </label>
              <input
                type="number"
                name="revenue"
                value={formData.revenue}
                onChange={handleChange}
                placeholder="0"
                min="0"
                className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Expected Cost (₹)
              </label>
              <input
                type="number"
                name="cost"
                value={formData.cost}
                onChange={handleChange}
                placeholder="0"
                min="0"
                className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
          </div>

          {/* Confidence */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Confidence Level: {(formData.confidence * 100).toFixed(0)}%
            </label>
            <input
              type="range"
              name="confidence"
              value={formData.confidence}
              onChange={handleChange}
              min="0"
              max="1"
              step="0.1"
              className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer"
            />
            <div className="flex justify-between text-xs text-gray-500 mt-2">
              <span>0% (No confidence)</span>
              <span>100% (Very confident)</span>
            </div>
          </div>

          {/* Risk Level */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Risk Level *
            </label>
            <select
              name="risk"
              value={formData.risk}
              onChange={handleChange}
              className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="low">Low Risk - Conservative, minimal downside</option>
              <option value="medium">Medium Risk - Balanced risk/reward</option>
              <option value="high">High Risk - Significant upside potential</option>
            </select>
          </div>

          {/* Expected Impact Summary */}
          <div className="bg-gray-50 rounded-lg p-4">
            <p className="text-sm font-medium text-gray-900 mb-2">Expected Impact</p>
            <p className="text-2xl font-bold text-blue-600">
              ₹{((formData.revenue - formData.cost) / 1_000_000).toFixed(1)}M
            </p>
            <p className="text-xs text-gray-600 mt-1">
              Revenue (₹{(formData.revenue / 1_000_000).toFixed(1)}M) - Cost (₹{(formData.cost / 1_000_000).toFixed(1)}M)
            </p>
          </div>

          {/* Action Buttons */}
          <div className="flex gap-4 pt-4 border-t">
            <button
              type="submit"
              disabled={loading}
              className="flex-1 bg-blue-600 text-white py-2 px-4 rounded-lg hover:bg-blue-700 disabled:bg-gray-400 font-medium"
            >
              {loading ? "Creating Decision..." : "Create Decision"}
            </button>
            <button
              type="button"
              onClick={() => router.back()}
              className="flex-1 bg-gray-200 text-gray-900 py-2 px-4 rounded-lg hover:bg-gray-300 font-medium"
            >
              Cancel
            </button>
          </div>

          <p className="text-xs text-gray-500 text-center pt-2">
            Once created, the decision will appear in your inbox for review and approval.
          </p>
        </form>
      </div>
    </div>
  );
}

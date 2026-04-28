"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";

interface QuickStartResult {
  clientId: string;
  engagementId: string;
  primaryDecision: string;
  businessImpact: string;
  executionCertainty: number;
  valueAtRiskINR: number;
  nextAction: string;
}

export default function QuickStartPage() {
  const router = useRouter();
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<QuickStartResult | null>(null);

  const [formData, setFormData] = useState({
    businessName: "",
    monthlyRevenueINR: "",
    problem1: "",
    problem2: "",
    problem3: "",
  });

  const getRiskColor = (impactLevel: string): string => {
    switch (impactLevel) {
      case "existential":
      case "critical":
        return "text-red-600";
      case "high":
        return "text-orange-600";
      case "medium":
        return "text-yellow-600";
      case "low":
        return "text-blue-600";
      default:
        return "text-gray-600";
    }
  };

  const getRiskBgColor = (impactLevel: string): string => {
    switch (impactLevel) {
      case "existential":
      case "critical":
        return "bg-red-50 border-red-200";
      case "high":
        return "bg-orange-50 border-orange-200";
      case "medium":
        return "bg-yellow-50 border-yellow-200";
      case "low":
        return "bg-blue-50 border-blue-200";
      default:
        return "bg-gray-50 border-gray-200";
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setError(null);

    const problems = [formData.problem1, formData.problem2, formData.problem3]
      .filter((p) => p.trim())
      .slice(0, 3);

    if (!formData.businessName.trim()) {
      setError("Business name is required");
      setIsLoading(false);
      return;
    }

    if (problems.length === 0) {
      setError("At least one problem is required");
      setIsLoading(false);
      return;
    }

    try {
      const res = await fetch("/api/quick-start", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          businessName: formData.businessName,
          monthlyRevenueINR: formData.monthlyRevenueINR
            ? parseInt(formData.monthlyRevenueINR)
            : undefined,
          problems,
        }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed to create engagement");
      }

      const data = await res.json();
      setResult(data.data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error");
    } finally {
      setIsLoading(false);
    }
  };

  if (result) {
    return (
      <div className="container mx-auto px-4 py-8 max-w-2xl">
        <div className="mb-8">
          <h1 className="text-3xl font-bold mb-2">Engagement Created Successfully</h1>
          <p className="text-gray-600">Your quick-start engagement is ready to review</p>
        </div>

        {/* Risk Assessment */}
        <div className={`border rounded-lg p-6 mb-6 ${getRiskBgColor(result.businessImpact)}`}>
          <div className="flex items-start justify-between">
            <div>
              <h2 className="text-xl font-semibold mb-2">Risk Assessment</h2>
              <p className={`text-2xl font-bold ${getRiskColor(result.businessImpact)}`}>
                {result.businessImpact.charAt(0).toUpperCase() +
                  result.businessImpact.slice(1)}{" "}
                Impact
              </p>
            </div>
          </div>
        </div>

        {/* Primary Decision */}
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-6 mb-6">
          <h2 className="text-lg font-semibold mb-3 text-blue-900">Primary Decision</h2>
          <p className="text-blue-800 text-lg font-medium">{result.primaryDecision}</p>
        </div>

        {/* Key Metrics */}
        <div className="grid grid-cols-2 gap-4 mb-6">
          <div className="bg-gray-50 border border-gray-200 rounded-lg p-4">
            <div className="text-sm font-medium text-gray-600 mb-1">Execution Certainty</div>
            <div className="text-2xl font-bold text-gray-900">{result.executionCertainty}%</div>
          </div>
          <div className="bg-gray-50 border border-gray-200 rounded-lg p-4">
            <div className="text-sm font-medium text-gray-600 mb-1">Value at Risk</div>
            <div className="text-2xl font-bold text-gray-900">
              ₹{(result.valueAtRiskINR / 100000).toFixed(1)}L
            </div>
          </div>
        </div>

        {/* Next Action */}
        <div className="bg-green-50 border border-green-200 rounded-lg p-6 mb-8">
          <h2 className="text-lg font-semibold mb-2 text-green-900">Next Action</h2>
          <p className="text-green-800">{result.nextAction}</p>
        </div>

        {/* Action Buttons */}
        <div className="flex gap-4">
          <Link
            href={`/engagements/${result.engagementId}`}
            className="flex-1 bg-blue-600 hover:bg-blue-700 text-white font-medium py-3 px-4 rounded-lg text-center transition"
          >
            Open Dashboard
          </Link>
          <button
            onClick={() => {
              setResult(null);
              setFormData({
                businessName: "",
                monthlyRevenueINR: "",
                problem1: "",
                problem2: "",
                problem3: "",
              });
            }}
            className="flex-1 bg-gray-200 hover:bg-gray-300 text-gray-900 font-medium py-3 px-4 rounded-lg transition"
          >
            Create Another
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="container mx-auto px-4 py-8 max-w-2xl">
      <div className="mb-8">
        <h1 className="text-3xl font-bold mb-2">Quick Start Workspace</h1>
        <p className="text-gray-600">
          Set up a new engagement in minutes. Answer a few questions and we'll help you get started.
        </p>
      </div>

      <form onSubmit={handleSubmit} className="bg-white rounded-lg border border-gray-200 p-8">
        {error && (
          <div className="mb-6 p-4 bg-red-50 border border-red-200 text-red-700 rounded-lg">
            {error}
          </div>
        )}

        {/* Business Name */}
        <div className="mb-6">
          <label className="block text-sm font-medium text-gray-900 mb-2">
            Business/Client Name *
          </label>
          <input
            type="text"
            required
            value={formData.businessName}
            onChange={(e) => setFormData({ ...formData, businessName: e.target.value })}
            placeholder="e.g., Acme Corp"
            className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>

        {/* Monthly Revenue */}
        <div className="mb-6">
          <label className="block text-sm font-medium text-gray-900 mb-2">
            Monthly Revenue (₹) <span className="text-gray-500 font-normal">(optional)</span>
          </label>
          <input
            type="number"
            value={formData.monthlyRevenueINR}
            onChange={(e) => setFormData({ ...formData, monthlyRevenueINR: e.target.value })}
            placeholder="e.g., 5000000"
            className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
          <p className="text-sm text-gray-500 mt-1">Leave blank to use default ₹10L</p>
        </div>

        {/* Problems */}
        <div className="mb-8">
          <label className="block text-sm font-medium text-gray-900 mb-4">
            Top Problems/Issues *
          </label>
          <div className="space-y-3">
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">
                Problem 1 (Most Critical)
              </label>
              <input
                type="text"
                required
                value={formData.problem1}
                onChange={(e) => setFormData({ ...formData, problem1: e.target.value })}
                placeholder="e.g., Revenue decline by 40%"
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">
                Problem 2 (Optional)
              </label>
              <input
                type="text"
                value={formData.problem2}
                onChange={(e) => setFormData({ ...formData, problem2: e.target.value })}
                placeholder="e.g., Customer churn increasing"
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">
                Problem 3 (Optional)
              </label>
              <input
                type="text"
                value={formData.problem3}
                onChange={(e) => setFormData({ ...formData, problem3: e.target.value })}
                placeholder="e.g., Team morale issues"
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
          </div>
        </div>

        {/* Submit Button */}
        <button
          type="submit"
          disabled={isLoading}
          className="w-full bg-blue-600 hover:bg-blue-700 disabled:bg-gray-400 text-white font-medium py-3 px-4 rounded-lg transition"
        >
          {isLoading ? "Creating Engagement..." : "Create Engagement"}
        </button>
      </form>

      <div className="mt-8 p-6 bg-blue-50 border border-blue-200 rounded-lg">
        <h3 className="font-semibold text-blue-900 mb-2">What happens next?</h3>
        <ul className="text-sm text-blue-800 space-y-1">
          <li>✓ We analyze your problems and assess business impact</li>
          <li>✓ Calculate execution certainty and identify risks</li>
          <li>✓ Generate a primary recommendation</li>
          <li>✓ You can refine details in the full dashboard</li>
        </ul>
      </div>
    </div>
  );
}

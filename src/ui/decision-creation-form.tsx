"use client";

import { useState } from "react";

interface DecisionCreationFormProps {
  workspaceId: string;
  onSuccess?: (decision: any) => void;
  onError?: (error: string) => void;
}

export function DecisionCreationForm({
  workspaceId,
  onSuccess,
  onError,
}: DecisionCreationFormProps) {
  const [title, setTitle] = useState("");
  const [type, setType] = useState("");
  const [impact, setImpact] = useState("");
  const [confidence, setConfidence] = useState("");
  const [problemType, setProblemType] = useState("");
  const [expectedOutcome, setExpectedOutcome] = useState("");
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");
  const [messageType, setMessageType] = useState<"success" | "error" | "">(
    ""
  );

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setMessage("");

    try {
      // Validate inputs
      if (!title.trim()) {
        throw new Error("Title is required");
      }
      if (!type.trim()) {
        throw new Error("Type is required");
      }
      if (!impact || isNaN(parseFloat(impact)) || parseFloat(impact) <= 0) {
        throw new Error("Impact must be a positive number");
      }
      if (
        !confidence ||
        isNaN(parseFloat(confidence)) ||
        parseFloat(confidence) < 0 ||
        parseFloat(confidence) > 1
      ) {
        throw new Error("Confidence must be between 0 and 1");
      }

      const response = await fetch("/api/decisions/create", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-workspace-id": workspaceId,
        },
        body: JSON.stringify({
          title,
          type,
          impact: parseFloat(impact),
          confidence: parseFloat(confidence),
          problemType: problemType || undefined,
          expectedOutcome: expectedOutcome || undefined,
        }),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.details || error.error || "Failed to create decision");
      }

      const decision = await response.json();

      setMessageType("success");
      setMessage("Decision created successfully!");

      // Clear form
      setTitle("");
      setType("");
      setImpact("");
      setConfidence("");
      setProblemType("");
      setExpectedOutcome("");

      if (onSuccess) {
        onSuccess(decision);
      }

      setTimeout(() => setMessage(""), 3000);
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      setMessageType("error");
      setMessage(errorMsg);

      if (onError) {
        onError(errorMsg);
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4 max-w-md">
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">
          Title *
        </label>
        <input
          type="text"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Decision title"
          className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500"
          disabled={loading}
        />
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">
          Type *
        </label>
        <input
          type="text"
          value={type}
          onChange={(e) => setType(e.target.value)}
          placeholder="e.g., strategic, operational"
          className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500"
          disabled={loading}
        />
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">
          Expected Impact (USD) *
        </label>
        <input
          type="number"
          value={impact}
          onChange={(e) => setImpact(e.target.value)}
          placeholder="0.00"
          step="0.01"
          min="0"
          className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500"
          disabled={loading}
        />
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">
          Confidence (0-1) *
        </label>
        <input
          type="number"
          value={confidence}
          onChange={(e) => setConfidence(e.target.value)}
          placeholder="0.00"
          step="0.01"
          min="0"
          max="1"
          className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500"
          disabled={loading}
        />
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">
          Problem Type (optional)
        </label>
        <input
          type="text"
          value={problemType}
          onChange={(e) => setProblemType(e.target.value)}
          placeholder="e.g., revenue_leak, cost_overrun"
          className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500"
          disabled={loading}
        />
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">
          Expected Outcome (optional)
        </label>
        <textarea
          value={expectedOutcome}
          onChange={(e) => setExpectedOutcome(e.target.value)}
          placeholder="Describe the expected outcome"
          className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500"
          rows={3}
          disabled={loading}
        />
      </div>

      {message && (
        <div
          className={`p-3 rounded-md text-sm ${
            messageType === "success"
              ? "bg-green-50 text-green-700"
              : "bg-red-50 text-red-700"
          }`}
        >
          {message}
        </div>
      )}

      <button
        type="submit"
        disabled={loading}
        className="w-full bg-blue-600 hover:bg-blue-700 text-white font-medium py-2 px-4 rounded-md disabled:opacity-50 disabled:cursor-not-allowed"
      >
        {loading ? "Creating..." : "Create Decision"}
      </button>
    </form>
  );
}

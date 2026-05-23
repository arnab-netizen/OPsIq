"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { classifyOperatorError } from "@/lib/operator-error-governance";

type Step = "workspace" | "decision" | "evaluate" | "dashboard";

interface StepData {
  workspace?: {
    id: string;
    name: string;
    slug: string;
  };
  decision?: {
    id: string;
  };
  evaluation?: {
    recommendation: string;
    blockStage?: string;
  };
}

export default function OnboardingFlow() {
  const router = useRouter();
  const [currentStep, setCurrentStep] = useState<Step>("workspace");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<StepData>({});

  // Step 1: Create Workspace
  const handleCreateWorkspace = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    const form = e.currentTarget as HTMLFormElement;
    const formData = new FormData(form);
    const name = formData.get("name") as string;
    const slug = formData.get("slug") as string;

    try {
      const res = await fetch("/api/onboarding/workspace", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, slug }),
      });

      if (!res.ok) throw new Error("Failed to create workspace");

      const result = await res.json();
      setData({ workspace: result });
      setCurrentStep("decision");
    } catch (err) {
      const governed = classifyOperatorError(err instanceof Error ? err : new Error(String(err)), { context: "action" });
      setError(governed.operatorMessage);
    } finally {
      setLoading(false);
    }
  };

  // Step 2: Add First Decision
  const handleAddDecision = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    const form = e.currentTarget as HTMLFormElement;
    const formData = new FormData(form);
    const title = formData.get("title") as string;
    const description = formData.get("description") as string;
    const confidence = parseFloat(formData.get("confidence") as string);

    try {
      const res = await fetch(
        `/api/decisions/intake?workspaceId=${data.workspace?.id}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            title,
            description,
            confidence,
            risk: "medium",
          }),
        }
      );

      if (!res.ok) throw new Error("Failed to create decision");

      const result = await res.json();
      setData({ ...data, decision: result });
      setCurrentStep("evaluate");
    } catch (err) {
      const governed = classifyOperatorError(err instanceof Error ? err : new Error("Error creating decision"), { context: "action" });
      setError(governed.operatorMessage);
    } finally {
      setLoading(false);
    }
  };

  // Step 3: Run Evaluation
  const handleEvaluate = async () => {
    setLoading(true);
    setError(null);

    try {
      const res = await fetch(
        `/api/decisions/${data.decision?.id}/evaluate?workspaceId=${data.workspace?.id}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({}),
        }
      );

      if (!res.ok) throw new Error("Failed to evaluate decision");

      const result = await res.json();
      setData({
        ...data,
        evaluation: {
          recommendation: result.recommendation,
          blockStage: result.blockStage,
        },
      });
      setCurrentStep("dashboard");
    } catch (err) {
      const governed = classifyOperatorError(err instanceof Error ? err : new Error("Error evaluating decision"), { context: "action" });
      setError(governed.operatorMessage);
    } finally {
      setLoading(false);
    }
  };

  // Step 4: View Dashboard
  const handleCompletedOnboarding = () => {
    router.push(
      `/dashboard/impact?workspaceId=${data.workspace?.id}`
    );
  };

  return (
    <div className="min-h-screen bg-gray-50 p-6">
      <div className="max-w-2xl mx-auto">
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-gray-900 mb-2">
            Welcome to OpsIQ
          </h1>
          <p className="text-gray-600">
            Let&apos;s get you started in 4 simple steps
          </p>
        </div>

        {/* Progress Indicator */}
        <div className="mb-8 flex gap-2">
          {(["workspace", "decision", "evaluate", "dashboard"] as const).map(
            (step) => (
              <div
                key={step}
                className={`flex-1 h-2 rounded ${
                  step === currentStep
                    ? "bg-blue-600"
                    : ["workspace", "decision", "evaluate", "dashboard"]
                        .indexOf(step) <
                      ["workspace", "decision", "evaluate", "dashboard"].indexOf(
                        currentStep
                      )
                    ? "bg-green-600"
                    : "bg-gray-200"
                }`}
              />
            )
          )}
        </div>

        {/* Error Message */}
        {error && (
          <div className="bg-red-50 border border-red-200 rounded p-4 mb-6 text-sm text-red-800">
            {error}
          </div>
        )}

        {/* Step 1: Create Workspace */}
        {currentStep === "workspace" && (
          <div className="bg-white rounded-lg border p-6">
            <h2 className="text-xl font-bold text-gray-900 mb-4">
              Step 1: Create Your Workspace
            </h2>
            <form onSubmit={handleCreateWorkspace} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Workspace Name
                </label>
                <input
                  type="text"
                  name="name"
                  placeholder="e.g., Acme Corp"
                  className="w-full border rounded px-3 py-2 text-sm"
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Workspace Slug
                </label>
                <input
                  type="text"
                  name="slug"
                  placeholder="e.g., acme-corp"
                  className="w-full border rounded px-3 py-2 text-sm"
                  required
                />
              </div>
              <button
                type="submit"
                disabled={loading}
                className="w-full bg-blue-600 text-white py-2 rounded font-medium hover:bg-blue-700 disabled:bg-gray-400"
              >
                {loading ? "Creating..." : "Create Workspace"}
              </button>
            </form>
          </div>
        )}

        {/* Step 2: Add First Decision */}
        {currentStep === "decision" && (
          <div className="bg-white rounded-lg border p-6">
            <h2 className="text-xl font-bold text-gray-900 mb-4">
              Step 2: Add Your First Decision
            </h2>
            <p className="text-sm text-gray-600 mb-4">
              Workspace: <span className="font-mono">{data.workspace?.name}</span>
            </p>
            <form onSubmit={handleAddDecision} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Decision Title
                </label>
                <input
                  type="text"
                  name="title"
                  placeholder="e.g., Scale to 3 new markets"
                  className="w-full border rounded px-3 py-2 text-sm"
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Description
                </label>
                <textarea
                  name="description"
                  placeholder="Describe the decision..."
                  className="w-full border rounded px-3 py-2 text-sm"
                  rows={3}
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Confidence (0-1)
                </label>
                <input
                  type="number"
                  name="confidence"
                  min="0"
                  max="1"
                  step="0.1"
                  defaultValue="0.7"
                  className="w-full border rounded px-3 py-2 text-sm"
                />
              </div>
              <button
                type="submit"
                disabled={loading}
                className="w-full bg-blue-600 text-white py-2 rounded font-medium hover:bg-blue-700 disabled:bg-gray-400"
              >
                {loading ? "Creating..." : "Add Decision"}
              </button>
            </form>
          </div>
        )}

        {/* Step 3: Run Evaluation */}
        {currentStep === "evaluate" && (
          <div className="bg-white rounded-lg border p-6">
            <h2 className="text-xl font-bold text-gray-900 mb-4">
              Step 3: Run Evaluation
            </h2>
            <p className="text-sm text-gray-600 mb-4">
              Decision: <span className="font-mono">{data.decision?.id?.slice(0, 8)}</span>
            </p>
            <div className="bg-blue-50 border border-blue-200 rounded p-4 mb-6 text-sm text-blue-800">
              This will run your decision through the governance engine to check
              against guardrails, gates, and control layers.
            </div>
            <button
              onClick={handleEvaluate}
              disabled={loading}
              className="w-full bg-blue-600 text-white py-2 rounded font-medium hover:bg-blue-700 disabled:bg-gray-400"
            >
              {loading ? "Evaluating..." : "Run Evaluation"}
            </button>
          </div>
        )}

        {/* Step 4: Dashboard */}
        {currentStep === "dashboard" && (
          <div className="bg-white rounded-lg border p-6">
            <h2 className="text-xl font-bold text-gray-900 mb-4">
              Step 4: View Impact Dashboard
            </h2>
            <div className="bg-green-50 border border-green-200 rounded p-4 mb-6 text-sm text-green-800">
              <p className="font-medium mb-2">Evaluation Complete ✓</p>
              <p>
                Recommendation:{" "}
                <span className="font-bold capitalize">
                  {data.evaluation?.recommendation}
                </span>
              </p>
              {data.evaluation?.blockStage && (
                <p>Block Stage: {data.evaluation.blockStage}</p>
              )}
            </div>
            <button
              onClick={handleCompletedOnboarding}
              className="w-full bg-green-600 text-white py-2 rounded font-medium hover:bg-green-700"
            >
              View Impact Dashboard
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

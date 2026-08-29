"use client";

import { classifyOperatorError } from "@/lib/operator-error-governance";
import { useState } from "react";
import { useRouter } from "next/navigation";

/**
 * Only rendered for an authenticated account with zero active workspace
 * memberships (see page.tsx) — public signup already creates the initial
 * workspace for every normal signup, so reaching this form means recovering
 * an account that legitimately has none.
 */
export function OnboardingRecoveryForm() {
  const router = useRouter();
  const [workspaceName, setWorkspaceName] = useState("");
  const [workspaceSlug, setWorkspaceSlug] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleCreateWorkspace = async () => {
    if (!workspaceName.trim() || !workspaceSlug.trim()) {
      setError("Workspace name and slug are required");
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const res = await fetch("/api/onboarding/workspace", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: workspaceName,
          slug: workspaceSlug.toLowerCase().replace(/\s+/g, "-"),
          description: "Decision governance workspace",
        }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => null);
        throw new Error(data?.error?.message || data?.error || "Failed to create workspace");
      }

      router.push("/owner/data");
    } catch (err) {
      const governed = classifyOperatorError(err instanceof Error ? err : new Error("Error creating workspace"), { context: "load" });
      setError(governed.operatorMessage);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 flex items-center justify-center p-4">
      <div className="w-full max-w-md bg-white rounded-lg shadow-lg p-8">
        <h1 className="text-3xl font-bold text-gray-900 mb-2">Finish setting up OpsIQ</h1>
        <p className="text-gray-600 mb-6">
          Your account doesn&apos;t have a workspace yet. Create one to continue.
        </p>

        {error && (
          <div className="bg-red-50 border border-red-200 rounded p-3 mb-4 text-sm text-red-800">
            {error}
          </div>
        )}

        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Workspace Name *
            </label>
            <input
              type="text"
              value={workspaceName}
              onChange={(e) => setWorkspaceName(e.target.value)}
              placeholder="e.g., Acme Corp"
              className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Workspace Slug *
            </label>
            <input
              type="text"
              value={workspaceSlug}
              onChange={(e) => setWorkspaceSlug(e.target.value)}
              placeholder="e.g., acme-corp"
              className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            <p className="text-xs text-gray-500 mt-1">
              URL-friendly identifier for your workspace
            </p>
          </div>

          <button
            onClick={handleCreateWorkspace}
            disabled={loading}
            className="w-full bg-blue-600 text-white py-2 px-4 rounded-lg hover:bg-blue-700 disabled:bg-gray-400 font-medium text-sm"
          >
            {loading ? "Creating..." : "Create Workspace"}
          </button>
        </div>
      </div>
    </div>
  );
}

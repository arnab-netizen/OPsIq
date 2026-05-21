"use client";

import { classifyOperatorError } from "@/lib/operator-error-governance";
import { useState } from "react";
import { useRouter } from "next/navigation";

export default function OnboardingPage() {
  const router = useRouter();
  const [step, setStep] = useState<"workspace" | "team" | "complete">("workspace");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Workspace form state
  const [workspaceName, setWorkspaceName] = useState("");
  const [workspaceSlug, setWorkspaceSlug] = useState("");

  // Team form state
  const [teamMembers, setTeamMembers] = useState<Array<{ email: string; role: string }>>([
    { email: "", role: "approver" },
  ]);

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
        const data = await res.json();
        throw new Error(data.error || "Failed to create workspace");
      }

      setStep("team");
    } catch (err) {
      const governed = classifyOperatorError(err instanceof Error ? err : new Error("Error creating workspace"), { context: "load" });
      setError(governed.operatorMessage);
    } finally {
      setLoading(false);
    }
  };

  const handleAddMember = () => {
    setTeamMembers([...teamMembers, { email: "", role: "submitter" }]);
  };

  const handleRemoveMember = (idx: number) => {
    setTeamMembers(teamMembers.filter((_, i) => i !== idx));
  };

  const handleMemberChange = (idx: number, field: string, value: string) => {
    const updated = [...teamMembers];
    updated[idx] = { ...updated[idx], [field]: value };
    setTeamMembers(updated);
  };

  const handleInviteTeam = async () => {
    const validMembers = teamMembers.filter((m) => m.email.trim());

    if (validMembers.length === 0) {
      setError("Please add at least one team member");
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const res = await fetch("/api/onboarding/invite", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          workspaceSlug: workspaceSlug.toLowerCase().replace(/\s+/g, "-"),
          members: validMembers,
        }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed to invite team members");
      }

      setStep("complete");
    } catch (err) {
      const governed = classifyOperatorError(err instanceof Error ? err : new Error("Error inviting team members"), { context: "load" });
      setError(governed.operatorMessage);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 flex items-center justify-center p-4">
      <div className="w-full max-w-md bg-white rounded-lg shadow-lg p-8">
        <h1 className="text-3xl font-bold text-gray-900 mb-2">Welcome to OPsIQ</h1>
        <p className="text-gray-600 mb-6">Set up your decision governance workspace</p>

        {/* Progress Indicator */}
        <div className="flex gap-2 mb-8">
          {(["workspace", "team", "complete"] as const).map((s) => (
            <div
              key={s}
              className={`flex-1 h-2 rounded-full ${
                s === step
                  ? "bg-blue-600"
                  : ["workspace", "team", "complete"].indexOf(s) <
                      ["workspace", "team", "complete"].indexOf(step)
                    ? "bg-green-600"
                    : "bg-gray-300"
              }`}
            />
          ))}
        </div>

        {error && (
          <div className="bg-red-50 border border-red-200 rounded p-3 mb-4 text-sm text-red-800">
            {error}
          </div>
        )}

        {/* Step 1: Create Workspace */}
        {step === "workspace" && (
          <div className="space-y-4">
            <h2 className="text-lg font-semibold text-gray-900">Create Your Workspace</h2>

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
        )}

        {/* Step 2: Invite Team */}
        {step === "team" && (
          <div className="space-y-4">
            <h2 className="text-lg font-semibold text-gray-900">Invite Your Team</h2>
            <p className="text-sm text-gray-600">
              Add team members who will govern and approve decisions
            </p>

            <div className="space-y-3 max-h-64 overflow-y-auto">
              {teamMembers.map((member, idx) => (
                <div key={idx} className="flex gap-2">
                  <input
                    type="email"
                    value={member.email}
                    onChange={(e) => handleMemberChange(idx, "email", e.target.value)}
                    placeholder="Email address"
                    className="flex-1 border rounded px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                  <select
                    value={member.role}
                    onChange={(e) => handleMemberChange(idx, "role", e.target.value)}
                    className="border rounded px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    <option value="admin">Admin</option>
                    <option value="approver">Approver</option>
                    <option value="submitter">Submitter</option>
                  </select>
                  {teamMembers.length > 1 && (
                    <button
                      onClick={() => handleRemoveMember(idx)}
                      className="text-red-600 hover:text-red-800 font-medium text-sm"
                    >
                      ✕
                    </button>
                  )}
                </div>
              ))}
            </div>

            <button
              onClick={handleAddMember}
              className="text-blue-600 hover:text-blue-800 text-sm font-medium"
            >
              + Add Another Member
            </button>

            <div className="flex gap-2 pt-4">
              <button
                onClick={() => setStep("workspace")}
                className="flex-1 bg-gray-200 text-gray-900 py-2 px-4 rounded-lg hover:bg-gray-300 font-medium text-sm"
              >
                Back
              </button>
              <button
                onClick={handleInviteTeam}
                disabled={loading}
                className="flex-1 bg-blue-600 text-white py-2 px-4 rounded-lg hover:bg-blue-700 disabled:bg-gray-400 font-medium text-sm"
              >
                {loading ? "Inviting..." : "Invite Team"}
              </button>
            </div>
          </div>
        )}

        {/* Step 3: Complete */}
        {step === "complete" && (
          <div className="space-y-4 text-center">
            <div className="text-5xl mb-4">✓</div>
            <h2 className="text-lg font-semibold text-gray-900">All Set!</h2>
            <p className="text-gray-600 text-sm">
              Your workspace is ready. Team members will receive invitation emails shortly.
            </p>
            <button
              onClick={() => router.push("/dashboard/inbox")}
              className="w-full bg-blue-600 text-white py-2 px-4 rounded-lg hover:bg-blue-700 font-medium text-sm"
            >
              Go to Dashboard
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

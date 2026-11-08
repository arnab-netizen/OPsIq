"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import type { WorkspaceSetupStateDTO, WorkspaceSetupInputDTO } from "@/lib/workspace-setup/workspace-setup.dto";
import { toOperatorSafeError } from "@/lib/operator-safe-errors";

export default function WorkspaceSetupPage() {
  const router = useRouter();
  const [setup, setSetup] = useState<WorkspaceSetupStateDTO | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const [formData, setFormData] = useState<WorkspaceSetupInputDTO>({});

  useEffect(() => {
    async function fetchSetup() {
      try {
        const response = await fetch("/api/owner/workspace-setup");
        if (!response.ok) {
          throw new Error(`Failed to load setup: ${response.status}`);
        }
        const data = await response.json();
        setSetup(data);
        setFormData({
          businessBasics: data.businessBasics,
          ownerConstraints: data.ownerConstraints,
          financialBasics: data.financialBasics,
          capacityBasics: data.capacityBasics,
          customerBasics: data.customerBasics,
        });
      } catch (err) {
        const safeError = toOperatorSafeError(err, "load");
        setError(safeError.error);
      } finally {
        setLoading(false);
      }
    }

    fetchSetup();
  }, []);

  const handleSave = async () => {
    setSaving(true);
    try {
      const response = await fetch("/api/owner/workspace-setup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(formData),
      });

      if (!response.ok) {
        throw new Error(`Failed to save setup: ${response.status}`);
      }

      const result = await response.json();
      setSetup(result as WorkspaceSetupStateDTO);
    } catch (err) {
      const safeError = toOperatorSafeError(err, "save");
      setError(safeError.error);
    } finally {
      setSaving(false);
    }
  };

  const handleContinueToFirstValue = () => {
    router.push("/owner/first-value");
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <p>Loading setup...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-6 bg-red-50 border border-red-200 rounded-lg">
        <h1 className="text-xl font-bold text-red-800">Error</h1>
        <p className="text-red-700">{error}</p>
      </div>
    );
  }

  if (!setup) {
    return (
      <div className="p-6 bg-gray-50 border border-gray-200 rounded-lg">
        <h1 className="text-xl font-bold">Setup not available</h1>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto p-6 space-y-8">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Workspace Setup</h1>
          {setup.workspaceMode === "DEMO" && (
            <span className="inline-block mt-2 px-3 py-1 bg-yellow-100 text-yellow-800 text-sm font-medium rounded-full">
              🔵 DEMO Workspace
            </span>
          )}
        </div>
        <button
          onClick={handleSave}
          disabled={saving}
          className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:bg-gray-400"
        >
          {saving ? "Saving..." : "Save Progress"}
        </button>
      </div>

      {/* Setup Progress */}
      <div className="p-6 bg-white border border-gray-200 rounded-lg">
        <h2 className="text-xl font-bold mb-4">Setup Progress</h2>
        <div className="space-y-3">
          <div>
            <p className="text-sm text-gray-600">Completion</p>
            <div className="w-full bg-gray-200 rounded-full h-2">
              <div
                className="bg-blue-600 h-2 rounded-full"
                style={{ width: `${setup.progress.progressPercent}%` }}
              />
            </div>
            <p className="text-sm font-semibold mt-1">{setup.progress.progressPercent}% Complete</p>
          </div>

          {setup.progress.completedSections.length > 0 && (
            <div>
              <p className="text-sm text-green-600 font-medium">
                ✓ Completed: {setup.progress.completedSections.join(", ")}
              </p>
            </div>
          )}

          {setup.progress.incompleteSections.length > 0 && (
            <div>
              <p className="text-sm text-orange-600 font-medium">
                → Incomplete: {setup.progress.incompleteSections.join(", ")}
              </p>
            </div>
          )}
        </div>
      </div>

      {/* Business Basics */}
      <div className="p-6 bg-white border border-gray-200 rounded-lg">
        <h2 className="text-xl font-bold mb-4">Business Basics</h2>
        <input
          type="text"
          placeholder="Business Name"
          value={formData.businessBasics?.businessName || ""}
          onChange={(e) => setFormData({ ...formData, businessBasics: { ...formData.businessBasics, businessName: e.target.value } })}
          className="w-full px-3 py-2 border border-gray-300 rounded-lg mb-3"
        />
        <input
          type="text"
          placeholder="Industry"
          value={formData.businessBasics?.industryCategory || ""}
          onChange={(e) => setFormData({ ...formData, businessBasics: { ...formData.businessBasics, industryCategory: e.target.value } })}
          className="w-full px-3 py-2 border border-gray-300 rounded-lg mb-3"
        />
        <input
          type="text"
          placeholder="Location / Market"
          value={formData.businessBasics?.operatingLocationMarket || ""}
          onChange={(e) => setFormData({ ...formData, businessBasics: { ...formData.businessBasics, operatingLocationMarket: e.target.value } })}
          className="w-full px-3 py-2 border border-gray-300 rounded-lg mb-3"
        />
        <input
          type="text"
          placeholder="Revenue Model"
          value={formData.businessBasics?.revenueModel || ""}
          onChange={(e) => setFormData({ ...formData, businessBasics: { ...formData.businessBasics, revenueModel: e.target.value } })}
          className="w-full px-3 py-2 border border-gray-300 rounded-lg"
        />
      </div>

      {/* Owner Constraints */}
      <div className="p-6 bg-white border border-gray-200 rounded-lg">
        <h2 className="text-xl font-bold mb-4">Owner Constraints</h2>
        <input
          type="text"
          placeholder="Owner Time Constraint (e.g., 10 hrs/week)"
          value={formData.ownerConstraints?.ownerTimeConstraint || ""}
          onChange={(e) =>
            setFormData({
              ...formData,
              ownerConstraints: {
                ...formData.ownerConstraints,
                ownerTimeConstraint: e.target.value,
              },
            })
          }
          className="w-full px-3 py-2 border border-gray-300 rounded-lg"
        />
      </div>

      {/* Financial Basics */}
      <div className="p-6 bg-white border border-gray-200 rounded-lg">
        <h2 className="text-xl font-bold mb-4">Financial Basics</h2>
        <input
          type="text"
          placeholder="Monthly Revenue ($50k or $40-60k)"
          value={formData.financialBasics?.monthlyRevenueEstimate || ""}
          onChange={(e) => setFormData({ ...formData, financialBasics: { ...formData.financialBasics, monthlyRevenueEstimate: e.target.value } })}
          className="w-full px-3 py-2 border border-gray-300 rounded-lg mb-3"
        />
        <input
          type="text"
          placeholder="Monthly Costs ($30k or $25-35k)"
          value={formData.financialBasics?.monthlyCostEstimate || ""}
          onChange={(e) => setFormData({ ...formData, financialBasics: { ...formData.financialBasics, monthlyCostEstimate: e.target.value } })}
          className="w-full px-3 py-2 border border-gray-300 rounded-lg"
        />
      </div>

      {/* Capacity Basics */}
      <div className="p-6 bg-white border border-gray-200 rounded-lg">
        <h2 className="text-xl font-bold mb-4">Capacity Basics</h2>
        <input
          type="text"
          placeholder="Team Size (e.g., 5-10 people, 80% utilized)"
          value={formData.capacityBasics?.teamSizeCapacity || ""}
          onChange={(e) => setFormData({ ...formData, capacityBasics: { ...formData.capacityBasics, teamSizeCapacity: e.target.value } })}
          className="w-full px-3 py-2 border border-gray-300 rounded-lg"
        />
      </div>

      {/* Customer Basics */}
      <div className="p-6 bg-white border border-gray-200 rounded-lg">
        <h2 className="text-xl font-bold mb-4">Customer Basics</h2>
        <div className="space-y-3">
          <input
            type="text"
            placeholder="Customer Segment"
            value={formData.customerBasics?.customerSegment || ""}
            onChange={(e) =>
              setFormData({
                ...formData,
                customerBasics: {
                  ...formData.customerBasics,
                  customerSegment: e.target.value,
                },
              })
            }
            className="w-full px-3 py-2 border border-gray-300 rounded-lg"
          />
          <textarea
            placeholder="Main Current Problem / Challenge"
            value={formData.customerBasics?.mainCurrentProblem || ""}
            onChange={(e) =>
              setFormData({
                ...formData,
                customerBasics: {
                  ...formData.customerBasics,
                  mainCurrentProblem: e.target.value,
                },
              })
            }
            className="w-full px-3 py-2 border border-gray-300 rounded-lg"
            rows={3}
          />
        </div>
      </div>

      {/* Missing Data */}
      {Object.values(setup.missingData).some((v) => v) && (
        <div className="p-6 bg-blue-50 border border-blue-300 rounded-lg">
          <h3 className="font-bold text-blue-900 mb-3">📋 Required to Complete Setup</h3>
          <ul className="space-y-2">
            {setup.missingData.businessName && (
              <li className="text-blue-800">• Business Name</li>
            )}
            {setup.missingData.industryCategory && (
              <li className="text-blue-800">• Industry Category</li>
            )}
            {setup.missingData.operatingLocationMarket && (
              <li className="text-blue-800">• Operating Location</li>
            )}
            {setup.missingData.revenueModel && (
              <li className="text-blue-800">• Revenue Model</li>
            )}
            {setup.missingData.monthlyRevenueEstimate && (
              <li className="text-blue-800">• Monthly Revenue Estimate</li>
            )}
            {setup.missingData.monthlyCostEstimate && (
              <li className="text-blue-800">• Monthly Cost Estimate</li>
            )}
            {setup.missingData.teamSizeCapacity && (
              <li className="text-blue-800">• Team Size / Capacity</li>
            )}
            {setup.missingData.customerSegment && (
              <li className="text-blue-800">• Customer Segment</li>
            )}
            {setup.missingData.mainCurrentProblem && (
              <li className="text-blue-800">• Main Current Problem</li>
            )}
            {setup.missingData.ownerTimeConstraint && (
              <li className="text-blue-800">• Owner Time Constraint</li>
            )}
          </ul>
        </div>
      )}

      {/* Safety Warnings */}
      {setup.safetyWarnings.length > 0 && (
        <div className="p-6 bg-amber-50 border border-amber-300 rounded-lg">
          <h3 className="font-bold text-amber-900 mb-3">⚠️ Setup Status</h3>
          <ul className="space-y-2">
            {setup.safetyWarnings.map((warning, idx) => (
              <li key={idx} className="text-amber-800">
                • {warning}
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Next Step */}
      <div className="p-6 bg-gray-50 border border-gray-300 rounded-lg">
        <p className="text-sm text-gray-600">Next Step</p>
        <p className="text-lg font-bold text-gray-900">{setup.nextStep}</p>
        {setup.firstValueReady && (
          <button
            onClick={handleContinueToFirstValue}
            className="mt-4 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700"
          >
            ✓ Continue to First-Value Visibility
          </button>
        )}
      </div>

      {/* Footer */}
      <div className="text-xs text-gray-500 text-center border-t pt-6">
        Generated: {new Date(setup.generatedAt).toLocaleString()}
      </div>
    </div>
  );
}

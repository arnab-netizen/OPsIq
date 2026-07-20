"use client";

import { useState } from "react";

interface Props {
  sessionId: string;
  currentVersion: number;
  initialProfile?: Record<string, unknown>;
  onSave: (profile: Record<string, unknown>, expectedVersion: number) => Promise<void>;
  working: boolean;
}

export function BusinessFitProfileForm({ currentVersion, initialProfile, onSave, working }: Props) {
  const [geography, setGeography] = useState((initialProfile?.geography as string) ?? "");
  const [industry, setIndustry] = useState((initialProfile?.industry as string) ?? "");
  const [ownerHoursPerWeek, setOwnerHoursPerWeek] = useState((initialProfile?.ownerHoursPerWeek as number) ?? 40);
  const [riskTolerance, setRiskTolerance] = useState<string>((initialProfile?.riskTolerance as string) ?? "medium");

  const handleSave = async () => {
    await onSave({
      geography: geography || null,
      industry: industry || null,
      ownerHoursPerWeek,
      capitalAvailableCents: null,
      riskTolerance: riskTolerance || null,
      requiresLicence: false,
      hasConnectors: false,
      ownerExclusions: [],
      targetCustomer: null,
    }, currentVersion);
  };

  return (
    <div className="business-fit-profile-form border rounded p-4 text-sm">
      <p className="font-semibold mb-3">Business Fit Profile</p>
      <div className="flex flex-col gap-3">
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="text-xs font-medium mb-1 block">Geography</label>
            <input className="input input-sm w-full" value={geography} onChange={(e) => setGeography(e.target.value)} placeholder="e.g. Melbourne, VIC" />
          </div>
          <div>
            <label className="text-xs font-medium mb-1 block">Industry focus</label>
            <input className="input input-sm w-full" value={industry} onChange={(e) => setIndustry(e.target.value)} placeholder="e.g. Food & Beverage" />
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="text-xs font-medium mb-1 block">Hours per week available</label>
            <input type="number" min={1} max={80} className="input input-sm w-full" value={ownerHoursPerWeek} onChange={(e) => setOwnerHoursPerWeek(Number(e.target.value))} />
          </div>
          <div>
            <label className="text-xs font-medium mb-1 block">Risk tolerance</label>
            <select className="select select-sm w-full" value={riskTolerance} onChange={(e) => setRiskTolerance(e.target.value)}>
              <option value="low">Low</option>
              <option value="medium">Medium</option>
              <option value="high">High</option>
            </select>
          </div>
        </div>
        <button className="btn btn-sm btn-outline w-fit" disabled={working} onClick={handleSave}>
          {working ? "Saving…" : "Save Profile"}
        </button>
      </div>
    </div>
  );
}

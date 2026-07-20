"use client";

import { useState } from "react";

interface Props {
  sessionId: string;
  ideaId?: string;
  onSubmit: (data: Record<string, unknown>) => Promise<void>;
  working: boolean;
}

const SOURCE_TYPES = [
  "AUTHORITATIVE_PRIMARY", "OFFICIAL_COMMERCIAL", "VERIFIED_INSTITUTIONAL",
  "REPUTABLE_SECONDARY", "MARKETPLACE_OBSERVATION", "CUSTOMER_GENERATED",
  "OWNER_PROVIDED", "SYSTEM_INFERENCE", "UNVERIFIED",
];

const EVIDENCE_TYPES = [
  "MARKET_DATA", "DEMAND_SIGNAL", "PRICE_POINT", "CUSTOMER_INTERVIEW",
  "SUPPLIER_QUOTE", "REGULATORY_CONFIRMATION", "COMPETITOR_DATA",
  "DIRECT_CUSTOMER_EVIDENCE", "OPERATIONAL_TRIAL", "OTHER",
];

export function EvidenceEntryForm({ onSubmit, working }: Props) {
  const [sourceType, setSourceType] = useState("OWNER_PROVIDED");
  const [evidenceType, setEvidenceType] = useState("MARKET_DATA");
  const [observedResult, setObservedResult] = useState("");
  const [reliabilityScore, setReliabilityScore] = useState(50);
  const [confidence, setConfidence] = useState(50);
  const [limitations, setLimitations] = useState("");

  const handleSubmit = async () => {
    if (!observedResult.trim()) return;
    await onSubmit({ sourceType, evidenceType, observedResult, reliabilityScore, confidence, limitations: limitations || null });
    setObservedResult("");
    setLimitations("");
  };

  return (
    <div className="evidence-entry-form border rounded p-4 text-sm">
      <p className="font-semibold mb-3">Record Evidence</p>
      <div className="flex flex-col gap-2">
        <div className="grid grid-cols-2 gap-2">
          <div>
            <label className="text-xs font-medium mb-1 block OBSERVED_FACT">Source Type</label>
            <select className="select select-sm w-full" value={sourceType} onChange={(e) => setSourceType(e.target.value)}>
              {SOURCE_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
            </select>
          </div>
          <div>
            <label className="text-xs font-medium mb-1 block">Evidence Type</label>
            <select className="select select-sm w-full" value={evidenceType} onChange={(e) => setEvidenceType(e.target.value)}>
              {EVIDENCE_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
            </select>
          </div>
        </div>
        <div>
          <label className="text-xs font-medium mb-1 block OBSERVED_FACT">Observed Result *</label>
          <textarea
            className="textarea textarea-sm w-full"
            rows={3}
            placeholder="What did you observe?"
            value={observedResult}
            onChange={(e) => setObservedResult(e.target.value)}
          />
        </div>
        <div>
          <label className="text-xs font-medium mb-1 block UNKNOWN_INPUT">Limitations</label>
          <input className="input input-sm w-full" placeholder="Sample size, recency, bias..." value={limitations} onChange={(e) => setLimitations(e.target.value)} />
        </div>
        <div className="grid grid-cols-2 gap-2">
          <div>
            <label className="text-xs font-medium mb-1 block">Reliability ({reliabilityScore}/100)</label>
            <input type="range" min={0} max={100} value={reliabilityScore} onChange={(e) => setReliabilityScore(Number(e.target.value))} className="w-full" />
          </div>
          <div>
            <label className="text-xs font-medium mb-1 block">Confidence ({confidence}/100)</label>
            <input type="range" min={0} max={100} value={confidence} onChange={(e) => setConfidence(Number(e.target.value))} className="w-full" />
          </div>
        </div>
        <div>
          <button className="btn btn-sm btn-outline" disabled={working || !observedResult.trim()} onClick={handleSubmit}>
            {working ? "Recording…" : "Record Evidence"}
          </button>
        </div>
      </div>
    </div>
  );
}

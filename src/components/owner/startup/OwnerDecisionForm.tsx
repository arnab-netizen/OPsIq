"use client";

/**
 * Owner decision form — GO/MODIFY/HOLD/REJECT/REQUEST_MORE_EVIDENCE.
 * Clearly labelled OWNER_DECISION — never conflated with system recommendation.
 */
import { useState } from "react";

const DECISION_LABELS: Record<string, string> = {
  GO: "GO — Approve and proceed",
  MODIFY: "MODIFY — Require modifications",
  HOLD: "HOLD — Pause pending evidence",
  REJECT: "REJECT — Reject this idea",
  REQUEST_MORE_EVIDENCE: "REQUEST MORE EVIDENCE — Need more data",
};

interface Props {
  sessionId: string;
  ideas: Record<string, unknown>[];
  working: boolean;
  onDecision: (decisionType: string, ideaId?: string, rationale?: string) => void;
}

export function OwnerDecisionForm({ ideas, working, onDecision }: Props) {
  const [decisionType, setDecisionType] = useState<string>("GO");
  const [ideaId, setIdeaId] = useState<string>("");
  const [rationale, setRationale] = useState<string>("");

  return (
    <div className="owner-decision-form border rounded p-4 OWNER_DECISION">
      <div className="flex items-center gap-2 mb-4">
        <span className="badge badge-primary OWNER_DECISION text-xs">Owner Decision</span>
        <p className="text-xs text-muted-foreground">This decision is separate from the system recommendation.</p>
      </div>

      <div className="flex flex-col gap-3">
        <div>
          <label className="text-sm font-medium mb-1 block">Decision</label>
          <select
            className="select select-sm w-full max-w-sm"
            value={decisionType}
            onChange={(e) => setDecisionType(e.target.value)}
          >
            {Object.entries(DECISION_LABELS).map(([k, v]) => (
              <option key={k} value={k}>{v}</option>
            ))}
          </select>
        </div>

        {ideas.length > 0 && (
          <div>
            <label className="text-sm font-medium mb-1 block">Idea (optional)</label>
            <select
              className="select select-sm w-full max-w-sm"
              value={ideaId}
              onChange={(e) => setIdeaId(e.target.value)}
            >
              <option value="">— Session-level decision —</option>
              {ideas.map((idea) => (
                <option key={idea.id as string} value={idea.id as string}>
                  {idea.name as string}
                </option>
              ))}
            </select>
          </div>
        )}

        <div>
          <label className="text-sm font-medium mb-1 block">Rationale (optional)</label>
          <textarea
            className="textarea textarea-sm w-full max-w-sm"
            rows={3}
            placeholder="Why are you making this decision?"
            value={rationale}
            onChange={(e) => setRationale(e.target.value)}
          />
        </div>

        <div>
          <button
            className={`btn btn-sm ${decisionType === "GO" ? "btn-success" : decisionType === "REJECT" ? "btn-destructive" : "btn-outline"}`}
            disabled={working}
            onClick={() => onDecision(decisionType, ideaId || undefined, rationale || undefined)}
          >
            {working ? "Recording…" : `Record ${decisionType}`}
          </button>
        </div>
      </div>
    </div>
  );
}

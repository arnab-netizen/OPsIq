"use client";

/**
 * Explanation panel — shows SYSTEM_RECOMMENDATION separately from OWNER_DECISION.
 * Never conflates system output with owner override.
 */
interface Props {
  explanation: Record<string, unknown> | null;
}

export function ExplanationPanel({ explanation }: Props) {
  if (!explanation) {
    return (
      <div className="explanation-panel text-sm text-muted-foreground UNKNOWN_INPUT">
        No system recommendation yet. Run arbitration to generate one.
      </div>
    );
  }

  const summary = explanation.summary as string | undefined;
  const rationale = explanation.rationale as string | undefined;
  const assumptions = (explanation.assumptions as string[] | undefined) ?? [];
  const caveats = (explanation.caveats as string[] | undefined) ?? [];
  const evidenceSources = (explanation.evidenceSources as string[] | undefined) ?? [];

  return (
    <div className="explanation-panel border rounded p-4 text-sm SYSTEM_RECOMMENDATION">
      <div className="flex items-center gap-2 mb-3">
        <span className="badge badge-secondary SYSTEM_RECOMMENDATION text-xs">System Recommendation</span>
      </div>

      {summary && <p className="font-medium mb-2">{summary}</p>}
      {rationale && <p className="text-muted-foreground mb-3 text-xs">{rationale}</p>}

      {assumptions.length > 0 && (
        <div className="assumptions mb-2">
          <p className="text-xs font-medium mb-1 UNTESTED_ASSUMPTION">Assumptions:</p>
          <ul className="text-xs text-muted-foreground space-y-0.5">
            {assumptions.map((a, i) => <li key={i} className="UNTESTED_ASSUMPTION">• {a}</li>)}
          </ul>
        </div>
      )}

      {caveats.length > 0 && (
        <div className="caveats mb-2">
          <p className="text-xs font-medium mb-1 UNKNOWN_INPUT">Caveats:</p>
          <ul className="text-xs text-muted-foreground space-y-0.5">
            {caveats.map((c, i) => <li key={i}>• {c}</li>)}
          </ul>
        </div>
      )}

      {evidenceSources.length > 0 && (
        <div className="evidence-sources">
          <p className="text-xs font-medium mb-1 OBSERVED_FACT">Evidence Sources:</p>
          <ul className="text-xs text-muted-foreground space-y-0.5">
            {evidenceSources.map((s, i) => <li key={i} className="OBSERVED_FACT">• {s}</li>)}
          </ul>
        </div>
      )}
    </div>
  );
}

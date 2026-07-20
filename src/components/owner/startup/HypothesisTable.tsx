"use client";

/**
 * Hypothesis table — shows all hypotheses ordered by priority score.
 * Distinguishes VALIDATED / INVALIDATED / UNTESTED_ASSUMPTION.
 */
const RESULT_STYLE: Record<string, string> = {
  CONFIRMED: "VALIDATED text-success-foreground",
  REJECTED: "INVALIDATED text-destructive",
  WEAKENED: "text-warning-foreground",
  INCONCLUSIVE: "text-muted-foreground",
  PENDING: "UNTESTED_ASSUMPTION text-muted-foreground",
};

interface Hypothesis {
  id: string;
  hypothesisType: string;
  statement: string;
  result: string;
  priorityScore: number;
  validationMethod: string;
  requiresOwnerApproval: boolean;
  falsificationCriteria: string;
}

interface Props {
  hypotheses: Record<string, unknown>[];
}

export function HypothesisTable({ hypotheses }: Props) {
  if (hypotheses.length === 0) return null;

  return (
    <div className="hypothesis-table mt-4 overflow-x-auto">
      <p className="text-sm font-semibold mb-2">Hypotheses ({hypotheses.length})</p>
      <table className="w-full text-xs border-collapse">
        <thead>
          <tr className="border-b text-left text-muted-foreground">
            <th className="py-1 pr-3">Type</th>
            <th className="py-1 pr-3">Statement</th>
            <th className="py-1 pr-3">Method</th>
            <th className="py-1 pr-3">Result</th>
            <th className="py-1">Priority</th>
          </tr>
        </thead>
        <tbody>
          {(hypotheses as unknown as Hypothesis[]).map((h) => (
            <tr key={h.id} className="border-b hover:bg-muted/30">
              <td className="py-1.5 pr-3 font-medium whitespace-nowrap">{h.hypothesisType}</td>
              <td className="py-1.5 pr-3 max-w-xs">
                <span className="UNTESTED_ASSUMPTION line-clamp-2">{h.statement}</span>
                {h.requiresOwnerApproval && (
                  <span className="badge badge-warning text-xs ml-1">Owner Approval</span>
                )}
              </td>
              <td className="py-1.5 pr-3 whitespace-nowrap">{h.validationMethod}</td>
              <td className={`py-1.5 pr-3 whitespace-nowrap font-medium ${RESULT_STYLE[h.result] ?? ""}`}>
                {h.result}
              </td>
              <td className="py-1.5 text-right">{h.priorityScore?.toFixed(1)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

"use client";

/**
 * Displays screening result with binding constraints and reasons.
 * Uses required CSS class distinctions per plan spec.
 */
interface Props {
  status: string;
  reasons: string[];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  bindingConstraints: any[];
}

const STATUS_STYLES: Record<string, string> = {
  ADVANCE: "border-success text-success-foreground VALIDATED",
  ADVANCE_WITH_EVIDENCE_GAPS: "border-warning text-warning-foreground EVIDENCE_REQUIRED",
  VALIDATE_FIRST: "border-warning text-warning-foreground UNTESTED_ASSUMPTION",
  MODIFY: "border-warning text-warning-foreground BINDING_CONSTRAINT",
  HOLD: "border-secondary text-secondary-foreground",
  REJECT: "border-destructive text-destructive REJECTED_IDEA",
};

export function ScreeningResultPanel({ status, reasons, bindingConstraints }: Props) {
  const style = STATUS_STYLES[status] ?? "border-muted";

  return (
    <div className={`screening-result-panel border rounded p-3 mt-3 text-sm ${style}`}>
      <p className="font-semibold mb-2">Screening: {status}</p>

      {reasons.length > 0 && (
        <div className="reasons mb-2">
          <ul className="space-y-1">
            {reasons.map((r, i) => (
              <li key={i} className={status === "REJECT" ? "REJECTED_IDEA" : ""}>{r}</li>
            ))}
          </ul>
        </div>
      )}

      {bindingConstraints.length > 0 && (
        <div className="binding-constraints BINDING_CONSTRAINT">
          <p className="text-xs font-semibold mb-1">Binding Constraints:</p>
          <div className="flex flex-wrap gap-2">
            {bindingConstraints.map((bc, i) => (
              <span key={i} className="badge badge-outline BINDING_CONSTRAINT text-xs">
                {bc.dimension} (score: {bc.bindingScore})
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

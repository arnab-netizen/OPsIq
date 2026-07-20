"use client";

/**
 * Readiness gate panel — hard gate failures shown prominently; no averaging.
 * BINDING_CONSTRAINT / VALIDATED / UNKNOWN_INPUT class distinctions required.
 */
const STATUS_STYLE: Record<string, string> = {
  READY: "border-success VALIDATED",
  NOT_READY: "border-destructive REJECTED_IDEA",
  PARTIALLY_READY: "border-warning UNTESTED_ASSUMPTION",
  INSUFFICIENT_EVIDENCE: "border-muted UNKNOWN_INPUT",
};

interface Props {
  assessment: Record<string, unknown>;
}

export function ReadinessGatePanel({ assessment }: Props) {
  const status = assessment.readinessStatus as string;
  const hardGateFailures = (assessment.hardGateFailures as string[] | undefined) ?? [];
  const passedGates = (assessment.passedGates as string[] | undefined) ?? [];
  const failedGates = (assessment.failedGates as string[] | undefined) ?? [];
  const unknownGates = (assessment.unknownGates as string[] | undefined) ?? [];
  const safeNextStep = assessment.safeNextStep as string | undefined;
  const evidenceGaps = (assessment.evidenceGaps as string[] | undefined) ?? [];

  return (
    <div className={`readiness-gate-panel border rounded p-4 mt-3 text-sm ${STATUS_STYLE[status] ?? "border-muted"}`}>
      <div className="flex items-center gap-2 mb-3">
        <p className="font-semibold">Readiness Assessment</p>
        <span className={`badge text-xs ${status === "READY" ? "badge-success VALIDATED" : status === "NOT_READY" ? "badge-error REJECTED_IDEA" : "badge-warning"}`}>
          {status}
        </span>
      </div>

      {hardGateFailures.length > 0 && (
        <div className="hard-gate-failures BINDING_CONSTRAINT mb-3 bg-destructive/10 rounded p-2">
          <p className="text-xs font-semibold text-destructive mb-1">Hard Gate Failures (cannot advance):</p>
          <ul className="text-xs space-y-0.5">
            {hardGateFailures.map((f, i) => <li key={i} className="REJECTED_IDEA text-destructive">• {f}</li>)}
          </ul>
        </div>
      )}

      <div className="gates-grid grid grid-cols-2 gap-2 text-xs mb-3">
        {passedGates.map((g, i) => (
          <div key={i} className="VALIDATED flex items-center gap-1">
            <span className="text-success-foreground">✓</span> {g}
          </div>
        ))}
        {failedGates.map((g, i) => (
          <div key={i} className="BINDING_CONSTRAINT flex items-center gap-1">
            <span className="text-destructive">✗</span> {g}
          </div>
        ))}
        {unknownGates.map((g, i) => (
          <div key={i} className="UNKNOWN_INPUT flex items-center gap-1">
            <span className="text-muted-foreground">?</span> {g}
          </div>
        ))}
      </div>

      {evidenceGaps.length > 0 && (
        <div className="EVIDENCE_REQUIRED mb-2">
          <p className="text-xs font-medium text-warning-foreground">Evidence Gaps:</p>
          <ul className="text-xs text-muted-foreground">
            {evidenceGaps.map((g, i) => <li key={i}>• {g}</li>)}
          </ul>
        </div>
      )}

      {safeNextStep && (
        <p className="text-xs mt-2 text-muted-foreground italic">Next step: {safeNextStep}</p>
      )}
    </div>
  );
}

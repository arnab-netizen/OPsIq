"use client";

interface DomainStatus {
  domain: string;
  required: boolean;
  acquired: boolean;
  canAutoAcquire: boolean;
  ownerApprovalRequired: boolean;
  gap: boolean;
  gapSeverity?: string;
}

interface Props {
  report: Record<string, unknown>;
}

export function ResearchCompletenessReport({ report }: Props) {
  const domains = (report.domains as DomainStatus[] | undefined) ?? [];
  const materialGaps = (report.materialGaps as string[] | undefined) ?? [];
  const overallCompleteness = report.overallCompleteness as number | undefined;

  return (
    <div className="research-completeness-report border rounded p-4 text-sm">
      <div className="flex items-center gap-2 mb-3">
        <p className="font-semibold">Research Completeness</p>
        {overallCompleteness !== undefined && (
          <span className={`badge text-xs ${overallCompleteness >= 80 ? "badge-success VALIDATED" : overallCompleteness >= 50 ? "badge-warning EVIDENCE_REQUIRED" : "badge-error REJECTED_IDEA"}`}>
            {overallCompleteness}%
          </span>
        )}
      </div>

      {materialGaps.length > 0 && (
        <div className="material-gaps EVIDENCE_REQUIRED mb-3 bg-warning/10 rounded p-2">
          <p className="text-xs font-semibold text-warning-foreground mb-1">Material Gaps:</p>
          <ul className="text-xs space-y-0.5">
            {materialGaps.map((g, i) => <li key={i} className="UNKNOWN_INPUT">• {g}</li>)}
          </ul>
        </div>
      )}

      <div className="domains-grid grid grid-cols-2 gap-1 text-xs">
        {domains.map((d, i) => (
          <div key={i} className={`flex items-center gap-1 ${d.acquired ? "VALIDATED text-success-foreground" : d.gap ? "EVIDENCE_REQUIRED text-warning-foreground" : "text-muted-foreground"}`}>
            <span>{d.acquired ? "✓" : d.gap ? "!" : "○"}</span>
            <span>{d.domain}</span>
            {d.canAutoAcquire && !d.acquired && <span className="badge badge-outline text-xs">Auto</span>}
            {d.ownerApprovalRequired && <span className="badge badge-warning text-xs">Owner</span>}
          </div>
        ))}
      </div>
    </div>
  );
}

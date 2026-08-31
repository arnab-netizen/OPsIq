/**
 * Presentational OpsIQ Supervisor Summary panel — one concise owner-facing card rendered from the
 * runtime `wbp.supervisor` derivation. NO business logic, NO static fallback: renders null when there
 * is no runtime summary. Advanced reasoning (assumption ledger, full cadence) is collapsed by default.
 */
import { Badge } from "@/ui/primitives";

export interface SupervisorSummaryView {
  found: boolean;
  emergency: boolean;
  mainIssue: string;
  whyItMatters: string;
  doNow: string;
  doNotDo: string[];
  ownerDecisionRequired: string | null;
  delegateToStaff: string[];
  opsiqPreparedWork: string[];
  proofNeeded: string[];
  confidence: string;
  actionStatus: string;
  canProceed: boolean;
  ledger: {
    knownFacts: string[];
    assumptions: string[];
    missingData: string[];
    confidenceReason: string;
    whatWouldChange: string;
  };
  impact: Array<{ dimension: string; label: string; statement: string; relevant: boolean }>;
  supportingFigures?: Array<{ key: string; label: string; value: number; unit: string; basis: string }>;
  /** Specific field-level inputs still needed to quantify the decision (e.g. "current cash balance"). */
  missingForQuantification?: string[];
  cadence: { now: string; today: string; thisWeek: string; reassessmentTrigger: string; kpiWatch: string; stopLoss: string; nextReview: string };
  topPriorities: Array<{ severity: string; whatIsWrong: string; doNext: string }>;
}

const STATUS_LABEL: Record<string, string> = {
  proceed: "Proceed",
  cautious_proceed: "Proceed with caution",
  owner_decision_required: "Owner decision required",
  need_more_data: "Need more data",
  blocked: "Blocked",
};
const STATUS_VARIANT: Record<string, "success" | "warning" | "destructive" | "muted"> = {
  proceed: "success",
  cautious_proceed: "warning",
  owner_decision_required: "warning",
  need_more_data: "muted",
  blocked: "destructive",
};
const CONFIDENCE_VARIANT: Record<string, "success" | "warning" | "destructive" | "muted"> = {
  high: "success", medium: "warning", low: "destructive", none: "muted",
};

export function SupervisorSummary({ summary }: { summary: SupervisorSummaryView | null }) {
  if (!summary || !summary.found) return null;
  const relevantImpact = summary.impact.filter((i) => i.relevant);
  const supportingFigures = summary.supportingFigures ?? [];

  return (
    <section className="border-2 border-foreground/20 rounded-lg p-4 bg-card mb-6" data-testid="owner-supervisor-summary">
      <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
        <div className="text-xs uppercase text-muted-foreground">OpsIQ supervisor summary</div>
        <div className="flex flex-wrap gap-2">
          <span data-testid="supervisor-action-status">
            <Badge variant={STATUS_VARIANT[summary.actionStatus] ?? "muted"}>{STATUS_LABEL[summary.actionStatus] ?? summary.actionStatus}</Badge>
          </span>
          <span data-testid="supervisor-confidence">
            <Badge variant={CONFIDENCE_VARIANT[summary.confidence] ?? "muted"}>Confidence: {summary.confidence}</Badge>
          </span>
          {summary.emergency && <Badge variant="destructive">Emergency</Badge>}
        </div>
      </div>

      <div className="text-sm font-medium" data-testid="supervisor-main-issue">{summary.mainIssue}</div>
      <p className="text-xs text-muted-foreground mt-1"><strong>Why:</strong> {summary.whyItMatters}</p>

      <div className="grid gap-2 sm:grid-cols-2 mt-3">
        <div className="rounded-md border p-2 text-sm" data-testid="supervisor-do-now">
          <strong>Do now:</strong> {summary.doNow}
        </div>
        {summary.doNotDo.length > 0 && (
          <div className="rounded-md border border-warning/30 bg-warning/5 p-2 text-sm" data-testid="supervisor-do-not-do">
            <strong>Do not:</strong> {summary.doNotDo[0]}
          </div>
        )}
        <div className="rounded-md border p-2 text-sm" data-testid="supervisor-owner-delegate">
          <strong>Owner vs delegate:</strong>{" "}
          {summary.ownerDecisionRequired ? <span className="text-[var(--warning-text)]">{summary.ownerDecisionRequired}</span> : "OpsIQ + staff can carry this with proof."}
          {summary.delegateToStaff.length > 0 && (
            <div className="text-xs text-muted-foreground mt-1">Delegate: {summary.delegateToStaff[0]}</div>
          )}
        </div>
        <div className="rounded-md border p-2 text-sm" data-testid="supervisor-proof">
          <strong>Proof needed:</strong> {summary.proofNeeded.length > 0 ? summary.proofNeeded[0] : "none outstanding"}
        </div>
      </div>

      {relevantImpact.length > 0 && (
        <div className="rounded-md border p-2 text-sm mt-2" data-testid="supervisor-impact">
          <strong>Expected impact:</strong>
          <ul className="list-disc ml-5">
            {relevantImpact.slice(0, 4).map((i) => (
              <li key={i.dimension}><span className="font-medium">{i.label}:</span> {i.statement}</li>
            ))}
          </ul>
        </div>
      )}

      {supportingFigures.length > 0 && (
        <div className="rounded-md border p-2 text-sm mt-2" data-testid="supervisor-supporting-figures">
          <strong>Supporting figures</strong>
          <span className="text-xs text-muted-foreground"> (computed from your real records)</span>
          <ul className="list-disc ml-5">
            {supportingFigures.map((f) => (
              <li key={f.key} data-testid={`supervisor-figure-${f.key}`}>
                <span className="font-medium">{f.label}:</span> {f.value.toLocaleString()} {f.unit}
                <span className="text-xs text-muted-foreground"> — {f.basis}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {(summary.missingForQuantification ?? []).length > 0 && (
        <div className="rounded-md border p-2 text-sm mt-2" data-testid="supervisor-missing-to-quantify">
          <strong>To quantify the upside, add:</strong>
          <span className="text-xs text-muted-foreground"> (specific figures the analysis needs)</span>
          <ul className="list-disc ml-5">
            {(summary.missingForQuantification ?? []).map((m: string, i: number) => (
              <li key={i} data-testid={`supervisor-quantify-missing-${i}`} className="text-muted-foreground">{m}</li>
            ))}
          </ul>
        </div>
      )}

      <div className="rounded-md border p-2 text-sm mt-2" data-testid="supervisor-missing-assumptions">
        <strong>Missing data / assumptions:</strong>{" "}
        {summary.ledger.missingData.length > 0
          ? <span className="text-muted-foreground">missing: {summary.ledger.missingData.slice(0, 3).join(", ")}.</span>
          : summary.ledger.assumptions.length > 0
            ? <span className="text-muted-foreground">{summary.ledger.assumptions.length} owner-estimate(s) in play.</span>
            : <span className="text-muted-foreground">none material.</span>}
        <span className="text-muted-foreground"> {summary.ledger.confidenceReason}</span>
      </div>

      <div className="rounded-md border p-2 text-sm mt-2" data-testid="supervisor-reassessment">
        <strong>Reassess:</strong> {summary.cadence.reassessmentTrigger}
        {summary.cadence.stopLoss !== "—" && <span className="text-muted-foreground"> · Stop-loss: {summary.cadence.stopLoss}</span>}
      </div>

      {summary.topPriorities.length > 0 && (
        <div className="mt-2" data-testid="supervisor-priorities">
          <div className="text-xs uppercase text-muted-foreground mb-1">Top priorities</div>
          <ol className="space-y-1">
            {summary.topPriorities.map((p, i) => (
              <li key={i} className="text-sm" data-testid={`supervisor-priority-${i}`}>
                <Badge variant={p.severity === "critical" ? "destructive" : p.severity === "high" ? "warning" : "muted"}>{p.severity}</Badge>{" "}
                {p.whatIsWrong} <span className="text-muted-foreground">→ {p.doNext}</span>
              </li>
            ))}
          </ol>
        </div>
      )}

      <details className="mt-2" data-testid="supervisor-ledger-detail">
        <summary className="text-xs uppercase text-muted-foreground cursor-pointer">Assumptions, known facts &amp; cadence</summary>
        <div className="text-xs text-muted-foreground mt-1 space-y-1">
          <p><strong>Known facts:</strong> {summary.ledger.knownFacts.slice(0, 4).join(" ") || "—"}</p>
          {summary.ledger.assumptions.length > 0 && <p><strong>Assumptions:</strong> {summary.ledger.assumptions.slice(0, 4).join(" ")}</p>}
          <p><strong>What would change this:</strong> {summary.ledger.whatWouldChange}</p>
          <p><strong>Now:</strong> {summary.cadence.now} · <strong>This week:</strong> {summary.cadence.thisWeek} · <strong>KPI:</strong> {summary.cadence.kpiWatch}</p>
        </div>
      </details>
    </section>
  );
}

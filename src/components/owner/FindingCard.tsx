"use client";

/**
 * FindingCard — the signature "what OpsIQ found" experience, formalized as a reusable component
 * instead of one-off JSX duplicated per domain. Backs Money's Findings section; Operations uses
 * it too (OwnerOperationsFinding has the exact same shape as OwnerFinanceFinding: findingType,
 * title, summary, sourceMetric/sourceValue/threshold, severity, confidence, evidence,
 * verificationMetric — same diagnosis-engine pattern, different domain).
 *
 * Structure, matching the mandated 8-section Finding/Evidence spec exactly where this data model
 * has real support for it, and nowhere else:
 *   WHAT OPSIQ FOUND   — title + summary. Always present (a finding is nothing without this).
 *   EVIDENCE           — the measured FACT vs. the threshold it's CALCULATED against. Always
 *                         present when sourceMetric exists (every real finding has one).
 *   HOW SURE OPSIQ IS  — confidence, in plain language + the number. Always present.
 * Not rendered, ever, by this component: WHY IT MATTERS, WHAT CHANGED, WHAT TO DO NEXT, WHY THIS
 * ACTION, OTHER OPTIONS. Neither OwnerFinanceFinding nor OwnerOperationsFinding carries a distinct
 * "why it matters" field separate from summary, a prior-cycle comparison, or a finding-to-action
 * link -- inventing any of those here would be exactly the fabrication the spec forbids. Where a
 * caller's own page has genuinely separate data for one of those sections (Money's paired
 * "Finance actions" list, e.g.), the caller renders it itself, next to this card, using its own
 * real data -- not as a prop threaded through a component that would otherwise have to fake it.
 */
import { Badge } from "@/ui/primitives";
import { humanizeMetricKey, humanizeEvidenceLine } from "@/lib/metric-label";

export interface FindingCardData {
  id: string;
  findingType: string;
  title: string;
  summary: string;
  sourceMetric: string;
  sourceValue: unknown;
  threshold: unknown;
  severity: string;
  confidence: number;
  evidence?: unknown;
  verificationMetric?: string | null;
}

const SEVERITY_VARIANT: Record<string, "default" | "warning" | "destructive" | "muted-accessible"> = {
  low: "muted-accessible",
  medium: "default",
  high: "warning",
  critical: "destructive",
};

function sureLabel(confidencePct: number): string {
  return confidencePct >= 80 ? "Very sure" : confidencePct >= 50 ? "Reasonably sure" : "Not very sure yet";
}

export function FindingCard({ finding }: { finding: FindingCardData }) {
  const confidencePct = Math.round((finding.confidence ?? 0) * 100);
  const evidenceLines = Array.isArray(finding.evidence) ? finding.evidence : [];
  return (
    <div
      className="border-l-2 pl-4 py-0.5"
      style={{ borderColor: finding.findingType === "opportunity" ? "var(--success-text)" : "var(--warning-text)" }}
    >
      <div className="flex flex-wrap items-start justify-between gap-x-3 gap-y-1.5">
        <span className="text-xs font-semibold uppercase tracking-[0.08em] text-muted-foreground">What OpsIQ found</span>
        <span className="flex shrink-0 gap-1">
          <Badge variant="muted-accessible">{finding.findingType}</Badge>
          <Badge variant={SEVERITY_VARIANT[finding.severity?.toLowerCase()] ?? "default"}>{finding.severity}</Badge>
        </span>
      </div>
      <strong className="mt-1 block font-display text-[1.05rem] font-semibold leading-snug text-foreground">{finding.title}</strong>
      <p className="mt-1 text-sm text-muted-foreground">{finding.summary}</p>

      <div className="mt-3">
        <span className="text-xs font-semibold uppercase tracking-[0.08em] text-muted-foreground">Evidence</span>
        <p className="mt-1 text-xs text-muted-foreground">
          <span className="font-medium text-foreground">Measured:</span> {humanizeMetricKey(finding.sourceMetric)} is {String(finding.sourceValue)}
          {finding.threshold !== null && finding.threshold !== undefined && (
            <> — <span className="font-medium text-foreground">compared against</span> a threshold of {String(finding.threshold)}</>
          )}
        </p>
        {evidenceLines.length > 0 && (
          <p className="mt-1 text-xs text-muted-foreground">
            <span className="font-medium text-foreground">Supporting detail:</span> {evidenceLines.map((l) => humanizeEvidenceLine(String(l))).join("; ")}
          </p>
        )}
      </div>

      <p className="mt-2 text-xs text-muted-foreground">
        <span className="font-medium text-foreground">How sure OpsIQ is:</span> {sureLabel(confidencePct)} ({confidencePct}% confidence)
        {finding.verificationMetric && <> — verify by re-checking {humanizeMetricKey(finding.verificationMetric)}</>}
      </p>
    </div>
  );
}

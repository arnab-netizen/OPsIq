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

const SEVERITY_LABEL: Record<string, string> = {
  low: "Low",
  medium: "Medium",
  high: "High",
  critical: "Critical",
};

// Exported so other owner surfaces (e.g. /owner/trust, UX-06 Wave B) can label the same
// findingType values consistently instead of inventing a second map. Reused, never redefined.
export const FINDING_TYPE_LABEL: Record<string, string> = {
  opportunity: "Opportunity",
  risk: "Risk",
};

/**
 * Own-property-only lookup for a plain object literal used as a label/variant table. A bare
 * `map[key]` lookup is unsafe when `key` comes from server-controlled data: every plain JS
 * object inherits `Object.prototype` members (`constructor`, `toString`, `hasOwnProperty`,
 * `valueOf`, and, via the `__proto__` accessor, the prototype object itself), so a
 * findingType/severity value equal to one of those names can resolve to that inherited
 * function/object instead of `undefined` -- silently producing a value React cannot render,
 * instead of falling through to this component's existing raw-value fallback like any other
 * unrecognized string.
 *
 * Concretely, in this component: `finding.findingType`/`finding.severity` are lowercased
 * (`.toLowerCase()`) before being used as the lookup key. `"constructor"` and `"__proto__"` are
 * already all-lowercase, so that normalization does nothing for them, and they DO resolve to
 * the real inherited member -- `"__proto__"` resolves to the prototype *object* itself (React
 * throws synchronously: "Objects are not valid as a React child"), and `"constructor"`
 * resolves to the inherited *function* (React logs "Functions are not valid as a React child"
 * and renders nothing for that badge). `"toString"`, `"hasOwnProperty"`, and `"valueOf"` are
 * real camelCase Object.prototype member names, so lowercasing them first (to `"tostring"`,
 * `"hasownproperty"`, `"valueof"`) already produced a string that does NOT match any inherited
 * member here -- this existing normalization already fell through to the raw-value fallback
 * for those three specifically, in this file, before this fix. The guard below still covers
 * all five uniformly (and defensively, independent of `.toLowerCase()` continuing to run
 * first) rather than relying on that normalization as the only safeguard.
 *
 * `Object.prototype.hasOwnProperty.call` (not `map.hasOwnProperty`, which could itself be
 * shadowed by a same-named own property) confirms `key` was actually defined on `map` itself
 * before it is ever indexed. Same pattern as `src/lib/audit-label.ts`'s own `ownLookup` --
 * duplicated locally rather than imported, since `audit-label.ts` already imports
 * `FINDING_TYPE_LABEL` from this module and importing back would be circular.
 */
function ownLookup<T>(map: Record<string, T>, key: string | undefined): T | undefined {
  return key !== undefined && Object.prototype.hasOwnProperty.call(map, key) ? map[key] : undefined;
}

/** Plain-language confidence phrase, shared so every owner surface words confidence the same way. */
export function sureLabel(confidencePct: number): string {
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
          <Badge variant="muted-accessible">{ownLookup(FINDING_TYPE_LABEL, finding.findingType?.toLowerCase()) ?? finding.findingType}</Badge>
          <Badge variant={ownLookup(SEVERITY_VARIANT, finding.severity?.toLowerCase()) ?? "default"}>{ownLookup(SEVERITY_LABEL, finding.severity?.toLowerCase()) ?? finding.severity}</Badge>
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

/**
 * The ONE owner decision, rendered — shared by Cockpit, Home, Priorities and the Command Center.
 *
 * Presentation only: every value comes from the server-resolved `CurrentOwnerDecision`
 * (owner-home service → Spine arbiter, src/domain/owner-spine/owner-decision.ts). This component
 * never ranks, filters, scores or re-orders anything — the same decision object always renders the
 * same main target on every surface. Surfaces may choose how much detail to show (`detail`), never
 * which target wins.
 */
import Link from "next/link";
import { Badge, Disclosure } from "@/ui/primitives";
import type { CurrentOwnerDecision, OwnerDecisionTarget } from "@/domain/owner-spine/owner-decision";

type Detail = "full" | "compact";

const SEVERITY_LABEL: Record<string, string> = { critical: "Critical", high: "High", medium: "Medium", low: "Low" };
const SEVERITY_VARIANT = (s: string | null): "destructive-accessible" | "warning-accessible" | "default-accessible" | "muted-accessible" =>
  s === "critical" || s === "high" ? "destructive-accessible" : s === "medium" ? "warning-accessible" : s === "low" ? "default-accessible" : "muted-accessible";
const CONFIDENCE_LABEL: Record<string, string> = {
  high: "High confidence",
  moderate: "Moderate confidence",
  low: "Low confidence",
  insufficient: "Not enough evidence",
};
const CONFIDENCE_VARIANT: Record<string, "success-accessible" | "default-accessible" | "warning-accessible" | "muted-accessible"> = {
  high: "success-accessible",
  moderate: "default-accessible",
  low: "warning-accessible",
  insufficient: "muted-accessible",
};

function TargetLine({ t }: { t: OwnerDecisionTarget }) {
  return (
    <li data-testid="owner-decision-waiting-item" className="text-sm leading-relaxed">
      <Link href={t.targetRoute} className="text-foreground underline-offset-2 hover:underline">{t.title}</Link>
      <span className="text-muted-foreground"> · {t.domainLabel}</span>
    </li>
  );
}

export function OwnerDecisionCard({
  decision,
  detail = "full",
  heading = "Your main business target",
}: {
  decision: CurrentOwnerDecision;
  detail?: Detail;
  heading?: string;
}) {
  const p = decision.primaryTarget;
  return (
    <section
      data-testid="owner-decision"
      data-owner-decision-state={decision.state}
      data-primary-candidate-id={decision.primaryCandidateId ?? ""}
      className="flex flex-col gap-3 border-l-2 py-1 pl-5"
      style={{ borderColor: "var(--accent-ink)" }}
    >
      <div className="flex flex-wrap items-center gap-2">
        <h2 className="m-0 text-xs font-semibold uppercase tracking-[0.08em]" style={{ color: "var(--accent-ink)" }}>{heading}</h2>
        {p?.severity && <Badge variant={SEVERITY_VARIANT(p.severity)}>{SEVERITY_LABEL[p.severity] ?? p.severity}</Badge>}
        {(p || decision.state === "NO_EVIDENCE") && (
          <Badge variant={CONFIDENCE_VARIANT[decision.confidence.level] ?? "muted-accessible"}>
            <span data-testid="owner-decision-confidence">
              {p && decision.confidence.level === "insufficient" ? "Very low confidence" : CONFIDENCE_LABEL[decision.confidence.level] ?? decision.confidence.level}
            </span>
          </Badge>
        )}
      </div>

      {p ? (
        <>
          <strong data-testid="owner-decision-title" className="font-display text-[1.3rem] font-semibold leading-snug tracking-tight text-foreground">
            {p.title}
          </strong>
          <p className="m-0 text-xs text-muted-foreground">Area: {p.domainLabel}</p>
          {p.explanation && detail === "full" && <p className="m-0 text-sm text-muted-foreground">{p.explanation}</p>}
          {decision.whyThisWins.length > 0 && (
            <div data-testid="owner-decision-why">
              <span className="text-sm font-medium text-foreground">Why this comes first</span>
              <ul className="mt-1 list-disc space-y-1 pl-[18px]">
                {decision.whyThisWins.slice(0, detail === "full" ? 3 : 2).map((w, i) => (
                  <li key={i} className="text-[0.9375rem] leading-relaxed text-muted-foreground">{w}</li>
                ))}
              </ul>
            </div>
          )}
          <Link data-testid="owner-decision-go" href={p.targetRoute} className="inline-flex self-start items-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground shadow-sm hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2">
            Work on this in {p.domainLabel} →
          </Link>
        </>
      ) : (
        <div data-testid="owner-decision-empty">
          <strong className="text-base font-semibold text-foreground">
            {decision.state === "NO_EVIDENCE"
              ? "OpsIQ needs your business numbers before it can pick a main target."
              : "None of your diagnosed areas has an open action right now."}
          </strong>
          {decision.whatToDoFirst && <p className="mt-1.5 text-sm text-muted-foreground">{decision.whatToDoFirst}</p>}
          <p className="mt-2 text-sm">
            <Link href="/owner/data" className="text-[var(--primary-text)] underline">
              {decision.state === "NO_EVIDENCE" ? "Add your business information" : "Add your latest figures so OpsIQ can re-check"}
            </Link>
          </p>
        </div>
      )}

      {decision.confidence.reasons.length > 0 && (
        <p data-testid="owner-decision-confidence-reason" className="m-0 text-sm" style={{ color: "var(--warning-text)" }}>
          {decision.confidence.reasons[0]}
        </p>
      )}

      {detail === "full" && decision.missingInformation.length > 0 && (
        <div data-testid="owner-decision-missing">
          <span className="text-sm font-medium text-foreground">Information OpsIQ still needs</span>
          <ul className="mt-1 list-disc space-y-1 pl-[18px] text-sm text-muted-foreground">
            {decision.missingInformation.slice(0, 4).map((m, i) => <li key={i}>{m}</li>)}
          </ul>
        </div>
      )}

      {detail === "full" && decision.whatNotToDo.length > 0 && (
        <div data-testid="owner-decision-avoid">
          <span className="text-sm font-medium text-foreground">Don&rsquo;t do this yet</span>
          <ul className="mt-1 list-disc space-y-1 pl-[18px] text-sm text-muted-foreground">
            {decision.whatNotToDo.slice(0, 3).map((m, i) => <li key={i}>{m}</li>)}
          </ul>
        </div>
      )}

      {detail === "full" && decision.whatChanged.length > 0 && (
        <div data-testid="owner-decision-changed">
          <span className="text-sm font-medium text-foreground">What changed since OpsIQ&rsquo;s previous advice</span>
          <ul className="mt-1 list-disc space-y-1 pl-[18px] text-sm text-muted-foreground">
            {decision.whatChanged.slice(0, 5).map((c, i) => <li key={i}>{c.message}</li>)}
          </ul>
        </div>
      )}

      {detail === "full" && (decision.supportingSteps.length > 0 || decision.whatCanWait.length > 0) && (
        <Disclosure summary={`What comes after this (${decision.supportingSteps.length + decision.whatCanWait.length})`} data-testid="owner-decision-queue">
          {decision.supportingSteps.length > 0 && (
            <>
              <p className="m-0 font-medium text-foreground">After this, in {p?.domainLabel}:</p>
              <ul className="mb-2 mt-1 list-disc space-y-1 pl-[18px]">{decision.supportingSteps.map((t) => <TargetLine key={t.candidateId} t={t} />)}</ul>
            </>
          )}
          {decision.whatCanWait.length > 0 && (
            <>
              <p className="m-0 font-medium text-foreground">{decision.supportingSteps.length > 0 ? "Then, in this order:" : "Next, in this order:"}</p>
              <ul className="mt-1 list-disc space-y-1 pl-[18px]">{decision.whatCanWait.map((t) => <TargetLine key={t.candidateId} t={t} />)}</ul>
            </>
          )}
        </Disclosure>
      )}

      {detail === "full" && <p data-testid="owner-decision-reassess" className="m-0 text-xs text-muted-foreground">{decision.reassessmentTrigger}</p>}
    </section>
  );
}

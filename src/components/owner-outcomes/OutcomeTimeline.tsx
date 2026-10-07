"use client";

/**
 * One tracked recommendation, rendered as a vertical timeline (cards, never a table — it must read on a phone).
 *
 * Presentation only. Every stage comes from `buildTimelineStages()` over the persisted chain read model; stages not yet
 * reached are shown as intentionally incomplete, never filled in. Caveats are plain visible text (not hover-only) and
 * every status keeps its persisted code as secondary detail. The only actions are the existing server operations:
 * check the outcome (server-derived), amend the commitment, or record a new decision.
 */
import { useId, useState } from "react";
import { Badge, Button, Disclosure } from "@/ui/primitives";
import { toOperatorSafeError } from "@/lib/operator-safe-errors";
import { ownerDomainLabel } from "@/domain/owner-spine/owner-decision";
import {
  DECISION_LABELS, assessmentDecisionSequence, assessmentHistory, buildTimelineStages, canCheckOutcome, chainFreshness, contractFormFromDecision, contractLines, currentCommitmentAssessment,
  decisionCommits, decisionHistory, measurementView, originalRecommendation, verificationSummary,
  type OwnerOutcomeChainDto, type StageState, type StatusTone,
} from "@/domain/owner-spine/owner-outcome-presentation";
import { OutcomeCommitmentForm } from "./OutcomeCommitmentForm";
import { postAssessOutcome } from "./outcome-api";

const TONE_BADGE: Record<StatusTone, "default-accessible" | "success-accessible" | "warning-accessible" | "destructive-accessible" | "muted-accessible"> = {
  neutral: "default-accessible", pending: "muted-accessible", good: "success-accessible", caution: "warning-accessible", bad: "destructive-accessible",
};
/** Visible text for the stage state — never colour alone. */
/** Stages whose headline is the owner's or OpsIQ's own free text (never a fixed status label): shown as wrapping text, not a pill. */
const FREE_TEXT_STAGES: ReadonlySet<string> = new Set(["recommended", "decided", "committed"]);
const STATE_TEXT: Record<StageState, string> = { reached: "Recorded", pending: "Waiting", not_applicable: "Not applicable" };

export function OutcomeTimeline({ chain, canManage, onChanged }: { chain: OwnerOutcomeChainDto; canManage: boolean; onChanged: () => void | Promise<void> }) {
  const uid = useId();
  const [checking, setChecking] = useState(false);
  const [checkMsg, setCheckMsg] = useState<{ kind: "ok" | "error"; text: string } | null>(null);
  const stages = buildTimelineStages(chain);
  const fresh = chainFreshness(chain);
  const rec = originalRecommendation(chain);
  const d = chain.currentDecision;
  const a = currentCommitmentAssessment(chain); // the stale one (if any) is history only
  const titleId = `${uid}-title`;

  async function check() {
    if (checking) return;
    setChecking(true); setCheckMsg(null);
    try {
      // Reference only — the server derives every conclusion from persisted sources.
      const res = await postAssessOutcome(chain.businessId, chain.chainKey);
      setCheckMsg({ kind: "ok", text: res.created ? "Checked. A new result was recorded." : "Checked. Nothing has changed since the last check." });
      await onChanged();
    } catch (err) {
      setCheckMsg({ kind: "error", text: toOperatorSafeError(err, "action").error });
    } finally {
      setChecking(false);
    }
  }

  return (
    <article aria-labelledby={titleId} data-testid="outcome-chain-card" data-chain-key={chain.chainKey} className="flex min-w-0 flex-col gap-4 rounded-lg border border-border p-4 [overflow-wrap:anywhere]">
      <header className="flex flex-col gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant="muted-accessible">{ownerDomainLabel(rec.domain)}</Badge>
          {d && <Badge variant="default-accessible"><span data-testid="outcome-decision-state">{DECISION_LABELS[d.decisionState].state}</span></Badge>}
          {fresh.assessmentIsStale && <Badge variant="warning-accessible">Result is out of date</Badge>}
        </div>
        <h3 id={titleId} className="m-0 font-display text-lg font-semibold leading-snug text-foreground">{rec.title}</h3>
        {d?.decisionState === "MODIFIED" && (
          <p data-testid="outcome-modified-notice" className="m-0 text-sm text-foreground">
            You chose to do something different from OpsIQ&apos;s recommendation. Results here relate to your own action.
          </p>
        )}
      </header>

      {fresh.assessmentIsStale && (
        <p role="status" data-testid="outcome-stale-notice" className="m-0 rounded-md border border-border bg-muted/40 p-3 text-sm text-foreground">
          The result below was checked before your latest decision or commitment change, so it may not describe what you are tracking now.
          {canManage && canCheckOutcome(chain) ? " Check the outcome again to bring it up to date." : ""}
        </p>
      )}

      <ol className="m-0 flex list-none flex-col gap-3 p-0" aria-label="Progress from recommendation to result">
        {stages.map((st) => (
          <li key={st.id} data-testid={`outcome-stage-${st.id}`} data-stage-state={st.state} className="flex flex-col gap-1 border-l-2 border-border pl-3">
            <span className="text-xs text-muted-foreground">{st.question} · <span data-testid="outcome-stage-state-text">{STATE_TEXT[st.state]}</span></span>
            <span className="flex min-w-0 flex-wrap items-center gap-2">
              {FREE_TEXT_STAGES.has(st.id)
                ? <span className="min-w-0 text-sm font-medium text-foreground">{st.headline}</span>
                : <Badge variant={TONE_BADGE[st.tone]} className="max-w-full whitespace-normal text-left">{st.headline}</Badge>}
              {st.code && <span className="text-xs text-muted-foreground">({st.code})</span>}
            </span>
            {st.detail && <span className="text-sm text-muted-foreground">{st.detail}</span>}
            {st.caveat && <span data-testid="outcome-stage-caveat" className="text-sm text-foreground">{st.caveat}</span>}
          </li>
        ))}
      </ol>

      {a && !fresh.stagesNotApplicable && (
        <div className="flex flex-col gap-1 text-sm text-muted-foreground" data-testid="outcome-assessment-meta">
          <span>{verificationSummary(a)}.</span>
          <span>Last checked {a.assessedAt.slice(0, 10)}.</span>
          {a.nextVerificationAction && <span>What would help next: {a.nextVerificationAction}</span>}
          {a.learningBlockers.length > 0 && <span>Why OpsIQ can&apos;t learn from this yet: {a.learningBlockers.join("; ")}</span>}
        </div>
      )}

      {!a && !fresh.stagesNotApplicable && (
        <p data-testid="outcome-not-checked" className="m-0 text-sm text-muted-foreground">
          {fresh.assessmentIsStale
            ? "Earlier results were recorded for your previous commitment. They are kept under History and are not shown as the current result."
            : "No result has been recorded yet. The stages above stay empty until OpsIQ checks this against your records."}
        </p>
      )}

      {canManage && canCheckOutcome(chain) && (
        <div className="flex flex-col gap-2">
          <div><Button type="button" variant="outline" onClick={check} isLoading={checking} disabled={checking} aria-busy={checking}>Check outcome</Button></div>
          {checkMsg && <p role={checkMsg.kind === "error" ? "alert" : "status"} className={`m-0 text-sm ${checkMsg.kind === "error" ? "text-destructive" : "text-foreground"}`}>{checkMsg.text}</p>}
        </div>
      )}

      {d && decisionCommits(d.decisionState) && (
        <Disclosure summary="What you committed to measure" data-testid="outcome-contract-disclosure">
          <dl className="m-0 grid min-w-0 grid-cols-1 gap-x-4 gap-y-1 sm:grid-cols-[max-content_minmax(0,1fr)]">
            {contractLines(d).map((l) => (
              <div key={l.label} className="contents"><dt className="font-medium text-foreground">{l.label}</dt><dd className="m-0">{l.value}</dd></div>
            ))}
          </dl>
        </Disclosure>
      )}

      {canManage && d && decisionCommits(d.decisionState) && (
        <Disclosure summary="Update what you're tracking">
          <OutcomeCommitmentForm idPrefix={`${uid}-amend`} businessId={chain.businessId} candidateId={chain.chainKey} mode={{ kind: "amend", state: d.decisionState }} initialContract={contractFormFromDecision(d)} onRecorded={onChanged} />
        </Disclosure>
      )}
      {canManage && d && (
        <Disclosure summary="Change my decision">
          <OutcomeCommitmentForm idPrefix={`${uid}-decide`} businessId={chain.businessId} candidateId={chain.chainKey} mode={{ kind: "decide" }} onRecorded={onChanged} />
        </Disclosure>
      )}

      <Disclosure summary="History" data-testid="outcome-history">
        <div className="flex flex-col gap-3">
          <div>
            <p className="m-0 mb-1 font-medium text-foreground">Decisions (newest first)</p>
            <ul className="m-0 flex list-none flex-col gap-1 p-0">
              {decisionHistory(chain).map((x) => (
                <li key={x.id} data-testid="outcome-history-decision">#{x.sequence} · {DECISION_LABELS[x.decisionState].state} · {x.decidedAt.slice(0, 10)}{x.commitmentDescription ? ` · ${x.commitmentDescription}` : ""}</li>
              ))}
            </ul>
          </div>
          <div>
            <p className="m-0 mb-1 font-medium text-foreground">Results checked (newest first)</p>
            {assessmentHistory(chain).length === 0 ? (
              <p className="m-0">None yet.</p>
            ) : (
              <ul className="m-0 flex list-none flex-col gap-1 p-0">
                {assessmentHistory(chain).map((x) => (
                  <li key={x.id} data-testid="outcome-history-assessment">Version {x.version} · {x.assessedAt.slice(0, 10)} · {measurementView(x.measurementResult).label}{assessmentDecisionSequence(chain, x) !== null ? ` · checked under decision #${assessmentDecisionSequence(chain, x)}` : ""}{x.ownerDecisionId !== d?.id ? " (earlier commitment)" : ""}</li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </Disclosure>
    </article>
  );
}

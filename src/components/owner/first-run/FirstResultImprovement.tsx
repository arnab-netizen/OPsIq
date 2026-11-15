"use client";

/**
 * "Improve this recommendation" — progressive OBQ. One question at a time, chosen on the server from actual
 * missing evidence; each says what is asked, why, what it could change and the effort. Progress is PERSISTED on the
 * server (answered/skipped categories), so a reload shows the same position, a skipped question is not asked again and
 * the question limit is reachable.
 *
 * WHERE the owner goes, and what the button says, is the SERVER's answer for that question (`view.target`, decided from
 * persisted evidence): "Add this" when nothing is recorded, "Edit this" when the evidence already exists — with its current
 * value shown first — and an honest "saved, but this read doesn't use it" when that is the case. This component never
 * decides add vs edit. Editing the Finance entry reuses the existing Correct flow (`onEditFinance`); editing the Cashflow
 * entry opens it with a return marker, and the shared return bar brings the owner back to re-run the read.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Button } from "@/ui/primitives";
import { firstRunApi, type FirstMoneyReadView, type ImproveTarget, type NextQuestionView } from "@/lib/owner-first-run-client";
import { firstRunErrorText } from "@/lib/first-run-errors";
import { clearRoundTrip, saveBeforeSummary } from "@/lib/first-run-return-storage";
import { formatCashflowAmount } from "@/domain/owner-cashflow/edit-flow";
import type { ImproveCurrentValue } from "@/domain/owner-first-run/improve-target";

const STOP_COPY: Record<string, string> = {
  NOTHING_WORTH_ASKING: "Another answer is unlikely to change this recommendation right now, so OpsIQ has nothing more to ask.",
  CONFIDENCE_SUFFICIENT: "OpsIQ has the main information it needs, so no further question would change this recommendation right now.",
  QUESTION_LIMIT: "That is enough for now. You can add more detail whenever you like.",
  FIRST_READ_NOT_READY: "OpsIQ needs your basic money numbers first.",
};

const linkClass = "inline-flex min-h-11 items-center justify-center rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground";

function CurrentValues({ values, currency }: { values: ImproveCurrentValue[]; currency: string }) {
  return (
    <ul className="rounded-md border border-border p-2 text-foreground" data-testid="first-result-improvement-current">
      {values.map((v) => (
        <li key={v.field}>
          {v.label}: <span className="font-semibold">{formatCashflowAmount(v.value, currency)}</span>
        </li>
      ))}
    </ul>
  );
}

export function FirstResultImprovement({
  businessId,
  read,
  cycleId,
  onEditFinance,
  onClose,
}: {
  businessId: string;
  /** The read on screen: what the owner sees now is remembered so the return can show what changed. */
  read: FirstMoneyReadView["read"];
  cycleId?: string;
  /** Open the existing first-run Correct flow on the evidence the server said to edit. */
  onEditFinance?: (target: Extract<ImproveTarget, { kind: "EDIT_FINANCE" }>) => void;
  onClose: () => void;
}) {
  const [view, setView] = useState<NextQuestionView | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const requested = useRef(false);
  const headingRef = useRef<HTMLHeadingElement>(null);
  // After the panel opens (and after a skip re-renders the question) focus returns to the heading, never to <body>.
  useEffect(() => { headingRef.current?.focus(); }, [view?.progress.handled]);

  const load = useCallback(async () => {
    setError(null);
    try {
      setView(await firstRunApi.nextQuestion(businessId));
    } catch (err) {
      setError(`We couldn't find the next question. ${firstRunErrorText(err)}`);
    }
  }, [businessId]);

  useEffect(() => {
    if (requested.current) return;
    requested.current = true;
    void load();
  }, [load]);

  async function skip(category: string) {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      await firstRunApi.skipQuestion(businessId, category);
      setView(null);
      await load();
    } catch (err) {
      setError(`We couldn't save that. ${firstRunErrorText(err)}`);
    } finally {
      setBusy(false);
    }
  }

  async function startAdding(category: string, label: string, roundTrip: boolean) {
    // Recorded when the owner actually sets out to supply the evidence (idempotent per category); a failure must never block navigation.
    const recorded = firstRunApi.improve(businessId, category).catch(() => undefined);
    if (!roundTrip) {
      // Editing the Finance entry in place re-runs the read right here and shows its own "what changed": there is no trip
      // away from this page, so no "before" is kept (and an abandoned earlier one is dropped — one pending round trip at most).
      clearRoundTrip();
      await recorded;
      return;
    }
    // Remember what the owner is looking at (labels and tiers only, never amounts) so the return can show what changed.
    saveBeforeSummary({
      recommendedAction: read.recommendedAction,
      confidenceTier: read.confidenceTier,
      evidenceQuality: read.evidenceQuality,
      missingEvidence: read.missingEvidence,
      questionLabel: label,
      category,
      ...(cycleId ? { cycleId } : {}),
      noticed: read.noticed,
      sharpenBy: read.sharpenBy?.title ?? null,
      cautions: read.cautions,
    });
    await recorded;
  }

  const question = view && !view.result.done ? view.result.question : null;
  const target = view?.target ?? null;

  return (
    <section data-testid="first-result-improvement" className="rounded-lg border border-border bg-background p-4">
      <h3 ref={headingRef} tabIndex={-1} className="text-lg font-semibold text-foreground outline-none">Make this recommendation sharper</h3>
      {view && (
        <p role="status" className="mt-1 text-xs text-muted-foreground" data-testid="first-result-improvement-progress">
          {view.progress.handled} of up to {view.progress.max} questions handled
        </p>
      )}
      {error && (
        <div role="alert" className="mt-3 text-sm text-destructive">
          <p>{error}</p>
          <Button type="button" variant="secondary" className="mt-2 min-h-11" onClick={() => void load()}>Try again</Button>
        </div>
      )}
      {!view && !error && <p className="mt-2 text-sm text-muted-foreground">Finding the most useful next question…</p>}
      {view && view.result.done && (
        <p role="status" className="mt-2 text-sm text-foreground" data-testid="first-result-improvement-done">{STOP_COPY[view.result.reason] ?? STOP_COPY.NOTHING_WORTH_ASKING}</p>
      )}
      {view && question && target && (
        <div className="mt-2 space-y-2 text-sm" data-testid="first-result-improvement-question" data-target-kind={target.kind}>
          <p className="text-base font-semibold text-foreground">{question.label}</p>
          <p className="text-foreground">{question.why}</p>
          {target.kind !== "NOT_USED_BY_READ" && <p className="text-muted-foreground">It could change: {question.couldChange}</p>}
          <p className="text-muted-foreground">Effort: {question.effortLabel}</p>

          {target.kind === "EDIT_FINANCE" && (
            <>
              <p className="text-muted-foreground" data-testid="first-result-improvement-where">
                {target.hasValue ? `This is already on the figures your read uses (${target.readPeriodLabel}). Here is what is recorded now:` : `Your read's figures for ${target.readPeriodLabel} don't have this yet. It is added to those figures, not to a new entry:`}
              </p>
              <CurrentValues values={target.currentValues} currency={target.currency} />
            </>
          )}
          {target.kind === "EDIT_CASHFLOW" && (
            <>
              <p className="text-muted-foreground" data-testid="first-result-improvement-where">
                {target.hasValue
                  ? `You already have a Cashflow entry for ${target.entryPeriodLabel}. Here is what is recorded now:`
                  : `You already have a Cashflow entry for ${target.entryPeriodLabel} without a bank balance. Add it to that entry:`}
              </p>
              <CurrentValues values={target.currentValues} currency={target.currency} />
            </>
          )}
          {target.kind === "ADD" && (
            <p className="text-muted-foreground" data-testid="first-result-improvement-where">Nothing is recorded for this yet. It will be saved for {target.readPeriodLabel}, the period your read covers.</p>
          )}
          {target.kind === "NOT_USED_BY_READ" && (
            <p className="text-foreground" data-testid="first-result-improvement-not-used">{target.explanation}</p>
          )}

          <p className="text-muted-foreground">After you save it, a bar at the top will bring you straight back to update your read.</p>
          <div className="flex flex-col gap-2 pt-1 sm:flex-row">
            {target.kind === "EDIT_FINANCE" && onEditFinance && (
              <Button
                type="button"
                className="min-h-11"
                onClick={() => { void startAdding(question.category, question.label, false); onEditFinance(target); }}
                data-testid="first-result-improvement-add"
              >
                {target.actionLabel}
              </Button>
            )}
            {(target.kind === "ADD" || target.kind === "EDIT_CASHFLOW") && (
              <Link href={target.href} onClick={() => void startAdding(question.category, question.label, true)} className={linkClass} data-testid="first-result-improvement-add">
                {target.actionLabel}
              </Link>
            )}
            {target.kind === "NOT_USED_BY_READ" && target.next && target.next.kind !== "EDIT_FINANCE" && (
              <Link href={target.next.href} onClick={() => void startAdding(question.category, question.label, true)} className={linkClass} data-testid="first-result-improvement-add">
                {target.next.actionLabel}
              </Link>
            )}
            {target.kind === "NOT_USED_BY_READ" && !target.next && (
              <Link
                href={target.addHref}
                onClick={() => void startAdding(question.category, question.label, true)}
                className="inline-flex min-h-11 items-center justify-center rounded-md border border-border px-4 text-sm font-medium text-foreground"
                data-testid="first-result-improvement-add"
              >
                {target.actionLabel}
              </Link>
            )}
            <Button
              type="button"
              variant="secondary"
              className="min-h-11"
              disabled={busy}
              onClick={() => void skip(question.category)}
              data-testid="first-result-improvement-skip"
            >
              I don&rsquo;t have this
            </Button>
          </div>
        </div>
      )}
      <Button type="button" variant="secondary" className="mt-4 min-h-11" onClick={onClose} data-testid="first-result-improvement-later">
        Continue later
      </Button>
    </section>
  );
}

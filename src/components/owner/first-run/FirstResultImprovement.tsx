"use client";

/**
 * "Improve this recommendation" — progressive OBQ. One question at a time, chosen on the server from actual
 * missing evidence; each says what is asked, why, what it could change and the effort. Progress is PERSISTED on the
 * server (answered/skipped categories), so a reload shows the same position, a skipped question is not asked again and
 * the question limit is reachable. "Add this" goes to the existing governed input surface carrying a return marker; the
 * shared return bar brings the owner back and the first read is re-run there. Presentation only.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Button } from "@/ui/primitives";
import { firstRunApi, type FirstMoneyReadView, type NextQuestionView } from "@/lib/owner-first-run-client";
import { firstRunErrorText } from "@/lib/first-run-errors";
import { saveBeforeSummary } from "@/lib/first-run-return-storage";

const STOP_COPY: Record<string, string> = {
  NOTHING_WORTH_ASKING: "Another answer is unlikely to change this recommendation right now, so OpsIQ has nothing more to ask.",
  CONFIDENCE_SUFFICIENT: "OpsIQ has the main information it needs, so no further question would change this recommendation right now.",
  QUESTION_LIMIT: "That is enough for now. You can add more detail whenever you like.",
  FIRST_READ_NOT_READY: "OpsIQ needs your basic money numbers first.",
};

export function FirstResultImprovement({
  businessId,
  read,
  onClose,
}: {
  businessId: string;
  /** The read on screen: what the owner sees now is remembered so the return can show what changed. */
  read: FirstMoneyReadView["read"];
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

  async function startAdding(category: string, label: string) {
    // Remember what the owner is looking at (labels and tiers only, never amounts) so the return can show what changed.
    saveBeforeSummary({
      recommendedAction: read.recommendedAction,
      confidenceTier: read.confidenceTier,
      evidenceQuality: read.evidenceQuality,
      missingEvidence: read.missingEvidence,
      questionLabel: label,
    });
    // Recorded when the owner actually sets out to supply the evidence (idempotent per category); a failure must never block navigation.
    await firstRunApi.improve(businessId, category).catch(() => undefined);
  }

  const question = view && !view.result.done ? view.result.question : null;

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
      {view && question && (
        <div className="mt-2 space-y-2 text-sm" data-testid="first-result-improvement-question">
          <p className="text-base font-semibold text-foreground">{question.label}</p>
          <p className="text-foreground">{question.why}</p>
          <p className="text-muted-foreground">It could change: {question.couldChange}</p>
          <p className="text-muted-foreground">Effort: {question.effortLabel}</p>
          <p className="text-muted-foreground">After you save it, a bar at the top will bring you straight back to update your read.</p>
          <div className="flex flex-col gap-2 pt-1 sm:flex-row">
            {view.inputHref && (
              <Link
                href={view.inputHref}
                onClick={() => void startAdding(question.category, question.label)}
                className="inline-flex min-h-11 items-center justify-center rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground"
                data-testid="first-result-improvement-add"
              >
                {view.inputActionLabel ?? "Add this"}
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

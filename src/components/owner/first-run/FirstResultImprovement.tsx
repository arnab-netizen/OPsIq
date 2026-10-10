"use client";

/**
 * "Improve this recommendation" — progressive OBQ. One question at a time, chosen on the server from actual
 * missing evidence; each says what is asked, why, what it could change and the effort. It stops when another
 * answer is unlikely to change the recommendation, at the question limit, or when the owner chooses to go on later.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Button } from "@/ui/primitives";
import { firstRunApi, newIdempotencyKey, type NextQuestionView } from "@/lib/owner-first-run-client";
import { classifyOperatorError } from "@/lib/operator-error-governance";

const STOP_COPY: Record<string, string> = {
  NOTHING_WORTH_ASKING: "Another answer is unlikely to change this recommendation right now, so OpsIQ has nothing more to ask.",
  CONFIDENCE_SUFFICIENT: "OpsIQ is confident enough in this recommendation. More detail can wait until something changes.",
  QUESTION_LIMIT: "That is enough for now. You can add more detail whenever you like.",
  FIRST_READ_NOT_READY: "OpsIQ needs your basic money numbers first.",
};

export function FirstResultImprovement({ businessId, onClose }: { businessId: string; onClose: () => void }) {
  const [view, setView] = useState<NextQuestionView | null>(null);
  const [skipped, setSkipped] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const requested = useRef(false);
  const attemptKey = useRef(newIdempotencyKey());

  const load = useCallback(
    async (skippedNow: string[]) => {
      setError(null);
      try {
        setView(await firstRunApi.nextQuestion(businessId, skippedNow, 0));
      } catch (err) {
        const governed = classifyOperatorError(err instanceof Error ? err : new Error(String(err)), { context: "load" });
        setError(`We couldn't find the next question. ${governed.recovery}`);
      }
    },
    [businessId],
  );

  useEffect(() => {
    if (requested.current) return;
    requested.current = true;
    // Asking to improve the read is itself recorded once (idempotent); a failure here must not block the question.
    void firstRunApi.improve(businessId, attemptKey.current).catch(() => undefined);
    void load([]);
  }, [businessId, load]);

  return (
    <section data-testid="first-result-improvement" className="rounded-lg border border-border bg-background p-4" aria-live="polite">
      <h3 className="text-lg font-semibold text-foreground">Make this recommendation sharper</h3>
      {error && (
        <div role="alert" className="mt-3 text-sm text-destructive">
          <p>{error}</p>
          <Button type="button" variant="secondary" className="mt-2 min-h-11" onClick={() => void load(skipped)}>Try again</Button>
        </div>
      )}
      {!view && !error && <p className="mt-2 text-sm text-muted-foreground">Finding the most useful next question…</p>}
      {view && view.result.done && (
        <p className="mt-2 text-sm text-foreground" data-testid="first-result-improvement-done">{STOP_COPY[view.result.reason] ?? STOP_COPY.NOTHING_WORTH_ASKING}</p>
      )}
      {view && !view.result.done && (
        <div className="mt-2 space-y-2 text-sm" data-testid="first-result-improvement-question">
          <p className="text-base font-semibold text-foreground">{view.result.question.label}</p>
          <p className="text-foreground">{view.result.question.why}</p>
          <p className="text-muted-foreground">It could change: {view.result.question.couldChange}</p>
          <p className="text-muted-foreground">Effort: {view.result.question.effortLabel}</p>
          <div className="flex flex-col gap-2 pt-1 sm:flex-row">
            {view.inputHref && (
              <Link href={view.inputHref} className="inline-flex min-h-11 items-center justify-center rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground" data-testid="first-result-improvement-add">
                {view.inputActionLabel ?? "Add this"}
              </Link>
            )}
            <Button
              type="button"
              variant="secondary"
              className="min-h-11"
              onClick={() => {
                const next = [...skipped, view.result.done ? "" : view.result.question.category].filter(Boolean);
                setSkipped(next);
                setView(null);
                void load(next);
              }}
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

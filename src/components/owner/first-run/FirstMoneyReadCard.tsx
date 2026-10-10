"use client";

/**
 * "Your first Money read" — presentation of the eleven first-value answers plus the three result actions.
 * Everything shown comes from the server view (src/domain/owner-first-run/first-money-read.ts): this
 * component decides nothing, scores nothing and adds no claims.
 */
import { Button } from "@/ui/primitives";
import type { FirstMoneyRead } from "@/domain/owner-first-run/first-money-read";

/** The supporting metric may be a ratio, a count of days or an amount, so no unit is invented for it. */
const plain = (value: number | null) => (value === null ? null : new Intl.NumberFormat(undefined, { maximumFractionDigits: 2 }).format(value));

export function FirstMoneyReadCard({
  read,
  stale,
  decisionState,
  busy,
  onAccept,
  onCorrect,
  onImprove,
}: {
  read: FirstMoneyRead;
  stale: boolean;
  decisionState: string | null;
  busy: boolean;
  onAccept: () => void;
  onCorrect: () => void;
  onImprove: () => void;
}) {
  const accepted = decisionState === "ACCEPTED" || decisionState === "MODIFIED";
  return (
    <section data-testid="first-money-read" aria-labelledby="first-money-read-heading" className="rounded-lg border-2 border-primary/40 bg-primary/5 p-4">
      <h2 id="first-money-read-heading" className="text-xl font-semibold text-foreground">{read.heading}</h2>
      <p className="mt-1 text-sm text-muted-foreground" data-testid="first-money-read-scope">{read.scope}</p>

      {stale && (
        <p role="alert" className="mt-3 rounded-md border border-border bg-background p-3 text-sm text-foreground" data-testid="first-money-read-stale">
          Your numbers changed after this read, so it may be out of date.
        </p>
      )}

      <dl className="mt-4 space-y-4 text-sm">
        <div>
          <dt className="font-medium text-muted-foreground">What OpsIQ noticed</dt>
          <dd className="mt-0.5 text-base font-semibold text-foreground" data-testid="first-money-read-noticed">{read.noticed}</dd>
        </div>

        {read.evidenceMetric && (
          <div>
            <dt className="font-medium text-muted-foreground">What it is based on</dt>
            <dd className="mt-0.5 break-words text-foreground">
              {read.evidenceMetric}
              {read.actualValue !== null && <> — <span data-testid="first-money-read-value" className="font-semibold">{plain(read.actualValue)}</span></>}
              {read.supportingEvidence.length > 0 && (
                <ul className="mt-1 list-disc pl-5 text-muted-foreground">
                  {read.supportingEvidence.map((e) => <li key={e}>{e}</li>)}
                </ul>
              )}
            </dd>
          </div>
        )}

        <div>
          <dt className="font-medium text-muted-foreground">Why it matters</dt>
          <dd className="mt-0.5 text-foreground">{read.whyItMatters}</dd>
        </div>

        {read.recommendedAction && (
          <div data-testid="first-money-read-action">
            <dt className="font-medium text-muted-foreground">What to do</dt>
            <dd className="mt-0.5 text-foreground">
              <span className="font-semibold">{read.recommendedAction}</span>
              {read.actionDetail && <span className="mt-1 block text-muted-foreground">{read.actionDetail}</span>}
              <span className="mt-1 block">Owner: {read.owner} · When: {read.timing}</span>
              {read.watchMetric && <span className="block">Watch: {read.watchMetric}</span>}
            </dd>
          </div>
        )}

        <div data-testid="first-money-read-confidence">
          <dt className="font-medium text-muted-foreground">How sure OpsIQ is</dt>
          <dd className="mt-0.5 text-foreground">{read.confidenceLabel}</dd>
        </div>

        {read.evidenceQualityLabel && (
          <div data-testid="first-money-read-quality">
            <dt className="font-medium text-muted-foreground">How reliable your numbers are</dt>
            <dd className="mt-0.5 text-foreground">
              {read.evidenceQualityLabel}
              {read.evidenceQualityNote && <span className="block text-muted-foreground">{read.evidenceQualityNote}</span>}
            </dd>
          </div>
        )}

        {read.missingEvidence.length > 0 && (
          <div data-testid="first-money-read-missing">
            <dt className="font-medium text-muted-foreground">What is still missing</dt>
            <dd className="mt-0.5 text-foreground">{read.missingEvidence.join(", ")}</dd>
          </div>
        )}
      </dl>

      <div className="mt-5 grid grid-cols-1 gap-2 sm:grid-cols-3" data-testid="first-money-read-actions">
        {accepted ? (
          <p className="rounded-md border border-border bg-background p-3 text-sm text-foreground sm:col-span-3" data-testid="first-money-read-accepted">
            This is your next move. You can find it in your Cockpit.
          </p>
        ) : (
          <Button type="button" onClick={onAccept} disabled={busy || stale || !read.recommendedAction} className="min-h-11" data-testid="first-run-accept">
            Use this as my next move
          </Button>
        )}
        <Button type="button" variant="secondary" onClick={onCorrect} disabled={busy} className="min-h-11" data-testid="first-run-correct">
          Something here is wrong
        </Button>
        <Button type="button" variant="secondary" onClick={onImprove} disabled={busy} className="min-h-11" data-testid="first-run-improve">
          Improve this recommendation
        </Button>
      </div>
    </section>
  );
}

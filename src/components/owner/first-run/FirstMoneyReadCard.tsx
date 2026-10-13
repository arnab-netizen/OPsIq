"use client";

/**
 * "Your first Money read" — presentation of the eleven first-value answers plus the three result actions.
 * Everything shown comes from the server view (src/domain/owner-first-run/first-money-read.ts): this
 * component decides nothing, scores nothing and adds no claims.
 */
import { Button } from "@/ui/primitives";
import Link from "next/link";
import { withFirstRunReturn } from "@/domain/owner-first-run/first-run-return";
import { FIRST_READ_SCOPE_COPY, scopeSentence, type FirstMoneyRead } from "@/domain/owner-first-run/first-money-read";

export function FirstMoneyReadCard({
  read,
  decisionState,
  busy,
  onAccept,
  onCorrect,
  onImprove,
  onSharpen,
}: {
  read: FirstMoneyRead;
  decisionState: string | null;
  busy: boolean;
  onAccept: () => void;
  onCorrect: () => void;
  onImprove: () => void;
  /** Called when the owner follows a "what would sharpen this" link (records what they were looking at for the return). */
  onSharpen?: () => void;
}) {
  const accepted = decisionState === "ACCEPTED" || decisionState === "MODIFIED";
  // The claim wording is derived from the runtime scope of the evidence, never from a string that happens to be in the payload.
  const copy = FIRST_READ_SCOPE_COPY[read.scopeKind];
  return (
    <section data-testid="first-money-read" aria-labelledby="first-money-read-heading" className="rounded-lg border-2 border-primary/40 bg-primary/5 p-4">
      <h2 id="first-money-read-heading" className="text-xl font-semibold text-foreground">{copy.heading}</h2>
      <p className="mt-1 text-sm text-muted-foreground" data-testid="first-money-read-scope" data-scope-kind={read.scopeKind}>{scopeSentence(read.scopeKind, read.status)}</p>
      <p className="mt-1 text-sm font-medium text-foreground" data-testid="first-money-read-basis" data-period-state={read.period.state}>{read.basis}</p>

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
              {read.actualValueText !== null && <> — <span data-testid="first-money-read-value" className="font-semibold">{read.actualValueText}</span></>}
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

        {read.sharpenBy && (
          <div data-testid="first-money-read-sharpen">
            <dt className="font-medium text-muted-foreground">What would sharpen this</dt>
            <dd className="mt-0.5 text-foreground">
              <span className="font-semibold">{read.sharpenBy.title}</span>
              <span className="mt-1 block text-muted-foreground">{read.sharpenBy.detail}</span>
              {read.sharpenBy.href && onSharpen && (
                <Link
                  href={withFirstRunReturn(read.sharpenBy.href)}
                  onClick={() => onSharpen()}
                  className="mt-2 inline-flex min-h-11 items-center justify-center rounded-md border border-border px-4 text-sm font-medium text-foreground"
                  data-testid="first-money-read-sharpen-link"
                >
                  Add this now
                </Link>
              )}
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

      {read.cautions.length > 0 && (
        <ul className="mt-4 list-disc space-y-1 rounded-md border border-border bg-background p-3 pl-7 text-sm text-foreground" data-testid="first-money-read-cautions">
          {read.cautions.map((c) => (
            <li key={c}>{c}</li>
          ))}
        </ul>
      )}

      {!accepted && read.acceptNote && (
        <p className="mt-4 rounded-md border border-border bg-background p-3 text-sm text-foreground" data-testid="first-money-read-accept-note">
          {read.acceptNote}
        </p>
      )}

      <div className="mt-5 grid grid-cols-1 gap-2 sm:grid-cols-3" data-testid="first-money-read-actions">
        {accepted ? (
          <p className="rounded-md border border-border bg-background p-3 text-sm text-foreground sm:col-span-3" data-testid="first-money-read-accepted">
            This is your next move. You can find it in your Cockpit.
          </p>
        ) : (
          <Button type="button" onClick={onAccept} disabled={busy || !read.canAccept} className="min-h-11" data-testid="first-run-accept">
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

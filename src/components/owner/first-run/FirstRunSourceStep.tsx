"use client";

/**
 * Step B — "Let's understand your business". Shows the evidence routes the SERVER says exist (see resolveFirstRunSources): connect
 * QuickBooks (read-only) and/or enter a few numbers. Both routes write the same canonical evidence, and the first read then starts
 * by itself from the persisted state (FirstRunFlow); this component holds no routing, scoring or availability rules and shows no
 * connector the server did not offer. Presentation only.
 */
import { useState } from "react";
import { Button } from "@/ui/primitives";
import { QuickBooksConnectionCard } from "@/components/owner/QuickBooksConnectionCard";
import { QuickFinancialPicture } from "@/components/owner/QuickFinancialPicture";
import type { FirstRunSourceView } from "@/domain/owner-first-run/first-run-source";

export function FirstRunSourceStep({
  business,
  sources,
  onEvidenceSaved,
  importWindowEnded = false,
  onRecheckImport,
}: {
  business: { id: string; name: string; currency: string };
  sources: FirstRunSourceView;
  /** The manual route saved enough for a first read: re-read the persisted state. */
  onEvidenceSaved: () => void;
  /** The automatic progress checks ran out while the import is still running (a persisted fact is NOT implied: only that we stopped looking). */
  importWindowEnded?: boolean;
  onRecheckImport?: () => void;
}) {
  const role = sources.quickBooks;
  // Manual is the whole step when QuickBooks is not part of it, and the fallback when QuickBooks needs the owner.
  const [manualOpen, setManualOpen] = useState(role === "HIDDEN" || role === "ATTENTION");
  const manualVisible = role === "HIDDEN" || manualOpen;

  const manualForm = (
    <div data-testid="first-run-manual-route">
      <p className="mb-2 text-sm text-muted-foreground">
        Revenue, one cost and your cash for <span className="font-medium text-foreground">{business.name}</span> are enough for a first read. Estimates are fine &mdash; and you will say how reliable they are.
      </p>
      <QuickFinancialPicture
        key={business.id}
        businessId={business.id}
        currency={business.currency}
        omitMoneyLink
        requireEvidenceQuality
        onFirstRead={onEvidenceSaved}
        onSaved={() => undefined}
      />
    </div>
  );

  return (
    <div className="space-y-4" data-testid="first-run-evidence-step" data-quickbooks-role={role}>
      <div>
        <h2 className="text-lg font-semibold text-foreground">Let&rsquo;s understand your business</h2>
        <p className="mt-1 text-sm text-muted-foreground">OpsIQ needs some business numbers before it can tell you what deserves attention.</p>
      </div>

      {role !== "HIDDEN" && (
        <section className="rounded-lg border border-border bg-background p-4" data-testid="first-run-quickbooks-route" aria-label="Connect QuickBooks">
          {role === "OFFER" && (
            <>
              <p className="text-sm font-medium text-foreground">Connect QuickBooks <span className="font-normal text-muted-foreground">&mdash; the fastest way</span></p>
              <p className="mt-1 text-sm text-muted-foreground" data-testid="first-run-quickbooks-explainer">
                Read-only. OpsIQ reads the accounting data it needs and never changes anything in QuickBooks. Your first read starts by itself once enough has arrived.
              </p>
            </>
          )}
          {role === "IN_PROGRESS" && !importWindowEnded && (
            <p className="text-sm text-foreground" role="status" data-testid="first-run-quickbooks-progress">
              Getting your numbers from QuickBooks. Your first read will start by itself &mdash; you don&rsquo;t need to do anything. You can leave this page; it will pick up where it left off.
            </p>
          )}
          {role === "IN_PROGRESS" && importWindowEnded && (
            <div role="status" data-testid="first-run-quickbooks-slow">
              <p className="text-sm text-foreground">
                This is taking longer than usual. OpsIQ still shows the QuickBooks import as in progress and nothing is lost &mdash; your first read starts as soon as enough has arrived, even if you close this page.
                You can check again now, or enter a few numbers instead.
              </p>
              {onRecheckImport && (
                <Button type="button" variant="outline" className="mt-2 min-h-11 w-full sm:w-auto" onClick={onRecheckImport} data-testid="first-run-recheck-import">
                  Check again
                </Button>
              )}
            </div>
          )}
          {role === "ATTENTION" && (
            <p className="text-sm text-foreground" data-testid="first-run-quickbooks-attention">
              QuickBooks is connected, but it hasn&rsquo;t given OpsIQ enough for a first read yet. You can fix the connection below, or enter a few numbers instead.
            </p>
          )}
          <QuickBooksConnectionCard businessId={business.id} firstRun />
        </section>
      )}

      {role !== "HIDDEN" && !manualVisible && (
        <div className="rounded-lg border border-border bg-background p-4" data-testid="first-run-manual-choice">
          <p className="text-sm font-medium text-foreground">Enter a few numbers</p>
          <p className="mt-1 text-sm text-muted-foreground">For businesses that don&rsquo;t use QuickBooks. A small set of numbers is enough for the first read.</p>
          <Button type="button" variant="outline" className="mt-3 min-h-11 w-full sm:w-auto" onClick={() => setManualOpen(true)} data-testid="first-run-choose-manual">
            Enter a few numbers
          </Button>
        </div>
      )}

      {manualVisible && manualForm}
    </div>
  );
}

"use client";

/**
 * UX-03 — canonical owner assessment presentation block for Home.
 *
 * Presentation-only: renders the already-finished UX-02B OwnerAssessmentNarrative verbatim.
 * No fetch, no useActiveBusiness, no Prisma, no service import, no OwnerNowView import, no
 * reconciliation, no health calculation, no category mapping, no confidence mapping. The page
 * is responsible for producing `narrative` via
 * composeOwnerAssessment(reconcileOwnerAssessment(...)) and passing it down.
 */

import Link from "next/link";
import { Button } from "@/ui/primitives";
import type { OwnerAssessmentNarrative } from "@/domain/owner-guidance/owner-assessment-composer";

export interface OwnerAssessmentSummaryProps {
  narrative: OwnerAssessmentNarrative;
}

export function OwnerAssessmentSummary({ narrative }: OwnerAssessmentSummaryProps) {
  return (
    <div data-testid="owner-assessment-summary" className="rounded-lg border border-border bg-card p-4">
      <p className="text-xs font-semibold uppercase tracking-[0.08em] text-muted-foreground">
        Business assessment
      </p>
      <p
        data-testid="owner-assessment-headline"
        className="mt-1 font-display text-[1.1rem] font-semibold leading-snug tracking-tight text-foreground"
      >
        {narrative.headline}
      </p>
      {narrative.primaryConcern && (
        <p data-testid="owner-assessment-primary-concern" className="mt-2 text-sm text-foreground">
          {narrative.primaryConcern}
        </p>
      )}
      <div className="mt-3 text-sm">
        <p data-testid="owner-assessment-confidence-label" className="font-medium text-foreground">
          {narrative.confidenceLabel}
        </p>
        <p
          data-testid="owner-assessment-confidence-message"
          className="mt-0.5 text-[var(--muted-foreground-accessible)]"
        >
          {narrative.confidenceMessage}
        </p>
      </div>
      {narrative.nextDataStep && (
        <div className="mt-3" data-testid="owner-assessment-next-data-step-block">
          <p className="text-xs font-semibold uppercase tracking-[0.08em] text-muted-foreground">
            Next data step
          </p>
          <p data-testid="owner-assessment-next-data-step" className="mt-1 text-sm text-foreground">
            {narrative.nextDataStep}
          </p>
          <div className="mt-2">
            <Link href="/owner/data">
              <Button size="sm" variant="outline" data-testid="owner-assessment-update-data-cta">
                Update business data
              </Button>
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}

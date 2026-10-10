"use client";

/**
 * "Your next move" on the canonical Cockpit: the action the owner accepted, when it is due, a notice if their
 * numbers changed since, and the prompt to check the result. Presentation only — it links to the existing
 * outcomes surface for the check; it is not a second home page and holds no logic.
 */
import { useEffect, useState } from "react";
import Link from "next/link";
import { firstRunApi, type NextMoveView } from "@/lib/owner-first-run-client";

export function AcceptedNextMoveCard({ businessId }: { businessId: string }) {
  const [move, setMove] = useState<NextMoveView | null>(null);
  useEffect(() => {
    let cancelled = false;
    void firstRunApi
      .nextMove(businessId)
      .then((r) => {
        if (!cancelled) setMove(r.nextMove);
      })
      .catch(() => {
        if (!cancelled) setMove(null);
      });
    return () => {
      cancelled = true;
    };
  }, [businessId]);

  if (!move) return null;
  return (
    <section className="rounded-lg border border-border bg-background p-4" data-testid="accepted-next-move" aria-label="Your next move">
      <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Your next move</p>
      <p className="mt-1 text-base font-semibold text-foreground">{move.commitment}</p>
      {move.prompt && <p className="mt-1 text-sm text-foreground" data-testid="accepted-next-move-prompt">{move.prompt}</p>}
      {move.evidenceChangedSince && (
        <p className="mt-2 text-sm text-muted-foreground" data-testid="accepted-next-move-evidence">
          Your numbers have changed since you accepted this. OpsIQ re-checks what comes first from the latest figures.
        </p>
      )}
      <Link
        href="/owner/outcomes"
        className="mt-3 inline-flex min-h-11 items-center text-sm font-medium text-[var(--primary-text)] underline"
        data-testid="accepted-next-move-link"
      >
        {move.status === "DUE_FOR_CHECK" ? "Check how it went" : "See progress"}
      </Link>
    </section>
  );
}

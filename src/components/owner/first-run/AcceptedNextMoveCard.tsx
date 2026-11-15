"use client";

/**
 * "Your next move" on the canonical Cockpit: the action the owner accepted, when it is due, and the prompt to check
 * the result — but ONLY while the evidence it rests on still stands. When the owner's numbers changed and the action
 * is no longer current (NEEDS_REASSESSMENT / SUPERSEDED / STALE, decided on the server), it is shown as an earlier
 * action in history with the reason, never under "Your next move". Presentation only: it holds no logic.
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

  if (move.validity !== "CURRENT") {
    return (
      <section
        className="rounded-lg border border-border bg-muted/30 p-4"
        data-testid="accepted-next-move"
        data-validity={move.validity}
        aria-label={move.validityHeading ?? "Earlier action"}
      >
        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground" data-testid="accepted-next-move-validity-heading">
          {move.validityHeading}
        </p>
        <p className="mt-1 text-sm text-muted-foreground" data-testid="accepted-next-move-earlier-commitment">{move.commitment}</p>
        {move.validityNote && <p className="mt-2 text-sm text-foreground" data-testid="accepted-next-move-validity-note">{move.validityNote}</p>}
        <Link
          href="/owner/first-run"
          className="mt-3 inline-flex min-h-11 items-center text-sm font-medium text-[var(--primary-text)] underline"
          data-testid="accepted-next-move-link"
        >
          Review your updated read
        </Link>
      </section>
    );
  }

  return (
    <section className="rounded-lg border border-border bg-background p-4" data-testid="accepted-next-move" data-validity="CURRENT" aria-label="Your next move">
      <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Your next move</p>
      <p className="mt-1 text-base font-semibold text-foreground">{move.commitment}</p>
      {move.prompt && <p className="mt-1 text-sm text-foreground" data-testid="accepted-next-move-prompt">{move.prompt}</p>}
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

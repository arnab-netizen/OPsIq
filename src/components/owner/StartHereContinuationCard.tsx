"use client";

/**
 * Home's "one obvious guided continuation" while setup is meaningfully incomplete — see
 * src/domain/owner-mode/start-here.ts (isStartHereMature) for what "sufficiently mature" means.
 * Self-contained: does its own fetch so the (already large) cockpit page doesn't need to
 * restructure its own data-loading to support this. Renders nothing once setup matures, and
 * nothing at all while loading or on error — this is a helpful nudge, never a blocking gate.
 */

import { useEffect, useState } from "react";
import Link from "next/link";
import { Button } from "@/ui/primitives";
import {
  computeStartHereSteps,
  nextStartHereStep,
  isStartHereMature,
} from "@/domain/owner-mode/start-here";

/* eslint-disable @typescript-eslint/no-explicit-any -- runtime onboarding payload is untyped */

export function StartHereContinuationCard({ businessId }: { businessId: string | null }) {
  const [next, setNext] = useState<{ label: string; why: string; href: string } | null>(null);

  useEffect(() => {
    if (!businessId) return;
    let cancelled = false;
    Promise.all([
      fetch(`/api/owner/onboarding?businessId=${businessId}`).then((r) => (r.ok ? r.json() : null)),
      fetch(`/api/owner/process-execution`).then((r) => (r.ok ? r.json() : null)),
    ])
      .then(([onboarding, processExecution]: [any, any]) => {
        if (cancelled || !onboarding || onboarding.found === false) return;
        const tasks: any[] = processExecution?.tasks ?? [];
        const steps = computeStartHereSteps({
          businessBasicsComplete: true,
          canRunFirstDiagnosis: onboarding.canRunFirstDiagnosis === true,
          missingMinimum: onboarding.missingMinimum ?? [],
          requirements: onboarding.requirements,
          hasEngagedAPriority: tasks.some((t) => t.status && t.status !== "PROPOSED"),
        });
        if (isStartHereMature(steps)) return; // setup mature: no continuation card
        const n = nextStartHereStep(steps);
        if (n) setNext({ label: n.label, why: n.why, href: n.href });
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [businessId]);

  if (!next) return null;

  return (
    <div
      data-testid="start-here-continuation-card"
      className="mb-4 rounded-lg border border-primary/30 bg-primary/5 p-4"
    >
      <p className="text-sm font-medium text-foreground">Continue setting up OpsIQ</p>
      <p className="mt-1 text-sm text-muted-foreground">
        Next: {next.label}
      </p>
      <p className="mt-0.5 text-xs text-muted-foreground">Why: {next.why}</p>
      <div className="mt-3">
        <Link href="/owner/start-here">
          <Button size="sm">Continue setup</Button>
        </Link>
      </div>
    </div>
  );
}

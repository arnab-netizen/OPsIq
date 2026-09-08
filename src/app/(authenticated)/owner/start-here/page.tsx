"use client";

/**
 * START HERE — persistent, resumable guided setup. A real usability test's headline failure was
 * "I don't know where to start." This is not a tooltip tour: every step's completion is derived
 * from real backend state (see src/domain/owner-mode/start-here.ts), so leaving and returning
 * shows exactly the same progress — there is no separate "seen the tour" flag to lose.
 */

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Button, CardDashboardSkeleton } from "@/ui/primitives";
import { useActiveBusiness } from "@/context/active-business-context";
import {
  computeStartHereSteps,
  nextStartHereStep,
  type StartHereStep,
} from "@/domain/owner-mode/start-here";

/* eslint-disable @typescript-eslint/no-explicit-any, react-hooks/set-state-in-effect -- runtime onboarding payload is untyped; fetch-on-mount is intentional */

const FETCH_TIMEOUT_MS = 10_000;

async function api(path: string) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(path, { headers: { "Content-Type": "application/json" }, signal: controller.signal });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data?.error?.message || data?.error || `Request failed (${res.status})`);
    return data;
  } finally {
    clearTimeout(timer);
  }
}

export default function StartHerePage() {
  const { activeBusinessId, activeBusiness, needsBusinessRecovery, loading: contextLoading } = useActiveBusiness();
  const [steps, setSteps] = useState<StartHereStep[] | null>(null);
  const [canRunFirstDiagnosis, setCanRunFirstDiagnosis] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (businessId: string) => {
    setLoading(true);
    setError(null);
    try {
      const [onboarding, processExecution] = await Promise.all([
        api(`/api/owner/onboarding?businessId=${businessId}`),
        api(`/api/owner/process-execution`),
      ]);
      if (onboarding.found === false) {
        setSteps(null);
        return;
      }
      const tasks: any[] = processExecution?.tasks ?? [];
      const hasEngagedAPriority = tasks.some((t) => t.status && t.status !== "PROPOSED");
      const computed = computeStartHereSteps({
        businessBasicsComplete: true,
        canRunFirstDiagnosis: onboarding.canRunFirstDiagnosis === true,
        missingMinimum: onboarding.missingMinimum ?? [],
        requirements: onboarding.requirements,
        hasEngagedAPriority,
      });
      setSteps(computed);
      setCanRunFirstDiagnosis(onboarding.canRunFirstDiagnosis === true);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't load your setup progress.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (contextLoading || needsBusinessRecovery) return;
    if (!activeBusinessId) {
      setLoading(false);
      return;
    }
    void load(activeBusinessId);
  }, [contextLoading, activeBusinessId, needsBusinessRecovery, load]);

  if (contextLoading || loading) {
    return (
      <div className="max-w-2xl mx-auto px-4 py-8">
        <CardDashboardSkeleton />
      </div>
    );
  }

  if (needsBusinessRecovery) {
    return (
      <div className="max-w-2xl mx-auto px-4 py-8 text-sm text-muted-foreground">
        Choose a business above to continue setup.
      </div>
    );
  }

  if (!activeBusinessId || !steps) {
    return (
      <div className="max-w-2xl mx-auto px-4 py-8">
        <h1 className="font-display text-[1.75rem] font-semibold tracking-tight mb-2">Start here</h1>
        <p className="text-sm text-muted-foreground mb-4">
          Add your business first, then come back here to get OpsIQ working for it.
        </p>
        <Link href="/owner/data">
          <Button>Add your business</Button>
        </Link>
      </div>
    );
  }

  const businessName = activeBusiness?.name ?? "your business";
  const next = nextStartHereStep(steps);
  const completedCount = steps.filter((s) => s.complete).length;

  return (
    <div className="max-w-2xl mx-auto px-4 py-8" data-testid="start-here-page">
      <h1 className="font-display text-[1.75rem] font-semibold tracking-tight mb-1">Start here</h1>
      <p className="text-sm text-muted-foreground mb-6">
        Get OpsIQ working for {businessName}
      </p>

      {error && <p className="text-sm text-destructive mb-4">{error}</p>}

      {canRunFirstDiagnosis && (
        <div className="mb-6 border-l-2 pl-5 py-1" style={{ borderColor: "var(--accent-ink)" }} data-testid="start-here-first-read-available">
          <p className="text-sm font-medium text-foreground">
            You already have enough information for a first financial read.
          </p>
          <Link href="/owner/cockpit" className="mt-2 inline-block text-sm font-medium text-[var(--primary-text)] underline hover:no-underline">
            See my first result →
          </Link>
        </div>
      )}

      {/* A numbered, left-rule list -- the same treatment Priorities uses for its ranked list --
          instead of five uniform bordered cards with a checkmark-in-a-circle icon each. That card
          pattern is a generic "onboarding checklist" recipe shared by countless SaaS products
          (found during a formal cross-screen audit); this app's own list pattern already fits an
          ordered setup sequence at least as well and reads as the same product as every other
          page here. */}
      <ol className="flex flex-col gap-5" data-testid="start-here-steps">
        {steps.map((step, i) => {
          const isNext = next?.id === step.id;
          return (
            <li
              key={step.id}
              data-testid={`start-here-step-${step.id}`}
              className="border-l-2 pl-5 py-0.5"
              style={{ borderColor: step.complete ? "var(--success-text)" : isNext ? "var(--accent-ink)" : "var(--border)" }}
            >
              <div className="flex flex-wrap items-baseline gap-2">
                <span
                  className="font-display text-base font-semibold tabular-nums"
                  style={{ color: step.complete ? "var(--success-text)" : isNext ? "var(--accent-ink)" : "var(--muted-foreground)" }}
                >
                  {step.complete ? "✓" : i + 1}
                </span>
                <p className={`text-sm font-medium ${isNext ? "text-foreground" : "text-muted-foreground"}`}>
                  {step.label}
                  {!step.applicable && (
                    <span className="ml-2 text-xs font-normal text-muted-foreground">(Not needed for your business)</span>
                  )}
                </p>
              </div>
              {isNext && (
                <>
                  <p className="mt-1.5 text-sm text-muted-foreground">{step.why}</p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    If you skip this for now: {step.ifSkipped}
                  </p>
                  <Link href={step.href} className="mt-2.5 inline-block text-sm font-medium text-[var(--primary-text)] underline hover:no-underline">
                    Continue →
                  </Link>
                </>
              )}
            </li>
          );
        })}
      </ol>

      {!next && (
        <div className="mt-6 border-l-2 pl-5 py-1" style={{ borderColor: "var(--success-text)" }}>
          <p className="text-sm font-medium text-foreground">Setup is complete.</p>
          <p className="mt-1 text-sm text-muted-foreground">
            You can always come back here, or improve OpsIQ&rsquo;s understanding further at any time.
          </p>
        </div>
      )}

      <div className="mt-8 border-t border-border pt-6">
        <p className="text-sm font-medium text-foreground mb-2">Improve OpsIQ&rsquo;s understanding</p>
        <p className="text-sm text-muted-foreground mb-3">
          None of this is required — adding more detail just makes OpsIQ&rsquo;s read of {businessName} more accurate.
        </p>
        <div className="flex flex-wrap gap-2">
          <Link href="/owner/finance"><Button size="sm" variant="outline">Add more financial detail</Button></Link>
          <Link href="/owner/customers"><Button size="sm" variant="outline">Add customer detail</Button></Link>
          <Link href="/owner/operations"><Button size="sm" variant="outline">Add operations detail</Button></Link>
        </div>
      </div>

      <p className="mt-8 text-xs text-muted-foreground">
        {completedCount} of {steps.length} steps done. You can leave and come back anytime — nothing is lost.
      </p>
    </div>
  );
}

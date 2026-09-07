"use client";

/**
 * Owner activation panel — the interim bridge between the current dashboard and the real owner data
 * path, added without redesigning the dashboard.
 *
 * It reads the EXISTING onboarding contract (`GET /api/owner/onboarding`), which derives setup steps,
 * missing minimum data and an honest pre-diagnosis confidence from persisted rows. It computes
 * nothing itself and never fabricates a completeness value.
 *
 * It renders only while the workspace is not yet ready — once `canRunFirstDiagnosis` is true and the
 * minimum set is complete, it removes itself rather than becoming permanent furniture.
 */
/* eslint-disable react-hooks/set-state-in-effect -- fetch-on-mount is the established owner-page pattern */
import { useCallback, useEffect, useState } from "react";
import Link from "next/link";

interface MissingItem {
  category: string;
  label: string;
  severity: "critical" | "high" | "medium";
  why: string;
}

interface ActivationState {
  minimumSuppliedCount: number;
  minimumRequiredCount: number;
  minimumComplete: boolean;
  canRunFirstDiagnosis: boolean;
  confidenceBeforeDiagnosis: string;
  missingMinimum: MissingItem[];
  firstAction: string;
  found: boolean;
}

export default function OwnerActivationPanel() {
  const [state, setState] = useState<ActivationState | null>(null);
  const [hasBusiness, setHasBusiness] = useState<boolean | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/owner/businesses", { headers: { "Content-Type": "application/json" } });
      if (!res.ok) return;
      const data = await res.json();
      const list: Array<{ id: string }> = data?.businesses ?? [];
      setHasBusiness(list.length > 0);
      if (list.length === 0) return;

      const onboarding = await fetch(`/api/owner/onboarding?businessId=${encodeURIComponent(list[0].id)}`, {
        headers: { "Content-Type": "application/json" },
      });
      if (!onboarding.ok) return;
      setState((await onboarding.json()) as ActivationState);
    } catch {
      // Silent: this panel is additive guidance. A failure must not break the dashboard.
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  // No business at all — the hard blocker.
  if (hasBusiness === false) {
    return (
      <div
        data-testid="owner-activation-panel"
        className="mt-4 rounded-lg border border-amber-200 bg-amber-50 p-6"
      >
        <h3 className="text-base font-semibold text-amber-900">Set up your business to get started</h3>
        <p className="mt-1 text-sm text-amber-900">
          OpsIQ does not yet have enough reliable business information to generate a trustworthy
          diagnosis. It needs a business profile before it can hold anything else.
        </p>
        <Link
          href="/owner/data"
          className="mt-4 inline-flex h-11 items-center justify-center rounded-lg bg-primary px-6 text-sm font-medium text-primary-foreground shadow-sm transition-colors hover:bg-primary/90"
        >
          Go to My Business
        </Link>
      </div>
    );
  }

  if (!state) return null;

  // Ready and complete — the panel has done its job and gets out of the way.
  if (state.minimumComplete && state.canRunFirstDiagnosis) return null;

  const pct =
    state.minimumRequiredCount > 0
      ? Math.round((state.minimumSuppliedCount / state.minimumRequiredCount) * 100)
      : 0;
  const critical = state.missingMinimum.filter((m) => m.severity === "critical").slice(0, 3);

  return (
    <div
      data-testid="owner-activation-panel"
      className="mt-4 rounded-lg border border-border bg-muted/40 p-6"
    >
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h3 className="text-base font-semibold text-foreground">Finish setting up</h3>
        <span className="text-sm text-muted-foreground">
          {state.minimumSuppliedCount} of {state.minimumRequiredCount} essentials added
        </span>
      </div>

      <div
        className="mt-2 h-2 w-full overflow-hidden rounded-full bg-muted"
        role="progressbar"
        aria-valuenow={pct}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label="Essential data added"
      >
        <div className="h-full bg-primary" style={{ width: `${pct}%` }} />
      </div>

      {!state.canRunFirstDiagnosis && (
        <p
          data-testid="owner-activation-insufficient"
          className="mt-4 rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900"
        >
          OpsIQ does not yet have enough reliable business information to generate a trustworthy
          diagnosis.
        </p>
      )}

      {critical.length > 0 && (
        <div className="mt-4">
          <p className="text-sm font-medium text-foreground">Still missing:</p>
          <ul className="mt-1 space-y-1 text-sm text-muted-foreground">
            {critical.map((m) => (
              <li key={m.category}>
                <span className="font-medium text-foreground">{m.label}</span> — {m.why}
              </li>
            ))}
          </ul>
        </div>
      )}

      {state.firstAction && (
        <p className="mt-3 text-sm text-foreground">
          <span className="font-medium">Do this next: </span>
          {state.firstAction}
        </p>
      )}

      <Link
        href="/owner/data"
        className="mt-4 inline-flex h-11 items-center justify-center rounded-lg bg-primary px-6 text-sm font-medium text-primary-foreground shadow-sm transition-colors hover:bg-primary/90"
      >
        Go to My Business
      </Link>
    </div>
  );
}

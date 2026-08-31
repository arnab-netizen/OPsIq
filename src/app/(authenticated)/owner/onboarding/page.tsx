"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Badge, Button } from "@/ui/primitives";
import { BusinessContextSelector } from "@/components/owner/BusinessContextSelector";
import { inputTargetForCategory } from "@/domain/owner-mode/owner-data-hub";
import type { OwnerInputCategory } from "@/domain/owner-mode/input-catalog";

/* eslint-disable @typescript-eslint/no-explicit-any, react-hooks/set-state-in-effect -- runtime onboarding payload is untyped; fetch-on-mount is intentional */

const CONFIDENCE_VARIANT: Record<string, "success" | "default" | "warning" | "destructive" | "muted"> = {
  high: "success",
  medium: "warning",
  low: "destructive",
  none: "muted",
};

const SEVERITY_VARIANT: Record<string, "warning" | "destructive" | "muted"> = {
  critical: "destructive",
  high: "warning",
  medium: "muted",
};

const FETCH_TIMEOUT_MS = 10_000;

async function api(path: string) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(path, { headers: { "Content-Type": "application/json" }, signal: controller.signal });
    if (!res.ok) throw new Error(`Request failed (${res.status})`);
    return await res.json();
  } catch (e) {
    if (e instanceof Error && e.name === "AbortError") throw new Error("Request timed out. Check your connection and try again.");
    throw e;
  } finally {
    clearTimeout(timer);
  }
}

export default function OwnerOnboardingPage() {
  const [businesses, setBusinesses] = useState<any[] | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [state, setState] = useState<any | null>(null);
  const [readiness, setReadiness] = useState<any | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadState = useCallback(async (businessId: string) => {
    setError(null);
    try {
      setState(await api(`/api/owner/onboarding?businessId=${businessId}`));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load onboarding");
      setState(null);
    }
    try {
      setReadiness(await api(`/api/owner/readiness?businessId=${businessId}`));
    } catch {
      setReadiness(null);
    }
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const biz = await api("/api/owner/businesses");
      const list = biz.businesses ?? [];
      setBusinesses(list);
      if (list.length > 0) {
        setSelected(list[0].id);
        await loadState(list[0].id);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load");
    } finally {
      setLoading(false);
    }
  }, [loadState]);

  useEffect(() => {
    load();
  }, [load]);

  if (loading) return <div className="p-8">Loading onboarding…</div>;

  return (
    <div className="mx-auto max-w-3xl py-8 px-4" data-testid="owner-onboarding">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-foreground">Get started with OpsIQ</h1>
        <p className="text-sm text-muted-foreground">
          A few minutes of setup, then OpsIQ tells you the single most important thing to do — and what not to do yet.
        </p>
      </div>

      {error && (
        <div className="mb-4 rounded-md border border-destructive/20 bg-destructive/5 p-3 text-sm text-destructive">
          {error} <Button className="ml-2 min-h-[44px]" onClick={() => load()}>Retry</Button>
        </div>
      )}

      {(businesses?.length ?? 0) === 0 ? (
        <div className="border rounded-lg p-8 text-center text-muted-foreground" data-testid="onboarding-empty">
          No business yet. Create one in{" "}
          <Link href="/owner/finance" className="underline">Finance</Link> or{" "}
          <Link href="/owner/intake" className="underline">Data Intake</Link> to begin onboarding.
        </div>
      ) : (
        <>
          <div className="mb-6">
            <BusinessContextSelector
              businesses={businesses ?? []}
              selectedId={selected}
              onChange={(businessId) => {
                setSelected(businessId);
                loadState(businessId);
              }}
            />
          </div>

          {readiness?.found && (
            <section className="border rounded-lg p-4 bg-white mb-6" data-testid="onboarding-readiness">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="text-xs uppercase text-muted-foreground">Owner pilot readiness</div>
                <div className="flex flex-wrap gap-2">
                  <Badge variant={readiness.overallScore >= 70 ? "success" : readiness.overallScore >= 40 ? "warning" : "destructive"}>
                    {Math.round(readiness.overallScore)}/100
                  </Badge>
                  <Badge variant={readiness.pilotReady ? "success" : "warning"}>
                    {readiness.pilotReady ? "Pilot-ready" : "Keep setting up"}
                  </Badge>
                </div>
              </div>
              {readiness.blockers.length > 0 && (
                <ul className="list-disc ml-5 mt-2 text-xs text-muted-foreground">
                  {readiness.blockers.slice(0, 3).map((b: string, i: number) => <li key={i}>{b}</li>)}
                </ul>
              )}
            </section>
          )}

          {state?.found && (
            <div className="space-y-6">
              {/* Steps */}
              <section className="border rounded-lg p-4 bg-white" data-testid="onboarding-steps">
                <div className="text-xs uppercase text-muted-foreground mb-3">Your setup steps</div>
                <ol className="space-y-2">
                  {state.steps.map((s: any) => (
                    <li key={s.id} className="flex items-center gap-3 text-sm">
                      <span className={`inline-flex h-6 w-6 items-center justify-center rounded-full text-xs ${s.complete ? "bg-success/20 text-success" : "bg-muted text-muted-foreground"}`}>
                        {s.complete ? "✓" : "•"}
                      </span>
                      <span className={s.complete ? "text-foreground" : "text-muted-foreground"}>{s.label}</span>
                    </li>
                  ))}
                </ol>
              </section>

              {/* Confidence before diagnosis */}
              <section className="border rounded-lg p-4 bg-white" data-testid="onboarding-confidence">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="text-xs uppercase text-muted-foreground">Confidence before diagnosis</div>
                  <Badge variant={CONFIDENCE_VARIANT[state.confidenceBeforeDiagnosis] ?? "muted"}>
                    {state.confidenceBeforeDiagnosis}
                  </Badge>
                </div>
                <p className="mt-2 text-sm text-muted-foreground">
                  {state.minimumSuppliedCount}/{state.minimumRequiredCount} minimum inputs supplied.{" "}
                  {state.canRunFirstDiagnosis
                    ? "You can run a limited first diagnosis."
                    : "Add the highlighted data to unlock your first diagnosis."}
                </p>
              </section>

              {/* Missing minimum data */}
              {state.missingMinimum.length > 0 && (
                <section className="border rounded-lg p-4 bg-white" data-testid="onboarding-missing">
                  <div className="text-xs uppercase text-muted-foreground mb-2">What data is still missing</div>
                  <ul className="space-y-3">
                    {state.missingMinimum.map((m: any) => {
                      const target = inputTargetForCategory(m.category as OwnerInputCategory);
                      return (
                        <li key={m.category} className="rounded-md border p-3">
                          <div className="flex flex-wrap items-center justify-between gap-2">
                            <span className="min-w-0 break-words text-sm font-medium">{m.label}</span>
                            <Badge variant={SEVERITY_VARIANT[m.severity] ?? "muted"}>{m.severity}</Badge>
                          </div>
                          <p className="mt-1 text-xs text-muted-foreground">{m.why}</p>
                          <p className="text-xs text-muted-foreground">Affects: {m.decisionAffected}</p>
                          <Link
                            href={target.href}
                            className="mt-2 inline-block text-xs font-medium text-primary underline hover:no-underline"
                          >
                            {target.actionLabel} {m.label.toLowerCase()} →
                          </Link>
                        </li>
                      );
                    })}
                  </ul>
                </section>
              )}

              {/* First action + what not to do */}
              <section className="border-2 border-foreground/20 rounded-lg p-4 bg-white" data-testid="onboarding-first-action">
                <div className="text-xs uppercase text-muted-foreground mb-1">Your first action</div>
                <p className="text-sm font-medium">{state.firstAction}</p>
                {state.whatNotToDo.length > 0 && (
                  <div className="mt-3 rounded-md border border-warning/30 bg-warning/5 p-3 text-sm" data-testid="onboarding-do-not-do">
                    <strong>What not to do yet:</strong>
                    <ul className="list-disc ml-5">{state.whatNotToDo.map((x: string, i: number) => <li key={i}>{x}</li>)}</ul>
                  </div>
                )}
              </section>

              {/* Next best upload + proof + delegation */}
              <section className="grid gap-3 sm:grid-cols-2">
                <div className="rounded-md border p-3 text-sm bg-white" data-testid="onboarding-next-upload">
                  <strong>Next best upload:</strong>{" "}
                  {state.nextBestUpload ? state.nextBestUpload.replace(/_/g, " ") : "you have what you need to start"}
                  <div className="mt-2">
                    <Link
                      href={
                        state.nextBestUpload
                          ? inputTargetForCategory(state.nextBestUpload as OwnerInputCategory).href
                          : "/owner/intake"
                      }
                    >
                      <Button className="min-h-[44px]">Add this data →</Button>
                    </Link>
                  </div>
                </div>
                <div className="rounded-md border p-3 text-sm bg-white" data-testid="onboarding-proof">
                  <strong>Proof you&apos;ll need:</strong>
                  <p className="text-muted-foreground mt-1">{state.proofExpectation}</p>
                </div>
              </section>

              <section className="rounded-md border p-3 text-sm bg-white" data-testid="onboarding-delegation">
                <strong>How OpsIQ helps you delegate:</strong>
                <p className="text-muted-foreground mt-1">{state.delegationGuidance}</p>
              </section>

              <div className="flex flex-wrap gap-2">
                <Link href="/owner"><Button className="min-h-[44px]">Go to command center →</Button></Link>
                <Link href="/owner/intake"><Button className="min-h-[44px]">Add more data</Button></Link>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}

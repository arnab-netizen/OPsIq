"use client";

/**
 * FirstRunFlow — the single owner first-run surface. It asks the server (the one first-run routing contract)
 * which step the owner is on and renders that step; it holds no routing or scoring logic of its own.
 * Every step is resumable: leaving and returning lands on the same step because the state is derived from
 * saved records, not from anything held in the browser.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Button, PageContainer, PageHeader } from "@/ui/primitives";
import { useActiveBusiness } from "@/context/active-business-context";
import { QuickFinancialPicture } from "@/components/owner/QuickFinancialPicture";
import { FirstRunBusinessStep } from "@/components/owner/first-run/FirstRunBusinessStep";
import { FirstMoneyReadCard } from "@/components/owner/first-run/FirstMoneyReadCard";
import { FirstResultCorrection } from "@/components/owner/first-run/FirstResultCorrection";
import { FirstResultImprovement } from "@/components/owner/first-run/FirstResultImprovement";
import { FirstValueFeedback } from "@/components/owner/first-run/FirstValueFeedback";
import {
  firstRunApi,
  newIdempotencyKey,
  type CorrectionResult,
  type FirstMoneyReadView,
  type FirstRunContext,
} from "@/lib/owner-first-run-client";
import { retryDiagnosis, type QuickStartApi } from "@/lib/owner-quick-start";
import { httpResponseErrorFromBody } from "@/lib/operator-safe-errors";
import { classifyOperatorError } from "@/lib/operator-error-governance";
import { QUICK_ENTRY_FIELDS } from "@/domain/owner-finance/quick-entry";
import { EVIDENCE_QUALITY_LABEL, type EvidenceQuality } from "@/domain/owner-finance/evidence-quality";
import { humanizeMetricKey } from "@/lib/metric-label";

const diagnosisApi: QuickStartApi = async (path, init) => {
  const res = await fetch(path, { ...init, headers: { "Content-Type": "application/json" } });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw httpResponseErrorFromBody(res.status, data);
  return data;
};

type Mode = "result" | "correcting" | "improving";

const TIER_WORDS = { HIGH: "high", MEDIUM: "moderate", LOW: "low", BLOCKED: "not enough to rely on" } as const;
const fieldLabel = (key: string): string =>
  key === "evidenceQuality" ? "how reliable the numbers are" : (QUICK_ENTRY_FIELDS.find((f) => f.name === key)?.label ?? humanizeMetricKey(key)).toLowerCase();
const qualityWords = (q: EvidenceQuality | null): string => (q ? EVIDENCE_QUALITY_LABEL[q] : "not stated");

function friendly(err: unknown, context: "load" | "save" | "action"): string {
  return classifyOperatorError(err instanceof Error ? err : new Error(String(err)), { context }).recovery;
}

export function FirstRunFlow() {
  const { refreshBusinesses, setActiveBusinessId } = useActiveBusiness();
  const [ctx, setCtx] = useState<FirstRunContext | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [view, setView] = useState<FirstMoneyReadView | null>(null);
  const [mode, setMode] = useState<Mode>("result");
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [correction, setCorrection] = useState<CorrectionResult | null>(null);
  const [diagnosing, setDiagnosing] = useState<"idle" | "running" | "failed">("idle");
  const viewedFor = useRef<string | null>(null);
  const inFlight = useRef(false);
  const acceptKey = useRef(newIdempotencyKey());

  const loadContext = useCallback(async () => {
    setLoadError(null);
    try {
      setCtx(await firstRunApi.context());
    } catch (err) {
      setLoadError(`We couldn't load your setup. Nothing was lost. ${friendly(err, "load")}`);
    }
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- fetch on mount
    void loadContext();
  }, [loadContext]);

  const businessId = ctx?.business?.id ?? null;
  const hasResult = ctx?.state === "FIRST_RESULT" || ctx?.state === "ESTABLISHED";

  const loadResult = useCallback(async () => {
    if (!businessId) return;
    try {
      const next = await firstRunApi.result(businessId);
      setView(next);
      if (viewedFor.current !== next.cycleId) {
        viewedFor.current = next.cycleId;
        void firstRunApi.markViewed(businessId).catch(() => undefined);
      }
    } catch (err) {
      setLoadError(`We couldn't load your first read. Your numbers are saved. ${friendly(err, "load")}`);
    }
  }, [businessId]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- fetch when the result exists
    if (hasResult && !ctx?.diagnosisStale) void loadResult();
  }, [hasResult, ctx?.diagnosisStale, loadResult]);

  const runDiagnosis = useCallback(async () => {
    if (!businessId || inFlight.current) return;
    if (!ctx?.currentSnapshotId) {
      setDiagnosing("failed");
      return;
    }
    inFlight.current = true;
    setDiagnosing("running");
    try {
      const result = await retryDiagnosis(diagnosisApi, businessId, ctx.currentSnapshotId);
      if (result.status === "diagnosed") {
        setDiagnosing("idle");
        await loadContext();
        await loadResult();
      } else {
        setDiagnosing("failed");
      }
    } finally {
      inFlight.current = false;
    }
  }, [businessId, ctx?.currentSnapshotId, loadContext, loadResult]);

  // State C: the evidence is enough, the read is missing — produce it through the canonical diagnosis path.
  const autoRan = useRef(false);
  useEffect(() => {
    if (ctx?.state === "NEEDS_DIAGNOSIS" && !autoRan.current) {
      autoRan.current = true;
      void runDiagnosis();
    }
  }, [ctx?.state, runDiagnosis]);

  async function onBusinessCreated(business: { id: string }) {
    await refreshBusinesses();
    setActiveBusinessId(business.id);
    await loadContext();
  }

  async function accept() {
    if (!businessId || inFlight.current) return;
    inFlight.current = true;
    setBusy(true);
    setActionError(null);
    try {
      await firstRunApi.accept(businessId, acceptKey.current);
      await Promise.all([loadResult(), loadContext()]);
    } catch (err) {
      setActionError(`We couldn't save that as your next move. Nothing was changed. ${friendly(err, "action")}`);
    } finally {
      inFlight.current = false;
      setBusy(false);
    }
  }

  async function afterCorrection(result: CorrectionResult) {
    setCorrection(result);
    setView(result.after);
    setMode("result");
    await loadContext();
  }

  return (
    <PageContainer>
      <PageHeader title="Your first read" description="A few answers, then OpsIQ shows you where to look first." />
      <div className="mx-auto w-full max-w-2xl space-y-4 px-0" data-testid="first-run-flow">
        {loadError && (
          <div role="alert" className="rounded-md border border-destructive/20 bg-destructive/5 p-3 text-sm text-destructive" data-testid="first-run-load-error">
            <p>{loadError}</p>
            <Button type="button" variant="secondary" className="mt-2 min-h-11" onClick={() => void (hasResult ? loadResult() : loadContext())}>Try again</Button>
          </div>
        )}
        {!ctx && !loadError && <p className="text-sm text-muted-foreground">Loading…</p>}

        {ctx?.state === "NEEDS_BUSINESS" && (
          <FirstRunBusinessStep suggestedName={ctx.suggestedBusinessName} onCreated={(b) => void onBusinessCreated(b)} onConflict={() => void loadContext()} />
        )}

        {ctx?.state === "NEEDS_EVIDENCE" && ctx.business && (
          <div data-testid="first-run-evidence-step">
            <p className="mb-2 text-sm text-muted-foreground">
              Just four numbers for <span className="font-medium text-foreground">{ctx.business.name}</span>. Estimates are fine — and you will say how reliable they are.
            </p>
            <QuickFinancialPicture
              key={ctx.business.id}
              businessId={ctx.business.id}
              currency={ctx.business.currency}
              omitMoneyLink
              requireEvidenceQuality
              onFirstRead={() => void loadContext()}
              onSaved={() => undefined}
            />
          </div>
        )}

        {ctx?.state === "NEEDS_DIAGNOSIS" && (
          <div className="rounded-lg border border-border bg-background p-4" data-testid="first-run-diagnosis-step" aria-live="polite">
            {diagnosing === "failed" ? (
              <>
                <p role="alert" className="text-sm text-destructive">Your numbers are saved, but your first read didn&rsquo;t run.</p>
                <Button type="button" className="mt-2 min-h-11" onClick={() => void runDiagnosis()}>Try the first read again</Button>
              </>
            ) : (
              <p className="text-sm text-foreground">Working out your first Money read…</p>
            )}
          </div>
        )}

        {hasResult && ctx?.diagnosisStale && (
          <div className="rounded-lg border border-border bg-background p-4 text-sm" data-testid="first-run-update-read">
            <p className="font-medium text-foreground">Your numbers have changed since your last read.</p>
            <p className="mt-1 text-muted-foreground">Your earlier numbers are kept on record. OpsIQ will work out a fresh read from the new ones.</p>
            <Button type="button" className="mt-3 min-h-11" disabled={diagnosing === "running"} onClick={() => void runDiagnosis()}>
              {diagnosing === "running" ? "Updating…" : "Update my read"}
            </Button>
            {diagnosing === "failed" && <p role="alert" className="mt-2 text-destructive">The update didn&rsquo;t run. Your numbers are saved &mdash; try again.</p>}
          </div>
        )}

        {hasResult && view && !ctx?.diagnosisStale && (
          <>
            {correction && (
              <div className="rounded-lg border border-border bg-background p-3 text-sm" data-testid="first-result-changes" aria-live="polite">
                <p className="font-medium text-foreground">What changed after your correction</p>
                <ul className="mt-1 list-disc space-y-0.5 pl-5 text-muted-foreground">
                  <li>Corrected: {correction.changedFields.map(fieldLabel).join(", ")}</li>
                  <li>
                    How sure OpsIQ is: {TIER_WORDS[correction.before.confidenceTier]} → {TIER_WORDS[correction.after.read.confidenceTier]}
                  </li>
                  <li>
                    How reliable your numbers are: {qualityWords(correction.before.evidenceQuality)} → {qualityWords(correction.after.read.evidenceQuality)}
                  </li>
                  <li>
                    Recommendation: {correction.before.recommendedAction ?? "none"}
                    {correction.before.recommendedAction === correction.after.read.recommendedAction ? " (unchanged)" : ` → ${correction.after.read.recommendedAction ?? "none"}`}
                  </li>
                </ul>
                <p className="mt-1 text-muted-foreground">Your earlier numbers are kept on record.</p>
              </div>
            )}

            <FirstMoneyReadCard
              read={view.read}
              stale={view.stale}
              decisionState={view.decisionState}
              busy={busy}
              onAccept={() => void accept()}
              onCorrect={() => setMode("correcting")}
              onImprove={() => setMode("improving")}
            />
            {actionError && <p role="alert" className="rounded-md border border-destructive/20 bg-destructive/5 p-3 text-sm text-destructive" data-testid="first-run-action-error">{actionError}</p>}

            {mode === "correcting" && (
              <FirstResultCorrection
                businessId={view.businessId}
                snapshotId={view.snapshotId}
                currency={view.currency}
                onDone={(r) => void afterCorrection(r)}
                onCancel={() => setMode("result")}
              />
            )}
            {mode === "improving" && <FirstResultImprovement businessId={view.businessId} onClose={() => setMode("result")} />}

            <Link
              href="/owner/cockpit"
              className="inline-flex min-h-11 w-full items-center justify-center rounded-md border border-border px-4 text-sm font-medium text-foreground sm:w-auto"
              data-testid="first-run-skip-to-cockpit"
            >
              {ctx?.state === "ESTABLISHED" ? "Go to my Cockpit" : "Skip to my Cockpit"}
            </Link>

            {ctx?.state === "ESTABLISHED" && (
              <>
                <FirstValueFeedback businessId={view.businessId} />
                <div className="rounded-lg border border-border bg-background p-3 text-sm" data-testid="first-run-goal-prompt">
                  <p className="font-medium text-foreground">What do you most want OpsIQ to help improve? <span className="font-normal text-muted-foreground">(optional)</span></p>
                  <p className="mt-1 text-muted-foreground">
                    You can set a {ctx.goalFamilies.map((g) => g.toLowerCase()).join(" or ")} goal. It helps OpsIQ weigh what comes next, but it never hides urgent money, legal or safety issues.
                  </p>
                  <Link href="/owner/goals" className="mt-2 inline-flex min-h-11 items-center underline">Set a goal</Link>
                </div>
              </>
            )}
          </>
        )}
      </div>
    </PageContainer>
  );
}

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
import { CORRECTION_SAVED_READ_PENDING_MESSAGE, READ_REFRESHED_AFTER_STALE_MESSAGE, READ_STALE_MESSAGE, isReadStaleMessage } from "@/domain/owner-first-run/read-staleness";
import { clearRoundTrip, readBeforeSummary, saveBeforeSummary } from "@/lib/first-run-return-storage";
import { HttpResponseError } from "@/lib/operator-safe-errors";
import { httpResponseErrorFromBody } from "@/lib/operator-safe-errors";
import { firstRunErrorText } from "@/lib/first-run-errors";
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

/** Owner-facing reason for a failed request (fixed, truthful wording; see first-run-errors). */
function friendly(err: unknown, _context?: "load" | "save" | "action"): string {
  return firstRunErrorText(err);
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
  /** The corrected numbers were saved but the read could not be re-run: the previous read must not be shown or used. */
  const [correctionSavedPending, setCorrectionSavedPending] = useState(false);
  /** What changed after the owner supplied evidence for "Improve this recommendation". */
  const [improvedLines, setImprovedLines] = useState<string[] | null>(null);
  const viewedFor = useRef<string | null>(null);
  const inFlight = useRef(false);
  const acceptKey = useRef(newIdempotencyKey());

  const loadContext = useCallback(async (): Promise<FirstRunContext | null> => {
    setLoadError(null);
    try {
      const next = await firstRunApi.context();
      setCtx(next);
      return next;
    } catch (err) {
      setLoadError(`We couldn't load your setup. Nothing was lost. ${friendly(err, "load")}`);
      return null;
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
        // A different read is a different decision: it must never reuse the idempotency key of an earlier attempt.
        acceptKey.current = newIdempotencyKey();
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
        setActionError(null);
        setCorrectionSavedPending(false);
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
    if (!businessId || !view || inFlight.current) return;
    inFlight.current = true;
    setBusy(true);
    setActionError(null);
    try {
      // The read the owner is looking at is named explicitly; the server refuses unless it is still the current one.
      await firstRunApi.accept(businessId, view.cycleId, acceptKey.current);
      acceptKey.current = newIdempotencyKey();
      await Promise.all([loadResult(), loadContext()]);
    } catch (err) {
      if (err instanceof HttpResponseError && err.status === 409 && isReadStaleMessage(err.message)) {
        // The figures changed after this read: take a fresh attempt, bring the screen up to date, and say so plainly.
        acceptKey.current = newIdempotencyKey();
        const next = await loadContext();
        if (next && !next.diagnosisStale) await loadResult();
        // Still waiting for the owner to update the read -> ask for it; already refreshed on screen -> say that instead.
        setActionError(next && !next.diagnosisStale ? READ_REFRESHED_AFTER_STALE_MESSAGE : READ_STALE_MESSAGE);
      } else {
        setActionError(`We couldn't save that as your next move. Nothing was changed. ${friendly(err, "action")}`);
      }
    } finally {
      inFlight.current = false;
      setBusy(false);
    }
  }

  async function afterCorrection(result: CorrectionResult) {
    setImprovedLines(null);
    setMode("result");
    if (result.diagnosisFailed || !result.after) {
      // The amendment committed; only the re-run failed. The old read no longer applies, so it is withdrawn from the
      // screen and the owner is offered the retry — never told their earlier numbers are still in force.
      setCorrection(null);
      setView(null);
      setCorrectionSavedPending(true);
      const next = await loadContext();
      // The diagnosis may have committed even though a later step failed: if the head now has a read, show it.
      if (next && !next.diagnosisStale) {
        await loadResult();
        setCorrectionSavedPending(false);
      }
      return;
    }
    setActionError(null);
    setCorrectionSavedPending(false);
    acceptKey.current = newIdempotencyKey();
    setCorrection(result);
    setView(result.after);
    await loadContext();
  }

  // Returning from "Add this": re-run the canonical diagnosis once, then show what changed since the owner left.
  const roundTripHandled = useRef(false);
  useEffect(() => {
    if (!ctx || !businessId || roundTripHandled.current) return;
    if (typeof window === "undefined" || new URLSearchParams(window.location.search).get("update") !== "1") return;
    roundTripHandled.current = true;
    window.history.replaceState(null, "", window.location.pathname);
    const snapshotId = ctx.currentSnapshotId;
    // NEEDS_DIAGNOSIS is already handled by the automatic first diagnosis: a second concurrent run would double-spend the quota.
    if (!snapshotId || !(ctx.state === "FIRST_RESULT" || ctx.state === "ESTABLISHED")) {
      clearRoundTrip();
      return;
    }
    const before = readBeforeSummary();
    // eslint-disable-next-line react-hooks/set-state-in-effect -- one-shot refresh when arriving from the input surface
    setDiagnosing("running");
    void (async () => {
      const ran = await retryDiagnosis(diagnosisApi, businessId, snapshotId);
      if (ran.status !== "diagnosed") {
        setDiagnosing("failed");
        return;
      }
      setDiagnosing("idle");
      setActionError(null);
      clearRoundTrip();
      await loadContext();
      try {
        const next = await firstRunApi.result(businessId);
        setView(next);
        if (before) {
          const stillMissing = before.missingEvidence.filter((m) => next.read.missingEvidence.includes(m));
          const nowFilled = before.missingEvidence.filter((m) => !next.read.missingEvidence.includes(m));
          const lines = [`You went to add: ${before.questionLabel.toLowerCase()}`];
          lines.push(`How sure OpsIQ is: ${TIER_WORDS[before.confidenceTier as keyof typeof TIER_WORDS] ?? before.confidenceTier} → ${TIER_WORDS[next.read.confidenceTier]}`);
          lines.push(
            nowFilled.length > 0
              ? `No longer missing: ${nowFilled.map((m) => humanizeMetricKey(m).toLowerCase()).join(", ")}`
              : stillMissing.length > 0
                ? "The information still missing is unchanged"
                : "Nothing important is missing now",
          );
          lines.push(
            before.recommendedAction === next.read.recommendedAction
              ? `Recommendation: ${next.read.recommendedAction ?? "none"} (unchanged)`
              : `Recommendation: ${before.recommendedAction ?? "none"} → ${next.read.recommendedAction ?? "none"}`,
          );
          setImprovedLines(lines);
        } else {
          setImprovedLines(["Your read has been re-run on your latest information."]);
        }
      } catch (err) {
        setLoadError(`We couldn't load your updated read. Your numbers are saved. ${friendly(err, "load")}`);
      }
    })();
  }, [ctx, businessId, loadContext]);

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
              Revenue, one cost and your cash for <span className="font-medium text-foreground">{ctx.business.name}</span> are enough. Estimates are fine — and you will say how reliable they are.
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
            <p className="mt-1 text-muted-foreground" data-testid="first-run-update-read-note">
              {correctionSavedPending ? CORRECTION_SAVED_READ_PENDING_MESSAGE : "Your earlier numbers are kept on record. OpsIQ will work out a fresh read from the new ones."}
            </p>
            <Button type="button" className="mt-3 min-h-11" disabled={diagnosing === "running"} onClick={() => void runDiagnosis()}>
              {diagnosing === "running" ? "Updating…" : "Update my read"}
            </Button>
            {diagnosing === "failed" && <p role="alert" className="mt-2 text-destructive">The update didn&rsquo;t run. Your numbers are saved &mdash; try again.</p>}
            {/* The owner is never left with a single button: the Cockpit stays one tap away while the read is out of date. */}
            <Link href="/owner/cockpit" className="mt-3 inline-flex min-h-11 w-full items-center justify-center rounded-md border border-border px-4 text-sm font-medium text-foreground sm:w-auto" data-testid="first-run-stale-cockpit">
              Go to my Cockpit
            </Link>
          </div>
        )}

        {/* Corrected numbers are saved but there is neither a read nor the stale panel (e.g. the follow-up reload failed). */}
        {hasResult && !view && !ctx?.diagnosisStale && correctionSavedPending && (
          <div role="status" className="rounded-lg border border-border bg-background p-4 text-sm" data-testid="first-run-correction-pending">
            <p className="text-foreground">{CORRECTION_SAVED_READ_PENDING_MESSAGE}</p>
            <Button type="button" className="mt-3 min-h-11" onClick={() => void runDiagnosis()}>Update my read</Button>
          </div>
        )}

        {/* The round trip back from "Add this" re-runs the read: show that it is happening (and let it be retried). */}
        {hasResult && view && !ctx?.diagnosisStale && diagnosing === "running" && (
          <p role="status" className="rounded-md border border-border bg-background p-3 text-sm text-foreground" data-testid="first-run-updating">Updating your read with your latest information…</p>
        )}
        {hasResult && view && !ctx?.diagnosisStale && diagnosing === "failed" && (
          <div role="alert" className="rounded-md border border-destructive/20 bg-destructive/5 p-3 text-sm text-destructive" data-testid="first-run-update-failed">
            <p>The update didn&rsquo;t run, so the read below may be out of date. Your numbers are saved.</p>
            <Button type="button" variant="secondary" className="mt-2 min-h-11" onClick={() => void runDiagnosis()}>Try the update again</Button>
          </div>
        )}

        {hasResult && view && !ctx?.diagnosisStale && (
          <>
            {correction?.after && (
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

            {improvedLines && (
              <div className="rounded-lg border border-border bg-background p-3 text-sm" data-testid="first-result-improved" aria-live="polite">
                <p className="font-medium text-foreground">What changed after you added that</p>
                <ul className="mt-1 list-disc space-y-0.5 pl-5 text-muted-foreground">
                  {improvedLines.map((l) => <li key={l}>{l}</li>)}
                </ul>
              </div>
            )}

            <FirstMoneyReadCard
              read={view.read}
              decisionState={view.decisionState}
              busy={busy || diagnosing === "running"}
              onSharpen={() => {
                // Same round trip as a progressive question: remember what the owner saw, then bring them back to update.
                saveBeforeSummary({
                  recommendedAction: view.read.recommendedAction,
                  confidenceTier: view.read.confidenceTier,
                  evidenceQuality: view.read.evidenceQuality,
                  missingEvidence: view.read.missingEvidence,
                  questionLabel: view.read.sharpenBy?.title ?? "more information",
                });
              }}
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
            {mode === "improving" && <FirstResultImprovement businessId={view.businessId} read={view.read} onClose={() => setMode("result")} />}

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

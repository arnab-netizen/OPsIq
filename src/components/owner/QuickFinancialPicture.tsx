"use client";

/**
 * QuickFinancialPicture — the ONE first-input surface for an existing business: four optional
 * numbers, one primary action. Presentation only: parsing, sufficiency, periods and the
 * save→diagnose orchestration live in `@/domain/owner-finance/quick-entry`,
 * `@/domain/owner-finance/first-read-sufficiency` and `@/lib/owner-quick-start`.
 *
 * Mount it with `key={businessId}`: the draft then belongs to exactly one business and a business
 * switch discards it (no draft is persisted anywhere, so nothing can leak across businesses).
 */
import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Button, Input } from "@/ui/primitives";
import { httpResponseErrorFromBody, HttpResponseError } from "@/lib/operator-safe-errors";
import { classifyOperatorError } from "@/lib/operator-error-governance";
import {
  QUICK_ENTRY_FIELDS,
  assessQuickEntry,
  buildQuickSnapshotPayload,
  type QuickEntryDraft,
} from "@/domain/owner-finance/quick-entry";
import { describeMissingFirstReadFacts } from "@/domain/owner-mode/owner-onboarding";
import {
  quickReportingPeriods,
  retryDiagnosis,
  runQuickStart,
  type QuickStartApi,
  type QuickStartResult,
} from "@/lib/owner-quick-start";

const FETCH_TIMEOUT_MS = 15_000;

const api: QuickStartApi = async (path, init) => {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(path, {
      ...init,
      headers: { "Content-Type": "application/json" },
      signal: controller.signal,
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw httpResponseErrorFromBody(res.status, data);
    return data;
  } finally {
    clearTimeout(timer);
  }
};

type Phase =
  | { kind: "idle" }
  | { kind: "working" }
  | { kind: "diagnosis_failed"; snapshotId: string; message: string }
  | { kind: "error"; message: string };

export function QuickFinancialPicture({
  businessId,
  currency,
  onSaved,
}: {
  businessId: string;
  currency: string | null | undefined;
  /** Called after any successful save so the host can refresh its readiness view. */
  onSaved?: () => void;
}) {
  const router = useRouter();
  const [draft, setDraft] = useState<QuickEntryDraft>({});
  const periods = useMemo(() => quickReportingPeriods(new Date()), []);
  const [periodId, setPeriodId] = useState<string>(periods[0]?.id ?? "custom");
  const [customStart, setCustomStart] = useState("");
  const [customEnd, setCustomEnd] = useState("");
  const [phase, setPhase] = useState<Phase>({ kind: "idle" });
  // A synchronous guard: React state updates are async, so two fast clicks would both pass a
  // `phase === "working"` check. The ref closes that window (no duplicate submission).
  const inFlight = useRef(false);
  const mounted = useRef(true);
  // Set once the snapshot is saved; from then on the inputs lock and only the diagnosis may be retried.
  const [savedSnapshotId, setSavedSnapshotId] = useState<string | null>(null);
  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; };
  }, []);

  const assessment = useMemo(() => assessQuickEntry(draft), [draft]);
  const period =
    periodId === "custom"
      ? { start: customStart, end: customEnd, provisional: false }
      : periods.find((p) => p.id === periodId) ?? null;
  const periodValid = Boolean(period && period.start && period.end && period.end >= period.start);
  const hasErrors = Object.keys(assessment.errors).length > 0;
  const sufficient = assessment.sufficiency?.sufficient === true;
  const currencyMissing = !(currency ?? "").trim();
  const locked = savedSnapshotId !== null;
  const disabled = phase.kind === "working" || locked || !sufficient || hasErrors || !periodValid || currencyMissing;

  function conclude(result: QuickStartResult) {
    if (!mounted.current) return;
    if (result.status === "diagnosed") {
      onSaved?.();
      router.push("/owner/finance");
      return;
    }
    if (result.status === "diagnosis_failed") {
      setSavedSnapshotId(result.snapshotId);
      onSaved?.();
      const governed = classifyOperatorError(result.error instanceof Error ? result.error : new Error(String(result.error)), { context: "action" });
      setPhase({
        kind: "diagnosis_failed",
        snapshotId: result.snapshotId,
        message: `Your numbers are saved, but the first read didn't run. ${governed.recovery}`,
      });
      return;
    }
    const error = result.error;
    if (error instanceof HttpResponseError && error.status === 409) {
      setPhase({
        kind: "error",
        message: "You've already saved numbers for that period. Pick a different period, or update the saved numbers on the Money page.",
      });
      return;
    }
    const governed = classifyOperatorError(error instanceof Error ? error : new Error(String(error)), { context: "save" });
    setPhase({ kind: "error", message: `We couldn't save these numbers. What you typed is still here. ${governed.recovery}` });
  }

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (inFlight.current || disabled || !period) return;
    inFlight.current = true;
    setPhase({ kind: "working" });
    try {
      const built = buildQuickSnapshotPayload({ values: assessment.values, period, currency });
      if (!built.ok) {
        setPhase({ kind: "error", message: built.reason === "currency_missing" ? "Your business needs a currency first." : "Enter at least one number." });
        return;
      }
      conclude(await runQuickStart({ api, businessId, payload: built.payload }));
    } finally {
      inFlight.current = false;
    }
  }

  async function retry() {
    if (inFlight.current || phase.kind !== "diagnosis_failed") return;
    inFlight.current = true;
    setPhase({ kind: "working" });
    try {
      conclude(await retryDiagnosis(api, businessId, phase.snapshotId));
    } finally {
      inFlight.current = false;
    }
  }

  const feedback = hasErrors
    ? null
    : assessment.nothingEntered
      ? null
      : sufficient
        ? "That's enough for a first read. It will be a rough picture and will say how sure it is."
        : `Still needed for a first read: ${describeMissingFirstReadFacts(assessment.sufficiency?.missing ?? [])}. A rough estimate is fine; zero is fine if it is truly zero.`;

  return (
    <form
      onSubmit={submit}
      noValidate
      data-testid="quick-financial-picture-form"
      className="rounded-lg border-2 border-primary/40 bg-primary/5 p-4"
    >
      <h2 className="text-lg font-semibold text-foreground">Give OpsIQ a rough picture of the business</h2>
      <p className="mt-1 text-sm text-muted-foreground">
        Estimates are fine. Enter what you know — leave the rest blank. You can improve the numbers later.
      </p>

      {currencyMissing ? (
        <p role="alert" className="mt-3 text-sm text-destructive" data-testid="quick-currency-missing">
          This business has no currency yet. Set it once under My Business, then come back.
        </p>
      ) : (
        <>
          <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
            {QUICK_ENTRY_FIELDS.map((f) => (
              <Input
                key={f.name}
                name={f.name}
                label={`${f.label} (${currency})`}
                hint={f.hint}
                type="text"
                inputMode="decimal"
                autoComplete="off"
                placeholder="Blank = don't know"
                value={draft[f.name] ?? ""}
                disabled={locked}
                error={assessment.errors[f.name]}
                onChange={(e) => {
                  setDraft((d) => ({ ...d, [f.name]: e.target.value }));
                  if (phase.kind === "error") setPhase({ kind: "idle" });
                }}
              />
            ))}
          </div>

          <fieldset className="mt-4">
            <legend className="text-sm font-medium text-foreground">These numbers are for</legend>
            <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-sm">
              {periods.map((p) => (
                <label key={p.id} className="flex items-center gap-1.5">
                  <input type="radio" name="period" checked={periodId === p.id} onChange={() => setPeriodId(p.id)} />
                  {p.label}
                </label>
              ))}
              <label className="flex items-center gap-1.5">
                <input type="radio" name="period" checked={periodId === "custom"} onChange={() => setPeriodId("custom")} />
                Choose dates
              </label>
            </div>
            {periodId === "custom" && (
              <div className="mt-2 grid grid-cols-1 gap-3 sm:grid-cols-2">
                <Input name="periodStart" label="From" type="date" value={customStart} onChange={(e) => setCustomStart(e.target.value)} />
                <Input name="periodEnd" label="To" type="date" value={customEnd} onChange={(e) => setCustomEnd(e.target.value)} />
              </div>
            )}
            {period?.provisional && (
              <p className="mt-1 text-xs text-muted-foreground" data-testid="quick-provisional-note">
                The month isn&rsquo;t over, so this will be treated as a provisional read, not a completed month.
              </p>
            )}
          </fieldset>

          <div aria-live="polite" className="mt-3 min-h-5 text-sm text-foreground" data-testid="quick-feedback">
            {feedback}
          </div>
          {phase.kind === "diagnosis_failed" && (
            <div role="alert" className="mt-2 rounded-md border border-destructive/20 bg-destructive/5 p-3 text-sm text-destructive" data-testid="quick-diagnosis-failed">
              <p>{phase.message}</p>
              <Button type="button" onClick={retry} className="mt-2">Try the first read again</Button>
            </div>
          )}
          {phase.kind === "error" && (
            <p role="alert" className="mt-2 rounded-md border border-destructive/20 bg-destructive/5 p-3 text-sm text-destructive" data-testid="quick-error">
              {phase.message}
            </p>
          )}

          {!locked && (
            <Button type="submit" disabled={disabled} className="mt-3" data-testid="quick-primary-action">
              {phase.kind === "working" ? "Working…" : "Show my first read"}
            </Button>
          )}
          <p className="mt-2 text-xs text-muted-foreground">
            This is enough for a first read, not a full picture of your business — OpsIQ will tell you what would make it more reliable.
          </p>
        </>
      )}

      <details className="mt-4 text-sm" data-testid="quick-more-detail">
        <summary className="cursor-pointer font-medium text-foreground">Add more detail (optional)</summary>
        <ul className="mt-2 space-y-1 text-muted-foreground">
          <li><Link href="/owner/finance" className="underline">Enter the full money picture</Link></li>
          <li><Link href="/owner/manual-entry" className="underline">Add other business information</Link></li>
          <li><Link href="/owner/intake" className="underline">Paste spreadsheet or CSV rows</Link></li>
        </ul>
      </details>
    </form>
  );
}

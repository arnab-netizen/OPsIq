"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { Badge, Button, CardDashboardSkeleton, Disclosure, PageHeader, PageContainer } from "@/ui/primitives";
import { BusinessContextSelector } from "@/components/owner/BusinessContextSelector";
import { FirstRunRedirect } from "@/components/owner/first-run/FirstRunRedirect";
import { classifyOperatorError } from "@/lib/operator-error-governance";
import { inputTargetForCategory } from "@/domain/owner-mode/owner-data-hub";
import { INPUT_CATALOG, type OwnerInputCategory } from "@/domain/owner-mode/input-catalog";
import { displayLabelForField } from "@/domain/owner-finance";
import { confidenceDisplayPhrase, describeMissingFirstReadFacts } from "@/domain/owner-mode/owner-onboarding";
import {
  BANK_BALANCE_COPY,
  QUICK_ENTRY_FIELDS,
  assessQuickEntry,
  parseQuickAmount,
  type QuickEntryDraft,
} from "@/domain/owner-finance/quick-entry";

/* eslint-disable @typescript-eslint/no-explicit-any, react-hooks/set-state-in-effect -- runtime onboarding payload is untyped; fetch-on-mount is intentional */

// Data completeness is not a danger signal -- see the matching comment in /owner/data/page.tsx.
const CONFIDENCE_VARIANT: Record<string, "success-accessible" | "default-accessible" | "warning-accessible" | "destructive" | "muted-accessible"> = {
  high: "success-accessible",
  medium: "warning-accessible",
  low: "muted-accessible",
  none: "muted-accessible",
};

const SEVERITY_VARIANT: Record<string, "warning-accessible" | "destructive-accessible" | "muted-accessible"> = {
  critical: "destructive-accessible",
  high: "warning-accessible",
  medium: "muted-accessible",
};

const SEVERITY_LABEL: Record<string, string> = {
  critical: "Urgent",
  high: "Important",
  medium: "Worth doing",
  low: "Minor",
};

// Lowercase — OwnerSeverity values (src/domain/owner-spine/contracts.ts) are "critical" |
// "high" | "medium" | "low", not upper-case; a mismatched-case map here would silently fall
// through to the "default" (unstyled) badge variant for every real finding.
const FINDING_SEVERITY_VARIANT: Record<string, "warning-accessible" | "destructive-accessible" | "muted-accessible" | "default-accessible"> = {
  critical: "destructive-accessible",
  high: "destructive-accessible",
  medium: "warning-accessible",
  low: "muted-accessible",
};

const FETCH_TIMEOUT_MS = 10_000;

/** Preserves the HTTP status alongside the governed error message, so a caller can branch on a
 *  specific known status (e.g. 409 conflict) instead of only ever showing/retrying generically. */
class ApiError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

async function api(path: string, init?: RequestInit) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(path, {
      ...init,
      headers: { "Content-Type": "application/json", ...(init?.headers ?? {}) },
      signal: controller.signal,
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new ApiError(data?.error?.message || data?.error || `Request failed (${res.status})`, res.status);
    return data;
  } catch (e) {
    if (e instanceof Error && e.name === "AbortError") throw new Error("That took too long. Check your connection and try again.");
    throw e;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * First and last day of the most recently completed full calendar month, as ISO date strings
 * (YYYY-MM-DD).
 *
 * The essential-numbers form asks for "Average monthly sales", "Fixed monthly costs", and
 * "Variable monthly costs" -- figures the owner is describing as representative of a typical,
 * complete month. Posting those values against periodStart=start-of-current-month /
 * periodEnd=today was a real correctness defect: on the 8th of a month, that is an 8-day
 * reporting period, but periodDays() (src/domain/owner-finance/metrics.ts) divides the very
 * same monthly figures by however many days sit between periodStart/periodEnd to derive
 * dailyBreakEvenRevenue and cashRunwayDays. A full month's worth of revenue/costs divided by 8
 * days instead of ~30 overstates daily burn by roughly 4x, so cashRunwayDays -- the number a
 * struggling owner most needs to trust -- would silently read roughly 4x too alarmist. The last
 * full calendar month is a real, complete, unambiguous period the owner can estimate honestly
 * (as opposed to an abstract "any typical month"), and it never straddles today.
 */
function lastFullMonthStart(): string {
  const d = new Date();
  return new Date(d.getFullYear(), d.getMonth() - 1, 1).toISOString().slice(0, 10);
}
function lastFullMonthEnd(): string {
  const d = new Date();
  // Day 0 of the current month is the last day of the previous month.
  return new Date(d.getFullYear(), d.getMonth(), 0).toISOString().slice(0, 10);
}

function confidencePhrase(score: number): string {
  if (score >= 85) return "High confidence — this is based on solid data.";
  if (score >= 60) return "Reasonable confidence — a good starting picture.";
  if (score >= 30) return "Limited confidence — add more data for a fuller picture.";
  return "Not enough data yet for a reliable read.";
}

/**
 * "Essential numbers" — Guided setup's presentation of the first financial picture. The FOUR core Finance
 * inputs (revenue, fixed costs, variable costs, cash in hand) are NOT defined here: their field
 * definitions, blank/zero/invalid parsing and the first-read sufficiency all come from the shared
 * quick-entry domain (`@/domain/owner-finance/quick-entry` → the canonical
 * `evaluateFirstReadSufficiency`), exactly as in `QuickFinancialPicture`. This form therefore cannot save
 * or diagnose until revenue, at least one cost and cash in hand are KNOWN (a known 0 counts).
 *
 * What this route adds (GUIDED_SETUP_EXTENSION): a separate optional bank balance that is written to a
 * Cashflow snapshot (never to the Finance snapshot, and never counted as cash in hand), and amend-on-409
 * for a same-period Finance snapshot through the governed amendment endpoint. Entering numbers and seeing
 * a first result is one action (Phase 7).
 */
function EssentialNumbersForm({
  businessId,
  currency,
  onResult,
}: {
  businessId: string;
  currency: string;
  onResult: (cycle: any, bankBalanceWarning?: string) => void;
}) {
  const [busy, setBusy] = useState(false);
  const [saveFailure, setSaveFailure] = useState<string | null>(null);
  const [draft, setDraft] = useState<QuickEntryDraft>({});
  const [bankText, setBankText] = useState("");
  // Synchronous guard: two fast submits must not both pass a state-based `busy` check.
  const inFlight = useRef(false);

  const assessment = useMemo(() => assessQuickEntry(draft), [draft]);
  const bank = parseQuickAmount(bankText);
  const hasErrors = Object.keys(assessment.errors).length > 0 || bank.kind === "invalid";
  const sufficient = assessment.sufficiency?.sufficient === true;
  const disabled = busy || hasErrors || !sufficient;
  const feedback = hasErrors || assessment.nothingEntered
    ? null
    : sufficient
      ? "That's enough for a first read."
      : `Still needed for a first read: ${describeMissingFirstReadFacts(assessment.sufficiency?.missing ?? [])}. A rough estimate is fine; zero is fine if it is truly zero.`;

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    // The canonical gate is enforced HERE, not left to the diagnosis engine to abstain after saving.
    if (inFlight.current || disabled) return;
    inFlight.current = true;
    setBusy(true);
    setSaveFailure(null);
    // Known values only (blank = unknown and omitted; a known 0 is kept) — from the shared parser.
    const fields = { ...assessment.values };
    const bankBalance = bank.kind === "value" ? bank.value : undefined;
    const periodStart = lastFullMonthStart();
    const periodEnd = lastFullMonthEnd();
    try {
      let snapshotId: string;
      try {
        const snapshot = await api(`/api/owner/finance/businesses/${businessId}/snapshots`, {
          method: "POST",
          body: JSON.stringify({ periodStart, periodEnd, currency, ...fields }),
        });
        snapshotId = snapshot.id;
      } catch (createErr) {
        // A snapshot for this exact reporting period already exists (e.g. the owner already
        // ran this step once today, or is correcting an earlier estimate) -- the create route
        // fails closed with 409 rather than silently overwriting, per its own governance
        // (financial snapshots are append-only/amend-only, never blindly replaced). Amend the
        // existing period's snapshot instead of surfacing that conflict as a dead end.
        if (!(createErr instanceof ApiError) || createErr.status !== 409) throw createErr;
        const existing = await api(`/api/owner/finance/businesses/${businessId}/snapshots`);
        const list = (existing?.snapshots ?? existing ?? []) as Array<{ id: string; periodStart: string; periodEnd: string; version: number }>;
        const currentPeriod = list
          .filter((s) => s.periodStart?.slice(0, 10) === periodStart && s.periodEnd?.slice(0, 10) === periodEnd)
          .sort((a, b) => b.version - a.version)[0];
        if (!currentPeriod) throw createErr;
        const amended = await api(`/api/owner/finance/snapshots/${currentPeriod.id}/amend`, {
          method: "POST",
          body: JSON.stringify({ amendmentReason: "Updated during onboarding essential numbers.", ...fields }),
        });
        snapshotId = amended.newSnapshotId;
      }

      // Bank balance is a Cashflow-domain fact, not a finance one -- it lives on a
      // OwnerCashflowSnapshot (cashInHand/bankBalance are its own separate fields; see
      // src/domain/owner-cashflow/types.ts), which the finance diagnosis then enriches itself from
      // (DEFECT 1 in src/services/owner-finance/diagnosis.service.ts: it reads the latest cashflow
      // snapshot with periodEnd <= this finance snapshot's periodEnd, within a 45-day freshness
      // window). Creating it here, for the same period, before running the diagnosis below, is what
      // makes that enrichment fire on this very first result -- no new field, no new domain, just
      // wiring onboarding into the enrichment path that already exists.
      let bankBalanceWarning: string | undefined;
      if (bankBalance !== undefined) {
        try {
          await api(`/api/owner/cashflow/businesses/${businessId}/snapshots`, {
            method: "POST",
            body: JSON.stringify({ periodStart, periodEnd, currency, bankBalance }),
          });
        } catch (cashflowErr) {
          // A cashflow snapshot for this exact period already exists. Unlike finance snapshots,
          // cashflow snapshots have no governed amend/update endpoint in this codebase (only
          // GET/POST-create exist -- see src/app/api/owner/cashflow/**), so there is no safe way to
          // overwrite the value already on file for this period from here.
          if (!(cashflowErr instanceof ApiError) || cashflowErr.status !== 409) throw cashflowErr;

          // The 409 alone doesn't tell us whether this is genuinely idempotent (the owner re-ran
          // this step and typed the same number again) or a real conflict (the number on file is
          // different from what was just submitted). Resolve the actual stored value and compare --
          // silently proceeding on a DIFFERENT value would mean the diagnosis below enriches itself
          // from a stale bank balance while the UI just accepted a new one, with nothing telling the
          // owner their correction never took effect.
          const existing = await api(`/api/owner/cashflow/businesses/${businessId}/snapshots`);
          const list = (existing?.snapshots ?? existing ?? []) as Array<{
            periodStart: string;
            periodEnd: string;
            bankBalance: number | null;
          }>;
          const currentPeriod = list.find(
            (s) => s.periodStart?.slice(0, 10) === periodStart && s.periodEnd?.slice(0, 10) === periodEnd,
          );
          const onFile = currentPeriod?.bankBalance ?? null;
          if (onFile !== bankBalance) {
            // Not idempotent. There is no governed way to overwrite it from onboarding, so say so
            // honestly rather than silently using the stale figure.
            bankBalanceWarning =
              onFile === null
                ? `Your bank balance couldn't be saved for this period — a cashflow record already exists for it without a bank balance. Add it directly in Cashflow.`
                : `Your bank balance of ${bankBalance.toLocaleString()} couldn't be saved — ${onFile.toLocaleString()} is already on file for this period. Update it directly in Cashflow if that figure is wrong.`;
          }
          // else: identical value already on file -- genuinely idempotent, nothing to warn about.
        }
      }

      const cycle = await api(`/api/owner/finance/businesses/${businessId}/diagnoses`, {
        method: "POST",
        body: JSON.stringify({ snapshotId }),
      });
      onResult(cycle, bankBalanceWarning);
    } catch (err) {
      // Governed owner-safe message — never the raw exception text.
      setSaveFailure(classifyOperatorError(err instanceof Error ? err : new Error(String(err)), { context: "save" }).operatorMessage);
    } finally {
      setBusy(false);
      inFlight.current = false;
    }
  }

  return (
    <section className="rounded-md border border-border bg-card p-5" data-testid="onboarding-essential-numbers">
      <h2 className="text-base font-semibold text-foreground">Essential numbers</h2>
      <p className="mt-1 text-sm text-muted-foreground">
        A few numbers are enough for a first, real result: revenue, any one cost, and your cash in hand.
        An estimate is fine for all of them — you can refine them later in Money.
      </p>
      <form onSubmit={submit} noValidate className="mt-4 flex flex-col gap-4 max-w-lg">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          {QUICK_ENTRY_FIELDS.map((f) => (
            <label key={f.name} className="flex flex-col gap-1 text-sm text-foreground">
              <span>{f.label} ({currency})</span>
              <input
                name={f.name}
                type="text"
                inputMode="decimal"
                autoComplete="off"
                value={draft[f.name] ?? ""}
                onChange={(e) => setDraft((d) => ({ ...d, [f.name]: e.target.value }))}
                aria-invalid={assessment.errors[f.name] ? true : undefined}
                className="w-full rounded-md border border-border p-2 text-sm"
                placeholder="Blank = don't know"
              />
              {assessment.errors[f.name] ? (
                <span role="alert" className="text-xs text-destructive">{assessment.errors[f.name]}</span>
              ) : (
                <span className="text-xs text-muted-foreground">{f.hint}</span>
              )}
            </label>
          ))}
        </div>
        <label className="flex flex-col gap-1 text-sm text-foreground">
          <span>{BANK_BALANCE_COPY.label} ({currency}) — optional</span>
          <input
            name="bankBalance"
            type="text"
            inputMode="decimal"
            autoComplete="off"
            value={bankText}
            onChange={(e) => setBankText(e.target.value)}
            aria-invalid={bank.kind === "invalid" ? true : undefined}
            className="w-full rounded-md border border-border p-2 text-sm"
            placeholder="e.g. 6000"
          />
          {bank.kind === "invalid" ? (
            <span role="alert" className="text-xs text-destructive">{bank.message}</span>
          ) : (
            <span className="text-xs text-muted-foreground">{BANK_BALANCE_COPY.hint}</span>
          )}
        </label>
        <div aria-live="polite" className="min-h-5 text-sm text-foreground" data-testid="onboarding-first-read-feedback">
          {feedback}
        </div>
        {saveFailure && <p role="alert" className="text-sm text-destructive">{saveFailure}</p>}
        <Button type="submit" disabled={disabled} className="min-h-[44px] self-start">
          {busy ? "Working on it…" : "See my first result"}
        </Button>
      </form>
    </section>
  );
}

type FirstResultFinding = {
  id: string;
  title: string;
  summary: string;
  severity: string;
  sourceMetric?: string | null;
  missingData?: string[] | null;
};
type FirstResultAction = {
  findingId: string | null;
  title: string;
  description: string;
  verificationMetric?: string | null;
  verificationMethod?: string | null;
  confidence?: number | null;
};

/**
 * The first real, non-fabricated interpretation of the owner's own data (Phase 7).
 *
 * Reads only what the governed finance-diagnosis engine actually returned on this
 * cycle -- the top finding (by impact/urgency, already ordered server-side) and, when
 * one exists, the real OwnerFinanceAction the engine generated FOR that exact finding
 * (matched by findingId, never guessed or reordered). Nothing here is invented: if the
 * engine produced no action for the top finding, or no finding at all, this says so
 * plainly and points at the specific missing inputs (finding.missingData) rather than
 * inventing a recommendation.
 *
 * The action block used to label its verification-method line "Why this action" -- but that text
 * only restates what OpsIQ recommends and how it will check the result, neither of which is a
 * causal rationale. The domain engine does compute a real one (buildEvidenceRationale in
 * src/domain/owner-finance/actions.ts, e.g. "Your netMarginPct is -25 (threshold: 0)."), but it is
 * never persisted on OwnerFinanceAction nor returned by this API today, so there is nothing true to
 * show under a "Why" heading here. Labeled honestly instead: "How OpsIQ will check it worked."
 */
function FirstResultCard({ cycle, bankBalanceWarning }: { cycle: any; bankBalanceWarning?: string | null }) {
  const findings = (cycle?.findings ?? []) as FirstResultFinding[];
  const actions = (cycle?.actions ?? []) as FirstResultAction[];
  const top = findings[0] ?? null;
  const topAction = top ? (actions.find((a) => a.findingId === top.id) ?? null) : null;
  const confidenceScore = cycle?.dataConfidenceScore as number | undefined;

  return (
    <section className="rounded-md border border-border bg-card p-5" data-testid="onboarding-first-result">
      {bankBalanceWarning && (
        <div
          className="mb-4 rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900"
          role="alert"
          data-testid="onboarding-bank-balance-warning"
        >
          <p className="font-medium">Bank balance not saved</p>
          <p className="mt-1">{bankBalanceWarning}</p>
          <Link href="/owner/cashflow" className="mt-1 inline-block font-medium underline hover:no-underline">
            Go to Cashflow →
          </Link>
        </div>
      )}
      <h2 className="text-base font-semibold text-foreground">What OpsIQ found</h2>
      {top ? (
        <>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <strong className="text-base text-foreground">{top.title}</strong>
            <Badge variant={FINDING_SEVERITY_VARIANT[top.severity] ?? "default-accessible"}>
              {SEVERITY_LABEL[top.severity] ?? top.severity}
            </Badge>
          </div>

          <h3 className="mt-4 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Why it matters</h3>
          <p className="mt-1 text-sm text-foreground">{top.summary}</p>

          <h3 className="mt-4 text-xs font-semibold uppercase tracking-wide text-muted-foreground">What to do next</h3>
          {topAction ? (
            <>
              <p className="mt-1 text-base font-semibold text-foreground">{topAction.title}</p>
              <p className="mt-1 text-sm text-muted-foreground">{topAction.description}</p>
              {topAction.verificationMethod && (
                <>
                  <h3 className="mt-4 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    How OpsIQ will check it worked
                  </h3>
                  <p className="mt-1 text-xs text-muted-foreground">{topAction.verificationMethod}</p>
                </>
              )}
            </>
          ) : top.missingData && top.missingData.length > 0 ? (
            <p className="mt-1 text-sm text-muted-foreground">
              OpsIQ doesn&rsquo;t have enough information yet to safely recommend an action for this. Add{" "}
              {top.missingData.map(displayLabelForField).join(", ")} and run this again.
            </p>
          ) : (
            <p className="mt-1 text-sm text-muted-foreground">
              OpsIQ doesn&rsquo;t have a safe recommendation for this yet. Add a bit more detail in Money and run
              this again.
            </p>
          )}
        </>
      ) : (
        <p className="mt-2 text-sm text-muted-foreground">
          Nothing urgent stands out yet with the numbers you&rsquo;ve given OpsIQ.
        </p>
      )}
      {typeof confidenceScore === "number" && (
        <>
          <h3 className="mt-4 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            How sure OpsIQ is
          </h3>
          <p className="mt-1 text-sm text-muted-foreground">{confidencePhrase(confidenceScore)}</p>
        </>
      )}
      {/* Both outline, not one solid-primary: neither is "the" recommended action -- that's the
          plain-text finding/action content above (title, why it matters, what to do next). These
          are navigation only (view more detail / leave this screen), so a solid button here would
          out-compete the actual recommendation for attention rather than support it. */}
      <div className="mt-4 flex flex-wrap gap-2">
        <Link href="/owner/finance"><Button variant="outline" className="min-h-[44px]">See full finance details</Button></Link>
        <Link href="/owner/cockpit"><Button variant="outline" className="min-h-[44px]">Go to Home</Button></Link>
      </div>
    </section>
  );
}

export default function OwnerOnboardingPage() {
  const [businesses, setBusinesses] = useState<any[] | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [state, setState] = useState<any | null>(null);
  const [readiness, setReadiness] = useState<any | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [firstResult, setFirstResult] = useState<any | null>(null);
  const [bankBalanceWarning, setBankBalanceWarning] = useState<string | null>(null);

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
        setSelected((prev) => prev ?? list[0].id);
        await loadState(selected ?? list[0].id);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load");
    } finally {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- selected is read, not a dependency: this only runs on mount and after business creation, both of which should always resolve to the first/only business
  }, [loadState]);

  useEffect(() => {
    load();
  }, [load]);

  if (loading) return <CardDashboardSkeleton label="Loading onboarding" />;

  const selectedBusiness = businesses?.find((b) => b.id === selected) ?? null;

  // A real, deterministic read of where the owner actually is in this 3-step flow -- never a
  // decorative counter. Gives the page a sense of progress instead of restating "Welcome to
  // OpsIQ" with no indication of how far along setup is.
  const step = firstResult ? 3 : (businesses?.length ?? 0) > 0 ? 2 : 1;
  const stepLabel = step === 1 ? "Business basics" : step === 2 ? "Essential numbers" : "First result";

  return (
    <PageContainer narrow data-testid="owner-onboarding">
      <div className="mb-6">
        <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
          Step {step} of 3 · {stepLabel}
        </p>
        <div className="mt-1">
          <PageHeader
            title="Welcome to OpsIQ"
            description="OpsIQ helps you see what needs attention in your business, what to do next, and whether it worked."
          />
        </div>
      </div>

      {error && (
        <div className="mb-4 rounded-md border border-destructive/20 bg-destructive/5 p-3 text-sm text-destructive">
          {error} <Button className="ml-2 min-h-[44px]" onClick={() => load()}>Retry</Button>
        </div>
      )}

      {(businesses?.length ?? 0) === 0 ? (
        <div data-testid="onboarding-empty">
          <h2 className="mb-2 text-sm font-medium text-muted-foreground">Business basics</h2>
          <FirstRunRedirect />
        </div>
      ) : (
        <>
          {(businesses?.length ?? 0) > 1 && (
            <div className="mb-6">
              <BusinessContextSelector
                businesses={businesses ?? []}
                selectedId={selected}
                onChange={(businessId) => {
                  setSelected(businessId);
                  setFirstResult(null);
                  loadState(businessId);
                }}
              />
            </div>
          )}

          {firstResult ? (
            <FirstResultCard cycle={firstResult} bankBalanceWarning={bankBalanceWarning} />
          ) : (
            <div className="flex flex-col gap-6">
              {state?.found && !state.canRunFirstDiagnosis && selectedBusiness && (
                <EssentialNumbersForm
                  businessId={selectedBusiness.id}
                  currency={selectedBusiness.currency ?? "USD"}
                  onResult={(cycle, warning) => {
                    setFirstResult(cycle);
                    setBankBalanceWarning(warning ?? null);
                  }}
                />
              )}

              {readiness?.found && (
                <section className="rounded-md border border-border bg-card p-4" data-testid="onboarding-readiness">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="text-xs uppercase text-muted-foreground">Setup progress</div>
                    <div className="flex flex-wrap gap-2">
                      <Badge
                        variant={readiness.overallScore >= 70 ? "success-accessible" : readiness.overallScore >= 40 ? "warning-accessible" : "destructive-accessible"}
                        className="tabular-nums"
                      >
                        {Math.round(readiness.overallScore)}/100
                      </Badge>
                    </div>
                  </div>
                </section>
              )}

              {state?.found && (
                <>
                  <section className="rounded-md border border-border bg-card p-4" data-testid="onboarding-steps">
                    <div className="mb-3 text-xs uppercase text-muted-foreground">Your setup steps</div>
                    <ol className="space-y-2">
                      {state.steps.map((s: any) => (
                        <li key={s.id} className="flex items-center gap-3 text-sm">
                          <span className={`inline-flex h-6 w-6 items-center justify-center rounded-full text-xs ${s.complete ? "bg-success/20 text-success" : "bg-muted text-muted-foreground"}`}>
                            {s.complete ? "✓" : "•"}
                          </span>
                          <span className={s.complete ? "text-muted-foreground" : "text-foreground font-medium"}>{s.label}</span>
                        </li>
                      ))}
                    </ol>
                  </section>

                  <section className="rounded-md border border-border bg-card p-4" data-testid="onboarding-confidence">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="text-xs uppercase text-muted-foreground">How sure OpsIQ is so far</div>
                      <Badge variant={CONFIDENCE_VARIANT[state.confidenceBeforeDiagnosis] ?? "muted-accessible"}>
                        {confidenceDisplayPhrase(state.confidenceBeforeDiagnosis)}
                      </Badge>
                    </div>
                    <p className="mt-2 text-sm text-muted-foreground">
                      {state.minimumSuppliedCount}/{state.minimumRequiredCount} minimum inputs supplied.{" "}
                      {state.canRunFirstDiagnosis
                        ? "You can run a limited first diagnosis."
                        : "Add the essential numbers above to unlock your first result."}
                    </p>
                  </section>

                  {state.missingMinimum.length > 0 && (
                    <section className="rounded-md border border-border bg-card p-4" data-testid="onboarding-missing">
                      <div className="mb-2 text-xs uppercase text-muted-foreground">What data is still missing</div>
                      <ul className="space-y-3">
                        {state.missingMinimum.map((m: any) => {
                          const target = inputTargetForCategory(m.category as OwnerInputCategory);
                          return (
                            <li key={m.category} className="rounded-md border border-border p-3">
                              <div className="flex flex-wrap items-center justify-between gap-2">
                                <span className="min-w-0 break-words text-sm font-medium text-foreground">{m.label}</span>
                                <Badge variant={SEVERITY_VARIANT[m.severity] ?? "muted-accessible"}>
                                  {SEVERITY_LABEL[m.severity] ?? m.severity}
                                </Badge>
                              </div>
                              <p className="mt-1 text-xs text-muted-foreground">{m.why}</p>
                              <Link
                                href={target.href}
                                className="mt-2 inline-block text-xs font-medium text-[var(--primary-text)] underline hover:no-underline"
                              >
                                {target.actionLabel} {m.label.toLowerCase()} →
                              </Link>
                            </li>
                          );
                        })}
                      </ul>
                    </section>
                  )}

                  <section className="rounded-md border border-foreground/20 bg-card p-4" data-testid="onboarding-first-action">
                    <div className="mb-1 text-xs uppercase text-muted-foreground">Your first action</div>
                    <p className="text-sm font-medium text-foreground">{state.firstAction}</p>
                    {state.whatNotToDo.length > 0 && (
                      <div className="mt-3 rounded-md border border-warning/30 bg-warning/5 p-3 text-sm" data-testid="onboarding-do-not-do">
                        <strong>What not to do yet:</strong>
                        <ul className="ml-5 list-disc">{state.whatNotToDo.map((x: string, i: number) => <li key={i}>{x}</li>)}</ul>
                      </div>
                    )}
                  </section>

                  <Disclosure summary="More setup details">
                    <div className="flex flex-col gap-3">
                      <div data-testid="onboarding-next-upload">
                        <strong className="text-foreground">Next best thing to add:</strong>{" "}
                        {state.nextBestUpload
                          ? (INPUT_CATALOG[state.nextBestUpload as OwnerInputCategory]?.label ??
                             state.nextBestUpload.replace(/_/g, " "))
                          : "you have what you need to start"}
                        <div className="mt-2">
                          <Link
                            href={
                              state.nextBestUpload
                                ? inputTargetForCategory(state.nextBestUpload as OwnerInputCategory).href
                                : "/owner/intake"
                            }
                          >
                            <Button variant="outline" className="min-h-[44px]">Add this data →</Button>
                          </Link>
                        </div>
                      </div>
                      <div data-testid="onboarding-proof">
                        <strong className="text-foreground">Proof you&apos;ll need:</strong>
                        <p className="mt-1 text-muted-foreground">{state.proofExpectation}</p>
                      </div>
                      <div data-testid="onboarding-delegation">
                        <strong className="text-foreground">How OpsIQ helps you delegate:</strong>
                        <p className="mt-1 text-muted-foreground">{state.delegationGuidance}</p>
                      </div>
                    </div>
                  </Disclosure>

                  <div className="flex flex-wrap gap-2">
                    <Link href="/owner/cockpit"><Button variant="outline" className="min-h-[44px]">Go to Home</Button></Link>
                  </div>
                </>
              )}
            </div>
          )}
        </>
      )}
    </PageContainer>
  );
}

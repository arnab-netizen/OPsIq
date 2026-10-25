"use client";

/**
 * Edit the two cash figures (bank balance, cash in hand) of a recorded Cashflow entry.
 *
 * What is recorded NOW is shown first. The change is sent with the `updatedAt` the owner saw; the SERVER decides
 * whether the entry moved underneath them (CASHFLOW_STALE → reload prompt with the fresh figures) and whether a recorded
 * value is being replaced (CASHFLOW_REPLACEMENT_CONFIRMATION_REQUIRED → an explicit "Replace X with Y?" step, resent with
 * `confirmReplace` AND the same `updatedAt`). The period and currency are shown, never editable. All decisions live in
 * `@/domain/owner-cashflow/edit-flow`; this component renders and transports.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { Button, Input } from "@/ui/primitives";
import { periodLabel } from "@/domain/owner-first-run/first-money-read";
import {
  assessCashflowEditDraft,
  classifyCashflowWriteFailure,
  draftFromFigures,
  formatCashflowAmount,
  replacementQuestions,
  type CashflowEditDraft,
  type CashflowWriteFailure,
} from "@/domain/owner-cashflow/edit-flow";
import { CASHFLOW_AMEND_FIELDS, CASHFLOW_FIELD_LABEL, type CashflowFigures } from "@/domain/owner-cashflow/amend";

interface LoadedEntry {
  id: string;
  updatedAt: string;
  periodStart: string;
  periodEnd: string;
  currency: string;
  figures: CashflowFigures;
}

type Phase =
  | { name: "loading" }
  | { name: "load_failed"; message: string }
  | { name: "editing" }
  | { name: "confirming"; questions: string[] }
  | { name: "stale"; message: string }
  | { name: "saved"; changed: boolean; bankBalanceChanged: boolean };

async function call(path: string, init?: RequestInit): Promise<{ status: number; ok: boolean; body: unknown }> {
  const res = await fetch(path, { ...init, headers: { "Content-Type": "application/json", ...(init?.headers || {}) } });
  return { status: res.status, ok: res.ok, body: await res.json().catch(() => ({})) };
}

function toEntry(row: Record<string, unknown>): LoadedEntry {
  const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : null);
  return {
    id: String(row.id),
    updatedAt: String(row.updatedAt),
    periodStart: String(row.periodStart),
    periodEnd: String(row.periodEnd),
    currency: String(row.currency),
    figures: { bankBalance: num(row.bankBalance), cashInHand: num(row.cashInHand) },
  };
}

export function CashflowEntryEditor({
  snapshotId,
  onClose,
  onSaved,
}: {
  snapshotId: string;
  onClose: () => void;
  /** Called after a successful save (the page reloads its figures; a first-read return bar is already on the screen). */
  onSaved: () => void;
}) {
  const [entry, setEntry] = useState<LoadedEntry | null>(null);
  const [draft, setDraft] = useState<CashflowEditDraft>({ bankBalance: "", cashInHand: "" });
  const [phase, setPhase] = useState<Phase>({ name: "loading" });
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const inFlight = useRef(false);
  const headingRef = useRef<HTMLHeadingElement>(null);

  const load = useCallback(async () => {
    setPhase({ name: "loading" });
    setNotice(null);
    try {
      const r = await call(`/api/owner/cashflow/snapshots/${snapshotId}`);
      if (!r.ok) {
        setPhase({ name: "load_failed", message: r.status === 404 ? "That entry wasn't found." : "We couldn't open that entry. Nothing was changed." });
        return;
      }
      const loaded = toEntry(r.body as Record<string, unknown>);
      setEntry(loaded);
      setDraft(draftFromFigures(loaded.figures));
      setPhase({ name: "editing" });
    } catch {
      setPhase({ name: "load_failed", message: "We couldn't open that entry. Nothing was changed." });
    }
  }, [snapshotId]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- fetch on mount
    void load();
  }, [load]);

  useEffect(() => { if (phase.name !== "loading") headingRef.current?.focus(); }, [phase.name]);

  const assessment = entry ? assessCashflowEditDraft(draft, entry.figures) : null;
  const hasErrors = assessment ? Object.keys(assessment.errors).length > 0 : false;

  async function submit(confirmReplace: boolean) {
    if (!entry || !assessment || inFlight.current || hasErrors || assessment.unchanged) return;
    inFlight.current = true;
    setBusy(true);
    setNotice(null);
    try {
      const r = await call(`/api/owner/cashflow/snapshots/${entry.id}/amend`, {
        method: "POST",
        body: JSON.stringify({ expectedUpdatedAt: entry.updatedAt, ...(confirmReplace ? { confirmReplace: true } : {}), ...assessment.proposed }),
      });
      if (r.ok) {
        const result = r.body as { changed?: boolean; changedFields?: Record<string, unknown>; snapshot?: Record<string, unknown> };
        if (result.snapshot) setEntry(toEntry(result.snapshot));
        // The "a read needs updating" sentence is about the bank balance a read rests on: said only when THAT was changed.
        const bankBalanceChanged = Boolean(result.changedFields && Object.prototype.hasOwnProperty.call(result.changedFields, "bankBalance"));
        setPhase({ name: "saved", changed: result.changed !== false, bankBalanceChanged });
        onSaved();
        return;
      }
      const failure: CashflowWriteFailure = classifyCashflowWriteFailure(r.status, r.body);
      if (failure.kind === "CONFIRMATION_REQUIRED") {
        setPhase({ name: "confirming", questions: replacementQuestions(assessment.changes, entry.currency) });
      } else if (failure.kind === "STALE") {
        setPhase({ name: "stale", message: failure.message });
        if (failure.current && failure.updatedAt) {
          // Show the FRESH figures the server holds now; the owner decides again from them.
          setEntry({ ...entry, updatedAt: failure.updatedAt, figures: failure.current });
          setDraft(draftFromFigures(failure.current));
        }
      } else {
        setNotice(failure.message);
      }
    } catch {
      setNotice("We couldn't confirm that this was saved. Reload this page to see the figures on record before trying again.");
    } finally {
      inFlight.current = false;
      setBusy(false);
    }
  }

  return (
    <section data-testid="cashflow-entry-editor" className="mb-6 rounded-lg border bg-card p-4">
      <h2 ref={headingRef} tabIndex={-1} className="text-lg font-semibold text-foreground outline-none">Edit your cash figures</h2>
      {phase.name === "loading" && <p className="mt-2 text-sm text-muted-foreground">Opening the entry…</p>}
      {phase.name === "load_failed" && (
        <div role="alert" className="mt-2 text-sm text-destructive" data-testid="cashflow-edit-load-failed">
          <p>{phase.message}</p>
          <Button type="button" variant="secondary" className="mt-2 min-h-11" onClick={onClose}>Back</Button>
        </div>
      )}

      {entry && phase.name !== "loading" && phase.name !== "load_failed" && (
        <>
          <p className="mt-1 text-sm text-muted-foreground" data-testid="cashflow-edit-period">
            Entry for {periodLabel({ start: entry.periodStart, end: entry.periodEnd })} · {entry.currency}. The period and currency can&rsquo;t be changed here.
          </p>
          <dl className="mt-3 rounded-md border border-border bg-background p-3 text-sm" data-testid="cashflow-edit-current">
            <dt className="font-medium text-muted-foreground">Recorded now</dt>
            {CASHFLOW_AMEND_FIELDS.map((f) => (
              <dd key={f} className="mt-0.5 text-foreground" data-testid={`cashflow-current-${f}`}>
                {CASHFLOW_FIELD_LABEL[f]}: <span className="font-semibold">{formatCashflowAmount(entry.figures[f], entry.currency)}</span>
              </dd>
            ))}
          </dl>

          {phase.name === "stale" && (
            <div role="alert" className="mt-3 rounded-md border border-border bg-background p-3 text-sm text-foreground" data-testid="cashflow-edit-stale">
              <p className="font-medium">{phase.message}</p>
              <p className="mt-1 text-muted-foreground">The figures above are what is recorded now. Change them again if you still want to.</p>
            </div>
          )}

          {phase.name === "saved" ? (
            <div role="status" className="mt-3 text-sm text-foreground" data-testid="cashflow-edit-saved">
              <p>
                {!phase.changed
                  ? "Nothing changed — these are the figures already recorded."
                  : phase.bankBalanceChanged
                    ? "Saved. A read that used this balance now needs updating to include it."
                    : "Saved. Your cash in hand is updated on this entry."}
              </p>
              <Button type="button" variant="secondary" className="mt-3 min-h-11" onClick={onClose}>Done</Button>
            </div>
          ) : (
            <form
              noValidate
              className="mt-3 space-y-3"
              onSubmit={(e) => { e.preventDefault(); void submit(false); }}
              data-testid="cashflow-edit-form"
            >
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                {CASHFLOW_AMEND_FIELDS.map((f) => (
                  <Input
                    key={f}
                    name={f}
                    label={`${CASHFLOW_FIELD_LABEL[f]} (${entry.currency})`}
                    type="text"
                    inputMode="decimal"
                    autoComplete="off"
                    placeholder="Not recorded"
                    value={draft[f]}
                    error={assessment?.errors[f]}
                    disabled={busy || phase.name === "confirming"}
                    onChange={(e) => { const typedValue = e.target.value; setDraft((d) => ({ ...d, [f]: typedValue })); }}
                  />
                ))}
              </div>
              <p className="text-xs text-muted-foreground">Emptying a figure that is recorded clears it, and you will be asked to confirm.</p>

              {phase.name === "confirming" && (
                <div role="alertdialog" aria-label="Confirm replacement" className="rounded-md border border-border bg-background p-3 text-sm" data-testid="cashflow-edit-confirm">
                  {phase.questions.map((q) => <p key={q} className="font-medium text-foreground">{q}</p>)}
                  <p className="mt-1 text-muted-foreground">The earlier figure stays in the history of this entry.</p>
                  <div className="mt-3 flex flex-col gap-2 sm:flex-row">
                    <Button type="button" className="min-h-11" disabled={busy} onClick={() => void submit(true)} data-testid="cashflow-edit-confirm-yes">
                      {busy ? "Saving…" : "Yes, replace"}
                    </Button>
                    <Button type="button" variant="secondary" className="min-h-11" disabled={busy} onClick={() => setPhase({ name: "editing" })}>No, go back</Button>
                  </div>
                </div>
              )}

              {notice !== null && <p role="alert" className="rounded-md border border-destructive/20 bg-destructive/5 p-3 text-sm text-destructive" data-testid="cashflow-edit-error">{notice}</p>}

              {phase.name !== "confirming" && (
                <div className="flex flex-col gap-2 sm:flex-row">
                  <Button
                    type="submit"
                    className="min-h-11"
                    disabled={busy || hasErrors || !assessment || assessment.unchanged}
                    aria-describedby={assessment?.unchanged && !hasErrors ? "cashflow-edit-save-hint" : undefined}
                    data-testid="cashflow-edit-save"
                  >
                    {busy ? "Saving…" : "Save changes"}
                  </Button>
                  {assessment?.unchanged && !hasErrors && !busy && (
                    <p id="cashflow-edit-save-hint" className="self-center text-sm text-muted-foreground" data-testid="cashflow-edit-save-hint">Change a figure to save</p>
                  )}
                  <Button type="button" variant="secondary" className="min-h-11" disabled={busy} onClick={onClose}>Cancel</Button>
                </div>
              )}
            </form>
          )}
        </>
      )}
    </section>
  );
}

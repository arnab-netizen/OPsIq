"use client";

/**
 * "Update this period" — open a saved Finance period, see what is recorded now, change only what is wrong or newly known, and
 * save it as a correction. Presentation only: the draft → amendment rules live in `@/domain/owner-finance/snapshot-amend-form`,
 * the wording of a failure in `@/domain/owner-finance/snapshot-form-errors`, and the save goes to the governed amendment route
 * (the earlier version is kept as history; the new one becomes the current evidence).
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { Button, Input } from "@/ui/primitives";
import { EvidenceQualityFieldset } from "@/components/owner/EvidenceQualityFieldset";
import { type EvidenceQuality } from "@/domain/owner-finance/evidence-quality";
import { FINANCE_FIELDS } from "@/domain/owner-finance/snapshot-fields";
import {
  AMEND_REASONS,
  describeChange,
  isLegacyLeakageRow,
  planPeriodAmendment,
  recordedFiguresFromRow,
  type AmendReasonId,
} from "@/domain/owner-finance/snapshot-amend-form";
import { presentSnapshotFormError, type SnapshotFormError } from "@/domain/owner-finance/snapshot-form-errors";
import { formatCashflowAmount } from "@/domain/owner-cashflow/edit-flow";
import { amendFinanceSnapshot, type AmendResult } from "@/lib/owner-finance-client";

const num = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) ? v : null);

export function FinancePeriodEditor({
  row,
  currency,
  periodText,
  initialDraft,
  onSaved,
  onCancel,
  onStale,
}: {
  /** The current version of the period being updated, as the snapshots list returns it. */
  row: Record<string, unknown>;
  currency: string;
  /** "September 2026" — the period in owner words. */
  periodText: string;
  /** Figures the owner already typed on the "add a period" form, carried over when that form hit "this period exists". */
  initialDraft?: Readonly<Record<string, string>>;
  onSaved: (result: AmendResult) => void;
  onCancel: () => void;
  /** The version this form was opened on has been replaced: reload the latest figures. */
  onStale: () => void;
}) {
  const snapshotId = String(row.id);
  const recorded = useMemo(() => recordedFiguresFromRow(row), [row]);
  const legacy = isLegacyLeakageRow(row);
  const [draft, setDraft] = useState<Record<string, string>>({ ...(initialDraft ?? {}) });
  const [unknown, setUnknown] = useState<Record<string, boolean>>({});
  const [quality, setQuality] = useState<EvidenceQuality | null>(null);
  const [reasonId, setReasonId] = useState<AmendReasonId>("completed");
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState<SnapshotFormError | null>(null);
  const inFlight = useRef(false);
  const headingRef = useRef<HTMLHeadingElement>(null);
  useEffect(() => { headingRef.current?.focus(); }, []);

  const plan = useMemo(() => planPeriodAmendment(row, draft, unknown, quality !== null), [row, draft, unknown, quality]);
  const fmt = (n: number | null) => formatCashflowAmount(n, currency);
  const messages = { ...plan.errors, ...(failure?.fieldMessages ?? {}) };

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (inFlight.current || !plan.canSave) return;
    inFlight.current = true;
    setBusy(true);
    setFailure(null);
    try {
      const reason = AMEND_REASONS.find((r) => r.id === reasonId)?.text ?? AMEND_REASONS[0].text;
      const result = await amendFinanceSnapshot(snapshotId, {
        amendmentReason: reason,
        ...plan.fields,
        ...(quality ? { evidenceQuality: quality } : {}),
      });
      onSaved(result);
    } catch (err) {
      const presented = presentSnapshotFormError(err, "amend");
      setFailure(presented);
      if (presented.focusField) document.getElementById(`period-edit-${presented.focusField}`)?.focus();
    } finally {
      inFlight.current = false;
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} noValidate data-testid="finance-period-editor" className="rounded-lg border border-border bg-card p-4">
      <h3 ref={headingRef} tabIndex={-1} className="text-lg font-semibold text-foreground outline-none">Update {periodText}</h3>
      <p className="mt-1 text-sm text-muted-foreground">
        Change only what is wrong or newly known and leave the rest blank. Tick “I don&apos;t know” to take a figure back to unknown — OpsIQ
        treats that as unknown, never as zero. Your earlier figures are kept as history.
      </p>
      {legacy && num(row.refundReworkCost) !== null && (
        <p className="mt-2 rounded-md border border-border bg-muted/40 p-2 text-sm text-foreground" data-testid="finance-period-editor-legacy">
          This period has one combined figure for refunds, redone work and complaints ({fmt(Number(row.refundReworkCost))}). It can&apos;t be split, so
          to change any of those three, enter all three.
        </p>
      )}
      {legacy && num(row.refundReworkCost) === null && (
        <p className="mt-2 rounded-md border border-border bg-muted/40 p-2 text-sm text-foreground" data-testid="finance-period-editor-legacy">
          This period was saved before refunds, redone work and complaint costs were kept separately. To add any of those three, enter all three — tick
          “I don&apos;t know” for any you can&apos;t give.
        </p>
      )}
      <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
        {FINANCE_FIELDS.map((f) => {
          const was = recorded[f.name];
          const markedUnknown = unknown[f.name] === true;
          const canMarkUnknown = was !== null || (legacy && ["refundAmount", "reworkCost", "complaintCost"].includes(f.name));
          return (
            <div key={f.name}>
              <Input
                id={`period-edit-${f.name}`}
                name={f.name}
                label={`${f.label} (${currency})`}
                type="text"
                inputMode="decimal"
                autoComplete="off"
                placeholder={markedUnknown ? "Will be treated as unknown" : "Blank = leave as is"}
                hint={`Recorded now: ${was === null ? "not entered" : fmt(was)}`}
                value={markedUnknown ? "" : draft[f.name] ?? ""}
                disabled={markedUnknown}
                error={messages[f.name]}
                onChange={(e) => { const typedValue = e.target.value; setDraft((d) => ({ ...d, [f.name]: typedValue })); }}
              />
              {canMarkUnknown && (
                <label className="mt-1 flex min-h-11 items-center gap-2 text-sm text-foreground">
                  <input
                    type="checkbox"
                    name={`${f.name}-unknown`}
                    aria-label={`I don't know ${f.label}`}
                    data-testid={`finance-period-unknown-${f.name}`}
                    checked={markedUnknown}
                    onChange={(e) => { const typedChecked = e.target.checked; setUnknown((u) => ({ ...u, [f.name]: typedChecked })); }}
                  />
                  I don&apos;t know this figure
                </label>
              )}
            </div>
          );
        })}
      </div>
      {plan.formProblem && (
        <p role="alert" className="mt-3 text-sm text-destructive" data-testid="finance-period-editor-problem">{plan.formProblem}</p>
      )}
      <div className="mt-4">
        <label className="text-sm font-medium text-foreground" htmlFor="period-edit-reason">Why are you updating this period?</label>
        <select
          id="period-edit-reason"
          value={reasonId}
          onChange={(e) => setReasonId(e.target.value as AmendReasonId)}
          className="mt-1 h-11 w-full rounded-md border border-border bg-background px-3 text-base sm:h-10 sm:text-sm"
        >
          {AMEND_REASONS.map((r) => <option key={r.id} value={r.id}>{r.label}</option>)}
        </select>
      </div>
      <EvidenceQualityFieldset
        legend="How reliable are the updated numbers? (optional)"
        name="periodEditQuality"
        value={quality}
        onChange={setQuality}
        hint="If you change a number and say nothing here, OpsIQ stops treating the whole set as straight from your records."
      />
      {plan.changes.length > 0 && (
        <div className="mt-4 rounded-md border border-border bg-background p-3" data-testid="finance-period-editor-changes">
          <p className="text-sm font-medium text-foreground">This will change:</p>
          <ul className="mt-1 list-disc pl-5 text-sm text-foreground">
            {plan.changes.map((c) => <li key={c.field}>{describeChange(c, fmt)}</li>)}
          </ul>
        </div>
      )}
      {plan.changes.length === 0 && plan.sameAsRecorded.length > 0 && (
        <p role="status" className="mt-3 text-sm text-muted-foreground" data-testid="finance-period-editor-same">
          That is what is already recorded, so there is nothing to update. Change a figure to update this period.
        </p>
      )}
      {failure && (
        <div role="alert" className="mt-3 rounded-md border border-destructive/20 bg-destructive/5 p-3 text-sm text-destructive" data-testid="finance-period-editor-error">
          <p>{failure.message}</p>
          {failure.kind === "STALE" && (
            <Button type="button" variant="secondary" className="mt-2" onClick={onStale}>Show the latest figures</Button>
          )}
        </div>
      )}
      <div className="mt-4 flex flex-col gap-2 sm:flex-row">
        <Button type="submit" disabled={busy || !plan.canSave} className="min-h-11" data-testid="finance-period-editor-submit">
          {busy ? "Saving…" : "Save as a correction"}
        </Button>
        <Button type="button" variant="secondary" onClick={onCancel} disabled={busy} className="min-h-11">Cancel</Button>
      </div>
    </form>
  );
}

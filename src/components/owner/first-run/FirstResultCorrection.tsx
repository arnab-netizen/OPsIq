"use client";

/**
 * "Something here is wrong" — a direct, governed correction of the evidence behind the first read.
 * Parsing reuses the quick-entry parser (blank = unchanged, 0 = a real zero); the save goes to the canonical
 * amendment route, which keeps the old version and re-runs the canonical diagnosis. Presentation only.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { Button, Input } from "@/ui/primitives";
import { assessCorrectionDraft, correctionFields, type CorrectionField } from "@/domain/owner-first-run/correction-form";
import { formatCashflowAmount } from "@/domain/owner-cashflow/edit-flow";
import { type EvidenceQuality } from "@/domain/owner-finance/evidence-quality";
import { EvidenceQualityFieldset } from "@/components/owner/EvidenceQualityFieldset";
import { firstRunApi, type CorrectionResult } from "@/lib/owner-first-run-client";
import { firstRunErrorText } from "@/lib/first-run-errors";
import { HttpResponseError } from "@/lib/operator-safe-errors";
import { CORRECTION_UNCONFIRMED_MESSAGE } from "@/domain/owner-first-run/read-staleness";

export function FirstResultCorrection({
  businessId,
  snapshotId,
  currency,
  fields,
  recorded,
  onDone,
  onCancel,
}: {
  businessId: string;
  snapshotId: string;
  currency: string;
  /** The figures offered (defaults to the four quick-entry figures; Improve adds the ones its question is about). */
  fields?: readonly CorrectionField[];
  /** What is recorded NOW for each figure (null = not recorded), shown before the owner changes anything. */
  recorded?: Readonly<Record<string, number | null>>;
  onDone: (result: CorrectionResult) => void;
  onCancel: () => void;
}) {
  const offered = useMemo(() => fields ?? correctionFields(), [fields]);
  const [draft, setDraft] = useState<Record<string, string>>({});
  const [quality, setQuality] = useState<EvidenceQuality | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inFlight = useRef(false);
  const headingRef = useRef<HTMLHeadingElement>(null);
  // The panel opens below the read: move focus to it so keyboard and screen-reader users land on the form.
  useEffect(() => { headingRef.current?.focus(); }, []);
  const assessment = useMemo(() => assessCorrectionDraft(draft, offered, recorded), [draft, offered, recorded]);
  const hasErrors = Object.keys(assessment.errors).length > 0;
  const enteredCount = Object.keys(assessment.values).length;
  // Entering what is already recorded changes nothing: it is not a correction (the server refuses it too).
  const changes = enteredCount > assessment.sameAsRecorded.length || quality !== null;
  const onlySame = enteredCount > 0 && enteredCount === assessment.sameAsRecorded.length && quality === null;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (inFlight.current || hasErrors || !changes) return;
    inFlight.current = true;
    setBusy(true);
    setError(null);
    try {
      const result = await firstRunApi.correct({
        businessId,
        snapshotId,
        amendmentReason: "Corrected by the owner after seeing the first read",
        ...assessment.values,
        ...(quality ? { evidenceQuality: quality } : {}),
      });
      onDone(result);
    } catch (err) {
      // A 4xx is refused before anything is written, so "unchanged" is true. Anything else (network, 5xx) may have
      // reached the server after the amendment committed: say it is unconfirmed, never that nothing changed.
      const refusedBeforeWrite = err instanceof HttpResponseError && err.status >= 400 && err.status < 500;
      // 409 means the figures moved under this form (another tab corrected them): the server's reason stands alone, and
      // "unchanged" is not claimed because the numbers on record are no longer the ones this form was opened on.
      const conflict = err instanceof HttpResponseError && err.status === 409;
      setError(
        conflict
          ? firstRunErrorText(err)
          : refusedBeforeWrite
            ? `We couldn't apply that correction. Your earlier numbers are unchanged. ${firstRunErrorText(err)}`
            : CORRECTION_UNCONFIRMED_MESSAGE,
      );
    } finally {
      inFlight.current = false;
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} noValidate data-testid="first-result-correction" className="rounded-lg border border-border bg-background p-4">
      <h3 ref={headingRef} tabIndex={-1} className="text-lg font-semibold text-foreground outline-none">What should be different?</h3>
      <p className="mt-1 text-sm text-muted-foreground">
        Change only what is wrong and leave the rest blank. Your earlier numbers are kept on record, and OpsIQ will work out the read again.
      </p>
      <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
        {offered.map((f) => (
          <Input
            key={f.name}
            name={f.name}
            label={`${f.label} (${currency})`}
            type="text"
            inputMode="decimal"
            autoComplete="off"
            placeholder="Blank = leave as is"
            hint={recorded && f.name in recorded ? (recorded[f.name] === null ? "Recorded now: nothing yet" : `Recorded now: ${formatCashflowAmount(recorded[f.name], currency)}`) : undefined}
            value={draft[f.name] ?? ""}
            error={assessment.errors[f.name]}
            onChange={(e) => setDraft((d) => ({ ...d, [f.name]: e.target.value }))}
          />
        ))}
      </div>
      {onlySame && (
        <p role="status" className="mt-3 text-sm text-muted-foreground" data-testid="first-result-correction-same">
          That is what is already recorded, so there is nothing to correct. Change a figure to update your read.
        </p>
      )}
      <EvidenceQualityFieldset
        legend="How reliable are the corrected numbers?"
        name="correctionQuality"
        value={quality}
        onChange={setQuality}
        hint="Optional. If you change a number and say nothing here, OpsIQ stops treating the whole set as straight from your records."
      />
      {error && (
        <p
          role="alert"
          className="mt-3 rounded-md border border-destructive/20 bg-destructive/5 p-3 text-sm text-destructive"
          data-testid="first-result-correction-error"
        >
          {error}
        </p>
      )}
      <div className="mt-4 flex flex-col gap-2 sm:flex-row">
        <Button type="submit" disabled={busy || hasErrors || !changes} className="min-h-11" data-testid="first-result-correction-submit">
          {busy ? "Working it out again…" : "Save correction and update the read"}
        </Button>
        <Button type="button" variant="secondary" onClick={onCancel} disabled={busy} className="min-h-11">Cancel</Button>
      </div>
    </form>
  );
}

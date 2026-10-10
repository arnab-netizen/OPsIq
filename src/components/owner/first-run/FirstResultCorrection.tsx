"use client";

/**
 * "Something here is wrong" — a direct, governed correction of the evidence behind the first read.
 * Parsing reuses the quick-entry parser (blank = unchanged, 0 = a real zero); the save goes to the canonical
 * amendment route, which keeps the old version and re-runs the canonical diagnosis. Presentation only.
 */
import { useMemo, useRef, useState } from "react";
import { Button, Input } from "@/ui/primitives";
import { QUICK_ENTRY_FIELDS, assessQuickEntry, type QuickEntryDraft } from "@/domain/owner-finance/quick-entry";
import { EVIDENCE_QUALITIES, EVIDENCE_QUALITY_LABEL, type EvidenceQuality } from "@/domain/owner-finance/evidence-quality";
import { firstRunApi, type CorrectionResult } from "@/lib/owner-first-run-client";
import { classifyOperatorError } from "@/lib/operator-error-governance";

export function FirstResultCorrection({
  businessId,
  snapshotId,
  currency,
  onDone,
  onCancel,
}: {
  businessId: string;
  snapshotId: string;
  currency: string;
  onDone: (result: CorrectionResult) => void;
  onCancel: () => void;
}) {
  const [draft, setDraft] = useState<QuickEntryDraft>({});
  const [quality, setQuality] = useState<EvidenceQuality | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inFlight = useRef(false);
  const assessment = useMemo(() => assessQuickEntry(draft), [draft]);
  const hasErrors = Object.keys(assessment.errors).length > 0;
  const changes = Object.keys(assessment.values).length > 0 || quality !== null;

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
      const governed = classifyOperatorError(err instanceof Error ? err : new Error(String(err)), { context: "save" });
      setError(`We couldn't apply that correction. Your earlier numbers are unchanged. ${governed.recovery}`);
    } finally {
      inFlight.current = false;
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} noValidate data-testid="first-result-correction" className="rounded-lg border border-border bg-background p-4">
      <h3 className="text-lg font-semibold text-foreground">What should be different?</h3>
      <p className="mt-1 text-sm text-muted-foreground">
        Change only what is wrong and leave the rest blank. Your earlier numbers are kept on record, and OpsIQ will work out the read again.
      </p>
      <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
        {QUICK_ENTRY_FIELDS.map((f) => (
          <Input
            key={f.name}
            name={f.name}
            label={`${f.label} (${currency})`}
            type="text"
            inputMode="decimal"
            autoComplete="off"
            placeholder="Blank = leave as is"
            value={draft[f.name] ?? ""}
            error={assessment.errors[f.name]}
            onChange={(e) => setDraft((d) => ({ ...d, [f.name]: e.target.value }))}
          />
        ))}
      </div>
      <fieldset className="mt-3">
        <legend className="text-sm font-medium text-foreground">How reliable are the corrected numbers?</legend>
        <div className="mt-1 grid grid-cols-1 gap-2 sm:grid-cols-3">
          {EVIDENCE_QUALITIES.map((q) => (
            <label key={q} className={`flex min-h-11 cursor-pointer items-center gap-2 rounded-md border p-2 text-sm ${quality === q ? "border-primary bg-primary/10" : "border-border"}`}>
              <input type="radio" name="correctionQuality" checked={quality === q} onChange={() => setQuality(q)} />
              {EVIDENCE_QUALITY_LABEL[q]}
            </label>
          ))}
        </div>
      </fieldset>
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

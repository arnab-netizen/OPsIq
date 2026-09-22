"use client";

import { useId, useState } from "react";
import { Button, Input, Select } from "@/ui/primitives";

/**
 * UX-06 Wave B1 (Section X.2, K, Z): the two same-page inline forms that
 * replace the 20 `window.prompt()` call sites across Money/Sales/Operations/
 * Execution's action Complete/Verify buttons. Narrowly scoped presentation
 * components only -- no domain API URLs, business IDs, endpoints, `load()`,
 * the shared active-business context, race guards, or server error governance live here.
 * Each domain page owns those and calls back into this component only with
 * already-validated, typed values.
 */

export interface CompletionValues {
  completionNotes: string;
  completionEvidence: string[];
}

export interface CompletionActionFormProps {
  busy?: boolean;
  /** DOM id for the <form> element itself, so a caller's trigger button can point its
   *  aria-controls at this exact instance. Optional -- omitting it only omits the id attribute,
   *  it does not affect the form's own accessible name (see headingId below). */
  formId?: string;
  onCancel: () => void;
  onSave: (values: CompletionValues) => void;
}

export function CompletionActionForm({ busy = false, formId, onCancel, onSave }: CompletionActionFormProps) {
  const [notes, setNotes] = useState("");
  const [evidence, setEvidence] = useState("");
  // useId() guarantees a unique id per mounted instance (unlike a static string), so the form's
  // accessible name never collides even if more than one of these were ever mounted at once.
  const headingId = useId();

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    // No trimming: the old window.prompt()-based flow this replaces preserved whatever the owner
    // typed verbatim (`window.prompt("Completion notes:") || ""`; evidence was `ev ? [ev] : []` on
    // the raw string) -- the frozen contract (UX-06 Section Z) requires the same payload semantics
    // for a valid submission, so introducing trimming here would be an unauthorized behavior change.
    onSave({
      completionNotes: notes,
      completionEvidence: evidence ? [evidence] : [],
    });
  }

  return (
    <form
      id={formId}
      aria-labelledby={headingId}
      onSubmit={handleSubmit}
      className="mt-3 rounded-md border border-border bg-card p-3 space-y-3"
    >
      <h4 id={headingId} className="text-sm font-semibold text-foreground">Complete action</h4>
      <Input
        name="completionNotes"
        label="Completion notes"
        value={notes}
        onChange={(e) => setNotes(e.target.value)}
        disabled={busy}
      />
      <Input
        name="completionEvidence"
        label="Completion evidence"
        value={evidence}
        onChange={(e) => setEvidence(e.target.value)}
        disabled={busy}
      />
      <div className="flex gap-2">
        <Button type="submit" size="sm" disabled={busy}>
          {busy ? "Saving…" : "Save completion"}
        </Button>
        <Button type="button" size="sm" variant="outline" onClick={onCancel} disabled={busy}>
          Cancel
        </Button>
      </div>
    </form>
  );
}

export interface VerificationValues {
  beforeValue: number | null;
  afterValue: number | null;
  targetDirection: "up" | "down";
}

export interface VerificationActionFormProps {
  busy?: boolean;
  /** Freezes each domain's own pre-existing default (Money: down; Sales/Operations/Execution: up). */
  defaultDirection: "up" | "down";
  /** Humanized metric text shown as "Metric: <this>". */
  metricLabel: string;
  /** DOM id for the <form> element itself, so a caller's trigger button can point its
   *  aria-controls at this exact instance. Optional -- omitting it only omits the id attribute,
   *  it does not affect the form's own accessible name (see headingId below). */
  formId?: string;
  onCancel: () => void;
  onSave: (values: VerificationValues) => void;
}

/**
 * Blank means null (never 0/NaN/""). A non-blank value must be a finite
 * number or the field fails local validation -- ordinary field validation,
 * never routed through server-error governance (Section K's frozen contract).
 *
 * Exported for direct unit testing: this function's non-blank+non-finite
 * branch is unreachable through normal typing, by two distinct mechanisms:
 *   1. Value sanitization: a native `type="number"` input clears anything
 *      that doesn't parse to a finite number (including magnitude overflow,
 *      e.g. "1e400") back to "" the instant it's typed, so this function is
 *      never actually called with a non-blank, non-finite string from a
 *      rendered field's own value. This holds in both jsdom (via
 *      fireEvent.change) and real Chromium (via Playwright's real keyboard
 *      input) -- jsdom does reproduce this mechanism.
 *   2. Submission blocking: independently of (1), typing an unparseable
 *      entry via real keyboard input in Chromium (confirmed with Playwright,
 *      not fireEvent) sets the field's own `validity.badInput` to true, and
 *      Chromium's native constraint validation then blocks the "submit"
 *      event itself from ever firing -- confirmed via both a real
 *      Save-button click and a real Enter keypress, either way with zero
 *      network requests and this form's own onSubmit handler never invoked
 *      at all (confirmed with a temporary console.log instrumentation
 *      probe). A no-op click is the actual observed behavior for this case
 *      in Chromium, not a silent null submission. jsdom does NOT reproduce
 *      this mechanism -- it never computes `validity.badInput` from a value
 *      assigned via fireEvent.change, so the corresponding unit test
 *      simulates it directly instead (see domain-action-inline-forms.
 *      test.tsx). This was verified in Chromium only; other browser engines
 *      were not tested here.
 * This export lets the branch itself be proven correct directly, since a
 * rendered Chromium browser cannot reach it through normal typing.
 */
export function parseOptionalNumericField(raw: string): { valid: true; value: number | null } | { valid: false } {
  const trimmed = raw.trim();
  if (trimmed === "") return { valid: true, value: null };
  const parsed = Number(trimmed);
  if (!Number.isFinite(parsed)) return { valid: false };
  return { valid: true, value: parsed };
}

export function VerificationActionForm({
  busy = false,
  defaultDirection,
  metricLabel,
  formId,
  onCancel,
  onSave,
}: VerificationActionFormProps) {
  const [beforeRaw, setBeforeRaw] = useState("");
  const [afterRaw, setAfterRaw] = useState("");
  const [targetDirection, setTargetDirection] = useState<"up" | "down">(defaultDirection);
  const [validationError, setValidationError] = useState<string | null>(null);
  // useId() guarantees a unique id per mounted instance (unlike a static string), so the form's
  // accessible name never collides even if more than one of these were ever mounted at once.
  const headingId = useId();

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const before = parseOptionalNumericField(beforeRaw);
    const after = parseOptionalNumericField(afterRaw);
    if (!before.valid || !after.valid) {
      setValidationError("Enter a valid number or leave the field blank.");
      return;
    }
    setValidationError(null);
    onSave({ beforeValue: before.value, afterValue: after.value, targetDirection });
  }

  return (
    <form
      id={formId}
      aria-labelledby={headingId}
      onSubmit={handleSubmit}
      className="mt-3 rounded-md border border-border bg-card p-3 space-y-3"
    >
      <h4 id={headingId} className="text-sm font-semibold text-foreground">Verify outcome</h4>
      <p className="text-xs text-muted-foreground">Metric: {metricLabel}</p>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Input
          name="beforeValue"
          label="Before value"
          type="number"
          step="any"
          value={beforeRaw}
          onChange={(e) => setBeforeRaw(e.target.value)}
          disabled={busy}
        />
        <Input
          name="afterValue"
          label="After value"
          type="number"
          step="any"
          value={afterRaw}
          onChange={(e) => setAfterRaw(e.target.value)}
          disabled={busy}
        />
      </div>
      <Select
        name="targetDirection"
        label="Target direction"
        value={targetDirection}
        onChange={(e) => setTargetDirection(e.target.value === "up" ? "up" : "down")}
        disabled={busy}
        options={[
          { value: "up", label: "Up" },
          { value: "down", label: "Down" },
        ]}
      />
      {validationError && (
        <p role="alert" className="text-xs text-destructive">
          {validationError}
        </p>
      )}
      <div className="flex gap-2">
        <Button type="submit" size="sm" disabled={busy}>
          {busy ? "Saving…" : "Save verification"}
        </Button>
        <Button type="button" size="sm" variant="outline" onClick={onCancel} disabled={busy}>
          Cancel
        </Button>
      </div>
    </form>
  );
}

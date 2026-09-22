"use client";

import { useState } from "react";
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
  onCancel: () => void;
  onSave: (values: CompletionValues) => void;
}

export function CompletionActionForm({ busy = false, onCancel, onSave }: CompletionActionFormProps) {
  const [notes, setNotes] = useState("");
  const [evidence, setEvidence] = useState("");

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const trimmedNotes = notes.trim();
    const trimmedEvidence = evidence.trim();
    onSave({
      completionNotes: trimmedNotes,
      completionEvidence: trimmedEvidence ? [trimmedEvidence] : [],
    });
  }

  return (
    <form onSubmit={handleSubmit} className="mt-3 rounded-md border border-border bg-card p-3 space-y-3">
      <h4 className="text-sm font-semibold text-foreground">Complete action</h4>
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
  onCancel: () => void;
  onSave: (values: VerificationValues) => void;
}

/**
 * Blank means null (never 0/NaN/""). A non-blank value must be a finite
 * number or the field fails local validation -- ordinary field validation,
 * never routed through server-error governance (Section K's frozen contract).
 *
 * Exported for direct unit testing: a native `type="number"` input's own DOM
 * sanitization already clears anything that doesn't parse to a finite number
 * (including magnitude overflow) back to "" before this ever runs, so the
 * non-blank+non-finite branch below is unreachable through normal browser
 * interaction -- this export lets that branch be proven correct directly.
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
  onCancel,
  onSave,
}: VerificationActionFormProps) {
  const [beforeRaw, setBeforeRaw] = useState("");
  const [afterRaw, setAfterRaw] = useState("");
  const [targetDirection, setTargetDirection] = useState<"up" | "down">(defaultDirection);
  const [validationError, setValidationError] = useState<string | null>(null);

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
    <form onSubmit={handleSubmit} className="mt-3 rounded-md border border-border bg-card p-3 space-y-3">
      <h4 className="text-sm font-semibold text-foreground">Verify outcome</h4>
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

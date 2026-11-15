"use client";

/**
 * The one "how reliable are these numbers?" control (Actual / good estimate / rough guess). Presentation only: the
 * choices, labels and explanations come from the evidence-quality domain, and the server enforces that the first
 * evidence states one (a client-side required marker is not the integrity guarantee).
 */
import { EVIDENCE_QUALITIES, EVIDENCE_QUALITY_EXPLANATION, EVIDENCE_QUALITY_LABEL, type EvidenceQuality } from "@/domain/owner-finance/evidence-quality";

export function EvidenceQualityFieldset({
  value,
  onChange,
  legend = "How reliable are these numbers?",
  name = "evidenceQuality",
  disabled,
  required,
  testId,
  hint,
}: {
  value: EvidenceQuality | null;
  onChange: (q: EvidenceQuality) => void;
  legend?: string;
  name?: string;
  disabled?: boolean;
  required?: boolean;
  testId?: string;
  hint?: string;
}) {
  return (
    <fieldset className="mt-4" data-testid={testId} disabled={disabled}>
      <legend className="text-sm font-medium text-foreground">{legend}</legend>
      <div className="mt-1 grid grid-cols-1 gap-2 sm:grid-cols-3">
        {EVIDENCE_QUALITIES.map((q) => (
          <label
            key={q}
            className={`flex min-h-11 cursor-pointer items-center gap-2 rounded-md border p-2 text-sm ${value === q ? "border-primary bg-primary/10" : "border-border bg-background"}`}
          >
            <input type="radio" name={name} value={q} checked={value === q} required={required} onChange={() => onChange(q)} className="h-5 w-5" />
            <span>{EVIDENCE_QUALITY_LABEL[q]}</span>
          </label>
        ))}
      </div>
      <p className="mt-1 text-xs text-muted-foreground" data-testid={testId ? `${testId}-note` : undefined}>
        {value ? EVIDENCE_QUALITY_EXPLANATION[value] : (hint ?? "Pick one so OpsIQ can say how far to trust the read.")}
      </p>
    </fieldset>
  );
}

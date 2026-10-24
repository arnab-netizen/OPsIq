"use client";

import { useRef, useState, type FormEvent } from "react";
import {
  AGENCY_EXAMPLE_INPUT,
  AGENCY_INPUT_FIELDS,
  diagnoseAgency,
  type AgencyDiagnosticInput,
  type AgencyDiagnosticResult,
} from "@/lib/agency-diagnostic/diagnose";
import { trackAgencyEvent } from "./agency-events";

type Draft = Record<keyof AgencyDiagnosticInput, string>;

const initialDraft = (): Draft =>
  Object.fromEntries(AGENCY_INPUT_FIELDS.map((f) => [f.key, String(AGENCY_EXAMPLE_INPUT[f.key])])) as Draft;

/** Presentation only: parsing the form and rendering the result. All decision logic lives in the lib. */
export function AgencyDiagnosticClient() {
  const [draft, setDraft] = useState<Draft>(initialDraft);
  const [result, setResult] = useState<AgencyDiagnosticResult | null>(null);
  // Funnel counters fire at most once per page mount; no form content is ever passed to them.
  const started = useRef(false);
  const completed = useRef(false);

  function markStarted() {
    if (started.current) return;
    started.current = true;
    trackAgencyEvent("AGENCY_DIAGNOSTIC_START");
  }

  function onSubmit(event: FormEvent) {
    event.preventDefault();
    const parsed = Object.fromEntries(
      AGENCY_INPUT_FIELDS.map((f) => [f.key, draft[f.key].trim() === "" ? Number.NaN : Number(draft[f.key])])
    ) as AgencyDiagnosticInput;
    const next = diagnoseAgency(parsed);
    setResult(next);
    if (next.ok && !completed.current) {
      markStarted();
      completed.current = true;
      trackAgencyEvent("AGENCY_DIAGNOSTIC_COMPLETE");
    }
  }

  return (
    <div className="mt-8">
      <form onSubmit={onSubmit} className="grid gap-4 sm:grid-cols-2" aria-label="Agency decision diagnostic inputs">
        {AGENCY_INPUT_FIELDS.map((f) => (
          <label key={f.key} className="flex flex-col gap-1 text-sm font-medium">
            {f.label}
            <input
              type="number"
              inputMode="decimal"
              min={0}
              step={f.step}
              value={draft[f.key]}
              onChange={(e) => {
                markStarted();
                setDraft((d) => ({ ...d, [f.key]: e.target.value }));
              }}
              className="rounded-md border border-border bg-background px-3 py-2 text-base"
              aria-describedby={`${f.key}-hint`}
            />
            <span id={`${f.key}-hint`} className="text-xs font-normal text-muted-foreground">
              {f.hint}
            </span>
          </label>
        ))}
        <div className="sm:col-span-2">
          <button type="submit" className="rounded-md bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground">
            Find my first priority
          </button>
        </div>
      </form>

      <div aria-live="polite" className="mt-8">
        {result && !result.ok && (
          <ul className="list-disc space-y-1 pl-5 text-sm text-destructive" role="alert">
            {result.errors.map((e) => (
              <li key={e}>{e}</li>
            ))}
          </ul>
        )}
        {result && result.ok && (
          <section aria-labelledby="priority-heading" className="rounded-lg border border-border p-5">
            <h2 id="priority-heading" className="font-display text-xl font-bold">
              {result.priority ? "Fix this first" : "No clear issue found"}
            </h2>
            <p className="mt-2 text-base leading-relaxed">{result.priority ? result.priority.why : result.noIssueMessage}</p>
            {result.priority && (
              <p className="mt-3 text-base leading-relaxed">
                <strong>This week:</strong> {result.priority.next}
              </p>
            )}
            {result.others.length > 0 && (
              <div className="mt-5">
                <h3 className="text-sm font-semibold">Also flagged, in order</h3>
                <ol className="mt-2 list-decimal space-y-2 pl-5 text-sm">
                  {result.others.map((o) => (
                    <li key={o.key}>{o.why}</li>
                  ))}
                </ol>
              </div>
            )}
          </section>
        )}
      </div>
    </div>
  );
}

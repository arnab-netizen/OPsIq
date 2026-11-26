"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { CURRENCIES, DEFAULT_CURRENCY, normalizeCurrency, parseField, type CurrencyCode } from "@/services/tools/agency/shared";
import type { AgencyToolId } from "@/services/tools/agency/registry";
import { trackCalculatorEvent } from "@/lib/analytics/calculator-events";
import { CALC_CONFIGS, makeFmt, type EvalOutcome, type Tone } from "./configs";

/**
 * One reusable, deterministic, browser-only calculator form. Nothing typed here is sent, stored or put in the URL.
 * Validation never turns a blank or unreadable value into 0, and results are withheld (not guessed) until every required
 * field is valid. Analytics receive only the calculator id (start/complete), never any value.
 */
const TONE_CLASS: Record<Tone, string> = { pos: "text-emerald-700", neg: "text-red-700", warn: "text-amber-700", "": "" };

export function AgencyCalculator({ id }: { id: AgencyToolId }) {
  const config = CALC_CONFIGS[id];
  const sample = useMemo(() => Object.fromEntries(config.fields.map((f) => [f.key, f.sample])), [config]);
  const empty = useMemo(() => Object.fromEntries(config.fields.map((f) => [f.key, ""])), [config]);
  const [raw, setRaw] = useState<Record<string, string>>(sample);
  const [bad, setBad] = useState<Record<string, boolean>>({});
  const [currency, setCurrency] = useState<CurrencyCode>(DEFAULT_CURRENCY);
  const [isSample, setIsSample] = useState(true);
  const [edited, setEdited] = useState(false);
  const [copyStatus, setCopyStatus] = useState("");
  // Bumped on reset so inputs remount and any unreadable text the browser still shows is cleared.
  const [resetCount, setResetCount] = useState(0);
  const hasMoney = config.fields.some((f) => f.rule.kind === "money");

  const { outcome, fieldErrors, allBlank, differsFromSample } = useMemo(() => {
    const values: Record<string, number> = {};
    const blanks: Record<string, boolean> = {};
    const fieldErrors: Record<string, string> = {};
    for (const f of config.fields) {
      const p = parseField(raw[f.key] ?? "", f.rule, f.label, Boolean(bad[f.key]));
      if (p.ok) {
        values[f.key] = p.value;
        blanks[f.key] = p.blank;
      } else fieldErrors[f.key] = p.message;
    }
    const allBlank = config.fields.every((f) => (raw[f.key] ?? "").trim() === "" && !bad[f.key]);
    const differsFromSample = config.fields.some((f) => (raw[f.key] ?? "").trim() !== f.sample);
    const outcome: EvalOutcome =
      Object.keys(fieldErrors).length > 0 ? { ok: false, errors: Object.values(fieldErrors) } : config.evaluate(values, makeFmt(currency), blanks);
    return { outcome, fieldErrors, allBlank, differsFromSample };
  }, [raw, bad, currency, config]);

  const startedRef = useRef(false);
  // calculator_complete means exactly this and nothing more: the calculator displayed a VALID result for inputs that differ from
  // the preloaded sample, after the visitor changed an input. It does not show that every sample value was replaced, that the
  // numbers are real, or that the visitor is a genuine business owner or has any purchase intent.
  useEffect(() => {
    if (edited && differsFromSample && outcome.ok) trackCalculatorEvent("calculator_complete", id);
  }, [edited, differsFromSample, outcome.ok, id]);

  function onChange(key: string, value: string, unreadable: boolean) {
    setRaw((r) => ({ ...r, [key]: value }));
    setBad((b) => ({ ...b, [key]: unreadable }));
    setIsSample(false);
    setCopyStatus("");
    if (!startedRef.current) {
      startedRef.current = true;
      trackCalculatorEvent("calculator_start", id);
    }
    setEdited(true);
  }

  function reset(next: Record<string, string>, sampleState: boolean) {
    setRaw(next);
    setBad({});
    setIsSample(sampleState);
    setCopyStatus("");
    setResetCount((c) => c + 1);
  }

  async function copy() {
    if (!outcome.ok) return;
    try {
      await navigator.clipboard.writeText(outcome.view.summary.join("\n"));
      setCopyStatus("Copied.");
    } catch {
      setCopyStatus("Copy is not available in this browser. Select the result text and copy it manually.");
    }
  }

  const view = outcome.ok ? outcome.view : null;

  return (
    <section aria-labelledby={`calc-${id}-heading`} className="mt-8 grid gap-6 md:grid-cols-2">
      <form className="rounded-lg border border-border bg-background p-5" onSubmit={(e) => e.preventDefault()} autoComplete="off" noValidate>
        <div className="flex items-center justify-between gap-3">
          <h2 id={`calc-${id}-heading`} className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
            {config.basis}
          </h2>
          <span className="shrink-0 rounded border border-border bg-muted px-2 py-0.5 text-xs text-foreground">{isSample ? "Sample numbers" : "Your numbers"}</span>
        </div>
        {hasMoney && (
          <label className="mt-4 block text-sm font-medium">
            Currency
            <select
              value={currency}
              onChange={(e) => {
                setCurrency(normalizeCurrency(e.target.value));
                setCopyStatus("");
              }}
              className="mt-1 min-h-11 w-full rounded-md border border-border bg-background px-3 py-2"
            >
              {CURRENCIES.map((c) => (
                <option key={c.code} value={c.code}>
                  {c.code} - {c.name}
                </option>
              ))}
            </select>
            <span className="block text-xs font-normal text-muted-foreground">Changes the symbol only. It does not convert: enter every amount in this currency.</span>
          </label>
        )}
        <div className="mt-4 space-y-4">
          {config.fields.map((f) => {
            const err = fieldErrors[f.key];
            const showErr = Boolean(err) && !(allBlank && !bad[f.key]) && (raw[f.key] ?? "").trim() !== "" || Boolean(bad[f.key]);
            const hintId = `${id}-${f.key}-hint`;
            const errId = `${id}-${f.key}-err`;
            return (
              <label key={`${f.key}-${resetCount}`} className="block text-sm font-medium">
                {f.label}
                {!f.rule.required && <span className="font-normal text-muted-foreground"> (optional)</span>}
                {f.hint && (
                  <span id={hintId} className="block text-xs font-normal text-muted-foreground">
                    {f.hint}
                  </span>
                )}
                <input
                  type="number"
                  inputMode="decimal"
                  min={f.rule.min ?? 0}
                  step="any"
                  value={raw[f.key] ?? ""}
                  onChange={(e) => onChange(f.key, e.target.value, e.target.validity.badInput)}
                  aria-invalid={showErr || undefined}
                  aria-describedby={[f.hint ? hintId : "", showErr ? errId : ""].filter(Boolean).join(" ") || undefined}
                  className={`mt-1 min-h-11 w-full rounded-md border bg-background px-3 py-2 tabular-nums ${showErr ? "border-red-600" : "border-border"}`}
                />
                {showErr && (
                  <span id={errId} role="alert" className="mt-1 block text-xs font-normal text-red-700">
                    {err ?? `${f.label}: enter numbers only.`}
                  </span>
                )}
              </label>
            );
          })}
        </div>
        <div className="mt-5 flex flex-wrap gap-3">
          <button type="button" className="min-h-11 rounded-md border border-border px-3 py-2 text-sm font-medium hover:bg-muted focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--primary-text)]" onClick={() => reset(empty, false)}>
            Clear all
          </button>
          <button type="button" className="min-h-11 rounded-md border border-border px-3 py-2 text-sm font-medium hover:bg-muted focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--primary-text)]" onClick={() => reset(sample, true)}>
            Load sample
          </button>
        </div>
      </form>

      <div className="rounded-lg border border-border bg-background p-5" aria-live="polite">
        <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">Your result</h2>
        {!outcome.ok && (
          <div className="mt-3 rounded-md border-l-4 border-amber-500 bg-muted p-4">
            <strong className="block text-base">{allBlank ? "Enter your numbers" : "Results not available yet"}</strong>
            <span className="text-sm text-[var(--muted-foreground-accessible)]">
              {allBlank
                ? "Fill in the required boxes to see your results."
                : "Every required field needs a valid number before results are shown. Nothing has been calculated from the values as typed."}
            </span>
            {!allBlank && (
              <ul className="mt-2 list-disc pl-5 text-xs text-red-700">
                {outcome.errors.slice(0, 6).map((e) => (
                  <li key={e}>{e}</li>
                ))}
              </ul>
            )}
          </div>
        )}
        {view && (
          <>
            {view.warnings.length > 0 && (
              <div role="note" className="mt-3 rounded-md border border-amber-300 bg-amber-50 p-3 text-xs text-amber-900">
                <strong className="block">Read this before relying on the result</strong>
                <ul className="mt-1 list-disc space-y-1 pl-4">
                  {view.warnings.map((w) => (
                    <li key={w}>{w}</li>
                  ))}
                </ul>
              </div>
            )}
            <div className="mt-3 rounded-md border-l-4 border-[var(--primary-text)] bg-muted p-4">
              <strong className={`block text-base ${TONE_CLASS[view.headlineTone]}`}>{view.headline}</strong>
            </div>
            {view.sections.map((s) => (
              <div key={s.title ?? "rows"} className="mt-4">
                {s.title && <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">{s.title}</h3>}
                <dl className="mt-1 divide-y divide-border text-sm">
                  {s.rows.map((r) => (
                    <div key={r.label} className="flex flex-wrap justify-between gap-x-3 py-2 tabular-nums">
                      <dt>{r.label}</dt>
                      <dd className={`shrink-0 font-semibold ${TONE_CLASS[r.tone ?? ""]}`}>{r.value}</dd>
                      {r.note && <dd className="basis-full text-xs font-normal text-muted-foreground">{r.note}</dd>}
                    </div>
                  ))}
                </dl>
              </div>
            ))}
          </>
        )}
      </div>

      {view && (
        <div className="space-y-6 md:col-span-2">
          {view.compare && (
            <div className="rounded-lg border border-border bg-background p-5">
              <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">Current versus target</h2>
              <div className="mt-3 overflow-x-auto">
                <table className="w-full min-w-[28rem] text-left text-sm">
                  <thead>
                    <tr className="border-b border-border text-xs text-muted-foreground">
                      <th scope="col" className="py-2 pr-3 font-medium">Measure</th>
                      <th scope="col" className="py-2 pr-3 font-medium">Current</th>
                      <th scope="col" className="py-2 pr-3 font-medium">Target</th>
                      <th scope="col" className="py-2 font-medium">Gap</th>
                    </tr>
                  </thead>
                  <tbody className="tabular-nums">
                    {view.compare.map((c) => (
                      <tr key={c.label} className="border-b border-border last:border-0">
                        <th scope="row" className="py-2 pr-3 font-medium">{c.label}</th>
                        <td className="py-2 pr-3">{c.current}</td>
                        <td className="py-2 pr-3">{c.target}</td>
                        <td className="py-2">{c.gap}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
          {view.table && (
            <div className="rounded-lg border border-border bg-background p-5">
              <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">{view.table.title}</h2>
              <div className="mt-3 overflow-x-auto">
                <table className="w-full min-w-[28rem] text-left text-sm">
                  <thead>
                    <tr className="border-b border-border text-xs text-muted-foreground">
                      {view.table.columns.map((c) => (
                        <th key={c} scope="col" className="py-2 pr-3 font-medium">{c}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="tabular-nums">
                    {view.table.rows.map((row) => (
                      <tr key={row.join("|")} className="border-b border-border last:border-0">
                        {row.map((cell, i) => (i === 0 ? <th key={cell} scope="row" className="py-2 pr-3 font-medium">{cell}</th> : <td key={`${cell}-${i}`} className="py-2 pr-3">{cell}</td>))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
          <div className="rounded-lg border border-border bg-background p-5">
            <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">What this means</h2>
            <ul className="mt-2 list-disc space-y-2 pl-5 text-sm leading-relaxed">
              {view.interpretation.map((t) => (
                <li key={t}>{t}</li>
              ))}
            </ul>
            <h3 className="mt-4 text-xs font-semibold uppercase tracking-wider text-muted-foreground">Suggested next steps</h3>
            <ul className="mt-2 list-disc space-y-2 pl-5 text-sm leading-relaxed">
              {view.nextSteps.map((t) => (
                <li key={t}>{t}</li>
              ))}
            </ul>
            <h3 className="mt-4 text-xs font-semibold uppercase tracking-wider text-muted-foreground">Limits of this result</h3>
            <ul className="mt-2 list-disc space-y-1 pl-5 text-xs leading-relaxed text-muted-foreground">
              {view.notes.map((t) => (
                <li key={t}>{t}</li>
              ))}
            </ul>
            <button type="button" onClick={copy} className="mt-4 min-h-11 rounded-md border border-border px-3 py-2 text-sm font-medium hover:bg-muted focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--primary-text)]">
              Copy my results
            </button>
            {copyStatus && <p className="mt-2 text-xs text-muted-foreground">{copyStatus}</p>}
          </div>
        </div>
      )}
    </section>
  );
}

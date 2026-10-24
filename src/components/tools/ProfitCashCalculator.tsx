"use client";

import { useMemo, useState } from "react";
import {
  CURRENCIES,
  DEFAULT_CURRENCY,
  EMPTY_INPUTS,
  SAMPLE_INPUTS,
  MAX_TARGET_MARGIN,
  calculateProfitCash,
  formatCoverRatio,
  formatMoney,
  formatPercent,
  formatPrice,
  normalizeCurrency,
  parseAmount,
  priceForTargetMargin,
  type CurrencyCode,
  type ProfitCashInputs,
  type ProfitCashQuadrant,
} from "@/services/tools/profit-cash";

type FieldKey = keyof ProfitCashInputs;

const FIELDS: Array<{ key: FieldKey; label: string; hint?: string }> = [
  { key: "revenue", label: "Revenue invoiced" },
  { key: "directCosts", label: "Direct delivery costs", hint: "Materials, subcontractors, cost of goods" },
  { key: "operatingExpenses", label: "Operating expenses", hint: "Payroll, rent, software, insurance, everything else" },
  { key: "cash", label: "Cash in the bank today" },
  { key: "receivables", label: "Total owed to you (unpaid invoices)" },
  { key: "overdueReceivables", label: "Of that, overdue 30+ days" },
  { key: "expectedCollections", label: "Cash you realistically expect in 30 days", hint: "Be conservative: only what you'd bet on" },
  { key: "billsDue", label: "Bills and payroll due in 30 days" },
];

const PRICE_DEFAULTS = { cost: "60", margin: "40" };

const QUADRANTS: Array<{ id: ProfitCashQuadrant; label: string }> = [
  { id: "profitable-healthy", label: "Profitable + healthy cash" },
  { id: "profitable-squeezed", label: "Profitable + cash squeezed" },
  { id: "unprofitable-healthy", label: "Unprofitable + healthy cash" },
  { id: "unprofitable-squeezed", label: "Unprofitable + cash squeezed" },
];

type Money = (n: number) => string;

const VERDICTS: Record<ProfitCashQuadrant, { head: string; body: (gap: number, profit: number, money: Money) => string }> = {
  "profitable-healthy": {
    head: "Profitable, and cash covers the next 30 days",
    body: () => "Your bank balance plus expected collections covers bills due. Keep an eye on overdue invoices.",
  },
  "profitable-squeezed": {
    head: "Profitable but short on cash",
    body: (gap, _p, money) => `You are making money on paper, but expected cash falls ${money(-gap)} short of bills due in 30 days. Collections and timing are the likely pressure point.`,
  },
  "unprofitable-healthy": {
    head: "Cash is fine for now, but you are not profitable",
    body: (_g, profit, money) =>
      profit < 0
        ? `Cost is exceeding revenue by ${money(-profit)} a month. Cash cover can hide this for a while.`
        : "Revenue only just covers cost, so there is no profit cushion. Cash cover can hide this for a while.",
  },
  "unprofitable-squeezed": {
    head: "Not profitable and cash is short",
    body: () => "Both margins and liquidity need attention. Cost and collections are worth reviewing together.",
  },
};

export function ProfitCashCalculator() {
  const [raw, setRaw] = useState<Record<FieldKey, string>>(
    () => Object.fromEntries(Object.entries(SAMPLE_INPUTS).map(([k, v]) => [k, String(v)])) as Record<FieldKey, string>,
  );
  const [isSample, setIsSample] = useState(true);
  const [copyStatus, setCopyStatus] = useState("");
  const [currency, setCurrency] = useState<CurrencyCode>(DEFAULT_CURRENCY);
  const money: Money = (n) => formatMoney(n, currency);
  // A number input holds "" while the browser shows unreadable text such as "1,000" or "$5". Track it so it is flagged, not read as 0.
  const [badInput, setBadInput] = useState<Partial<Record<FieldKey | "priceCost" | "priceMargin", boolean>>>({});
  // Bumped on reset so inputs remount and any unreadable text the browser is still showing is cleared.
  const [resetCount, setResetCount] = useState(0);
  const [priceCost, setPriceCost] = useState(PRICE_DEFAULTS.cost);
  const [priceMargin, setPriceMargin] = useState(PRICE_DEFAULTS.margin);
  const priceCostP = parseAmount(priceCost);
  const priceMarginP = parseAmount(priceMargin);
  const priceHasBadText = Boolean(badInput.priceCost || badInput.priceMargin);
  const targetPrice =
    priceHasBadText || priceCostP.invalid || priceMarginP.invalid || priceCost.trim() === "" || priceMargin.trim() === ""
      ? null
      : priceForTargetMargin(priceCostP.value, priceMarginP.value);

  const { result } = useMemo(() => {
    let invalid = false;
    const parsed = { ...EMPTY_INPUTS };
    for (const f of FIELDS) {
      const p = parseAmount(raw[f.key]);
      if (p.invalid || badInput[f.key]) invalid = true;
      parsed[f.key] = p.value;
    }
    return { result: calculateProfitCash(parsed, invalid) };
  }, [raw, badInput]);

  const verdict = VERDICTS[result.quadrant];
  const rows: Array<[string, string, "pos" | "neg" | ""]> = result.isBlank
    ? ["Gross profit", "Gross margin", "Markup on direct costs", "Operating profit", "Operating margin", "Cash + expected collections", "Bills due in 30 days", "30-day cash surplus / shortfall", "Overdue 30+ days, share of owed", "Cash cover of bills"].map(
        (l) => [l, "—", ""] as [string, string, "" ],
      )
    : [
        ["Gross profit", money(result.grossProfit), result.grossProfit >= 0 ? "pos" : "neg"],
        ["Gross margin", formatPercent(result.grossMarginPercent), result.grossMarginPercent === null ? "" : result.grossProfit >= 0 ? "pos" : "neg"],
        ["Markup on direct costs", formatPercent(result.markupPercent), ""],
        ["Operating profit", money(result.operatingProfit), result.operatingProfit >= 0 ? "pos" : "neg"],
        ["Operating margin", formatPercent(result.marginPercent), result.marginPercent === null ? "" : result.operatingProfit >= 0 ? "pos" : "neg"],
        ["30-day cash surplus / shortfall", money(result.liquidity), result.liquidity >= 0 ? "pos" : "neg"],
        ["Overdue 30+ days, share of owed", formatPercent(result.overdueSharePercent, 0), result.overdueSharePercent !== null && result.overdueSharePercent >= 50 ? "neg" : ""],
        ["Cash cover of bills", formatCoverRatio(result.coverRatio), ""],
      ];

  function onChange(key: FieldKey, value: string, unreadable: boolean) {
    setRaw((r) => ({ ...r, [key]: value }));
    setBadInput((b) => ({ ...b, [key]: unreadable }));
    setIsSample(false);
    setCopyStatus("");
  }

  function resetInputs(next: Record<FieldKey, string>, sample: boolean) {
    setRaw(next);
    setBadInput({});
    setIsSample(sample);
    setCopyStatus("");
    setPriceCost(sample ? PRICE_DEFAULTS.cost : "");
    setPriceMargin(sample ? PRICE_DEFAULTS.margin : "");
    setResetCount((c) => c + 1);
  }

  function summary(): string {
    return [
      `Profit vs Cash Check (${currency})`,
      `Operating profit: ${money(result.operatingProfit)} (${result.marginPercent === null ? "margin n/a, no revenue" : `${formatPercent(result.marginPercent)} margin`})`,
      `30-day surplus/(shortfall): ${money(result.liquidity)}`,
      `Overdue 30+ days share of receivables: ${formatPercent(result.overdueSharePercent, 0)}`,
      `Result: ${verdict.head}`,
    ].join("\n");
  }

  async function copy() {
    try {
      await navigator.clipboard.writeText(summary());
      setCopyStatus("Copied.");
    } catch {
      setCopyStatus("Copy is not available in this browser. Select the result text and copy it manually.");
    }
  }

  return (
    <section aria-labelledby="calc-heading" className="mt-8 grid gap-6 md:grid-cols-2">
      <form className="rounded-lg border border-border bg-background p-5" onSubmit={(e) => e.preventDefault()} autoComplete="off">
        <div className="flex items-center justify-between gap-3">
          <h2 id="calc-heading" className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
            Your last month ({currency})
          </h2>
          <span className="rounded border border-border bg-muted px-2 py-0.5 text-xs text-muted-foreground">
            {isSample ? "Sample numbers" : "Your numbers"}
          </span>
        </div>
        <label className="mt-4 block text-sm font-medium">
          Currency
          <select
            value={currency}
            onChange={(e) => {
              setCurrency(normalizeCurrency(e.target.value));
              setCopyStatus("");
            }}
            className="mt-1 w-full rounded-md border border-border bg-background px-3 py-2"
          >
            {CURRENCIES.map((c) => (
              <option key={c.code} value={c.code}>
                {c.code} - {c.name}
              </option>
            ))}
          </select>
          <span className="block text-xs font-normal text-muted-foreground">Changes the symbol only. Enter every amount in this currency.</span>
        </label>
        <div className="mt-4 space-y-4">
          {FIELDS.map((f) => (
            <label key={`${f.key}-${resetCount}`} className="block text-sm font-medium">
              {f.label}
              {f.hint && <span className="block text-xs font-normal text-muted-foreground">{f.hint}</span>}
              <input
                type="number"
                inputMode="decimal"
                min={0}
                step="any"
                value={raw[f.key]}
                onChange={(e) => onChange(f.key, e.target.value, e.target.validity.badInput)}
                className="mt-1 w-full rounded-md border border-border bg-background px-3 py-2 tabular-nums"
              />
            </label>
          ))}
        </div>
        <div className="mt-5 flex flex-wrap gap-3">
          <button type="button" className="rounded-md border border-border px-3 py-2 text-sm font-medium hover:bg-muted" onClick={() => resetInputs(Object.fromEntries(FIELDS.map((f) => [f.key, ""])) as Record<FieldKey, string>, false)}>
            Clear all
          </button>
          <button type="button" className="rounded-md border border-border px-3 py-2 text-sm font-medium hover:bg-muted" onClick={() => resetInputs(Object.fromEntries(Object.entries(SAMPLE_INPUTS).map(([k, v]) => [k, String(v)])) as Record<FieldKey, string>, true)}>
            Load sample
          </button>
        </div>
      </form>

      <div className="rounded-lg border border-border bg-background p-5" aria-live="polite">
        <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">Your result</h2>
        {result.notes.length > 0 && (
          <p role="note" className="mt-3 rounded-md border border-amber-300 bg-amber-50 p-3 text-xs text-amber-900">
            {result.notes.join(" ")}
          </p>
        )}
        <div className="mt-3 rounded-md border-l-4 border-[var(--primary-text)] bg-muted p-4">
          <strong className="block text-base">{result.isBlank ? "Enter your numbers" : verdict.head}</strong>
          <span className="text-sm text-muted-foreground">
            {result.isBlank ? "Fill in the boxes to see how profit and cash compare." : verdict.body(result.liquidity, result.operatingProfit, money)}
          </span>
        </div>
        <dl className="mt-3 divide-y divide-border text-sm">
          {rows.map(([label, value, tone]) => (
            <div key={label} className="flex justify-between gap-3 py-2 tabular-nums">
              <dt>{label}</dt>
              <dd className={`font-semibold ${tone === "neg" ? "text-red-700" : tone === "pos" ? "text-emerald-700" : ""}`}>{value}</dd>
            </div>
          ))}
        </dl>
        <div className="mt-4 grid grid-cols-2 gap-2 text-xs">
          {QUADRANTS.map((q) => (
            <div key={q.id} className={`rounded border p-2 ${!result.isBlank && q.id === result.quadrant ? "border-[var(--primary-text)] bg-muted font-semibold" : "border-border text-muted-foreground"}`}>
              {q.label}
            </div>
          ))}
        </div>
        <button type="button" onClick={copy} disabled={result.isBlank} className="mt-4 rounded-md border border-border px-3 py-2 text-sm font-medium hover:bg-muted disabled:opacity-50">
          Copy my results
        </button>
        {copyStatus && <p className="mt-2 text-xs text-muted-foreground">{copyStatus}</p>}
      </div>
      <div className="rounded-lg border border-border bg-background p-5 md:col-span-2">
        <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">Price for a target margin</h2>
        <div className="mt-3 grid gap-4 sm:grid-cols-3">
          <label className="block text-sm font-medium">
            Your cost per item or job
            <input key={`priceCost-${resetCount}`} type="number" inputMode="decimal" min={0} step="any" value={priceCost} onChange={(e) => { setPriceCost(e.target.value); setBadInput((b) => ({ ...b, priceCost: e.target.validity.badInput })); }} className="mt-1 w-full rounded-md border border-border bg-background px-3 py-2 tabular-nums" />
          </label>
          <label className="block text-sm font-medium">
            Target gross margin (%)
            <input key={`priceMargin-${resetCount}`} type="number" inputMode="decimal" min={0} max={MAX_TARGET_MARGIN} step="any" value={priceMargin} onChange={(e) => { setPriceMargin(e.target.value); setBadInput((b) => ({ ...b, priceMargin: e.target.validity.badInput })); }} className="mt-1 w-full rounded-md border border-border bg-background px-3 py-2 tabular-nums" />
          </label>
          <div className="text-sm font-medium">
            Price to charge
            <p className="mt-1 rounded-md border border-border bg-muted px-3 py-2 text-base font-semibold tabular-nums">
              {targetPrice === null ? "Enter a cost of 0 or more and a margin from 0 to 99.9, using numbers only" : formatPrice(targetPrice, currency)}
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}

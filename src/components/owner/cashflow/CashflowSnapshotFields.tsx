"use client";

/**
 * The figure inputs of the "add a Cashflow snapshot" form. Renders only: which fields exist, and which are essential, come
 * from the page's field list. Mobile first: one column on a phone (so a number is never squeezed into a ~70px box), two from
 * `sm`, four from `lg`. When the owner arrives from the first read (`essentialFirst`), only the two figures that read needs
 * (bank balance, cash in hand) are shown; the rest sit behind a "More cashflow details" disclosure. The disclosure is a native
 * <details>, so the hidden inputs stay in the form and are still submitted if the owner opens it and fills them.
 */
import { Input } from "@/ui/primitives";
import { OVERDRAFT_BANK_BALANCE_SENTENCE } from "@/domain/owner-cashflow/overdraft-copy";

export interface CashflowFieldSpec {
  name: string;
  label: string;
}

const ESSENTIAL = ["bankBalance", "cashInHand"] as const;

function FieldInput({ field }: { field: CashflowFieldSpec }) {
  return (
    <Input
      key={field.name}
      name={field.name}
      label={field.label}
      type="number"
      inputMode="decimal"
      step="any"
      placeholder="—"
      hint={field.name === "bankBalance" ? OVERDRAFT_BANK_BALANCE_SENTENCE : undefined}
    />
  );
}

export function CashflowSnapshotFields({ fields, essentialFirst }: { fields: readonly CashflowFieldSpec[]; essentialFirst: boolean }) {
  const essential = ESSENTIAL.map((n) => fields.find((f) => f.name === n)).filter((f): f is CashflowFieldSpec => Boolean(f));
  const rest = fields.filter((f) => !ESSENTIAL.includes(f.name as (typeof ESSENTIAL)[number]));
  const grid = "grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4";

  if (!essentialFirst) {
    return (
      <div className={grid} data-testid="cashflow-fields-all">
        {fields.map((f) => <FieldInput key={f.name} field={f} />)}
      </div>
    );
  }
  return (
    <div className="space-y-3" data-testid="cashflow-fields-essential-first">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2" data-testid="cashflow-fields-essential">
        {essential.map((f) => <FieldInput key={f.name} field={f} />)}
      </div>
      <details className="rounded-md border border-border" data-testid="cashflow-more-details">
        <summary className="flex min-h-11 cursor-pointer select-none items-center px-3 text-sm font-medium text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
          More cashflow details
        </summary>
        <div className={`${grid} border-t border-border p-3`}>
          {rest.map((f) => <FieldInput key={f.name} field={f} />)}
        </div>
      </details>
    </div>
  );
}

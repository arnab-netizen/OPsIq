"use client";

/**
 * "Your saved periods" — every period that holds figures, with what is known and what is not, and a way to update it.
 * Presentation only: the period wording and amounts come from existing domain formatters.
 */
import { Button } from "@/ui/primitives";
import { periodLabel } from "@/domain/owner-first-run/first-money-read";
import { formatCashflowAmount } from "@/domain/owner-cashflow/edit-flow";
import { recordedFiguresFromRow } from "@/domain/owner-finance/snapshot-amend-form";
import { SAVED_PERIOD_TIMING_NOTE, savedPeriodTiming } from "@/domain/owner-finance/period-timing";

const iso = (v: unknown) => (v instanceof Date ? v.toISOString() : String(v ?? ""));

export function periodTextOf(row: Record<string, unknown>): string {
  return periodLabel({ start: iso(row.periodStart), end: iso(row.periodEnd) });
}

export function FinanceRecordedPeriods({
  rows,
  currency,
  editingId,
  onEdit,
  disabled,
}: {
  rows: ReadonlyArray<Record<string, unknown>>;
  currency: string;
  editingId: string | null;
  onEdit: (id: string) => void;
  disabled?: boolean;
}) {
  if (rows.length === 0) return null;
  return (
    <section className="mb-6" data-testid="finance-saved-periods">
      <h2 className="font-display text-[1.1rem] font-semibold text-foreground">Your saved periods</h2>
      <p className="mt-1 text-sm text-muted-foreground">
        Each period can be updated when you learn a figure you didn&apos;t have, or need to correct one. Earlier figures are kept as history.
      </p>
      <ul className="mt-3 divide-y divide-border rounded-md border border-border">
        {rows.map((row) => {
          const rec = recordedFiguresFromRow(row);
          const unknownCount = ["revenue", "cashOnHand"].filter((k) => rec[k] === null).length;
          const version = typeof row.version === "number" ? row.version : 1;
          const id = String(row.id);
          const timing = savedPeriodTiming({ periodStart: row.periodStart as string | null, periodEnd: row.periodEnd as string | null }, new Date());
          return (
            <li key={id} className="flex flex-wrap items-center justify-between gap-2 p-3" data-testid="finance-saved-period">
              <div className="min-w-0">
                <p className="font-medium text-foreground">{periodTextOf(row)}{version > 1 ? ` · updated ${version - 1} time${version === 2 ? "" : "s"}` : ""}</p>
                <p className="text-sm text-muted-foreground">
                  Revenue: {rec.revenue === null ? "not entered" : formatCashflowAmount(rec.revenue, currency)} · Cash in hand:{" "}
                  {rec.cashOnHand === null ? "not entered" : formatCashflowAmount(rec.cashOnHand, currency)}
                  {unknownCount > 0 ? " — you can add what's missing" : ""}
                </p>
                {timing && timing !== "completed" && (
                  <p className="text-sm text-muted-foreground" data-testid="finance-saved-period-timing">{SAVED_PERIOD_TIMING_NOTE[timing]}</p>
                )}
              </div>
              <Button
                type="button"
                variant="secondary"
                onClick={() => onEdit(id)}
                disabled={disabled || editingId === id}
                aria-label={`Update ${periodTextOf(row)}`}
                data-testid="finance-saved-period-update"
              >
                {editingId === id ? "Updating…" : "Update this period"}
              </Button>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

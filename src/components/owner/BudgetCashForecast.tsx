"use client";

import Link from "next/link";
import { Badge } from "@/ui/primitives";

/** The `/api/owner/budget/forecast` payload this card presents (presentation only; no calculation). */
export interface BudgetForecastView {
  hasData: boolean;
  /** Cash in hand AND the bank balance are both known. */
  liquidityComplete?: boolean;
  sevenDayCash: number;
  thirtyDayCash: number;
  ninetyDayCash: number;
  reserveRequired: number;
  nextCriticalDueInDays?: number | null;
  scenarios?: Array<{ name: string; endingCash: number; minCash: number; reserveBreachWeek?: number | null }>;
}

/**
 * Cash forecast card. The forecast starts from total liquid funds (cash in hand + bank balance). When the
 * bank balance is not recorded the engine only has a lower bound, which must never look like a real
 * 7/30/90-day forecast, a reserve verdict or confirmed runway — so no figures are shown, only what is
 * needed to complete the picture.
 */
export function BudgetCashForecast({ forecast }: { forecast: BudgetForecastView | null | undefined }) {
  if (!forecast?.hasData) return null;

  if (forecast.liquidityComplete !== true) {
    return (
      <section data-testid="budget-forecast-incomplete" className="border rounded-lg p-4 bg-card">
        <h2 className="font-bold mb-2">Cash forecast</h2>
        <p className="text-sm">
          Bank balance is not recorded, so OpsIQ cannot yet show a complete cash forecast. Add your bank balance
          (enter 0 if you hold nothing in the bank) and the cash outlook and reserve check will appear.
        </p>
        <p className="mt-2 text-sm">
          <Link href="/owner/cashflow" className="underline">Add your bank balance</Link>
        </p>
      </section>
    );
  }

  return (
    <section data-testid="budget-forecast-complete" className="border rounded-lg p-4 bg-card">
      <h2 className="font-bold mb-2">Cash forecast</h2>
      <div className="flex flex-wrap gap-2 text-sm">
        <Badge variant="muted-accessible">7-day {Math.round(forecast.sevenDayCash)}</Badge>
        <Badge variant="muted-accessible">30-day {Math.round(forecast.thirtyDayCash)}</Badge>
        <Badge variant="muted-accessible">90-day {Math.round(forecast.ninetyDayCash)}</Badge>
        <Badge variant="muted-accessible">reserve required {Math.round(forecast.reserveRequired)}</Badge>
        {forecast.nextCriticalDueInDays != null && <Badge variant="warning-accessible">next due in {forecast.nextCriticalDueInDays}d</Badge>}
      </div>
      <div className="mt-2 space-y-1 text-xs">
        {(forecast.scenarios ?? []).map((s) => (
          <div key={s.name} className="flex justify-between border-b py-1">
            <span className="capitalize">{s.name.replace("_", " ")}</span>
            <span className="text-muted-foreground">
              ending {Math.round(s.endingCash)} · min {Math.round(s.minCash)} ·{" "}
              {s.reserveBreachWeek ? <span className="text-destructive">reserve breach wk {s.reserveBreachWeek}</span> : "no reserve breach (13wk)"}
            </span>
          </div>
        ))}
      </div>
    </section>
  );
}

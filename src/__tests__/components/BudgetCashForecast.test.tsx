import { describe, it, expect, afterEach } from "vitest";
import { render, cleanup, screen } from "@testing-library/react";
import { BudgetCashForecast, type BudgetForecastView } from "@/components/owner/BudgetCashForecast";

const forecast = (o: Partial<BudgetForecastView> = {}): BudgetForecastView => ({
  hasData: true, liquidityComplete: true,
  sevenDayCash: 130000, thirtyDayCash: 120000, ninetyDayCash: 90000, reserveRequired: 20000, nextCriticalDueInDays: 5,
  scenarios: [{ name: "base", endingCash: 80000, minCash: 70000, reserveBreachWeek: null }],
  ...o,
});
afterEach(cleanup);

describe("BudgetCashForecast", () => {
  it("F: incomplete liquidity hides every figure, reserve verdict and scenario, and asks for the bank balance", () => {
    const { container } = render(<BudgetCashForecast forecast={forecast({ liquidityComplete: false, sevenDayCash: 10000, thirtyDayCash: 9000, ninetyDayCash: 5000 })} />);
    expect(screen.getByTestId("budget-forecast-incomplete")).toBeTruthy();
    expect(container.textContent).toContain("Bank balance is not recorded, so OpsIQ cannot yet show a complete cash forecast.");
    expect(container.textContent).not.toMatch(/7-day|30-day|90-day|reserve breach|ending|min \d|10000|9000|5000/);
    expect(screen.getByRole("link", { name: /add your bank balance/i }).getAttribute("href")).toBe("/owner/cashflow");
  });

  it("F2: a payload without the flag (older server) is treated as incomplete, never as a real forecast", () => {
    const { container } = render(<BudgetCashForecast forecast={forecast({ liquidityComplete: undefined })} />);
    expect(container.textContent).not.toMatch(/7-day|no reserve breach/);
  });

  it("G: complete liquidity renders the normal forecast unchanged", () => {
    const { container } = render(<BudgetCashForecast forecast={forecast()} />);
    expect(screen.getByTestId("budget-forecast-complete")).toBeTruthy();
    for (const t of ["7-day 130000", "30-day 120000", "90-day 90000", "reserve required 20000", "next due in 5d", "ending 80000", "min 70000", "no reserve breach (13wk)"]) {
      expect(container.textContent).toContain(t);
    }
  });

  it("G2: a real reserve breach is still shown with complete liquidity", () => {
    const { container } = render(<BudgetCashForecast forecast={forecast({ scenarios: [{ name: "cash_stress", endingCash: -1, minCash: -5, reserveBreachWeek: 4 }] })} />);
    expect(container.textContent).toContain("reserve breach wk 4");
  });

  it("renders nothing without data", () => {
    const { container } = render(<BudgetCashForecast forecast={forecast({ hasData: false })} />);
    expect(container.textContent).toBe("");
  });
});

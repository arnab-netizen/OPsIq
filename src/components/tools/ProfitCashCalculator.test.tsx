import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { ProfitCashCalculator } from "./ProfitCashCalculator";

afterEach(cleanup);

const input = (label: RegExp) => screen.getByLabelText(label) as HTMLInputElement;
const setValue = (label: RegExp, value: string) => fireEvent.change(input(label), { target: { value } });
const row = (label: string) => screen.getByText(label).parentElement?.querySelector("dd")?.textContent;

describe("ProfitCashCalculator", () => {
  it("shows the worked example on load", () => {
    render(<ProfitCashCalculator />);
    expect(row("Gross margin")).toBe("67.9%");
    expect(row("Operating profit")).toBe("$4,500");
    expect(row("30-day cash surplus / shortfall")).toBe("-$5,000");
    expect(row("Cash cover of bills")).toBe("0.29x");
    expect(screen.getByText("Profitable but short on cash")).toBeTruthy();
  });

  it("shows n/a, not 0.0%, for margins when revenue is zero", () => {
    render(<ProfitCashCalculator />);
    setValue(/^Revenue invoiced/, "0");
    expect(row("Gross margin")).toBe("n/a");
    expect(row("Operating margin")).toBe("n/a");
    expect(row("Gross profit")).toBe("-$9,000");
  });

  it("shows n/a for overdue share when nothing is owed", () => {
    render(<ProfitCashCalculator />);
    setValue(/^Total owed to you/, "0");
    expect(row("Overdue 30+ days, share of owed")).toBe("n/a");
  });

  it("a $1 shortfall never shows 1.00x cover", () => {
    render(<ProfitCashCalculator />);
    setValue(/^Cash in the bank/, "3999");
    setValue(/^Cash you realistically expect/, "1000");
    setValue(/^Bills and payroll/, "5000");
    expect(row("30-day cash surplus / shortfall")).toBe("-$1");
    expect(row("Cash cover of bills")).toBe("0.99x");
    setValue(/^Cash in the bank/, "4999.99");
    setValue(/^Bills and payroll/, "6000");
    expect(row("Cash cover of bills")).toBe("0.99x");
    expect(row("30-day cash surplus / shortfall")).toBe("-$0.01");
  });

  it("break-even does not claim cost exceeds revenue", () => {
    render(<ProfitCashCalculator />);
    setValue(/^Revenue invoiced/, "10000");
    setValue(/^Direct delivery costs/, "4000");
    setValue(/^Operating expenses/, "6000");
    setValue(/^Cash in the bank/, "50000");
    expect(row("Operating profit")).toBe("$0");
    expect(screen.queryByText(/Cost is exceeding revenue/)).toBeNull();
    expect(screen.getByText(/no profit cushion/)).toBeTruthy();
  });

  it("flags over-limit values instead of printing absurd figures", () => {
    render(<ProfitCashCalculator />);
    setValue(/^Revenue invoiced/, "1e308");
    expect(screen.getByRole("note").textContent).toMatch(/over-limit/);
    expect(row("Gross margin")).toBe("n/a");
  });

  it("treats text the browser cannot read as invalid, not as a silent 0", () => {
    render(<ProfitCashCalculator />);
    const rev = input(/^Revenue invoiced/);
    Object.defineProperty(rev, "validity", { value: { badInput: true }, configurable: true });
    fireEvent.change(rev, { target: { value: "" } });
    expect(screen.getByRole("note").textContent).toMatch(/invalid/);
  });

  it("Clear all clears the price tool too, and Load sample restores it", () => {
    render(<ProfitCashCalculator />);
    fireEvent.click(screen.getByText("Clear all"));
    expect(input(/^Your cost per item/).value).toBe("");
    expect(input(/^Target gross margin/).value).toBe("");
    expect(screen.getByText(/Enter a cost of 0 or more/)).toBeTruthy();
    fireEvent.click(screen.getByText("Load sample"));
    expect(input(/^Your cost per item/).value).toBe("60");
    expect(screen.getByText("$100.00")).toBeTruthy();
  });

  it("price uses thousands separators and rejects margins above 99.9", () => {
    render(<ProfitCashCalculator />);
    setValue(/^Target gross margin/, "99.9");
    expect(screen.getByText("$60,000.00")).toBeTruthy();
    setValue(/^Target gross margin/, "99.95");
    expect(screen.getByText(/Enter a cost of 0 or more/)).toBeTruthy();
    setValue(/^Target gross margin/, "-1");
    expect(screen.getByText(/Enter a cost of 0 or more/)).toBeTruthy();
  });

  it("clears the stale 'Copied.' message as soon as an input changes", async () => {
    Object.defineProperty(navigator, "clipboard", { value: { writeText: vi.fn().mockResolvedValue(undefined) }, configurable: true });
    render(<ProfitCashCalculator />);
    fireEvent.click(screen.getByText("Copy my results"));
    await waitFor(() => expect(screen.getByText("Copied.")).toBeTruthy());
    setValue(/^Revenue invoiced/, "29000");
    expect(screen.queryByText("Copied.")).toBeNull();
  });

  it("copied summary is consistent with the screen and handles no revenue", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", { value: { writeText }, configurable: true });
    render(<ProfitCashCalculator />);
    setValue(/^Revenue invoiced/, "0");
    fireEvent.click(screen.getByText("Copy my results"));
    await waitFor(() => expect(writeText).toHaveBeenCalled());
    const text = writeText.mock.calls[0][0] as string;
    expect(text).toContain("margin n/a, no revenue");
    expect(text).not.toContain("0.0% margin");
  });

  it("switches the symbol with the currency without changing any number", () => {
    render(<ProfitCashCalculator />);
    const select = screen.getByLabelText(/^Currency/) as HTMLSelectElement;
    expect(select.value).toBe("USD");
    fireEvent.change(select, { target: { value: "INR" } });
    expect(row("Operating profit")).toBe("\u20b94,500");
    expect(row("30-day cash surplus / shortfall")).toBe("-\u20b95,000");
    expect(row("Gross margin")).toBe("67.9%");
    expect(screen.getByText(/short of bills/, { selector: "span" }).textContent).toContain("\u20b95,000");
    expect(screen.getByText("Your last month (INR)")).toBeTruthy();
    expect(screen.getByText("\u20b9100.00")).toBeTruthy();
    fireEvent.change(select, { target: { value: "AUD" } });
    expect(row("Operating profit")).toBe("A$4,500");
  });

  it("uses Indian digit grouping for rupees and keeps the choice across Clear all and Load sample", () => {
    render(<ProfitCashCalculator />);
    const select = screen.getByLabelText(/^Currency/) as HTMLSelectElement;
    fireEvent.change(select, { target: { value: "INR" } });
    setValue(/^Revenue invoiced/, "5000000");
    expect(row("Gross profit")).toBe("\u20b949,91,000");
    fireEvent.click(screen.getByText("Clear all"));
    expect(select.value).toBe("INR");
    fireEvent.click(screen.getByText("Load sample"));
    expect(select.value).toBe("INR");
    expect(row("Operating profit")).toBe("\u20b94,500");
  });

  it("the copied summary names the currency and uses its symbol", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", { value: { writeText }, configurable: true });
    render(<ProfitCashCalculator />);
    fireEvent.change(screen.getByLabelText(/^Currency/), { target: { value: "GBP" } });
    fireEvent.click(screen.getByText("Copy my results"));
    await waitFor(() => expect(writeText).toHaveBeenCalled());
    const text = writeText.mock.calls[0][0] as string;
    expect(text).toContain("Profit vs Cash Check (GBP)");
    expect(text).toContain("\u00a34,500");
    expect(text).not.toContain("$");
  });

  it("a tampered currency value falls back to USD instead of crashing", () => {
    render(<ProfitCashCalculator />);
    const select = screen.getByLabelText(/^Currency/) as HTMLSelectElement;
    fireEvent.change(select, { target: { value: "INR" } });
    const opt = document.createElement("option");
    opt.value = "<bad>";
    select.appendChild(opt);
    fireEvent.change(select, { target: { value: "<bad>" } });
    expect(row("Operating profit")).toBe("$4,500");
  });

  it("changing currency clears a stale 'Copied.' message", async () => {
    Object.defineProperty(navigator, "clipboard", { value: { writeText: vi.fn().mockResolvedValue(undefined) }, configurable: true });
    render(<ProfitCashCalculator />);
    fireEvent.click(screen.getByText("Copy my results"));
    await waitFor(() => expect(screen.getByText("Copied.")).toBeTruthy());
    fireEvent.change(screen.getByLabelText(/^Currency/), { target: { value: "EUR" } });
    expect(screen.queryByText("Copied.")).toBeNull();
  });
});

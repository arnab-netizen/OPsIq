/**
 * BusinessContextSelector — the canonical "which business" control that replaces the ~21
 * duplicate inline selectors across Owner Mode (see
 * /tmp/.../scratchpad/business-context-route-matrix.md for the full audit). Pure presentational
 * component: no fetch, no business logic, so these are true DOM-level proofs (render + fire
 * events), not source-contract assertions.
 *
 * Covers zero/one/many-business states, the onChange output event, accessibility (label
 * association, announced current value, 44px touch target), and the a11y/UX requirement that a
 * single business shows context without dropdown chrome.
 */
import { describe, it, expect, afterEach, vi } from "vitest";
import { render, cleanup, screen, fireEvent } from "@testing-library/react";
import { BusinessContextSelector } from "@/components/owner/BusinessContextSelector";

afterEach(() => cleanup());

const ONE = [{ id: "biz-1", name: "Acme Bakery", currency: "USD" }];
const MANY = [
  { id: "biz-1", name: "Acme Bakery", currency: "USD" },
  { id: "biz-2", name: "Acme Landscaping", currency: "USD" },
  { id: "biz-3", name: "Acme Consulting", currency: "INR" },
];

describe("BusinessContextSelector — zero-business state", () => {
  it("renders nothing when the business list is empty", () => {
    const { container } = render(
      <BusinessContextSelector businesses={[]} selectedId={null} onChange={vi.fn()} />
    );
    expect(container).toBeEmptyDOMElement();
  });

  it("renders nothing for zero businesses even if a stray selectedId is passed", () => {
    const { container } = render(
      <BusinessContextSelector businesses={[]} selectedId="ghost-id" onChange={vi.fn()} />
    );
    expect(container).toBeEmptyDOMElement();
  });
});

describe("BusinessContextSelector — one-business state (no dropdown chrome)", () => {
  it("shows the business name as plain text, not an interactive control", () => {
    render(<BusinessContextSelector businesses={ONE} selectedId="biz-1" onChange={vi.fn()} />);
    expect(screen.getByText("Acme Bakery (USD)")).toBeInTheDocument();
    expect(screen.queryByRole("combobox")).not.toBeInTheDocument();
  });

  it("labels the single-business readout as 'Business'", () => {
    render(<BusinessContextSelector businesses={ONE} selectedId="biz-1" onChange={vi.fn()} />);
    expect(screen.getByText("Business")).toBeInTheDocument();
  });
});

describe("BusinessContextSelector — many-business state (interactive switch)", () => {
  it("renders an accessible combobox with a real associated label", () => {
    render(<BusinessContextSelector businesses={MANY} selectedId="biz-1" onChange={vi.fn()} />);
    const select = screen.getByRole("combobox", { name: "Business" });
    expect(select).toBeInTheDocument();
  });

  it("lists every business as an option, formatted with currency", () => {
    render(<BusinessContextSelector businesses={MANY} selectedId="biz-1" onChange={vi.fn()} />);
    expect(screen.getByRole("option", { name: "Acme Bakery (USD)" })).toBeInTheDocument();
    expect(screen.getByRole("option", { name: "Acme Landscaping (USD)" })).toBeInTheDocument();
    expect(screen.getByRole("option", { name: "Acme Consulting (INR)" })).toBeInTheDocument();
  });

  it("reflects the currently selected business as the control's value", () => {
    render(<BusinessContextSelector businesses={MANY} selectedId="biz-2" onChange={vi.fn()} />);
    const select = screen.getByRole("combobox", { name: "Business" }) as HTMLSelectElement;
    expect(select.value).toBe("biz-2");
  });

  it("fires onChange with the newly chosen business id when switched", () => {
    const onChange = vi.fn();
    render(<BusinessContextSelector businesses={MANY} selectedId="biz-1" onChange={onChange} />);
    const select = screen.getByRole("combobox", { name: "Business" });
    fireEvent.change(select, { target: { value: "biz-3" } });
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange).toHaveBeenCalledWith("biz-3");
  });

  it("announces the current value via aria-live so a switch is announced to assistive tech", () => {
    render(<BusinessContextSelector businesses={MANY} selectedId="biz-1" onChange={vi.fn()} />);
    const select = screen.getByRole("combobox", { name: "Business" });
    expect(select).toHaveAttribute("aria-live", "polite");
  });

  it("meets the 44px minimum touch target via the min-h-[44px] utility class", () => {
    render(<BusinessContextSelector businesses={MANY} selectedId="biz-1" onChange={vi.fn()} />);
    const select = screen.getByRole("combobox", { name: "Business" });
    expect(select.className).toContain("min-h-[44px]");
  });

  it("carries the canonical businessSelector name for existing test/query hooks", () => {
    render(<BusinessContextSelector businesses={MANY} selectedId="biz-1" onChange={vi.fn()} />);
    const select = screen.getByRole("combobox", { name: "Business" });
    expect(select).toHaveAttribute("name", "businessSelector");
  });
});

describe("BusinessContextSelector — searchable switcher (30+ businesses)", () => {
  const many30 = Array.from({ length: 32 }, (_, i) => ({
    id: `biz-${i}`,
    name: `Business Number ${i} — a fairly long descriptive trading name`,
    currency: "USD",
  }));

  it("shows a search box once the business count exceeds the threshold", () => {
    render(<BusinessContextSelector businesses={many30} selectedId="biz-0" onChange={vi.fn()} />);
    expect(screen.getByRole("textbox", { name: "Search businesses" })).toBeInTheDocument();
  });

  it("does not show a search box for a small business count (many-but-under-threshold case)", () => {
    render(<BusinessContextSelector businesses={MANY} selectedId="biz-1" onChange={vi.fn()} />);
    expect(screen.queryByRole("textbox", { name: "Search businesses" })).not.toBeInTheDocument();
  });

  it("type-to-filter narrows the select's options to matching business names", () => {
    render(<BusinessContextSelector businesses={many30} selectedId="biz-0" onChange={vi.fn()} />);
    const search = screen.getByRole("textbox", { name: "Search businesses" });
    fireEvent.change(search, { target: { value: "Number 17" } });
    expect(screen.getByRole("option", { name: many30[17].name + " (USD)" })).toBeInTheDocument();
  });

  it("still renders the full untruncated business list with no search query typed (back-compat with existing selectOption automation)", () => {
    render(<BusinessContextSelector businesses={many30} selectedId="biz-0" onChange={vi.fn()} />);
    for (const b of many30) {
      expect(screen.getByRole("option", { name: `${b.name} (${b.currency})` })).toBeInTheDocument();
    }
  });

  it("keeps the currently selected business in the option list even when it no longer matches the query", () => {
    render(<BusinessContextSelector businesses={many30} selectedId="biz-5" onChange={vi.fn()} />);
    const search = screen.getByRole("textbox", { name: "Search businesses" });
    fireEvent.change(search, { target: { value: "Number 17" } });
    const select = screen.getByRole("combobox", { name: "Business" }) as HTMLSelectElement;
    expect(select.value).toBe("biz-5");
    expect(screen.getByRole("option", { name: many30[5].name + " (USD)" })).toBeInTheDocument();
  });

  it("filters out non-matching, non-selected businesses from the select", () => {
    render(<BusinessContextSelector businesses={many30} selectedId="biz-0" onChange={vi.fn()} />);
    const search = screen.getByRole("textbox", { name: "Search businesses" });
    fireEvent.change(search, { target: { value: "Number 17" } });
    expect(screen.queryByRole("option", { name: many30[3].name + " (USD)" })).not.toBeInTheDocument();
    expect(screen.getByRole("option", { name: many30[17].name + " (USD)" })).toBeInTheDocument();
  });

  it("the underlying select still fires onChange with the chosen id, unaffected by search state", () => {
    const onChange = vi.fn();
    render(<BusinessContextSelector businesses={many30} selectedId="biz-0" onChange={onChange} />);
    const select = screen.getByRole("combobox", { name: "Business" });
    fireEvent.change(select, { target: { value: "biz-20" } });
    expect(onChange).toHaveBeenCalledWith("biz-20");
  });

  it("shows the full, untruncated selected business name as a readout (fixes clipped-label finding)", () => {
    render(<BusinessContextSelector businesses={many30} selectedId="biz-9" onChange={vi.fn()} />);
    expect(screen.getByTitle(many30[9].name + " (USD)")).toBeInTheDocument();
  });
});

describe("BusinessContextSelector — loading state", () => {
  it("renders a disabled placeholder control while the caller's list is not yet known", () => {
    render(<BusinessContextSelector businesses={[]} selectedId={null} onChange={vi.fn()} loading />);
    const select = screen.getByRole("combobox", { name: "Business (loading)" });
    expect(select).toBeDisabled();
  });

  it("does not fire onChange from a disabled loading placeholder", () => {
    const onChange = vi.fn();
    render(<BusinessContextSelector businesses={[]} selectedId={null} onChange={onChange} loading />);
    expect(onChange).not.toHaveBeenCalled();
  });
});

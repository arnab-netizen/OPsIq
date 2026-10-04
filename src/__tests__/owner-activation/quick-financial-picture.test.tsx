/**
 * The owner journey for minimum-effort first input: existing business → My Business → four numbers →
 * ONE action → first read. Component/browser-level (jsdom) coverage of the 16 journey requirements.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { render, cleanup, screen, waitFor, fireEvent, act } from "@testing-library/react";

vi.mock("next/link", () => ({
  default: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => (
    <a href={href} {...rest}>{children}</a>
  ),
}));
const routerPush = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: routerPush, replace: vi.fn(), prefetch: vi.fn(), back: vi.fn() }),
}));

import OwnerDataHubPage from "@/app/(authenticated)/owner/data/page";
import { ActiveBusinessProvider } from "@/context/active-business-context";
import { QuickFinancialPicture } from "@/components/owner/QuickFinancialPicture";

const fetchMock = vi.fn();
const json = (body: unknown, ok = true, status = ok ? 200 : 500) =>
  Promise.resolve({ ok, status, json: () => Promise.resolve(body) });

const NOT_READY = {
  businessName: "X", suppliedCategories: [],
  requirements: { minimumRequired: ["revenue_sales", "expenses", "cash_debt"], recommended: [], optional: [] },
  missingMinimum: [], minimumSuppliedCount: 0, minimumRequiredCount: 3, minimumComplete: false,
  confidenceBeforeDiagnosis: "none", canRunFirstDiagnosis: false,
  firstRead: { sufficient: false, revenueKnown: false, costKnown: false, cashKnown: false, missing: ["revenue", "costs", "cashOnHand"], basis: "none" },
  firstAction: "", whatNotToDo: [], nextBestUpload: null, found: true,
};

const calls = () => fetchMock.mock.calls.map((c) => ({ url: String(c[0]), method: (c[1] as RequestInit | undefined)?.method ?? "GET", body: (c[1] as RequestInit | undefined)?.body as string | undefined }));
/** Everything except the read-only saved-periods lookup the component makes on mount. */
const writes = () => calls().filter((c) => c.method !== "GET");
const posts = (suffix: string) => calls().filter((c) => c.method === "POST" && c.url.endsWith(suffix));

beforeEach(() => {
  fetchMock.mockReset();
  routerPush.mockReset();
  vi.stubGlobal("fetch", fetchMock);
  window.sessionStorage.clear();
  window.localStorage.clear();
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

function type(name: string, value: string) {
  fireEvent.change(document.querySelector(`input[name="${name}"]`) as HTMLInputElement, { target: { value } });
}
const primary = () => screen.getByTestId("quick-primary-action") as HTMLButtonElement;
const submit = () => fireEvent.submit(screen.getByTestId("quick-financial-picture-form"));

function mountComponent(currency: string | null = "INR", businessId = "b1") {
  return render(<QuickFinancialPicture key={businessId} businessId={businessId} currency={currency} />);
}
function happyApi() {
  fetchMock.mockImplementation((url: string, init?: RequestInit) => {
    if (init?.method === "POST" && url.endsWith("/snapshots")) return json({ id: "snap-1" }, true, 201);
    if (init?.method === "POST" && url.endsWith("/diagnoses")) return json({ id: "cycle-1" }, true, 201);
    return json({});
  });
}

describe("first quick-entry surface (requirements 2–5, 11, 16)", () => {
  it("shows ≤4 numeric fields, no narrative, no taxonomy, no source/domain choice, ONE primary action", () => {
    const { container } = mountComponent();
    const form = screen.getByTestId("quick-financial-picture-form");
    expect(form.querySelectorAll('input[type="text"]')).toHaveLength(4);
    expect(form.querySelector("textarea")).toBeNull();
    expect(form.querySelector("select")).toBeNull(); // no domain / source / category selection
    expect(form.querySelectorAll('button[type="submit"]')).toHaveLength(1);
    expect(container.textContent).not.toMatch(/revenue_sales|Expense records|20 categor|data categor/i);
    expect(container.querySelector("input[name=currency]")).toBeNull();
    // Required narrative/evidence markers are absent.
    expect(form.querySelector("[required]")).toBeNull();
    expect(form.textContent).toMatch(/Estimates are fine/);
    expect(form.textContent).toMatch(/Blank = don't know|leave the rest blank/);
  });
  it("optional detail is collapsed and reachable (manual entry / CSV / full money form)", () => {
    mountComponent();
    const more = screen.getByTestId("quick-more-detail") as HTMLDetailsElement;
    expect(more.open).toBe(false);
    const hrefs = Array.from(more.querySelectorAll("a")).map((a) => a.getAttribute("href"));
    expect(hrefs).toEqual(expect.arrayContaining(["/owner/finance", "/owner/manual-entry", "/owner/intake"]));
  });
  it("is mobile-safe: single-column grid below sm, no fixed widths", () => {
    window.innerWidth = 360;
    mountComponent();
    const form = screen.getByTestId("quick-financial-picture-form");
    const grid = form.querySelector('input[name="revenue"]')!.closest(".grid")!;
    expect(grid.className).toMatch(/grid-cols-1/);
    expect(form.outerHTML).not.toMatch(/\bw-\[\d+px\]|\bw-(72|80|96)\b|min-w-\[/);
  });
  it("states the period honestly and defaults to a COMPLETED month", () => {
    mountComponent();
    expect((document.querySelector('input[name="period"]') as HTMLInputElement).checked).toBe(true);
    expect(screen.queryByTestId("quick-provisional-note")).toBeNull();
    fireEvent.click(screen.getByLabelText("This month so far"));
    expect(screen.getByTestId("quick-provisional-note").textContent).toMatch(/provisional/);
  });
});

describe("field semantics and truthful feedback (6–8)", () => {
  it("blank fields do nothing; primary action stays disabled", () => {
    mountComponent();
    expect(primary().disabled).toBe(true);
    submit();
    expect(writes()).toEqual([]);
  });
  it("partial evidence (D: revenue + cash) names exactly what is missing and does not save or diagnose", () => {
    mountComponent();
    type("revenue", "600000"); type("cashOnHand", "180000");
    expect(screen.getByTestId("quick-feedback").textContent).toMatch(/Still needed for a first read: one cost figure/);
    expect(primary().disabled).toBe(true);
    submit();
    expect(writes()).toEqual([]);
  });
  it("invalid number → clear inline error, nothing sent", () => {
    mountComponent();
    type("revenue", "six lakh"); type("fixedCosts", "10"); type("cashOnHand", "10");
    expect(screen.getByText("Enter a number, like 150000.")).toBeTruthy();
    expect(primary().disabled).toBe(true);
  });
  it("negative number → inline error", () => {
    mountComponent();
    type("cashOnHand", "-5");
    expect(screen.getByText(/can't be negative/)).toBeTruthy();
  });
  it("fixed-cost-only cost evidence (A) is ENOUGH — and is sent as fixedCosts, never relabelled", async () => {
    happyApi();
    mountComponent("GBP");
    type("revenue", "600000"); type("fixedCosts", "200000"); type("cashOnHand", "180000");
    expect(screen.getByTestId("quick-feedback").textContent).toMatch(/enough for a first read/i);
    expect(primary().disabled).toBe(false);
    fireEvent.click(primary());
    await waitFor(() => expect(posts("/snapshots")).toHaveLength(1));
    const body = JSON.parse(posts("/snapshots")[0].body!);
    expect(body).toMatchObject({ revenue: 600000, fixedCosts: 200000, cashOnHand: 180000, currency: "GBP" });
    expect("variableCosts" in body).toBe(false);
    expect("costOfGoodsOrServices" in body).toBe(false);
  });
  it("variable-cost-only (B) is also enough", () => {
    mountComponent();
    type("revenue", "1"); type("variableCosts", "1"); type("cashOnHand", "1");
    expect(primary().disabled).toBe(false);
  });
  it("known zeros (G/H/I) are accepted and SENT as 0; blanks are omitted", async () => {
    happyApi();
    mountComponent();
    type("revenue", "0"); type("fixedCosts", "0"); type("cashOnHand", "0");
    expect(primary().disabled).toBe(false);
    fireEvent.click(primary());
    await waitFor(() => expect(posts("/snapshots")).toHaveLength(1));
    const body = JSON.parse(posts("/snapshots")[0].body!);
    expect(body).toMatchObject({ revenue: 0, fixedCosts: 0, cashOnHand: 0 });
    expect("variableCosts" in body).toBe(false);
  });
  it("no mandatory narrative: nothing but numbers is sent (no notes, no evidence refs)", async () => {
    happyApi();
    mountComponent();
    type("revenue", "5"); type("fixedCosts", "5"); type("cashOnHand", "5");
    fireEvent.click(primary());
    await waitFor(() => expect(posts("/snapshots")).toHaveLength(1));
    expect(Object.keys(JSON.parse(posts("/snapshots")[0].body!)).sort()).toEqual(["cashOnHand", "currency", "fixedCosts", "periodEnd", "periodStart", "revenue"]);
  });
  it("missing business currency: asks to set it once instead of choosing one", () => {
    mountComponent(null);
    expect(screen.getByTestId("quick-currency-missing")).toBeTruthy();
    expect(screen.queryByTestId("quick-primary-action")).toBeNull();
  });
});

describe("one action: save → diagnose → route (6, 9, 10, 12, 13)", () => {
  it("a single click saves via the governed endpoint, runs the diagnosis on that snapshot, then routes to the read", async () => {
    happyApi();
    mountComponent();
    type("revenue", "5"); type("variableCosts", "5"); type("cashOnHand", "5");
    fireEvent.click(primary());
    await waitFor(() => expect(routerPush).toHaveBeenCalledWith("/owner/finance"));
    expect(writes().map((c) => `${c.method} ${c.url}`)).toEqual([
      "POST /api/owner/finance/businesses/b1/snapshots",
      "POST /api/owner/finance/businesses/b1/diagnoses",
    ]);
    expect(JSON.parse(posts("/diagnoses")[0].body!)).toEqual({ snapshotId: "snap-1" });
    // First read reached with no manual-entry / CSV involvement.
    expect(calls().some((c) => /manual-entry|intake/.test(c.url))).toBe(false);
  });
  it("a double click does not duplicate the snapshot or the diagnosis", async () => {
    happyApi();
    mountComponent();
    type("revenue", "5"); type("variableCosts", "5"); type("cashOnHand", "5");
    act(() => { submit(); submit(); submit(); });
    await waitFor(() => expect(routerPush).toHaveBeenCalledTimes(1));
    expect(posts("/snapshots")).toHaveLength(1);
    expect(posts("/diagnoses")).toHaveLength(1);
  });
  it("save succeeds + diagnosis fails → numbers stay saved, inputs lock, retry runs ONLY the diagnosis", async () => {
    let diagnosisUp = false;
    fetchMock.mockImplementation((url: string, init?: RequestInit) => {
      if (init?.method === "POST" && url.endsWith("/snapshots")) return json({ id: "snap-9" }, true, 201);
      if (init?.method === "POST" && url.endsWith("/diagnoses")) return diagnosisUp ? json({ id: "c" }, true, 201) : json({ error: "engine down" }, false, 503);
      return json({});
    });
    mountComponent();
    type("revenue", "5"); type("variableCosts", "5"); type("cashOnHand", "5");
    fireEvent.click(primary());
    const alert = await screen.findByTestId("quick-diagnosis-failed");
    expect(alert.textContent).toMatch(/numbers are saved/i);
    expect(routerPush).not.toHaveBeenCalled();
    expect(screen.queryByTestId("quick-primary-action")).toBeNull(); // cannot re-submit a second snapshot
    expect((document.querySelector('input[name="revenue"]') as HTMLInputElement).disabled).toBe(true);
    diagnosisUp = true;
    fireEvent.click(screen.getByText("Try the first read again"));
    await waitFor(() => expect(routerPush).toHaveBeenCalledWith("/owner/finance"));
    expect(posts("/snapshots")).toHaveLength(1);
    expect(posts("/diagnoses")).toHaveLength(2);
    expect(JSON.parse(posts("/diagnoses")[1].body!)).toEqual({ snapshotId: "snap-9" });
  });
  it("snapshot save failure keeps what was typed and allows a retry", async () => {
    fetchMock.mockImplementation(() => json({ error: "boom" }, false, 500));
    mountComponent();
    type("revenue", "5"); type("variableCosts", "5"); type("cashOnHand", "5");
    fireEvent.click(primary());
    expect((await screen.findByTestId("quick-error")).textContent).toMatch(/still here/i);
    expect((document.querySelector('input[name="revenue"]') as HTMLInputElement).value).toBe("5");
    expect(primary().disabled).toBe(false);
  });
  it("a period that already has a snapshot is reported as such (never retried as a duplicate)", async () => {
    fetchMock.mockImplementation(() => json({ error: "A financial snapshot for this business and reporting period already exists." }, false, 409));
    mountComponent();
    type("revenue", "5"); type("variableCosts", "5"); type("cashOnHand", "5");
    fireEvent.click(primary());
    expect((await screen.findByTestId("quick-error")).textContent).toMatch(/already saved numbers for that period/i);
    expect(posts("/snapshots")).toHaveLength(1);
    expect(posts("/diagnoses")).toHaveLength(0);
  });
});

describe("business switching never leaks a draft (14, 15)", () => {
  it("remounting for another business starts blank; nothing is persisted to storage", () => {
    const { rerender } = render(<QuickFinancialPicture key="b1" businessId="b1" currency="INR" />);
    type("revenue", "123"); type("cashOnHand", "456");
    expect(Object.keys(window.localStorage).concat(Object.keys(window.sessionStorage))).toEqual([]);
    rerender(<QuickFinancialPicture key="b2" businessId="b2" currency="USD" />);
    for (const n of ["revenue", "fixedCosts", "variableCosts", "cashOnHand"]) {
      expect((document.querySelector(`input[name="${n}"]`) as HTMLInputElement).value).toBe("");
    }
    expect(screen.getByTestId("quick-financial-picture-form").textContent).toContain("(USD)");
  });

  it("on My Business, switching the selected business resets the draft and saves go to the NEW business", async () => {
    fetchMock.mockImplementation((url: string, init?: RequestInit) => {
      if (init?.method === "POST" && url.endsWith("/snapshots")) return json({ id: "s" }, true, 201);
      if (init?.method === "POST" && url.endsWith("/diagnoses")) return json({ id: "c" }, true, 201);
      if (url.includes("/api/owner/onboarding")) return json(NOT_READY);
      if (url.includes("/api/owner/businesses")) return json({ businesses: [{ id: "b1", name: "One", currency: "INR" }, { id: "b2", name: "Two", currency: "GBP" }] });
      return json({});
    });
    render(<ActiveBusinessProvider><OwnerDataHubPage /></ActiveBusinessProvider>);
    await screen.findByTestId("quick-financial-picture-form");
    const first = document.querySelector("select[name=businessSelector]") as HTMLSelectElement;
    const activeId = first.value;
    const otherId = activeId === "b1" ? "b2" : "b1";
    type("revenue", "999");
    fireEvent.change(first, { target: { value: otherId } });
    await waitFor(() => expect((document.querySelector('input[name="revenue"]') as HTMLInputElement).value).toBe(""));
    expect(screen.getByTestId("quick-financial-picture-form").textContent).toContain(otherId === "b2" ? "(GBP)" : "(INR)");
    type("revenue", "5"); type("fixedCosts", "5"); type("cashOnHand", "5");
    fireEvent.click(primary());
    await waitFor(() => expect(routerPush).toHaveBeenCalled());
    expect(posts("/snapshots")[0].url).toBe(`/api/owner/finance/businesses/${otherId}/snapshots`);
  });
});

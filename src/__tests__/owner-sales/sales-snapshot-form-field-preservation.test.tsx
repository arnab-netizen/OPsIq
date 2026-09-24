/**
 * Owner Sales page — snapshot form field preservation after the cosmetic grouping polish.
 *
 * The snapshot form's 16 numeric fields were regrouped into labeled sections purely for
 * presentation (see SALES_FIELD_GROUPS in the page source). This is the regression risk that
 * grouping refactor actually introduces: a field silently dropped, duplicated, or given the wrong
 * `name` attribute while being moved into its group. This test guards against exactly that --
 * it does not assert on CSS classes or the grouping headings themselves.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, cleanup, screen, fireEvent, waitFor } from "@testing-library/react";
import { ActiveBusinessProvider } from "@/context/active-business-context";
import OwnerSalesPage from "@/app/(authenticated)/owner/sales/page";

const BIZ_A = { id: "biz-a", name: "Acme Bakery", currency: "USD" };

const SALES_FIELD_NAMES_IN_ORDER = [
  "leads", "qualifiedLeads", "orders", "revenue", "averageOrderValue",
  "newCustomers", "repeatCustomers", "lostCustomers",
  "b2bProspects", "b2bPipelineValue", "b2bRevenue", "b2cRevenue",
  "complaints", "discountAmount", "refundAmount", "staffCount",
];

let capturedBody: Record<string, unknown> | null = null;

function installFetchMock() {
  capturedBody = null;
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: string | URL, init?: RequestInit) => {
      const url = typeof input === "string" ? input : input.toString();
      if (url.includes("/api/owner/businesses")) {
        return { ok: true, status: 200, json: async () => ({ businesses: [BIZ_A] }) } as Response;
      }
      if (url.includes("/api/owner/sales/dashboard")) {
        return { ok: true, status: 200, json: async () => ({ businesses: [BIZ_A], selectedBusinessId: BIZ_A.id, hasData: false, latestSnapshot: null, missingCriticalData: [] }) } as Response;
      }
      if (url.match(/\/api\/owner\/sales\/businesses\/[^/]+\/snapshots$/) && init?.method === "POST") {
        capturedBody = JSON.parse(init.body as string);
        return { ok: true, status: 201, json: async () => ({ id: "snap-new" }) } as Response;
      }
      return { ok: true, status: 200, json: async () => ({}) } as Response;
    })
  );
}

function renderPage() {
  return render(
    <ActiveBusinessProvider>
      <OwnerSalesPage />
    </ActiveBusinessProvider>
  );
}

beforeEach(() => {
  window.sessionStorage.clear();
  window.localStorage.clear();
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("Owner Sales page — snapshot form field preservation", () => {
  it("renders exactly one input for every field, in the original order, after grouping", async () => {
    installFetchMock();
    renderPage();
    fireEvent.click(await screen.findByText("+ Add sales snapshot"));

    for (const name of SALES_FIELD_NAMES_IN_ORDER) {
      expect(document.querySelectorAll(`input[name="${name}"]`).length).toBe(1);
    }

    const form = document.querySelector("form") as HTMLFormElement;
    const numberInputNames = Array.from(form.querySelectorAll('input[type="number"]')).map((el) => el.getAttribute("name"));
    expect(numberInputNames).toEqual(SALES_FIELD_NAMES_IN_ORDER);
  });

  it("submits every populated field's value unchanged, keyed by its original field name", async () => {
    installFetchMock();
    renderPage();
    fireEvent.click(await screen.findByText("+ Add sales snapshot"));

    const form = document.querySelector("form") as HTMLFormElement;
    fireEvent.change(form.querySelector('input[name="periodStart"]') as HTMLInputElement, { target: { value: "2026-01-01" } });
    fireEvent.change(form.querySelector('input[name="periodEnd"]') as HTMLInputElement, { target: { value: "2026-01-31" } });

    const expected: Record<string, number> = {};
    SALES_FIELD_NAMES_IN_ORDER.forEach((name, i) => {
      const value = 100 + i;
      expected[name] = value;
      fireEvent.change(form.querySelector(`input[name="${name}"]`) as HTMLInputElement, { target: { value: String(value) } });
    });

    fireEvent.submit(form);
    await waitFor(() => expect(capturedBody).not.toBeNull());

    for (const name of SALES_FIELD_NAMES_IN_ORDER) {
      expect(capturedBody![name]).toBe(expected[name]);
    }
  });
});

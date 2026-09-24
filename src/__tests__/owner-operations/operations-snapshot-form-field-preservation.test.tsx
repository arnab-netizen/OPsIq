/**
 * Owner Operations page — snapshot form field preservation after the cosmetic grouping polish.
 *
 * See sales-snapshot-form-field-preservation.test.tsx for the full rationale: the 13 numeric
 * fields were regrouped into labeled sections purely for presentation (see
 * OPERATIONS_FIELD_GROUPS in the page source). This test guards against a field being silently
 * dropped, duplicated, or given the wrong `name` attribute during that regrouping -- it does not
 * assert on CSS classes or the grouping headings themselves.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, cleanup, screen, fireEvent, waitFor } from "@testing-library/react";
import { ActiveBusinessProvider } from "@/context/active-business-context";
import OwnerOperationsPage from "@/app/(authenticated)/owner/operations/page";

const BIZ_A = { id: "biz-a", name: "Acme Bakery", currency: "USD" };

const OPERATIONS_FIELD_NAMES_IN_ORDER = [
  "ordersReceived", "ordersCompleted", "ordersDelayed", "reworkCount", "complaints",
  "staffHours", "machineCapacityUnits", "idleHours",
  "deliveryAttempts", "deliveryFailures", "inventoryShortages",
  "sopChecks", "sopMisses",
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
      if (url.includes("/api/owner/operations/dashboard")) {
        return { ok: true, status: 200, json: async () => ({ businesses: [BIZ_A], selectedBusinessId: BIZ_A.id, hasData: false, latestSnapshot: null, missingCriticalData: [] }) } as Response;
      }
      if (url.match(/\/api\/owner\/operations\/businesses\/[^/]+\/snapshots$/) && init?.method === "POST") {
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
      <OwnerOperationsPage />
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

describe("Owner Operations page — snapshot form field preservation", () => {
  it("renders exactly one input for every field, in the original order, after grouping", async () => {
    installFetchMock();
    renderPage();
    fireEvent.click(await screen.findByText("+ Add operations snapshot"));

    for (const name of OPERATIONS_FIELD_NAMES_IN_ORDER) {
      expect(document.querySelectorAll(`input[name="${name}"]`).length).toBe(1);
    }

    const form = document.querySelector("form") as HTMLFormElement;
    const numberInputNames = Array.from(form.querySelectorAll('input[type="number"]')).map((el) => el.getAttribute("name"));
    expect(numberInputNames).toEqual(OPERATIONS_FIELD_NAMES_IN_ORDER);
  });

  it("submits every populated field's value unchanged, keyed by its original field name", async () => {
    installFetchMock();
    renderPage();
    fireEvent.click(await screen.findByText("+ Add operations snapshot"));

    const form = document.querySelector("form") as HTMLFormElement;
    fireEvent.change(form.querySelector('input[name="periodStart"]') as HTMLInputElement, { target: { value: "2026-01-01" } });
    fireEvent.change(form.querySelector('input[name="periodEnd"]') as HTMLInputElement, { target: { value: "2026-01-31" } });

    const expected: Record<string, number> = {};
    OPERATIONS_FIELD_NAMES_IN_ORDER.forEach((name, i) => {
      const value = 200 + i;
      expected[name] = value;
      fireEvent.change(form.querySelector(`input[name="${name}"]`) as HTMLInputElement, { target: { value: String(value) } });
    });

    fireEvent.submit(form);
    await waitFor(() => expect(capturedBody).not.toBeNull());

    for (const name of OPERATIONS_FIELD_NAMES_IN_ORDER) {
      expect(capturedBody![name]).toBe(expected[name]);
    }
  });
});

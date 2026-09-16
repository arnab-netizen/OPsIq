/**
 * Owner Inventory page — jsdom integration test.
 */
import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import { render, cleanup, fireEvent, waitFor } from "@testing-library/react";
import InventoryPage from "@/app/(authenticated)/owner/inventory/page";
import { ActiveBusinessProvider } from "@/context/active-business-context";

function renderPage() {
  return render(
    <ActiveBusinessProvider>
      <InventoryPage />
    </ActiveBusinessProvider>
  );
}

const BUSINESSES = [{ id: "biz-uuid-1", name: "Acme Trading" }];

const ITEMS = [
  {
    id: "item-uuid-1",
    sku: "SKU-001",
    name: "Widget A",
    unit: "pcs",
    currentQty: "150.0000",
    reorderPoint: "50.0000",
    safetyStock: "20.0000",
    leadTimeDays: 7,
    dailyUsage: "5.0000",
    vendorId: null,
    notes: null,
    updatedAt: "2026-07-15T00:00:00.000Z",
  },
  {
    id: "item-uuid-2",
    sku: "SKU-002",
    name: "Widget B",
    unit: "kg",
    currentQty: "10.0000",
    reorderPoint: "30.0000",
    safetyStock: "5.0000",
    leadTimeDays: 14,
    dailyUsage: "3.0000",
    vendorId: null,
    notes: null,
    updatedAt: "2026-07-10T00:00:00.000Z",
  },
];

let fetchMock: ReturnType<typeof vi.fn>;

beforeEach(() => {
  fetchMock = vi.fn((input: string | URL, init?: RequestInit) => {
    const url = typeof input === "string" ? input : input.toString();
    const method = (init?.method ?? "GET").toUpperCase();

    if (url.includes("/api/owner/recovery/businesses") && method === "GET") {
      return Promise.resolve({
        ok: true, status: 200,
        json: () => Promise.resolve(BUSINESSES),
      } as Response);
    }
    // The shared ActiveBusinessProvider (wraps every page) fetches this on mount.
    if (url.includes("/api/owner/businesses") && method === "GET") {
      return Promise.resolve({
        ok: true, status: 200,
        json: () => Promise.resolve({ businesses: BUSINESSES }),
      } as Response);
    }
    if (url.includes("/api/owner/inventory/stock-items") && method === "GET" && !url.match(/stock-items\/[a-z]/)) {
      return Promise.resolve({
        ok: true, status: 200,
        json: () => Promise.resolve({ items: ITEMS, total: ITEMS.length }),
      } as Response);
    }
    if (url.includes("/api/owner/inventory/stock-items") && method === "POST") {
      return Promise.resolve({
        ok: true, status: 201,
        json: () => Promise.resolve({ id: "item-uuid-3", sku: "SKU-003", name: "New Item" }),
      } as Response);
    }
    if (url.match(/stock-items\/[a-z0-9-]+$/) && method === "PATCH") {
      return Promise.resolve({
        ok: true, status: 200,
        json: () => Promise.resolve({ id: "item-uuid-1", name: "Widget A Updated" }),
      } as Response);
    }
    return Promise.resolve({
      ok: false, status: 404,
      json: () => Promise.resolve({ error: "not found" }),
    } as Response);
  });
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("InventoryPage", () => {
  it("renders the page heading", async () => {
    const { findByText } = renderPage();
    await findByText("Inventory");
  });

  it("fetches businesses then stock items on mount", async () => {
    const { findByTestId } = renderPage();
    await findByTestId("inventory-table");
    // Business list now comes from the shared ActiveBusinessProvider, not a page-local fetch.
    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining("/api/owner/businesses"),
      expect.anything(),
    );
    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining("businessId=biz-uuid-1"),
      expect.anything(),
    );
  });

  it("renders stock item skus and names", async () => {
    const { findByText } = renderPage();
    await findByText("SKU-001");
    await findByText("Widget A");
    await findByText("SKU-002");
    await findByText("Widget B");
  });

  it("renders current qty with unit", async () => {
    const { findByText } = renderPage();
    await findByText(/150\.00 pcs/);
  });

  it("renders lead time days", async () => {
    const { findByText } = renderPage();
    await findByText("7d");
  });

  it("shows a true-empty state (with a create CTA) when the business has no stock items yet", async () => {
    fetchMock.mockImplementation((input: string | URL) => {
      const url = typeof input === "string" ? input : input.toString();
      if (url.includes("/api/owner/recovery/businesses")) {
        return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve(BUSINESSES) } as Response);
      }
      if (url.includes("/api/owner/businesses")) {
        return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve({ businesses: BUSINESSES }) } as Response);
      }
      if (url.includes("/api/owner/inventory/stock-items")) {
        return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve({ items: [], total: 0 }) } as Response);
      }
      return Promise.resolve({ ok: false, status: 404, json: () => Promise.resolve({}) } as Response);
    });
    const { findByText } = renderPage();
    await findByText("No stock items yet");
  });

  it("opens create modal when + Add Item is clicked", async () => {
    const { findByText } = renderPage();
    await findByText("Inventory");
    await waitFor(async () => {
      const btn = await findByText("+ Add Item");
      fireEvent.click(btn);
    });
    const title = await findByText("Add Stock Item");
    expect(title).toBeTruthy();
  });

  it("opens edit modal when Edit is clicked", async () => {
    const { findByText, findAllByText } = renderPage();
    await findByText("Widget A");
    const editBtns = await findAllByText("Edit");
    fireEvent.click(editBtns[0]);
    const title = await findByText("Edit Stock Item");
    expect(title).toBeTruthy();
  });

  it("submits new stock item via POST", async () => {
    const { findByText } = renderPage();
    const addBtn = await findByText("+ Add Item");
    fireEvent.click(addBtn);
    await findByText("Add Stock Item");

    const createBtn = await findByText("Add item");
    fireEvent.click(createBtn);

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        expect.stringContaining("/api/owner/inventory/stock-items"),
        expect.objectContaining({ method: "POST" }),
      );
    });
  });

  describe("business-switch fetch race safety (mount/business-context effect)", () => {
    const BIZ_A = "biz-uuid-1";
    const BIZ_B = "biz-uuid-2";
    const TWO_BUSINESSES = [{ id: BIZ_A, name: "Acme Trading" }, { id: BIZ_B, name: "Beta Supplies" }];
    const ITEMS_A = [{ id: "item-a", sku: "A-SKU", name: "Business A Item", unit: "pcs", currentQty: "1.0000", reorderPoint: "1.0000", safetyStock: "1.0000", leadTimeDays: 1, dailyUsage: "1.0000", vendorId: null, notes: null, updatedAt: "2026-07-01T00:00:00.000Z" }];
    const ITEMS_B = [{ id: "item-b", sku: "B-SKU", name: "Business B Item", unit: "pcs", currentQty: "2.0000", reorderPoint: "2.0000", safetyStock: "2.0000", leadTimeDays: 2, dailyUsage: "2.0000", vendorId: null, notes: null, updatedAt: "2026-07-02T00:00:00.000Z" }];

    it("switching business before the first business's response arrives shows only the new business's data, never the stale one (LATE_OLD_BUSINESS_RESPONSE_IGNORED), with exactly one stock-items request per business (NO_DUPLICATE_REQUEST_INTRODUCED)", async () => {
      let resolveBizA: (() => void) | null = null;
      const bizARequests: string[] = [];
      const bizBRequests: string[] = [];

      fetchMock.mockImplementation((input: string | URL, init?: RequestInit) => {
        const url = typeof input === "string" ? input : input.toString();
        const method = (init?.method ?? "GET").toUpperCase();
        if (url.includes("/api/owner/recovery/businesses") && method === "GET") {
          return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve(TWO_BUSINESSES) } as Response);
        }
        if (url.includes("/api/owner/businesses") && method === "GET") {
          return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve({ businesses: TWO_BUSINESSES }) } as Response);
        }
        if (url.includes("/api/owner/inventory/stock-items") && method === "GET") {
          if (url.includes(`businessId=${BIZ_A}`)) {
            bizARequests.push(url);
            // Deliberately deferred: resolves only when the test calls resolveBizA() below,
            // which happens AFTER the switch to business B has already completed.
            return new Promise<Response>((resolve) => {
              resolveBizA = () =>
                resolve({ ok: true, status: 200, json: () => Promise.resolve({ items: ITEMS_A, total: ITEMS_A.length }) } as Response);
            });
          }
          if (url.includes(`businessId=${BIZ_B}`)) {
            bizBRequests.push(url);
            return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve({ items: ITEMS_B, total: ITEMS_B.length }) } as Response);
          }
        }
        return Promise.resolve({ ok: false, status: 404, json: () => Promise.resolve({ error: "not found" }) } as Response);
      });

      const { findByText, findByTestId, queryByText } = renderPage();

      // Initial mount resolves to business A and issues exactly one stock-items request for it
      // (INITIAL_ACTIVE_BUSINESS_REQUEST_COUNT=1) -- but that request is still pending (deferred above).
      await waitFor(() => expect(bizARequests.length).toBe(1));
      expect(bizBRequests.length).toBe(0);

      // Switch business before A's response arrives.
      const selector = await findByTestId("business-context-selector");
      fireEvent.change(selector, { target: { value: BIZ_B } });

      // Business B's data renders (BUSINESS_SWITCH_REQUESTS_NEW_BUSINESS=YES).
      await findByText("Business B Item");
      expect(bizBRequests.length).toBe(1);

      // Now let business A's deferred response resolve, arriving late.
      expect(resolveBizA).not.toBeNull();
      resolveBizA!();

      // Give the (ignored) late resolution a tick to run through if it were going to.
      await new Promise((r) => setTimeout(r, 20));

      // Business B's item must still be showing; business A's stale item must never appear.
      expect(queryByText("Business B Item")).not.toBeNull();
      expect(queryByText("Business A Item")).toBeNull();

      // Exactly one stock-items request was made per business -- the late arrival did not trigger
      // a retry or a duplicate fetch for either business.
      expect(bizARequests.length).toBe(1);
      expect(bizBRequests.length).toBe(1);
    });

    it("issues no stock-items request until the business context has resolved (NO_REQUEST_WHILE_CONTEXT_LOADING)", async () => {
      const stockItemCallsBeforeBusinessesResolved: string[] = [];
      let resolveBusinesses: (() => void) | null = null;

      fetchMock.mockImplementation((input: string | URL, init?: RequestInit) => {
        const url = typeof input === "string" ? input : input.toString();
        const method = (init?.method ?? "GET").toUpperCase();
        if (url.includes("/api/owner/inventory/stock-items") && method === "GET") {
          stockItemCallsBeforeBusinessesResolved.push(url);
          return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve({ items: ITEMS_A, total: ITEMS_A.length }) } as Response);
        }
        if (url.includes("/api/owner/recovery/businesses") || url.includes("/api/owner/businesses")) {
          return new Promise<Response>((resolve) => {
            resolveBusinesses = () =>
              resolve({ ok: true, status: 200, json: () => Promise.resolve(url.includes("/api/owner/businesses") ? { businesses: TWO_BUSINESSES } : TWO_BUSINESSES) } as Response);
          });
        }
        return Promise.resolve({ ok: false, status: 404, json: () => Promise.resolve({ error: "not found" }) } as Response);
      });

      renderPage();
      await new Promise((r) => setTimeout(r, 20));
      expect(stockItemCallsBeforeBusinessesResolved.length).toBe(0);

      expect(resolveBusinesses).not.toBeNull();
      resolveBusinesses!();
      await waitFor(() => expect(stockItemCallsBeforeBusinessesResolved.length).toBeGreaterThan(0));
    });
  });
});

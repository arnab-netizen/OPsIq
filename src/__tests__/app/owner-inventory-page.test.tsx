/**
 * Owner Inventory page — jsdom integration test.
 */
import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import { render, cleanup, fireEvent, waitFor } from "@testing-library/react";
import InventoryPage from "@/app/(authenticated)/owner/inventory/page";

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
    const { findByText } = render(<InventoryPage />);
    await findByText("Inventory");
  });

  it("fetches businesses then stock items on mount", async () => {
    const { findByTestId } = render(<InventoryPage />);
    await findByTestId("inventory-table");
    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining("/api/owner/recovery/businesses"),
      expect.anything(),
    );
    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining("businessId=biz-uuid-1"),
      expect.anything(),
    );
  });

  it("renders stock item skus and names", async () => {
    const { findByText } = render(<InventoryPage />);
    await findByText("SKU-001");
    await findByText("Widget A");
    await findByText("SKU-002");
    await findByText("Widget B");
  });

  it("renders current qty with unit", async () => {
    const { findByText } = render(<InventoryPage />);
    await findByText(/150\.00 pcs/);
  });

  it("renders lead time days", async () => {
    const { findByText } = render(<InventoryPage />);
    await findByText("7d");
  });

  it("shows a true-empty state (with a create CTA) when the business has no stock items yet", async () => {
    fetchMock.mockImplementation((input: string | URL) => {
      const url = typeof input === "string" ? input : input.toString();
      if (url.includes("/api/owner/recovery/businesses")) {
        return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve(BUSINESSES) } as Response);
      }
      if (url.includes("/api/owner/inventory/stock-items")) {
        return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve({ items: [], total: 0 }) } as Response);
      }
      return Promise.resolve({ ok: false, status: 404, json: () => Promise.resolve({}) } as Response);
    });
    const { findByText } = render(<InventoryPage />);
    await findByText("No stock items yet");
  });

  it("opens create modal when + Add Item is clicked", async () => {
    const { findByText } = render(<InventoryPage />);
    await findByText("Inventory");
    await waitFor(async () => {
      const btn = await findByText("+ Add Item");
      fireEvent.click(btn);
    });
    const title = await findByText("Add Stock Item");
    expect(title).toBeTruthy();
  });

  it("opens edit modal when Edit is clicked", async () => {
    const { findByText, findAllByText } = render(<InventoryPage />);
    await findByText("Widget A");
    const editBtns = await findAllByText("Edit");
    fireEvent.click(editBtns[0]);
    const title = await findByText("Edit Stock Item");
    expect(title).toBeTruthy();
  });

  it("submits new stock item via POST", async () => {
    const { findByText } = render(<InventoryPage />);
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
});

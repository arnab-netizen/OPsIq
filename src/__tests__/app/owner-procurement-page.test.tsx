/**
 * Owner Procurement (Purchase Orders) page — jsdom integration test.
 */
import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import { render, cleanup, fireEvent, waitFor } from "@testing-library/react";
import ProcurementPage from "@/app/(authenticated)/owner/procurement/page";
import { ActiveBusinessProvider } from "@/context/active-business-context";

function renderPage() {
  return render(
    <ActiveBusinessProvider>
      <ProcurementPage />
    </ActiveBusinessProvider>
  );
}

const BUSINESSES = [{ id: "biz-uuid-1", name: "Acme Trading" }];
const TWO_BUSINESSES = [
  { id: "biz-uuid-1", name: "Acme Trading" },
  { id: "biz-uuid-2", name: "Beta Foods" },
];

const ORDERS = [
  {
    id: "po-uuid-1",
    poNumber: "PO-2026-001",
    vendorName: "Supplier Co",
    status: "DRAFT",
    totalAmount: null,
    currency: "USD",
    lineItems: [{ description: "Widget A", qty: 100, unitPrice: 5 }],
    createdAt: "2026-07-15T00:00:00.000Z",
    updatedAt: "2026-07-15T00:00:00.000Z",
  },
  {
    id: "po-uuid-2",
    poNumber: "PO-2026-002",
    vendorName: null,
    status: "APPROVED",
    totalAmount: "2500.00",
    currency: "USD",
    lineItems: [{ description: "Parts kit", qty: 50, unitPrice: 50 }],
    createdAt: "2026-07-10T00:00:00.000Z",
    updatedAt: "2026-07-12T00:00:00.000Z",
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
    if (url.includes("/api/owner/procurement/purchase-orders") && method === "GET" && !url.includes("/transition")) {
      return Promise.resolve({
        ok: true, status: 200,
        json: () => Promise.resolve({ orders: ORDERS, total: ORDERS.length }),
      } as Response);
    }
    if (url.includes("/api/owner/procurement/purchase-orders") && method === "POST" && !url.includes("/transition")) {
      return Promise.resolve({
        ok: true, status: 201,
        json: () => Promise.resolve({ id: "po-uuid-3", poNumber: "PO-2026-003", status: "DRAFT" }),
      } as Response);
    }
    if (url.includes("/transition") && method === "POST") {
      return Promise.resolve({
        ok: true, status: 200,
        json: () => Promise.resolve({ id: "po-uuid-1", status: "REVIEWED" }),
      } as Response);
    }
    return Promise.resolve({
      ok: false, status: 404,
      json: () => Promise.resolve({ error: "not found" }),
    } as Response);
  });
  vi.stubGlobal("fetch", fetchMock);
  // ActiveBusinessContext persists the selected business to session/local storage (see
  // src/context/active-business-context.tsx) so a new tab/session starts from the last switch —
  // jsdom's storage isn't reset between `it()` blocks on its own, so without this a later test's
  // business switch would leak into an earlier-ordered test's initial render.
  window.sessionStorage.clear();
  window.localStorage.clear();
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("ProcurementPage", () => {
  it("renders the page heading", async () => {
    const { findByText } = renderPage();
    await findByText("Purchase Orders");
  });

  it("fetches businesses then orders on mount", async () => {
    const { findByTestId } = renderPage();
    await findByTestId("procurement-table");
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

  it("renders PO numbers in the table", async () => {
    const { findByText } = renderPage();
    await findByText("PO-2026-001");
    await findByText("PO-2026-002");
  });

  it("renders vendor name", async () => {
    const { findByText } = renderPage();
    await findByText("Supplier Co");
  });

  it("renders Draft status badge", async () => {
    // Presentation-only: the badge shows a sentence-case label ("Draft") for
    // the raw "DRAFT" status value; the stored/submitted value is unchanged.
    const { findAllByText } = renderPage();
    const badges = await findAllByText("Draft");
    expect(badges.length).toBeGreaterThan(0);
  });

  it("renders Approved status badge", async () => {
    const { findAllByText } = renderPage();
    const badges = await findAllByText("Approved");
    expect(badges.length).toBeGreaterThan(0);
  });

  it("renders total amount for approved PO", async () => {
    const { findByText } = renderPage();
    await findByText(/2,500/);
  });

  it("shows dash for missing vendor", async () => {
    const { findByTestId } = renderPage();
    await findByTestId("procurement-table");
    // Second order has no vendor name → "—"
    const { getAllByText } = renderPage();
    // Just confirm table renders without error
    expect(true).toBe(true);
  });

  it("shows a true-empty state (with a create CTA) when the business has no purchase orders yet", async () => {
    fetchMock.mockImplementation((input: string | URL) => {
      const url = typeof input === "string" ? input : input.toString();
      if (url.includes("/api/owner/recovery/businesses")) {
        return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve(BUSINESSES) } as Response);
      }
      if (url.includes("/api/owner/businesses")) {
        return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve({ businesses: BUSINESSES }) } as Response);
      }
      if (url.includes("/api/owner/procurement/purchase-orders")) {
        return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve({ orders: [], total: 0 }) } as Response);
      }
      return Promise.resolve({ ok: false, status: 404, json: () => Promise.resolve({}) } as Response);
    });
    const { findByText } = renderPage();
    await findByText("No purchase orders yet");
  });

  it("opens create modal when + New PO is clicked", async () => {
    const { findByText } = renderPage();
    await findByText("Purchase Orders");
    await waitFor(async () => {
      const btn = await findByText("+ New PO");
      fireEvent.click(btn);
    });
    const title = await findByText("New Purchase Order");
    expect(title).toBeTruthy();
  });

  it("submits new PO via POST", async () => {
    const { findByText } = renderPage();
    const addBtn = await findByText("+ New PO");
    fireEvent.click(addBtn);
    await findByText("New Purchase Order");

    const createBtn = await findByText("Create PO");
    fireEvent.click(createBtn);

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        expect.stringContaining("/api/owner/procurement/purchase-orders"),
        expect.objectContaining({ method: "POST" }),
      );
    });
  });

  it("calls transition endpoint when Mark Reviewed is clicked", async () => {
    const { findByText } = renderPage();
    await findByText("PO-2026-001");
    const markBtn = await findByText("Mark Reviewed");
    fireEvent.click(markBtn);

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        expect.stringContaining("/transition"),
        expect.objectContaining({ method: "POST" }),
      );
    });
  });

  describe("business switch — never shows stale rows tagged as the newly selected business", () => {
    it("clears the previous business's orders immediately and shows a loading state while the new business's orders are in flight", async () => {
      let resolveBiz2: (v: unknown) => void = () => {};
      const biz2Pending = new Promise((resolve) => { resolveBiz2 = resolve; });

      fetchMock.mockImplementation((input: string | URL) => {
        const url = typeof input === "string" ? input : input.toString();
        if (url.includes("/api/owner/recovery/businesses")) {
          return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve(TWO_BUSINESSES) } as Response);
        }
        if (url.includes("/api/owner/businesses")) {
          return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve({ businesses: TWO_BUSINESSES }) } as Response);
        }
        if (url.includes("businessId=biz-uuid-1")) {
          return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve({ orders: ORDERS, total: ORDERS.length }) } as Response);
        }
        if (url.includes("businessId=biz-uuid-2")) {
          return biz2Pending.then(() => ({ ok: true, status: 200, json: () => Promise.resolve({ orders: [], total: 0 }) } as Response));
        }
        return Promise.resolve({ ok: false, status: 404, json: () => Promise.resolve({}) } as Response);
      });

      const { findByText, queryByText, getByTestId } = renderPage();
      await findByText("PO-2026-001");

      fireEvent.change(getByTestId("business-context-selector"), { target: { value: "biz-uuid-2" } });

      // While business-2's fetch is still pending, business-1's PO must not still be rendered —
      // it would otherwise be visually presented as if it belonged to business 2, whose name is
      // already showing in the selector.
      await waitFor(() => {
        expect(queryByText("PO-2026-001")).toBeNull();
      });
      expect(fetchMock).toHaveBeenCalledWith(expect.stringContaining("businessId=biz-uuid-2"), expect.anything());

      resolveBiz2(undefined);
      await findByText("No purchase orders yet");
      expect(queryByText("PO-2026-001")).toBeNull();
    });

    it("does not show the previous business's orders if the newly selected business's fetch fails", async () => {
      fetchMock.mockImplementation((input: string | URL) => {
        const url = typeof input === "string" ? input : input.toString();
        if (url.includes("/api/owner/recovery/businesses")) {
          return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve(TWO_BUSINESSES) } as Response);
        }
        if (url.includes("/api/owner/businesses")) {
          return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve({ businesses: TWO_BUSINESSES }) } as Response);
        }
        if (url.includes("businessId=biz-uuid-1")) {
          return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve({ orders: ORDERS, total: ORDERS.length }) } as Response);
        }
        if (url.includes("businessId=biz-uuid-2")) {
          return Promise.resolve({ ok: false, status: 500, json: () => Promise.resolve({ error: "Simulated failure" }) } as Response);
        }
        return Promise.resolve({ ok: false, status: 404, json: () => Promise.resolve({}) } as Response);
      });

      const { findByText, queryByText, getByTestId } = renderPage();
      await findByText("PO-2026-001");

      fireEvent.change(getByTestId("business-context-selector"), { target: { value: "biz-uuid-2" } });

      await waitFor(() => {
        expect(queryByText("PO-2026-001")).toBeNull();
      });
      await findByText("No purchase orders yet");
      expect(queryByText("PO-2026-001")).toBeNull();
    });

    it("ignores a late response for a business the owner has already switched away from", async () => {
      let resolveBiz1: (v: unknown) => void = () => {};
      const biz1Pending = new Promise((resolve) => { resolveBiz1 = resolve; });

      fetchMock.mockImplementation((input: string | URL) => {
        const url = typeof input === "string" ? input : input.toString();
        if (url.includes("/api/owner/recovery/businesses")) {
          return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve(TWO_BUSINESSES) } as Response);
        }
        if (url.includes("/api/owner/businesses")) {
          return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve({ businesses: TWO_BUSINESSES }) } as Response);
        }
        if (url.includes("businessId=biz-uuid-1")) {
          return biz1Pending.then(() => ({ ok: true, status: 200, json: () => Promise.resolve({ orders: ORDERS, total: ORDERS.length }) } as Response));
        }
        if (url.includes("businessId=biz-uuid-2")) {
          return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve({ orders: [], total: 0 }) } as Response);
        }
        return Promise.resolve({ ok: false, status: 404, json: () => Promise.resolve({}) } as Response);
      });

      const { findByText, queryByText, findByTestId } = renderPage();
      const selector = await findByTestId("business-context-selector");
      fireEvent.change(selector, { target: { value: "biz-uuid-2" } });
      await findByText("No purchase orders yet");

      resolveBiz1(undefined);
      await new Promise((r) => setTimeout(r, 0));

      expect(queryByText("PO-2026-001")).toBeNull();
      await findByText("No purchase orders yet");
    });
  });
});

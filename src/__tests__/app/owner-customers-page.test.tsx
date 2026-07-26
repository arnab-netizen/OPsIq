/**
 * Owner Customers page — jsdom integration test.
 *
 * Stubs fetch to serve businesses + customer list. Asserts: page renders
 * customer table, create/edit modal lifecycle, and workspace-scoped fetch calls.
 */
import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import { render, cleanup, fireEvent, waitFor } from "@testing-library/react";
import CustomersPage from "@/app/(authenticated)/owner/customers/page";

const BUSINESSES = [{ id: "biz-uuid-1", name: "Acme Trading" }];

const CUSTOMERS = [
  {
    id: "cust-uuid-1",
    name: "Jane Smith",
    email: "jane@example.com",
    phone: "+1 555 000 0001",
    segment: "VIP",
    lastPurchaseDate: "2026-07-15T00:00:00.000Z",
    ltv: 12500,
    tags: [],
    updatedAt: "2026-07-15T00:00:00.000Z",
  },
  {
    id: "cust-uuid-2",
    name: "Bob Jones",
    email: null,
    phone: null,
    segment: "AT_RISK",
    lastPurchaseDate: null,
    ltv: null,
    tags: [],
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
    if (url.includes("/api/owner/sales/customers") && method === "GET" && !url.match(/customers\/[a-z]/)) {
      return Promise.resolve({
        ok: true, status: 200,
        json: () => Promise.resolve({ customers: CUSTOMERS, total: CUSTOMERS.length }),
      } as Response);
    }
    if (url.includes("/api/owner/sales/customers") && method === "POST") {
      return Promise.resolve({
        ok: true, status: 201,
        json: () => Promise.resolve({ id: "cust-uuid-3", name: "New Customer" }),
      } as Response);
    }
    if (url.match(/customers\/[a-z0-9-]+$/) && method === "PATCH") {
      return Promise.resolve({
        ok: true, status: 200,
        json: () => Promise.resolve({ id: "cust-uuid-1", name: "Jane Smith Updated" }),
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

describe("CustomersPage", () => {
  it("renders the page heading", async () => {
    const { findByText } = render(<CustomersPage />);
    await findByText("Customers");
  });

  it("fetches businesses then customers on mount", async () => {
    const { findByTestId } = render(<CustomersPage />);
    await findByTestId("customers-table");
    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining("/api/owner/recovery/businesses"),
      expect.anything(),
    );
    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining("businessId=biz-uuid-1"),
      expect.anything(),
    );
  });

  it("renders customer names in the table", async () => {
    const { findByText } = render(<CustomersPage />);
    await findByText("Jane Smith");
    await findByText("Bob Jones");
  });

  it("renders VIP segment badge", async () => {
    const { findByText } = render(<CustomersPage />);
    await findByText("VIP");
  });

  it("renders LTV value for Jane Smith", async () => {
    const { findByText } = render(<CustomersPage />);
    await findByText("$12,500");
  });

  it("shows dash for missing email", async () => {
    const { findByTestId, findAllByText } = render(<CustomersPage />);
    await findByTestId("customers-table");
    const dashes = await findAllByText("—");
    expect(dashes.length).toBeGreaterThan(0);
  });

  it("opens create modal when + New Customer is clicked", async () => {
    const { findByText } = render(<CustomersPage />);
    await findByText("Customers");
    await waitFor(async () => {
      const btn = await findByText("+ New Customer");
      fireEvent.click(btn);
    });
    const title = await findByText("New Customer");
    expect(title).toBeTruthy();
  });

  it("opens edit modal when Edit is clicked", async () => {
    const { findByText, findAllByText } = render(<CustomersPage />);
    await findByText("Jane Smith");
    const editBtns = await findAllByText("Edit");
    fireEvent.click(editBtns[0]);
    const title = await findByText("Edit Customer");
    expect(title).toBeTruthy();
  });

  it("shows No customers found when list is empty", async () => {
    fetchMock.mockImplementation((input: string | URL) => {
      const url = typeof input === "string" ? input : input.toString();
      if (url.includes("/api/owner/recovery/businesses")) {
        return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve(BUSINESSES) } as Response);
      }
      if (url.includes("/api/owner/sales/customers")) {
        return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve({ customers: [], total: 0 }) } as Response);
      }
      return Promise.resolve({ ok: false, status: 404, json: () => Promise.resolve({}) } as Response);
    });
    const { findByText } = render(<CustomersPage />);
    await findByText("No customers found.");
  });

  it("submits new customer via POST", async () => {
    const { findByText } = render(<CustomersPage />);
    const addBtn = await findByText("+ New Customer");
    fireEvent.click(addBtn);
    await findByText("New Customer");

    const inputs = document.querySelectorAll('input');
    const nameInput = Array.from(inputs).find((i) => (i as HTMLInputElement).type === "text") as HTMLInputElement | undefined;
    if (nameInput) fireEvent.change(nameInput, { target: { value: "New Person" } });

    const createBtn = await findByText("Add customer");
    fireEvent.click(createBtn);

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        expect.stringContaining("/api/owner/sales/customers"),
        expect.objectContaining({ method: "POST" }),
      );
    });
  });
});

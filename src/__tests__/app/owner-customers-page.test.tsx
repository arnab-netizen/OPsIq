/**
 * Owner Customers page — jsdom integration test.
 *
 * Stubs fetch to serve businesses + customer list. Asserts: page renders
 * customer table, create/edit modal lifecycle, and workspace-scoped fetch calls.
 */
import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import { render, cleanup, fireEvent, waitFor, within } from "@testing-library/react";
import CustomersPage from "@/app/(authenticated)/owner/customers/page";
import { ActiveBusinessProvider } from "@/context/active-business-context";

function renderPage() {
  return render(
    <ActiveBusinessProvider>
      <CustomersPage />
    </ActiveBusinessProvider>
  );
}

const BUSINESSES = [{ id: "biz-uuid-1", name: "Acme Trading", currency: "USD" }];

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
    // The shared ActiveBusinessProvider (wraps every page — see finance/page.tsx's root-cause
    // comment) fetches this on mount to resolve the active business.
    if (url.includes("/api/owner/businesses") && method === "GET") {
      return Promise.resolve({
        ok: true, status: 200,
        json: () => Promise.resolve({ businesses: BUSINESSES }),
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
    const { findByText } = renderPage();
    await findByText("Customers");
  });

  it("fetches businesses then customers on mount", async () => {
    const { findByTestId } = renderPage();
    await findByTestId("customers-table");
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

  it("renders customer names in the table", async () => {
    // Scoped to the desktop table: the same customer list also renders as a stacked card list
    // for narrow (mobile) viewports, present in the jsdom tree alongside the table (the two are
    // separated with CSS breakpoints, which jsdom doesn't evaluate), so an unscoped query is
    // ambiguous by design once both are on screen together.
    const { findByTestId } = renderPage();
    const table = await findByTestId("customers-table");
    await within(table).findByText("Jane Smith");
    await within(table).findByText("Bob Jones");
  });

  it("renders VIP segment badge", async () => {
    // Scoped to the records table: "VIP" is a legitimate segment name that also appears as a
    // plain option in the segment-filter <select> above the table, so an unscoped text query is
    // ambiguous by design once both are on screen together (real UI, not a bug).
    const { findByTestId } = renderPage();
    const table = await findByTestId("customers-table");
    await within(table).findByText("VIP");
  });

  it("renders LTV value for Jane Smith", async () => {
    const { findByTestId } = renderPage();
    const table = await findByTestId("customers-table");
    await within(table).findByText("USD 12,500");
  });

  it("shows dash for missing email", async () => {
    const { findByTestId, findAllByText } = renderPage();
    await findByTestId("customers-table");
    const dashes = await findAllByText("—");
    expect(dashes.length).toBeGreaterThan(0);
  });

  it("opens create modal when + New Customer is clicked", async () => {
    const { findByText } = renderPage();
    await findByText("Customers");
    await waitFor(async () => {
      const btn = await findByText("+ New Customer");
      fireEvent.click(btn);
    });
    const title = await findByText("New Customer");
    expect(title).toBeTruthy();
  });

  it("associates the New Customer modal's fields with their visible labels (G1)", async () => {
    const { findByText, getByLabelText } = renderPage();
    await findByText("Customers");
    await waitFor(async () => {
      const btn = await findByText("+ New Customer");
      fireEvent.click(btn);
    });
    await findByText("New Customer");
    expect(getByLabelText(/Name/)).toBeTruthy();
    expect(getByLabelText("Email")).toBeTruthy();
    expect(getByLabelText("Phone")).toBeTruthy();
    expect(getByLabelText("Segment")).toBeTruthy();
    expect(getByLabelText("Lifetime value ($)")).toBeTruthy();
    expect(getByLabelText("Notes")).toBeTruthy();
  });

  it("opens edit modal when Edit is clicked", async () => {
    const { findByText, findByTestId, findAllByText } = renderPage();
    const table = await findByTestId("customers-table");
    await within(table).findByText("Jane Smith");
    const editBtns = await findAllByText("Edit");
    fireEvent.click(editBtns[0]);
    const title = await findByText("Edit Customer");
    expect(title).toBeTruthy();
  });

  it("shows a true-empty state (with a create CTA) when the business has no customers yet", async () => {
    fetchMock.mockImplementation((input: string | URL) => {
      const url = typeof input === "string" ? input : input.toString();
      if (url.includes("/api/owner/recovery/businesses")) {
        return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve(BUSINESSES) } as Response);
      }
      if (url.includes("/api/owner/businesses")) {
        return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve({ businesses: BUSINESSES }) } as Response);
      }
      if (url.includes("/api/owner/sales/customers")) {
        return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve({ customers: [], total: 0 }) } as Response);
      }
      return Promise.resolve({ ok: false, status: 404, json: () => Promise.resolve({}) } as Response);
    });
    const { findByText } = renderPage();
    await findByText("No customers yet");
  });

  it("submits new customer via POST", async () => {
    const { findByText, findByTestId } = renderPage();
    // Wait for the customers table (not just the page heading) so the shared active-business
    // context and this page's own customer list have both fully resolved before interacting —
    // otherwise a click can land mid-async-chain and miss the modal open.
    await findByTestId("customers-table");
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

describe("CustomerBusinessReview calculations", () => {
  const daysAgo = (n: number) => new Date(Date.now() - n * 24 * 60 * 60 * 1000).toISOString();

  // ltv is a serialized Prisma Decimal on the wire -- a numeric STRING, not a JS number. A prior
  // bug summed these with a bare `+`, which silently string-concatenated instead of adding
  // (0 + "180000" is the string "0180000" in JS) once the very first value hit a string operand.
  // These fixtures deliberately use string ltv values to prove that regression stays fixed.
  const CALC_CUSTOMERS = [
    {
      id: "c1", name: "Ramesh Traders", email: null, phone: null, segment: "VIP",
      lastPurchaseDate: daysAgo(5), ltv: "180000", tags: ["design-demo", "repeat-customer"], updatedAt: daysAgo(5),
    },
    {
      id: "c2", name: "Quiet Customer", email: null, phone: null, segment: "B2C",
      lastPurchaseDate: daysAgo(100), ltv: "20000", tags: [], updatedAt: daysAgo(100),
    },
    {
      id: "c3", name: "Overdue Customer", email: null, phone: null, segment: "B2C",
      lastPurchaseDate: daysAgo(10), ltv: null, tags: [],
      notes: "Invoice overdue by 30 days -- $500 outstanding.", updatedAt: daysAgo(10),
    },
  ];

  beforeEach(() => {
    fetchMock = vi.fn((input: string | URL) => {
      const url = typeof input === "string" ? input : input.toString();
      if (url.includes("/api/owner/recovery/businesses")) {
        return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve(BUSINESSES) } as Response);
      }
      if (url.includes("/api/owner/businesses")) {
        return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve({ businesses: BUSINESSES }) } as Response);
      }
      if (url.includes("/api/owner/sales/customers")) {
        return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve({ customers: CALC_CUSTOMERS, total: CALC_CUSTOMERS.length }) } as Response);
      }
      return Promise.resolve({ ok: false, status: 404, json: () => Promise.resolve({}) } as Response);
    });
    vi.stubGlobal("fetch", fetchMock);
  });

  it("sums string-valued Decimal ltv correctly instead of string-concatenating it", async () => {
    const { findByText } = renderPage();
    // 180000 + 20000 = 200000, not "0180000020000" or similar garbage from string concatenation.
    await findByText(/worth USD 200,000 in combined lifetime value/);
  });

  it("computes concentration share from real ltv values", async () => {
    const { findByText } = renderPage();
    // Ramesh Traders: 180000 / 200000 = 90%.
    await findByText(/Ramesh Traders alone accounts for 90% of that/);
    await findByText((_, node) =>
      node?.textContent === "Of USD 200,000 in tracked lifetime value across 2 customers with a recorded value, Ramesh Traders accounts for 90%. Losing this customer would be a significant, concentrated hit."
    );
  });

  it("flags a customer inactive only past the 60-day threshold, using real lastPurchaseDate", async () => {
    const { findByText } = renderPage();
    await findByText(/1 customer hasn't been seen in over 60 days/);
    await findByText((_, node) =>
      node?.textContent === "3 of 3 customers have a recorded last-purchase date. 1 hasn't ordered in over 60 days: Quiet Customer."
    );
  });

  it("surfaces payment-behaviour evidence only from real notes text, quoted verbatim", async () => {
    const { findByText } = renderPage();
    await findByText((_, node) => node?.textContent === "Overdue Customer:");
    await findByText(/Invoice overdue by 30 days -- \$500 outstanding\./);
  });

  it("counts repeat-business tags from real tags data, not a fabricated metric", async () => {
    const { findByText } = renderPage();
    await findByText((_, node) =>
      node?.textContent === "1 of 3 customers carry a tag marking them as a repeat customer: Ramesh Traders."
    );
  });
});

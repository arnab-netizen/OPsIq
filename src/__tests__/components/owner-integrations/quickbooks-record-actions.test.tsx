/**
 * QuickBooksRecordActionsProvider / QuickBooksRecordActionCell — per-row governed QuickBooks
 * product triggers (Send to QuickBooks / Record bill / Remove from QuickBooks) mounted on
 * Vendor/Customer/PurchaseOrder rows.
 *
 * Proves: not connected (server returns records: []) renders nothing at all; a row's buttons come
 * strictly from its own `actions` flags; the destructive/creating actions (PO push, record bill,
 * inactivate) require a confirm dialog and cancelling posts nothing; every action posts the exact
 * body the server contract expects; a double click on a direct-post button and on a dialog's
 * confirm button each posts exactly once; a failed POST shows owner-safe error text without
 * crashing; and exactly ONE GET record-actions request is made for a whole batch of rows, never
 * one per row.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent, waitFor, within } from "@testing-library/react";
import {
  QuickBooksRecordActionsProvider,
  QuickBooksRecordActionCell,
  type QboRecordType,
} from "@/ui/owner/integrations/quickbooks-record-actions";

function Host({ type, ids }: { type: QboRecordType; ids: string[] }) {
  return (
    <QuickBooksRecordActionsProvider type={type} ids={ids}>
      {ids.map((id) => (
        <div key={id}>
          <QuickBooksRecordActionCell recordId={id} />
        </div>
      ))}
    </QuickBooksRecordActionsProvider>
  );
}

interface RecordActionsDTO {
  id: string;
  links: Array<{ entityType: string; remoteId: string; remoteStatus: string }>;
  actions: {
    pushVendor?: boolean;
    pushCustomer?: boolean;
    pushPurchaseOrder?: boolean;
    recordBill?: boolean;
    inactivate?: boolean;
  };
  blockedReason: string | null;
}

let currentRecords: RecordActionsDTO[];
let currentAccounts: Array<{ id: string; name: string; accountType: string }>;
let postOk = true;
let postErrorMessage = "Something went wrong. Try again.";
const posted: Array<{ body: unknown }> = [];
let recordActionsGetCalls: number;

function stubFetch() {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (path: string, init?: RequestInit) => {
      if (typeof path !== "string") return { ok: false, status: 404, json: async () => ({}) } as Response;
      if (path.includes("view=record-actions")) {
        recordActionsGetCalls += 1;
        return { ok: true, json: async () => ({ records: currentRecords }) } as Response;
      }
      if (path.includes("view=expense-accounts")) {
        return { ok: true, json: async () => ({ accounts: currentAccounts }) } as Response;
      }
      if (init?.method === "POST") {
        const body = init.body ? JSON.parse(String(init.body)) : {};
        posted.push({ body });
        if (!postOk) {
          // Canonical envelope (withCanonicalEnforcement): a flat, already owner-safe `error`
          // string, non-401/403/5xx status — httpResponseErrorFromBody/classifyOperatorError
          // surface this verbatim.
          return { ok: false, status: 422, json: async () => ({ error: postErrorMessage }) } as Response;
        }
        return {
          ok: true,
          json: async () => ({ result: { action: "CREATED", remoteId: "qbo-remote-1", replayed: false } }),
        } as Response;
      }
      return { ok: false, status: 404, json: async () => ({}) } as Response;
    }),
  );
}

beforeEach(() => {
  currentRecords = [];
  currentAccounts = [{ id: "acct-1", name: "Office Supplies", accountType: "Expense" }];
  postOk = true;
  postErrorMessage = "Something went wrong. Try again.";
  posted.length = 0;
  recordActionsGetCalls = 0;
  stubFetch();
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("QuickBooksRecordActionsProvider / QuickBooksRecordActionCell", () => {
  it("not connected (server returns records: []): renders nothing for any row", async () => {
    currentRecords = [];
    render(<Host type="VendorRecord" ids={["v1", "v2"]} />);
    await waitFor(() => expect(recordActionsGetCalls).toBe(1));
    expect(screen.queryByTestId("qbo-actions-v1")).toBeNull();
    expect(screen.queryByTestId("qbo-actions-v2")).toBeNull();
    expect(screen.queryByRole("button")).toBeNull();
  });

  it("renders only the buttons whose actions flag is true", async () => {
    currentRecords = [
      { id: "po1", links: [], actions: { pushPurchaseOrder: true }, blockedReason: null },
      { id: "po2", links: [], actions: { recordBill: true }, blockedReason: null },
      { id: "po3", links: [], actions: {}, blockedReason: "Assign an approved vendor to this purchase order first." },
    ];
    render(<Host type="PurchaseOrder" ids={["po1", "po2", "po3"]} />);
    await screen.findByTestId("qbo-actions-po1");

    const cell1 = within(screen.getByTestId("qbo-actions-po1"));
    expect(cell1.getByRole("button", { name: /send to quickbooks/i })).toBeTruthy();
    expect(cell1.queryByRole("button", { name: /record bill/i })).toBeNull();

    const cell2 = within(screen.getByTestId("qbo-actions-po2"));
    expect(cell2.getByRole("button", { name: /record bill/i })).toBeTruthy();
    expect(cell2.queryByRole("button", { name: /send to quickbooks/i })).toBeNull();

    const cell3 = within(screen.getByTestId("qbo-actions-po3"));
    expect(cell3.queryByRole("button")).toBeNull();
    expect(cell3.getByText(/assign an approved vendor/i)).toBeTruthy();
  });

  it("shows a linked badge from `links`, not a client-derived status", async () => {
    currentRecords = [
      { id: "po1", links: [{ entityType: "PurchaseOrder", remoteId: "r1", remoteStatus: "ACTIVE" }], actions: {}, blockedReason: null },
      { id: "po2", links: [{ entityType: "Bill", remoteId: "r2", remoteStatus: "ACTIVE" }], actions: {}, blockedReason: null },
    ];
    render(<Host type="PurchaseOrder" ids={["po1", "po2"]} />);
    await screen.findByTestId("qbo-actions-po1");
    expect(within(screen.getByTestId("qbo-actions-po1")).getByText("In QuickBooks")).toBeTruthy();
    expect(within(screen.getByTestId("qbo-actions-po2")).getByText("Bill recorded")).toBeTruthy();
  });

  it("push_vendor posts the exact body with no confirm dialog, and a double click posts exactly once", async () => {
    currentRecords = [{ id: "v1", links: [], actions: { pushVendor: true }, blockedReason: null }];
    render(<Host type="VendorRecord" ids={["v1"]} />);
    const btn = await screen.findByRole("button", { name: /send to quickbooks/i });
    fireEvent.click(btn);
    fireEvent.click(btn);
    await waitFor(() => expect(posted.length).toBe(1));
    expect(posted[0].body).toEqual({ action: "push_vendor", vendorId: "v1" });
  });

  it("push_customer posts the exact body", async () => {
    currentRecords = [{ id: "c1", links: [], actions: { pushCustomer: true }, blockedReason: null }];
    render(<Host type="CustomerRecord" ids={["c1"]} />);
    fireEvent.click(await screen.findByRole("button", { name: /send to quickbooks/i }));
    await waitFor(() => expect(posted.length).toBe(1));
    expect(posted[0].body).toEqual({ action: "push_customer", customerId: "c1" });
  });

  it("PO push requires confirmation in a dialog; cancel posts nothing", async () => {
    currentRecords = [{ id: "po1", links: [], actions: { pushPurchaseOrder: true }, blockedReason: null }];
    render(<Host type="PurchaseOrder" ids={["po1"]} />);
    fireEvent.click(await screen.findByRole("button", { name: /send to quickbooks/i }));
    const dialog = await screen.findByRole("dialog", { name: /send purchase order to quickbooks/i });
    expect(within(dialog).getByText(/creates? a purchase order in quickbooks|will create a purchase order in quickbooks/i)).toBeTruthy();
    fireEvent.click(within(dialog).getByRole("button", { name: /cancel/i }));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(posted.length).toBe(0);
  });

  it("PO push: confirm posts the exact body with the chosen expense account, and a double click posts once", async () => {
    currentRecords = [{ id: "po1", links: [], actions: { pushPurchaseOrder: true }, blockedReason: null }];
    render(<Host type="PurchaseOrder" ids={["po1"]} />);
    fireEvent.click(await screen.findByRole("button", { name: /send to quickbooks/i }));
    const dialog = await screen.findByRole("dialog", { name: /send purchase order to quickbooks/i });
    const select = within(dialog).getByLabelText(/expense account/i);
    fireEvent.change(select, { target: { value: "acct-1" } });
    const confirmBtn = within(dialog).getByRole("button", { name: /^send to quickbooks$/i });
    fireEvent.click(confirmBtn);
    fireEvent.click(confirmBtn);
    await waitFor(() => expect(posted.length).toBe(1));
    expect(posted[0].body).toEqual({ action: "push_purchase_order", purchaseOrderId: "po1", expenseAccountId: "acct-1", confirm: true });
  });

  it("record_bill requires confirmation and posts the exact body, including an optional due date", async () => {
    currentRecords = [{ id: "po1", links: [], actions: { recordBill: true }, blockedReason: null }];
    render(<Host type="PurchaseOrder" ids={["po1"]} />);
    fireEvent.click(await screen.findByRole("button", { name: /record bill/i }));
    const dialog = await screen.findByRole("dialog", { name: /record a bill/i });
    expect(within(dialog).getByText(/creates? a bill \(a payable\) in quickbooks|will create a bill \(a payable\) in quickbooks/i)).toBeTruthy();
    fireEvent.change(within(dialog).getByLabelText(/expense account/i), { target: { value: "acct-1" } });
    fireEvent.change(within(dialog).getByLabelText(/due date/i), { target: { value: "2026-10-01" } });
    fireEvent.click(within(dialog).getByRole("button", { name: /^record bill$/i }));
    await waitFor(() => expect(posted.length).toBe(1));
    expect(posted[0].body).toEqual({
      action: "record_bill",
      purchaseOrderId: "po1",
      expenseAccountId: "acct-1",
      dueDate: "2026-10-01",
      confirm: true,
    });
  });

  it("inactivate requires a confirm dialog and posts the exact body", async () => {
    currentRecords = [
      { id: "v1", links: [{ entityType: "Vendor", remoteId: "r1", remoteStatus: "ACTIVE" }], actions: { inactivate: true }, blockedReason: null },
    ];
    render(<Host type="VendorRecord" ids={["v1"]} />);
    fireEvent.click(await screen.findByRole("button", { name: /remove from quickbooks/i }));
    const dialog = await screen.findByRole("dialog", { name: /remove from quickbooks/i });
    fireEvent.click(within(dialog).getByRole("button", { name: /cancel/i }));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(posted.length).toBe(0);

    fireEvent.click(screen.getByRole("button", { name: /remove from quickbooks/i }));
    const dialog2 = await screen.findByRole("dialog", { name: /remove from quickbooks/i });
    fireEvent.click(within(dialog2).getByRole("button", { name: /^remove from quickbooks$/i }));
    await waitFor(() => expect(posted.length).toBe(1));
    expect(posted[0].body).toEqual({ action: "inactivate", kind: "vendor", recordId: "v1", confirm: true });
  });

  it("shows owner-safe error text from a failed POST without crashing", async () => {
    postOk = false;
    postErrorMessage = "QuickBooks couldn't create this vendor. Try again.";
    currentRecords = [{ id: "v1", links: [], actions: { pushVendor: true }, blockedReason: null }];
    render(<Host type="VendorRecord" ids={["v1"]} />);
    fireEvent.click(await screen.findByRole("button", { name: /send to quickbooks/i }));
    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toMatch(/couldn't create this vendor/i);
  });

  it("issues exactly ONE batched GET for record-actions, never one per row", async () => {
    currentRecords = [
      { id: "v1", links: [], actions: { pushVendor: true }, blockedReason: null },
      { id: "v2", links: [], actions: { pushVendor: true }, blockedReason: null },
      { id: "v3", links: [], actions: { pushVendor: true }, blockedReason: null },
    ];
    render(<Host type="VendorRecord" ids={["v1", "v2", "v3"]} />);
    await screen.findByTestId("qbo-actions-v1");
    await screen.findByTestId("qbo-actions-v2");
    await screen.findByTestId("qbo-actions-v3");
    expect(recordActionsGetCalls).toBe(1);
  });
});
